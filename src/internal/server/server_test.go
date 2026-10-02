package server

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/gorilla/websocket"
)

func fixture(t *testing.T) (*Server, *http.Client) {
	t.Helper()
	s, err := New(fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte("<html>Forge</html>")}}, t.TempDir(), "test")
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.Close)
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar, Timeout: 5 * time.Second}
	resp, err := client.Get(s.URL())
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	return s, client
}

func TestAuthAndOrigin(t *testing.T) {
	s, client := fixture(t)
	base := "http://" + s.host
	res, err := http.Get(base + "/api/bootstrap")
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 401 {
		t.Fatalf("unauthorized status %d", res.StatusCode)
	}
	for _, field := range []string{"Origin", "Host"} {
		req, _ := http.NewRequest("GET", base+"/api/bootstrap", nil)
		if field == "Host" {
			req.Host = "attacker.example"
		} else {
			req.Header.Set("Origin", "https://attacker.example")
		}
		res, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != 403 {
			t.Fatalf("%s was allowed", field)
		}
	}
	res, err = client.Get(base + "/api/bootstrap")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		t.Fatal(res.Status)
	}
	if !strings.Contains(res.Header.Get("Content-Security-Policy"), "frame-ancestors 'none'") {
		t.Fatal("missing CSP")
	}
	headers := http.Header{"Origin": []string{"https://attacker.example"}}
	u, _ := url.Parse(base)
	for _, c := range client.Jar.Cookies(u) {
		headers.Add("Cookie", c.String())
	}
	_, response, err := websocket.DefaultDialer.Dial("ws://"+s.host+"/ws?profile=bash", headers)
	if err == nil {
		t.Fatal("cross-origin websocket allowed")
	}
	if response == nil || response.StatusCode != 403 {
		t.Fatal("websocket origin not rejected")
	}
}

func TestConfigPersistenceAndInvalidJSON(t *testing.T) {
	s, c := fixture(t)
	endpoint := "http://" + s.host + "/api/config"
	for _, body := range []string{`[]`, `null`, `{`} {
		r, err := c.Post(endpoint, "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		r.Body.Close()
		if r.StatusCode != 400 {
			t.Fatalf("bad config %q accepted", body)
		}
	}
	input := `{"settings":{"theme":"paper"},"workspaces":[]}`
	r, err := c.Post(endpoint, "application/json", strings.NewReader(input))
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatal(r.Status)
	}
	data, err := os.ReadFile(filepath.Join(s.configDir, "settings.json"))
	if err != nil || string(data) != input {
		t.Fatal("config not persisted")
	}
}

func TestCompletionNeverEvaluatesInput(t *testing.T) {
	s, c := fixture(t)
	cwd := t.TempDir()
	_ = os.Mkdir(filepath.Join(cwd, "my project"), 0700)
	q := url.Values{"line": []string{"cd my"}, "cwd": []string{cwd}, "profile": []string{"bash"}}
	r, err := c.Get("http://" + s.host + "/api/completions?" + q.Encode())
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	var result []suggestion
	if err = json.NewDecoder(r.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if len(result) != 1 || result[0].Value != "cd "+quoteToken("my project"+string(filepath.Separator), "bash") {
		t.Fatalf("unexpected completion %#v", result)
	}
	q.Set("line", "$(touch "+filepath.Join(cwd, "should-not-exist")+")")
	r, err = c.Get("http://" + s.host + "/api/completions?" + q.Encode())
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if _, err = os.Stat(filepath.Join(cwd, "should-not-exist")); err == nil {
		t.Fatal("autocomplete executed a command")
	}
}

func TestTokenAndQuoting(t *testing.T) {
	for _, tc := range []struct {
		input, prefix, word string
		windows             bool
	}{{"cd 'my pro", "cd ", "my pro", false}, {`cat a\ b`, "cat ", "a b", false}, {`cd C:\Users\name`, "cd ", `C:\Users\name`, true}} {
		prefix, word := splitLastToken(tc.input, tc.windows)
		if prefix != tc.prefix || word != tc.word {
			t.Fatalf("%q => %q %q", tc.input, prefix, word)
		}
	}
	if quoteToken("a'b", "bash") != "'a'\\''b'" {
		t.Fatal("unsafe bash quote")
	}
	if quoteToken("a'b", "pwsh") != "'a''b'" {
		t.Fatal("unsafe powershell quote")
	}
}

func TestOutputExport(t *testing.T) {
	s, c := fixture(t)
	r, err := c.Post("http://"+s.host+"/api/export", "application/json", strings.NewReader(`{"text":"Hola 世界\n"}`))
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	var response map[string]string
	json.NewDecoder(r.Body).Decode(&response)
	data, err := os.ReadFile(response["path"])
	if err != nil || string(data) != "Hola 世界\n" {
		t.Fatal("export corrupted", err)
	}
	if !strings.HasPrefix(response["path"], s.configDir+string(filepath.Separator)) {
		t.Fatal("export escaped config directory")
	}
}

func TestInvalidDirectory(t *testing.T) {
	if _, err := validDirectory("relative/path"); err == nil {
		t.Fatal("relative path accepted")
	}
	s, c := fixture(t)
	r, err := c.Get("http://" + s.host + "/api/files?path=/definitely-not-a-real-directory-forge")
	if err != nil {
		t.Fatal(err)
	}
	io.Copy(io.Discard, r.Body)
	r.Body.Close()
	if r.StatusCode != 400 {
		t.Fatal("missing path accepted")
	}
}

func TestEmptyDirectoryCanBeOpened(t *testing.T) {
	s, c := fixture(t)
	r, err := c.Get("http://" + s.host + "/api/files?" + url.Values{"path": []string{t.TempDir()}}.Encode())
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	if r.StatusCode != http.StatusOK {
		t.Fatalf("empty directory rejected: %s", r.Status)
	}
	var result struct {
		Entries []fileEntry `json:"entries"`
	}
	if err = json.NewDecoder(r.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if len(result.Entries) != 0 {
		t.Fatal("unexpected entries")
	}
}
