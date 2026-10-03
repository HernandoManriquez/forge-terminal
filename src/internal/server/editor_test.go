package server

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestEditorRoundTripAndConflict(t *testing.T) {
	for _, tc := range []struct {
		name, raw, newline string
		bom                bool
	}{{"LF", "hola ñ\n", "LF", false}, {"BOM CRLF", "\ufeffhola ñ\r\n", "CRLF", true}, {"empty", "", "LF", false}} {
		t.Run(tc.name, func(t *testing.T) {
			p := filepath.Join(t.TempDir(), "note.txt")
			if err := os.WriteFile(p, []byte(tc.raw), 0644); err != nil {
				t.Fatal(err)
			}
			doc, err := readEditorFile(p)
			if err != nil {
				t.Fatal(err)
			}
			if doc.BOM != tc.bom || doc.Newline != tc.newline {
				t.Fatalf("wrong format: %+v", doc)
			}
			in := editorSaveRequest{Path: p, Text: doc.Text + "new\n", Version: doc.Version, Newline: doc.Newline, BOM: doc.BOM}
			saved, err := saveEditorFile(in)
			if err != nil {
				t.Fatal(err)
			}
			raw, _ := os.ReadFile(p)
			want := strings.ReplaceAll(in.Text, "\n", map[string]string{"LF": "\n", "CRLF": "\r\n"}[tc.newline])
			if tc.bom {
				want = "\ufeff" + want
			}
			if string(raw) != want {
				t.Fatalf("bytes %q, want %q", raw, want)
			}
			if saved.Version == doc.Version {
				t.Fatal("revision unchanged")
			}
			os.WriteFile(p, []byte("external\n"), 0644)
			in.Version = saved.Version
			if _, err = saveEditorFile(in); !errors.Is(err, errEditorConflict) {
				t.Fatalf("want conflict: %v", err)
			}
			raw, _ = os.ReadFile(p)
			if string(raw) != "external\n" {
				t.Fatal("external content lost")
			}
		})
	}
}
func TestEditorRejectsUnsupportedFiles(t *testing.T) {
	for name, content := range map[string][]byte{"binary": {0, 1, 2}, "utf16": {255, 254, 'a', 0}, "oversized": bytes.Repeat([]byte("x"), maxEditorBytes+1), "mixed": []byte("a\r\nb\n"), "CR": []byte("a\rb")} {
		t.Run(name, func(t *testing.T) {
			p := filepath.Join(t.TempDir(), "file")
			os.WriteFile(p, content, 0644)
			if _, err := readEditorFile(p); err == nil {
				t.Fatal("unsupported accepted")
			}
			raw, _ := os.ReadFile(p)
			if !bytes.Equal(raw, content) {
				t.Fatal("file modified")
			}
		})
	}
	for _, p := range []string{"relative.txt", t.TempDir()} {
		if _, err := readEditorFile(p); err == nil {
			t.Fatal("invalid path accepted")
		}
	}
}
func TestEditorSaveAsAndSymlink(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "new.txt")
	in := editorSaveRequest{Path: p, Text: "saved\n", Create: true, Newline: "LF"}
	_, err := saveEditorFile(in)
	if err != nil {
		t.Fatal(err)
	}
	in.Text = "overwrite"
	if _, err = saveEditorFile(in); err == nil {
		t.Fatal("overwrite allowed")
	}
	raw, _ := os.ReadFile(p)
	if string(raw) != "saved\n" {
		t.Fatal("file lost")
	}
	if runtime.GOOS == "windows" {
		return
	}
	link := filepath.Join(dir, "link.txt")
	if err = os.Symlink(p, link); err != nil {
		t.Fatal(err)
	}
	doc, err := readEditorFile(link)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = saveEditorFile(editorSaveRequest{Path: link, Text: "through link", Version: doc.Version, Newline: "LF"}); err != nil {
		t.Fatal(err)
	}
	info, _ := os.Lstat(link)
	if info.Mode()&os.ModeSymlink == 0 {
		t.Fatal("symlink replaced")
	}
	raw, _ = os.ReadFile(p)
	if string(raw) != "through link" {
		t.Fatal("target unchanged")
	}
}
func TestEditorAuthenticatedAPI(t *testing.T) {
	s, c := fixture(t)
	base := "http://" + s.host
	p := filepath.Join(t.TempDir(), "with space.txt")
	os.WriteFile(p, []byte("original"), 0644)
	res, err := http.Get(base + "/api/editor/file?path=" + url.QueryEscape(p))
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 401 {
		t.Fatal("unauthenticated read allowed")
	}
	res, err = c.Get(base + "/api/editor/file?path=" + url.QueryEscape(p))
	if err != nil {
		t.Fatal(err)
	}
	var doc editorDocument
	json.NewDecoder(res.Body).Decode(&doc)
	res.Body.Close()
	if doc.Text != "original" {
		t.Fatal("read failed")
	}
	body, _ := json.Marshal(editorSaveRequest{Path: p, Text: "via API", Version: doc.Version, Newline: "LF"})
	res, err = c.Post(base+"/api/editor/save", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 200 {
		t.Fatal("save failed")
	}
	res, err = c.Post(base+"/api/editor/save", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 409 {
		t.Fatal("no conflict status")
	}
	body, _ = json.Marshal(map[string]string{"path": p})
	res, err = c.Post(base+"/api/editor/open", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var result map[string]string
	json.NewDecoder(res.Body).Decode(&result)
	if !strings.HasPrefix(result["url"], "/editor.html?path=") {
		t.Fatal("no editor URL")
	}
}
func TestIndependentEditorCookies(t *testing.T) {
	a, c := fixture(t)
	b, _ := fixture(t)
	res, err := c.Get(b.URL())
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	for _, s := range []*Server{a, b} {
		res, err = c.Get("http://" + s.host + "/api/bootstrap")
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != 200 {
			t.Fatal("another window logs out existing window")
		}
	}
}
