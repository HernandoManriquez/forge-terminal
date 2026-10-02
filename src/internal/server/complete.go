package server

import (
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"unicode"
)

type suggestion struct {
	Label string `json:"label"`
	Value string `json:"value"`
	Kind  string `json:"kind"`
}

// Completion only reads PATH and directory entries; it never evaluates shell text.
func splitLastToken(line string, windows bool) (prefix, word string) {
	start := 0
	quote := rune(0)
	escaped := false
	var token strings.Builder
	for i, r := range line {
		if escaped {
			token.WriteRune(r)
			escaped = false
			continue
		}
		if r == '\\' && !windows && quote != '\'' {
			escaped = true
			continue
		}
		if quote != 0 {
			if r == quote {
				quote = 0
			} else {
				token.WriteRune(r)
			}
			continue
		}
		if r == '\'' || r == '"' {
			quote = r
			continue
		}
		if unicode.IsSpace(r) {
			start = i + len(string(r))
			token.Reset()
			continue
		}
		token.WriteRune(r)
	}
	if escaped {
		token.WriteByte('\\')
	}
	return line[:start], token.String()
}

func quoteToken(s, profile string) string {
	if !strings.ContainsAny(s, " \t\r\n'\"$`;&|<>()[]{}*!?#~") {
		return s
	}
	if profile == "cmd" {
		return `"` + strings.ReplaceAll(s, `"`, ``) + `"`
	}
	if profile == "pwsh" || profile == "powershell" {
		return "'" + strings.ReplaceAll(s, "'", "''") + "'"
	}
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}

func (s *Server) commandIndex() []string {
	s.commandsOnce.Do(func() {
		seen := map[string]bool{}
		for _, dir := range filepath.SplitList(os.Getenv("PATH")) {
			if !filepath.IsAbs(dir) {
				continue
			}
			f, err := os.Open(dir)
			if err != nil {
				continue
			}
			entries, _ := f.ReadDir(2500)
			f.Close()
			for _, e := range entries {
				if e.IsDir() {
					continue
				}
				name := e.Name()
				if runtime.GOOS == "windows" {
					ext := strings.ToLower(filepath.Ext(name))
					if ext != ".exe" && ext != ".cmd" && ext != ".bat" {
						continue
					}
					name = strings.TrimSuffix(name, filepath.Ext(name))
				} else {
					info, err := e.Info()
					if err != nil {
						continue
					}
					if info.Mode()&os.ModeSymlink != 0 {
						info, err = os.Stat(filepath.Join(dir, name))
						if err != nil {
							continue
						}
					}
					if info.Mode()&0111 == 0 {
						continue
					}
				}
				seen[name] = true
			}
		}
		for name := range seen {
			s.commands = append(s.commands, name)
		}
		sort.Strings(s.commands)
	})
	return s.commands
}

var subcommands = map[string][]string{
	"git":       {"status", "log --oneline --graph -15", "diff", "branch", "switch", "fetch", "pull", "push", "add", "commit", "stash", "remote -v"},
	"docker":    {"ps", "images", "compose ps", "compose up", "compose logs -f", "stats", "inspect", "logs"},
	"podman":    {"ps", "images", "stats", "logs", "inspect"},
	"systemctl": {"status", "list-units --type=service", "is-active", "start", "stop", "restart"},
	"npm":       {"run", "install", "test", "run build", "run dev", "outdated"},
	"go":        {"test ./...", "build", "run", "mod tidy", "version"},
}

func (s *Server) completions(w http.ResponseWriter, r *http.Request) {
	line := r.URL.Query().Get("line")
	if len(line) > 2048 {
		writeJSON(w, []suggestion{})
		return
	}
	profile := r.URL.Query().Get("profile")
	isWindows := runtime.GOOS == "windows" && profile != "wsl"
	prefix, word := splitLastToken(line, isWindows)
	result := []suggestion{}
	seen := map[string]bool{}
	add := func(label, value, kind string) {
		if len(result) < 30 && !seen[value] {
			result = append(result, suggestion{label, value, kind})
			seen[value] = true
		}
	}
	match := func(name string) bool { return strings.HasPrefix(strings.ToLower(name), strings.ToLower(word)) }
	first := strings.Fields(line)
	if len(first) > 0 && prefix != "" {
		base := first[0] + " "
		rest := strings.TrimPrefix(line, base)
		for _, sub := range subcommands[first[0]] {
			if strings.HasPrefix(strings.ToLower(sub), strings.ToLower(rest)) {
				add(base+sub, base+sub, "argument")
			}
		}
	}
	if prefix == "" && !strings.ContainsAny(word, "/\\") && !strings.HasPrefix(word, ".") {
		builtins := []string{"cd", "clear", "exit", "echo", "pwd", "export", "history", "source", "alias"}
		if isWindows {
			builtins = []string{"cd", "cls", "exit", "dir", "echo", "Get-ChildItem", "Get-Process", "Get-Service", "Get-Content", "Set-Location", "Select-String", "Test-Connection"}
		}
		for _, name := range builtins {
			if match(name) {
				add(name, name, "command")
			}
		}
		for _, name := range s.commandIndex() {
			if match(name) {
				add(name, name, "command")
			}
		}
	}
	// WSL uses Linux paths inside a Windows process; native Tab remains authoritative.
	if runtime.GOOS == "windows" && profile == "wsl" {
		writeJSON(w, result)
		return
	}
	cwd, err := validDirectory(r.URL.Query().Get("cwd"))
	if err != nil {
		writeJSON(w, result)
		return
	}
	expanded := word
	if strings.HasPrefix(word, "~/") || strings.HasPrefix(word, `~\`) {
		home, _ := os.UserHomeDir()
		expanded = filepath.Join(home, word[2:])
	}
	dirPart, base := filepath.Split(expanded)
	dir := dirPart
	if !filepath.IsAbs(dir) {
		dir = filepath.Join(cwd, dir)
	}
	originalDir, _ := filepath.Split(word)
	f, err := os.Open(dir)
	if err == nil {
		entries, _ := f.ReadDir(1000)
		f.Close()
		sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
		for _, e := range entries {
			if !strings.HasPrefix(strings.ToLower(e.Name()), strings.ToLower(base)) {
				continue
			}
			if base == "" && strings.HasPrefix(e.Name(), ".") {
				continue
			}
			isDir := e.IsDir()
			if e.Type()&os.ModeSymlink != 0 {
				if info, err := os.Stat(filepath.Join(dir, e.Name())); err == nil {
					isDir = info.IsDir()
				}
			}
			if len(first) > 0 && (first[0] == "cd" || first[0] == "Set-Location") && !isDir {
				continue
			}
			kind := "file"
			value := originalDir + e.Name()
			if isDir {
				kind = "directory"
				value += string(filepath.Separator)
			}
			if profile == "cmd" && strings.ContainsAny(value, "%!^&|<>\r\n") {
				continue
			}
			add(e.Name(), prefix+quoteToken(value, profile), kind)
		}
	}
	writeJSON(w, result)
}
