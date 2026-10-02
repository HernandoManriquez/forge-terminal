package terminal

import (
	"os/exec"
	"strings"
	"testing"
	"time"
)

// This smoke test is intended for the Windows CI job; it is not run on Linux.
func TestConPTYInteractiveShell(t *testing.T) {
	path, err := exec.LookPath("cmd.exe")
	if err != nil {
		t.Fatal(err)
	}
	p, err := Start(Profile{ID: "cmd", Path: path, Args: []string{"/Q"}}, t.TempDir(), 90, 28)
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	if err = p.Resize(100, 30); err != nil {
		t.Fatal(err)
	}
	result := make(chan string, 1)
	go func() {
		var output strings.Builder
		sent := false
		buf := make([]byte, 4096)
		for {
			n, err := p.Read(buf)
			if n > 0 {
				output.Write(buf[:n])
				if !sent && strings.Contains(output.String(), "FORGE_READY") {
					result <- output.String()
					sent = true
				}
			}
			if err != nil {
				if !sent {
					result <- output.String()
				}
				return
			}
		}
	}()
	if _, err = p.Write([]byte("set FORGE_TEST=READY\r\necho FORGE_%FORGE_TEST%\r\n")); err != nil {
		t.Fatal(err)
	}
	select {
	case output := <-result:
		if !strings.Contains(output, "FORGE_READY") {
			t.Fatalf("missing marker: %q", output)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("ConPTY output timeout")
	}
}
