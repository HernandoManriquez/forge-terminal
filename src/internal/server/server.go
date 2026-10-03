package server

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"forge-terminal/src/internal/terminal"
)

const MaxSessions = 8

type Server struct {
	assets                          fs.FS
	configDir, version, token, host string
	startupCwd                      string
	editorFile                      string
	editorLauncher                  func(string) error
	editorMu                        sync.Mutex
	listener                        net.Listener
	http                            *http.Server
	mu                              sync.Mutex
	configMu                        sync.Mutex
	sessions                        map[string]*session
	slots                           chan struct{}
	closed                          chan struct{}
	once                            sync.Once
	profiles                        []terminal.Profile
	commandsOnce                    sync.Once
	commands                        []string
}

func New(assets fs.FS, configDir, version string) (*Server, error) {
	startupCwd, err := os.Getwd()
	if err != nil {
		return nil, fmt.Errorf("cannot read launch directory: %w", err)
	}
	if configDir == "" {
		base, err := os.UserConfigDir()
		if err != nil {
			return nil, err
		}
		configDir = filepath.Join(base, "forge-terminal")
	}
	if err := os.MkdirAll(configDir, 0700); err != nil {
		return nil, err
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	return &Server{assets: assets, startupCwd: startupCwd, configDir: configDir, version: version, token: hex.EncodeToString(b), sessions: map[string]*session{}, slots: make(chan struct{}, MaxSessions), closed: make(chan struct{}), profiles: terminal.Profiles()}, nil
}

func (s *Server) Start() error {
	ln, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return err
	}
	s.listener = ln
	s.host = ln.Addr().String()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/bootstrap", s.bootstrap)
	mux.HandleFunc("POST /api/config", s.saveConfig)
	mux.HandleFunc("GET /api/files", s.files)
	mux.HandleFunc("POST /api/editor/open", s.editorOpen)
	mux.HandleFunc("GET /api/editor/file", s.editorRead)
	mux.HandleFunc("POST /api/editor/save", s.editorSave)
	mux.HandleFunc("GET /api/context", s.context)
	mux.HandleFunc("GET /api/git", s.gitDetails)
	mux.HandleFunc("GET /api/git/diff", s.gitDiff)
	mux.HandleFunc("GET /api/completions", s.completions)
	mux.HandleFunc("GET /api/metrics", s.metrics)
	mux.HandleFunc("POST /api/export", s.exportOutput)
	mux.HandleFunc("GET /ws", s.websocket)
	mux.Handle("GET /", http.FileServer(http.FS(s.assets)))
	s.http = &http.Server{Handler: s.guard(mux), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 16 << 10}
	go func() { _ = s.http.Serve(ln) }()
	return nil
}

func (s *Server) URL() string           { return "http://" + s.host + "/?token=" + s.token }
func (s *Server) Done() <-chan struct{} { return s.closed }
func (s *Server) Close() {
	s.once.Do(func() {
		close(s.closed)
		if s.http != nil {
			_ = s.http.Close()
		}
		s.mu.Lock()
		list := make([]*session, 0, len(s.sessions))
		for _, v := range s.sessions {
			list = append(list, v)
		}
		s.mu.Unlock()
		for _, v := range list {
			v.conn.Close()
			v.pty.Close()
		}
	})
}

func (s *Server) guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws://"+s.host+"; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
		if r.Host != s.host {
			http.Error(w, "Invalid host", http.StatusForbidden)
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" && origin != "http://"+s.host {
			http.Error(w, "Invalid origin", http.StatusForbidden)
			return
		}
		if r.URL.Path == "/" && r.Method == http.MethodGet && secureEqual(r.URL.Query().Get("token"), s.token) {
			http.SetCookie(w, &http.Cookie{Name: s.cookieName(), Value: s.token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode})
			http.Redirect(w, r, s.landingPage(), http.StatusSeeOther)
			return
		}
		cookie, err := r.Cookie(s.cookieName())
		if err != nil || !secureEqual(cookie.Value, s.token) {
			http.Error(w, "Open Forge from its executable to authorize this window.", http.StatusUnauthorized)
			return
		}
		if r.Method != http.MethodGet && !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
			http.Error(w, "JSON required", http.StatusUnsupportedMediaType)
			return
		}
		next.ServeHTTP(w, r)
	})
}
func (s *Server) cookieName() string {
	_, port, _ := net.SplitHostPort(s.host)
	return "forge_auth_" + port
}
func secureEqual(a, b string) bool {
	return a != "" && subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}
func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, err error, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
}

func (s *Server) bootstrap(w http.ResponseWriter, r *http.Request) {
	home, _ := os.UserHomeDir()
	config := json.RawMessage(`{}`)
	s.configMu.Lock()
	b, err := os.ReadFile(filepath.Join(s.configDir, "settings.json"))
	s.configMu.Unlock()
	if err == nil && json.Valid(b) {
		config = b
	}
	writeJSON(w, map[string]any{"version": s.version, "nativeEditor": s.editorLauncher != nil, "editorFile": s.editorFile, "platform": runtime.GOOS, "home": home, "startupCwd": s.startupCwd, "profiles": s.profiles, "config": config, "maxSessions": MaxSessions, "configPath": filepath.Join(s.configDir, "settings.json")})
}

func (s *Server) saveConfig(w http.ResponseWriter, r *http.Request) {
	b, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		fail(w, errors.New("Configuration exceeds 1 MiB"), 413)
		return
	}
	var obj map[string]any
	if json.Unmarshal(b, &obj) != nil || obj == nil {
		fail(w, errors.New("Invalid configuration"), 400)
		return
	}
	s.configMu.Lock()
	defer s.configMu.Unlock()
	f, err := os.CreateTemp(s.configDir, ".settings-*")
	if err != nil {
		fail(w, err, 500)
		return
	}
	tmp := f.Name()
	defer os.Remove(tmp)
	if _, err = f.Write(b); err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err == nil {
		err = os.Rename(tmp, filepath.Join(s.configDir, "settings.json"))
	}
	if err != nil {
		fail(w, err, 500)
		return
	}
	writeJSON(w, map[string]bool{"ok": true})
}

func validDirectory(path string) (string, error) {
	if path == "" || path == "~" {
		path, _ = os.UserHomeDir()
	}
	if strings.HasPrefix(path, "~/") || strings.HasPrefix(path, `~\`) {
		home, _ := os.UserHomeDir()
		path = filepath.Join(home, path[2:])
	}
	if !filepath.IsAbs(path) {
		return "", errors.New("Use an absolute directory path")
	}
	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", errors.New("Path is not a directory")
	}
	return filepath.Clean(path), nil
}

func (s *Server) metrics(w http.ResponseWriter, r *http.Request) {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	s.mu.Lock()
	count := len(s.sessions)
	s.mu.Unlock()
	writeJSON(w, map[string]any{"sessions": count, "heapBytes": m.HeapAlloc, "reservedBytes": m.Sys, "goroutines": runtime.NumGoroutine(), "scope": "Go backend only; excludes WebView and shells"})
}

func sessionID() string {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		panic(fmt.Sprintf("random source unavailable: %v", err))
	}
	return hex.EncodeToString(b)
}
