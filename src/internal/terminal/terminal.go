package terminal

import (
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

type Profile struct {
	ID   string   `json:"id"`
	Name string   `json:"name"`
	Path string   `json:"path"`
	Args []string `json:"-"`
}

type PTY interface {
	io.ReadWriteCloser
	Resize(cols, rows int) error
	PID() int
	Wait() (int, error)
}

func Profiles() []Profile {
	var candidates []Profile
	if runtime.GOOS == "windows" {
		candidates = []Profile{{"pwsh", "PowerShell 7", "pwsh.exe", nil}, {"powershell", "Windows PowerShell", "powershell.exe", nil}, {"cmd", "CMD", "cmd.exe", nil}, {"wsl", "WSL", "wsl.exe", nil}}
	} else {
		if shell := os.Getenv("SHELL"); filepath.IsAbs(shell) {
			candidates = append(candidates, Profile{filepath.Base(shell), filepath.Base(shell), shell, []string{"-i"}})
		}
		for _, name := range []string{"bash", "zsh", "fish", "sh"} {
			candidates = append(candidates, Profile{name, name, name, []string{"-i"}})
		}
	}
	result := []Profile{}
	seen := map[string]bool{}
	for _, p := range candidates {
		path, err := exec.LookPath(p.Path)
		if err != nil || seen[p.ID] {
			continue
		}
		p.Path = path
		seen[p.ID] = true
		result = append(result, p)
	}
	return result
}

func Environment() []string {
	env := []string{}
	for _, entry := range os.Environ() {
		key := strings.SplitN(entry, "=", 2)[0]
		if runtime.GOOS == "windows" {
			key = strings.ToUpper(key)
		}
		if key != "TERM" && key != "COLORTERM" && key != "TERM_PROGRAM" {
			env = append(env, entry)
		}
	}
	env = append(env, "TERM=xterm-256color", "COLORTERM=truecolor", "TERM_PROGRAM=Forge")
	if runtime.GOOS == "windows" {
		sort.Slice(env, func(i, j int) bool { return strings.ToUpper(env[i]) < strings.ToUpper(env[j]) })
	}
	return env
}

func ClampSize(cols, rows int) (int, int) {
	return max(2, min(cols, 500)), max(1, min(rows, 300))
}
