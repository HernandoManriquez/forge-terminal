package server

import (
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const gitLimit = 256 << 10

type gitBuffer struct {
	data      []byte
	truncated bool
}

func (b *gitBuffer) Write(p []byte) (int, error) {
	n := len(p)
	remaining := gitLimit - len(b.data)
	if n > remaining {
		b.truncated = true
	}
	b.data = append(b.data, p[:min(n, remaining)]...)
	return n, nil
}
func readGit(ctx context.Context, cwd string, args ...string) (string, bool, error) {
	base := []string{"--no-optional-locks", "--literal-pathspecs", "-C", cwd, "-c", "core.fsmonitor=false"}
	cmd := exec.CommandContext(ctx, "git", append(base, args...)...)
	hideWindow(cmd)
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0", "GIT_PAGER=cat", "GIT_EXTERNAL_DIFF=")
	var out gitBuffer
	cmd.Stdout = &out
	err := cmd.Run()
	return string(out.data), out.truncated, err
}
func gitLine(ctx context.Context, cwd string, args ...string) (string, error) {
	out, _, err := readGit(ctx, cwd, args...)
	return strings.TrimSuffix(strings.TrimSuffix(out, "\n"), "\r"), err
}

type gitChange struct {
	Path      string `json:"path"`
	Original  string `json:"original,omitempty"`
	Index     string `json:"index"`
	Worktree  string `json:"worktree"`
	Untracked bool   `json:"untracked"`
}

func parseChanges(raw string) []gitChange {
	result := []gitChange{}
	fields := strings.Split(raw, "\x00")
	// The last element is incomplete when output has been truncated.
	for i := 0; i < len(fields)-1; i++ {
		f := fields[i]
		if len(f) < 4 || f[2] != ' ' {
			continue
		}
		change := gitChange{Path: f[3:], Index: f[:1], Worktree: f[1:2], Untracked: f[:2] == "??"}
		if strings.ContainsAny(f[:2], "RC") {
			if i+1 >= len(fields)-1 {
				break
			}
			i++
			change.Original = fields[i]
		}
		result = append(result, change)
	}
	return result
}
func gitChanges(ctx context.Context, root string) ([]gitChange, bool, error) {
	raw, truncated, err := readGit(ctx, root, "status", "--porcelain=v1", "-z", "--untracked-files=normal")
	return parseChanges(raw), truncated, err
}
func (s *Server) gitRoot(ctx context.Context, id string) (string, error) {
	s.mu.Lock()
	v := s.sessions[id]
	s.mu.Unlock()
	if v == nil {
		return "", errors.New("La terminal ya no está en ejecución")
	}
	root, err := gitLine(ctx, v.directory(), "rev-parse", "--show-toplevel")
	if err != nil || root == "" {
		return "", errors.New("No hay un repositorio accesible en esta terminal; comprueba que Git esté instalado")
	}
	return root, nil
}

type gitBranch struct {
	Name     string `json:"name"`
	Current  bool   `json:"current"`
	Remote   bool   `json:"remote"`
	Upstream string `json:"upstream"`
}

func (s *Server) gitDetails(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
	defer cancel()
	root, err := s.gitRoot(ctx, r.URL.Query().Get("id"))
	if err != nil {
		fail(w, err, 400)
		return
	}
	changes, truncated, err := gitChanges(ctx, root)
	if err != nil {
		fail(w, errors.New("No se pudo leer el estado Git; vuelve a intentar"), 400)
		return
	}
	branch, _ := gitLine(ctx, root, "symbolic-ref", "--quiet", "--short", "HEAD")
	detached := branch == ""
	if detached {
		branch, _ = gitLine(ctx, root, "rev-parse", "--short", "HEAD")
	}
	raw, branchTruncated, err := readGit(ctx, root, "for-each-ref", "--format=%(refname)%00%(HEAD)%00%(upstream:short)%00%(symref)", "refs/heads/", "refs/remotes/")
	if err != nil {
		fail(w, errors.New("No se pudieron leer las ramas; vuelve a intentar"), 400)
		return
	}
	branches := []gitBranch{}
	for _, line := range strings.Split(raw, "\n") {
		fields := strings.Split(line, "\x00")
		if len(fields) != 4 || fields[3] != "" {
			continue
		}
		remote := strings.HasPrefix(fields[0], "refs/remotes/")
		name := strings.TrimPrefix(strings.TrimPrefix(fields[0], "refs/heads/"), "refs/remotes/")
		branches = append(branches, gitBranch{Name: name, Current: fields[1] == "*", Remote: remote, Upstream: fields[2]})
	}
	if !detached {
		found := false
		for _, b := range branches {
			if b.Current {
				found = true
			}
		}
		if !found {
			branches = append([]gitBranch{{Name: branch, Current: true}}, branches...)
		}
	}
	writeJSON(w, map[string]any{"root": root, "branch": branch, "detached": detached, "changes": changes, "branches": branches, "truncated": truncated || branchTruncated})
}
func readUntracked(root, path string) (string, bool, error) {
	if filepath.IsAbs(path) || path == "" {
		return "", false, errors.New("Ruta inválida")
	}
	full := filepath.Join(root, filepath.FromSlash(path))
	rel, err := filepath.Rel(root, full)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", false, errors.New("Ruta fuera del repositorio")
	}
	info, err := os.Lstat(full)
	if err != nil {
		return "", false, errors.New("El archivo ya no está disponible; actualiza los cambios")
	}
	if !info.Mode().IsRegular() {
		return "", false, errors.New("Selecciona un archivo regular; directorios y enlaces no tienen vista previa")
	}
	resolved, err := filepath.EvalSymlinks(full)
	resolvedRoot, rootErr := filepath.EvalSymlinks(root)
	if err != nil || rootErr != nil {
		return "", false, errors.New("No se pudo resolver el archivo")
	}
	rel, err = filepath.Rel(resolvedRoot, resolved)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", false, errors.New("Ruta fuera del repositorio")
	}
	f, err := os.Open(full)
	if err != nil {
		return "", false, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, gitLimit+1))
	if err != nil {
		return "", false, err
	}
	truncated := len(data) > gitLimit
	data = data[:min(len(data), gitLimit)]
	if strings.ContainsRune(string(data), '\x00') {
		return "Archivo binario sin vista previa de texto.", truncated, nil
	}
	return strings.ToValidUTF8(string(data), "�"), truncated, nil
}
func (s *Server) gitDiff(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
	defer cancel()
	root, err := s.gitRoot(ctx, r.URL.Query().Get("id"))
	if err != nil {
		fail(w, err, 400)
		return
	}
	changes, _, err := gitChanges(ctx, root)
	if err != nil {
		fail(w, errors.New("No se pudo actualizar el estado Git"), 400)
		return
	}
	var selected *gitChange
	for i := range changes {
		if changes[i].Path == r.URL.Query().Get("path") {
			selected = &changes[i]
			break
		}
	}
	if selected == nil {
		fail(w, errors.New("El archivo ya no aparece con cambios; actualiza la lista"), 404)
		return
	}
	if selected.Untracked {
		preview, truncated, err := readUntracked(root, selected.Path)
		if err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, map[string]any{"untracked": true, "preview": preview, "truncated": truncated})
		return
	}
	args := []string{"diff", "--no-ext-diff", "--no-textconv", "--no-color", "--src-prefix=a/", "--dst-prefix=b/", "--", selected.Path}
	if selected.Original != "" {
		args = append(args, selected.Original)
	}
	unstaged, uTrunc, err := readGit(ctx, root, args...)
	if err != nil {
		fail(w, errors.New("No se pudieron leer las diferencias"), 400)
		return
	}
	stagedArgs := append([]string{"diff", "--cached"}, args[1:]...)
	staged, sTrunc, err := readGit(ctx, root, stagedArgs...)
	if err != nil {
		fail(w, errors.New("No se pudieron leer los cambios preparados"), 400)
		return
	}
	writeJSON(w, map[string]any{"staged": strings.ToValidUTF8(staged, "�"), "unstaged": strings.ToValidUTF8(unstaged, "�"), "truncated": uTrunc || sTrunc})
}
