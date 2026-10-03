package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

type gitTestPTY struct{}

func (gitTestPTY) PID() int                    { return -1 }
func (gitTestPTY) Read([]byte) (int, error)    { return 0, io.EOF }
func (gitTestPTY) Write(b []byte) (int, error) { return len(b), nil }
func (gitTestPTY) Close() error                { return nil }
func (gitTestPTY) Wait() (int, error)          { return 0, nil }
func (gitTestPTY) Resize(int, int) error       { return nil }

func TestGitDetailsDiffAndBranches(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git unavailable")
	}
	root := t.TempDir()
	git := func(args ...string) string {
		t.Helper()
		out, _, err := readGit(context.Background(), root, args...)
		if err != nil {
			t.Fatalf("git %v: %v", args, err)
		}
		return out
	}
	write := func(name, text string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(root, name), []byte(text), 0600); err != nil {
			t.Fatal(err)
		}
	}
	git("init", "-b", "main")
	git("config", "user.email", "fixture@example.invalid")
	git("config", "user.name", "Fixture")
	write("tracked file.txt", "base\n")
	write("old.txt", "rename me\n")
	write("delete.txt", "gone\n")
	write("literal[1].txt", "literal base\n")
	write("literal1.txt", "other base\n")
	git("add", ".")
	git("commit", "-m", "fixture")
	git("branch", "feature/demo")
	git("update-ref", "refs/remotes/origin/remote-demo", "HEAD")
	write("tracked file.txt", "base\nstaged line\n")
	git("add", "tracked file.txt")
	write("tracked file.txt", "base\nstaged line\nworktree line\n")
	git("mv", "old.txt", "renamed.txt")
	os.Remove(filepath.Join(root, "delete.txt"))
	write("new ñ.txt", "<script>not executable</script>\n")
	write("binary.bin", "x\x00y")
	write("literal[1].txt", "literal changed\n")
	write("literal1.txt", "other changed\n")
	write("large.txt", strings.Repeat("x", gitLimit+10))
	s := &Server{sessions: map[string]*session{"test": {cwd: root, pty: gitTestPTY{}}}}
	get := func(route, path string) (int, map[string]any) {
		t.Helper()
		r := httptest.NewRequest("GET", route+"?"+url.Values{"id": {"test"}, "path": {path}}.Encode(), nil)
		w := httptest.NewRecorder()
		if route == "/api/git" {
			s.gitDetails(w, r)
		} else {
			s.gitDiff(w, r)
		}
		var v map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
			t.Fatal(err)
		}
		return w.Code, v
	}
	code, details := get("/api/git", "")
	if code != 200 {
		t.Fatal(details)
	}
	if details["branch"] != "main" {
		t.Fatal(details)
	}
	branches := details["branches"].([]any)
	if len(branches) != 3 {
		t.Fatal(branches)
	}
	code, diff := get("/api/git/diff", "tracked file.txt")
	if code != 200 || !strings.Contains(diff["staged"].(string), "+staged line") || !strings.Contains(diff["unstaged"].(string), "+worktree line") {
		t.Fatal(diff)
	}
	_, diff = get("/api/git/diff", "renamed.txt")
	if !strings.Contains(diff["staged"].(string), "rename from old.txt") {
		t.Fatal(diff)
	}
	_, diff = get("/api/git/diff", "delete.txt")
	if !strings.Contains(diff["unstaged"].(string), "-gone") {
		t.Fatal(diff)
	}
	_, diff = get("/api/git/diff", "literal[1].txt")
	if !strings.Contains(diff["unstaged"].(string), "+literal changed") || strings.Contains(diff["unstaged"].(string), "other changed") {
		t.Fatal(diff)
	}
	_, diff = get("/api/git/diff", "new ñ.txt")
	if diff["preview"] != "<script>not executable</script>\n" {
		t.Fatal(diff)
	}
	_, diff = get("/api/git/diff", "binary.bin")
	if !strings.Contains(diff["preview"].(string), "binario") {
		t.Fatal(diff)
	}
	_, diff = get("/api/git/diff", "large.txt")
	if diff["truncated"] != true || len(diff["preview"].(string)) != gitLimit {
		t.Fatal("unbounded preview")
	}
	code, _ = get("/api/git/diff", "../outside")
	if code != 404 {
		t.Fatal("path outside status was accepted")
	}
	git("checkout", "--detach")
	_, details = get("/api/git", "")
	if details["detached"] != true {
		t.Fatal("detached HEAD not detected")
	}
	git("reset", "--hard")
	git("clean", "-fd")
	_, details = get("/api/git", "")
	if len(details["changes"].([]any)) != 0 {
		t.Fatal("clean tree shown dirty")
	}
}
func TestGitUnbornAndNULPaths(t *testing.T) {
	root := t.TempDir()
	if _, _, err := readGit(context.Background(), root, "init", "-b", "fresh"); err != nil {
		t.Fatal(err)
	}
	s := &Server{sessions: map[string]*session{"test": {cwd: root, pty: gitTestPTY{}}}}
	w := httptest.NewRecorder()
	s.gitDetails(w, httptest.NewRequest("GET", "/api/git?id=test", nil))
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"branch":"fresh"`) {
		t.Fatal(w.Body.String())
	}
	changes := parseChanges(" M odd\nname.txt\x00R  new name.txt\x00old name.txt\x00?? partial")
	if len(changes) != 2 || changes[0].Path != "odd\nname.txt" || changes[1].Original != "old name.txt" {
		t.Fatal(changes)
	}
	if _, _, err := readUntracked(root, "../escape"); err == nil {
		t.Fatal("traversal accepted")
	}
	if err := os.Symlink(filepath.Join(root, "missing"), filepath.Join(root, "link")); err == nil {
		if _, _, err := readUntracked(root, "link"); err == nil {
			t.Fatal("symlink accepted")
		}
	}
}
func TestBootstrapLaunchDirectory(t *testing.T) {
	launch := t.TempDir()
	t.Chdir(launch)
	s, c := fixture(t)
	response, err := c.Get("http://" + s.host + "/api/bootstrap")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var boot struct {
		StartupCwd string `json:"startupCwd"`
	}
	if err = json.NewDecoder(response.Body).Decode(&boot); err != nil {
		t.Fatal(err)
	}
	if boot.StartupCwd != launch {
		t.Fatalf("launch cwd = %q; want %q", boot.StartupCwd, launch)
	}
}
