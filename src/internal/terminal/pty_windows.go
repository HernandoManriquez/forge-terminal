package terminal

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"strings"
	"sync"
	"syscall"
	"unicode/utf16"

	"github.com/UserExistsError/conpty"
)

type windowsPTY struct {
	*conpty.ConPty
	once sync.Once
	done chan struct{}
	code int
	err  error
}

func encodedCommand(s string) string {
	runes := utf16.Encode([]rune(s))
	data := make([]byte, len(runes)*2)
	for i, r := range runes {
		binary.LittleEndian.PutUint16(data[i*2:], r)
	}
	return base64.StdEncoding.EncodeToString(data)
}

func Start(p Profile, cwd string, cols, rows int) (PTY, error) {
	cols, rows = ClampSize(cols, rows)
	args := []string{syscall.EscapeArg(p.Path)}
	if p.ID == "powershell" || p.ID == "pwsh" {
		// Preserve the existing profile prompt; advertise its directory using OSC 7.
		script := `$global:ForgeOriginalPrompt = $function:prompt; function global:prompt { $u = [System.Uri]::new((Get-Location).Path + [IO.Path]::DirectorySeparatorChar); [Console]::Write(([char]27).ToString() + ']7;' + $u.AbsoluteUri + [char]7); if ($global:ForgeOriginalPrompt) { & $global:ForgeOriginalPrompt } else { 'PS ' + (Get-Location).Path + '> ' } }`
		args = append(args, "-NoLogo", "-NoExit", "-EncodedCommand", encodedCommand(script))
	} else {
		for _, arg := range p.Args {
			args = append(args, syscall.EscapeArg(arg))
		}
	}
	c, err := conpty.Start(strings.Join(args, " "), conpty.ConPtyDimensions(cols, rows), conpty.ConPtyWorkDir(cwd), conpty.ConPtyEnv(Environment()))
	if err != nil {
		return nil, err
	}
	result := &windowsPTY{ConPty: c, done: make(chan struct{})}
	go func() {
		code, err := c.Wait(context.Background())
		result.code, result.err = int(code), err
		close(result.done)
		result.Close()
	}()
	return result, nil
}
func (p *windowsPTY) Resize(cols, rows int) error {
	cols, rows = ClampSize(cols, rows)
	return p.ConPty.Resize(cols, rows)
}
func (p *windowsPTY) PID() int { return p.ConPty.Pid() }
func (p *windowsPTY) Wait() (int, error) {
	<-p.done
	return p.code, p.err
}
func (p *windowsPTY) Close() error {
	var err error
	p.once.Do(func() { err = p.ConPty.Close() })
	return err
}
