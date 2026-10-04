//go:build windows

package server

import (
	"errors"
	"fmt"
	"golang.org/x/sys/windows"
	"os"
	"unsafe"
)

var isProcessCritical = windows.NewLazySystemDLL("kernel32.dll").NewProc("IsProcessCritical")

func handleIdentity(h windows.Handle) (string, bool, bool, error) {
	var created, exited, kernel, user windows.Filetime
	if err := windows.GetProcessTimes(h, &created, &exited, &kernel, &user); err != nil {
		return "", false, false, err
	}
	critical, known := false, false
	if isProcessCritical.Find() == nil {
		var value uint32
		ok, _, _ := isProcessCritical.Call(uintptr(h), uintptr(unsafe.Pointer(&value)))
		known = ok != 0
		critical = known && value != 0
	}
	return fmt.Sprintf("%08x%08x", created.HighDateTime, created.LowDateTime), critical, known, nil
}
func processIdentity(pid int32) (string, bool, bool, error) {
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
	if err != nil {
		return "", false, false, err
	}
	defer windows.CloseHandle(h)
	return handleIdentity(h)
}
func terminateIdentifiedProcess(pid int32, expected string) error {
	if pid <= 1 || pid == int32(os.Getpid()) {
		return errors.New("Proceso protegido")
	}
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION|windows.PROCESS_TERMINATE, false, uint32(pid))
	if err != nil {
		return err
	}
	defer windows.CloseHandle(h)
	id, critical, known, err := handleIdentity(h)
	if err != nil {
		return err
	}
	if id != expected {
		return errors.New("El PID fue reutilizado; actualiza el detalle")
	}
	if critical {
		return errors.New("Proceso crítico protegido")
	}
	if !known {
		return errors.New("No se pudo comprobar si el proceso es crítico")
	}
	return windows.TerminateProcess(h, 1)
}
func openInspectorURL(raw string) error {
	verb, _ := windows.UTF16PtrFromString("open")
	target, err := windows.UTF16PtrFromString(raw)
	if err != nil {
		return err
	}
	return windows.ShellExecute(0, verb, target, nil, nil, windows.SW_SHOWNORMAL)
}
