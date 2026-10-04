//go:build linux

package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestInspectorPortsAssociateRealPID(t *testing.T) {
	tcp, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tcp.Close()
	udp, err := net.ListenPacket("udp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer udp.Close()
	inspector := processInspector{}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	out, err := inspector.snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []struct {
		port     int
		protocol string
	}{{tcp.Addr().(*net.TCPAddr).Port, "TCP"}, {udp.LocalAddr().(*net.UDPAddr).Port, "UDP"}} {
		found := false
		for _, port := range out.Ports {
			if port.Port == uint32(want.port) && port.Protocol == want.protocol && port.PID == int32(os.Getpid()) && port.Process != "" {
				found = true
			}
		}
		if !found {
			t.Fatalf("missing port/PID association %v; warnings %v", want, out.Warnings)
		}
	}
	info, err := inspectProcess(ctx, int32(os.Getpid()))
	if err != nil {
		t.Fatal(err)
	}
	if info["protected"] == "" || info["cwd"] == "" || info["identity"] == "" {
		t.Fatal("missing process detail", info)
	}
	for _, p := range out.Processes {
		if p.PID == int32(os.Getpid()) && p.CPU != nil {
			t.Fatal("CPU requires a second sample")
		}
	}
}
func TestInspectorTerminationNeedsConfirmationAndIdentity(t *testing.T) {
	child := exec.Command("sleep", "30")
	if err := child.Start(); err != nil {
		t.Fatal(err)
	}
	defer child.Process.Kill()
	pid := int32(child.Process.Pid)
	identity, _, _, err := processIdentity(pid)
	if err != nil {
		t.Fatal(err)
	}
	s, client := fixture(t)
	endpoint := "http://" + s.host + "/api/tools/process/terminate"
	post := func(id string, confirmed bool) int {
		b, _ := json.Marshal(map[string]any{"pid": pid, "identity": id, "confirmed": confirmed})
		req, _ := http.NewRequest("POST", endpoint, bytes.NewReader(b))
		req.Header.Set("Origin", "http://"+s.host)
		req.Header.Set("Content-Type", "application/json")
		res, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		return res.StatusCode
	}
	if code := post(identity, false); code != 400 {
		t.Fatal("no confirmation", code)
	}
	if code := post(identity+"different", true); code != 400 {
		t.Fatal("stale identity", code)
	}
	if err := child.Process.Signal(syscall.Signal(0)); err != nil {
		t.Fatal("child was killed before valid confirmation")
	}
	if err := terminateIdentifiedProcess(int32(os.Getpid()), identity); err == nil {
		t.Fatal("self was not protected")
	}
	if err := terminateIdentifiedProcess(1, "anything"); err == nil {
		t.Fatal("init was not protected")
	}
	if code := post(identity, true); code != 200 {
		t.Fatal("confirmed termination failed", code)
	}
	done := make(chan error, 1)
	go func() { done <- child.Wait() }()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("child did not terminate")
	}
}
func TestInspectorParsesProcStatWithComplexName(t *testing.T) {
	fields := []string{"R"}
	for i := 1; i < 20; i++ {
		fields = append(fields, strconv.Itoa(i))
	}
	id, err := linuxStartIdentity("89 (name with ) spaces) " + strings.Join(fields, " "))
	if err != nil || id != "19" {
		t.Fatal(id, err)
	}
	for _, stat := range []string{"invalid", "1 (x) R 0 0"} {
		if _, err := linuxStartIdentity(stat); err == nil {
			t.Fatal("accepted invalid proc stat")
		}
	}
}
