package server

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type fileEntry struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	Directory bool   `json:"directory"`
	Hidden    bool   `json:"hidden"`
}

func (s *Server) files(w http.ResponseWriter, r *http.Request) {
	path, err := validDirectory(r.URL.Query().Get("path"))
	if err != nil {
		fail(w, err, 400)
		return
	}
	f, err := os.Open(path)
	if err != nil {
		fail(w, err, 400)
		return
	}
	defer f.Close()
	entries, err := f.ReadDir(1001)
	if err != nil && err != io.EOF && len(entries) == 0 {
		fail(w, err, 400)
		return
	}
	result := []fileEntry{}
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".") && r.URL.Query().Get("hidden") != "1" {
			continue
		}
		isDir := e.IsDir()
		if e.Type()&os.ModeSymlink != 0 {
			if info, er := os.Stat(filepath.Join(path, e.Name())); er == nil {
				isDir = info.IsDir()
			}
		}
		result = append(result, fileEntry{e.Name(), filepath.Join(path, e.Name()), isDir, strings.HasPrefix(e.Name(), ".")})
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Directory != result[j].Directory {
			return result[i].Directory
		}
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})
	truncated := len(entries) > 1000 || len(result) > 200
	if len(result) > 200 {
		result = result[:200]
	}
	writeJSON(w, map[string]any{"path": path, "parent": filepath.Dir(path), "entries": result, "truncated": truncated})
}

type limitedBuffer struct{ bytes.Buffer }

func (b *limitedBuffer) Write(p []byte) (int, error) {
	n := len(p)
	if b.Len() < 65536 {
		_, _ = b.Buffer.Write(p[:min(len(p), 65536-b.Len())])
	}
	return n, nil
}

func gitOutput(ctx context.Context, cwd string, args ...string) string {
	cmd := exec.CommandContext(ctx, "git", append([]string{"--no-optional-locks", "-C", cwd}, args...)...)
	hideWindow(cmd)
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	var buf limitedBuffer
	cmd.Stdout = &buf
	if cmd.Run() != nil {
		return ""
	}
	return strings.TrimSpace(buf.String())
}

func (s *Server) context(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	v := s.sessions[r.URL.Query().Get("id")]
	s.mu.Unlock()
	if v == nil {
		writeJSON(w, map[string]any{"cwd": "", "git": nil})
		return
	}
	cwd := v.directory()
	if r.URL.Query().Get("git") == "0" {
		writeJSON(w, map[string]any{"cwd": cwd, "pid": v.pty.PID(), "git": nil})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 1200*time.Millisecond)
	defer cancel()
	branch := gitOutput(ctx, cwd, "symbolic-ref", "--quiet", "--short", "HEAD")
	if branch == "" {
		branch = gitOutput(ctx, cwd, "rev-parse", "--short", "HEAD")
	}
	var git any
	if branch != "" {
		status := gitOutput(ctx, cwd, "status", "--porcelain=v1", "--untracked-files=no")
		modified := 0
		if status != "" {
			modified = len(strings.Split(status, "\n"))
		}
		git = map[string]any{"branch": branch, "modified": modified}
	}
	writeJSON(w, map[string]any{"cwd": cwd, "pid": v.pty.PID(), "git": git})
}
