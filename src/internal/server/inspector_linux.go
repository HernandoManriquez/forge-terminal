//go:build linux

package server

import (
	"errors"
	"fmt"
	"golang.org/x/sys/unix"
	"os"
	"os/exec"
	"strconv"
	"strings"
)

func linuxStartIdentity(stat string) (string, error) {
	end := strings.LastIndexByte(stat, ')')
	if end < 0 {
		return "", errors.New("Información del proceso incompleta")
	}
	fields := strings.Fields(stat[end+1:])
	if len(fields) <= 19 {
		return "", errors.New("Información del proceso incompleta")
	}
	if _, err := strconv.ParseUint(fields[19], 10, 64); err != nil {
		return "", err
	}
	return fields[19], nil
}
func processIdentity(pid int32) (string, bool, bool, error) {
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
	if err != nil {
		return "", false, false, err
	}
	id, err := linuxStartIdentity(string(data))
	return id, pid == 1, pid == 1, err
}
func terminateIdentifiedProcess(pid int32, expected string) error {
	if pid <= 1 || pid == int32(os.Getpid()) {
		return errors.New("Proceso protegido")
	}
	fd, err := unix.PidfdOpen(int(pid), 0)
	if err != nil {
		return fmt.Errorf("No se puede obtener un descriptor seguro del proceso (requiere Linux 5.3+): %w", err)
	}
	defer unix.Close(fd)
	identity, critical, _, err := processIdentity(pid)
	if err != nil {
		return err
	}
	if identity != expected {
		return errors.New("El PID fue reutilizado; actualiza el detalle")
	}
	if critical {
		return errors.New("Proceso crítico protegido")
	}
	// The descriptor remains tied to the same process even if the PID is reused.
	return unix.PidfdSendSignal(fd, unix.SIGTERM, nil, 0)
}
func openInspectorURL(raw string) error {
	cmd := exec.Command("xdg-open", raw)
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() { _ = cmd.Wait() }()
	return nil
}
