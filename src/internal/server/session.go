package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"sync"
	"time"

	"forge-terminal/src/internal/terminal"
	"github.com/gorilla/websocket"
)

type session struct {
	id   string
	pty  terminal.PTY
	conn *websocket.Conn
	mu   sync.Mutex
	cwd  string
}

func (v *session) directory() string {
	if runtime.GOOS == "linux" {
		if dir, err := os.Readlink(filepath.Join("/proc", strconv.Itoa(v.pty.PID()), "cwd")); err == nil {
			return dir
		}
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	return v.cwd
}

type inputMessage struct {
	Type  string `json:"type"`
	Data  string `json:"data"`
	Cols  int    `json:"cols"`
	Rows  int    `json:"rows"`
	Bytes int    `json:"bytes"`
}

func (s *Server) websocket(w http.ResponseWriter, r *http.Request) {
	var profile *terminal.Profile
	for i := range s.profiles {
		if s.profiles[i].ID == r.URL.Query().Get("profile") {
			profile = &s.profiles[i]
			break
		}
	}
	if profile == nil {
		fail(w, errors.New("Shell profile unavailable"), 400)
		return
	}
	cwd, err := validDirectory(r.URL.Query().Get("cwd"))
	if err != nil {
		fail(w, err, 400)
		return
	}
	select {
	case s.slots <- struct{}{}:
		defer func() { <-s.slots }()
	default:
		fail(w, errors.New("Maximum 8 active terminals"), 429)
		return
	}
	upgrader := websocket.Upgrader{ReadBufferSize: 4096, WriteBufferSize: 16384, CheckOrigin: func(r *http.Request) bool { return r.Header.Get("Origin") == "http://"+s.host }}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	cols, _ := strconv.Atoi(r.URL.Query().Get("cols"))
	rows, _ := strconv.Atoi(r.URL.Query().Get("rows"))
	p, err := terminal.Start(*profile, cwd, cols, rows)
	if err != nil {
		_ = conn.WriteJSON(map[string]any{"type": "error", "message": err.Error()})
		return
	}
	defer p.Close()
	v := &session{id: sessionID(), pty: p, conn: conn, cwd: cwd}
	s.mu.Lock()
	select {
	case <-s.closed:
		s.mu.Unlock()
		return
	default:
	}
	s.sessions[v.id] = v
	s.mu.Unlock()
	defer func() { s.mu.Lock(); delete(s.sessions, v.id); s.mu.Unlock() }()
	conn.SetReadLimit(64 << 10)
	_ = conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	conn.SetPongHandler(func(string) error { return conn.SetReadDeadline(time.Now().Add(90 * time.Second)) })
	_ = conn.WriteJSON(map[string]any{"type": "ready", "id": v.id, "pid": p.PID(), "cwd": cwd, "profile": profile.ID})
	stopped := make(chan struct{})
	streamDone := make(chan struct{})
	defer close(streamDone)
	acks := make(chan int, 128)
	go func() {
		defer close(stopped)
		for {
			_, data, err := conn.ReadMessage()
			if err != nil {
				return
			}
			var m inputMessage
			if json.Unmarshal(data, &m) != nil {
				return
			}
			switch m.Type {
			case "input":
				if len(m.Data) > 32<<10 {
					return
				}
				if _, err = p.Write([]byte(m.Data)); err != nil {
					return
				}
			case "resize":
				_ = p.Resize(m.Cols, m.Rows)
			case "ack":
				if m.Bytes <= 0 || m.Bytes > 64<<10 {
					return
				}
				select {
				case acks <- m.Bytes:
				case <-s.closed:
					return
				case <-streamDone:
					return
				}
			case "cwd":
				if dir, err := validDirectory(m.Data); err == nil {
					v.mu.Lock()
					v.cwd = dir
					v.mu.Unlock()
				}
			}
		}
	}()
	frames := make(chan []byte, 4)
	go func() {
		defer close(frames)
		buf := make([]byte, 16<<10)
		for {
			n, err := p.Read(buf)
			if n > 0 {
				b := append([]byte(nil), buf[:n]...)
				select {
				case frames <- b:
				case <-streamDone:
					// Continue draining while ConPTY shuts down; ClosePseudoConsole
					// can wait for its output pipe to be consumed.
				}
			}
			if err != nil {
				return
			}
		}
	}()
	ping := time.NewTicker(30 * time.Second)
	defer ping.Stop()
	inflight := 0
	for {
		out := frames
		if inflight >= 64<<10 {
			out = nil
		}
		select {
		case <-s.closed:
			return
		case <-stopped:
			return
		case n := <-acks:
			if n > inflight {
				return
			}
			inflight -= n
		case <-ping.C:
			_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if conn.WriteMessage(websocket.PingMessage, nil) != nil {
				return
			}
		case data, ok := <-out:
			if !ok {
				code, _ := p.Wait()
				_ = conn.WriteJSON(map[string]any{"type": "exit", "code": code})
				return
			}
			_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if conn.WriteMessage(websocket.BinaryMessage, data) != nil {
				return
			}
			inflight += len(data)
		}
	}
}
