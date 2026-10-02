package terminal

import (
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"

	"github.com/creack/pty"
)

type unixPTY struct {
	*os.File
	cmd  *exec.Cmd
	once sync.Once
	done chan struct{}
	code int
	err  error
}

func Start(p Profile, cwd string, cols, rows int) (PTY, error) {
	cols, rows = ClampSize(cols, rows)
	cmd := exec.Command(p.Path, p.Args...)
	cmd.Dir, cmd.Env = cwd, Environment()
	f, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
	if err != nil {
		return nil, err
	}
	u := &unixPTY{File: f, cmd: cmd, done: make(chan struct{})}
	go func() { u.err = cmd.Wait(); u.code = cmd.ProcessState.ExitCode(); close(u.done) }()
	return u, nil
}

func (p *unixPTY) Resize(cols, rows int) error {
	cols, rows = ClampSize(cols, rows)
	return pty.Setsize(p.File, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
}
func (p *unixPTY) PID() int           { return p.cmd.Process.Pid }
func (p *unixPTY) Wait() (int, error) { <-p.done; return p.code, p.err }
func (p *unixPTY) Close() error {
	p.once.Do(func() {
		// Hang up the foreground job, then the shell's process group.
		p.File.Close()
		select {
		case <-p.done:
			return
		default:
		}
		_ = syscall.Kill(-p.PID(), syscall.SIGHUP)
		select {
		case <-p.done:
		case <-time.After(500 * time.Millisecond):
			_ = syscall.Kill(-p.PID(), syscall.SIGKILL)
		}
	})
	return nil
}
