package server

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestRealPTYResizeUTF8AndFlowControl(t *testing.T) {
	s, c := fixture(t)
	base := "http://" + s.host
	u, _ := url.Parse(base)
	headers := http.Header{"Origin": []string{base}}
	for _, cookie := range c.Jar.Cookies(u) {
		headers.Add("Cookie", cookie.String())
	}
	q := url.Values{"profile": []string{"bash"}, "cwd": []string{t.TempDir()}, "cols": []string{"93"}, "rows": []string{"27"}}
	ws, _, err := websocket.DefaultDialer.Dial("ws://"+s.host+"/ws?"+q.Encode(), headers)
	if err != nil {
		t.Fatal(err)
	}
	defer ws.Close()
	ws.SetReadDeadline(time.Now().Add(15 * time.Second))
	_, b, err := ws.ReadMessage()
	if err != nil {
		t.Fatal(err)
	}
	var ready map[string]any
	json.Unmarshal(b, &ready)
	if ready["type"] != "ready" {
		t.Fatalf("not ready: %s", b)
	}
	ws.WriteJSON(inputMessage{Type: "resize", Cols: 101, Rows: 31})
	// Split final marker so echoed input cannot make the test pass.
	command := "stty size; printf '\\303\\261\\342\\234\\223\\n'; for i in {1..5000}; do printf 'stream-%05d-abcdefghijklmnopqrstuvwxyz\\n' \"$i\"; done; printf 'FLOW_%s\\n' COMPLETE\r"
	if err = ws.WriteJSON(inputMessage{Type: "input", Data: command}); err != nil {
		t.Fatal(err)
	}
	var output strings.Builder
	for {
		kind, data, err := ws.ReadMessage()
		if err != nil {
			t.Fatal(err)
		}
		if kind == websocket.BinaryMessage {
			output.Write(data)
			ws.WriteJSON(inputMessage{Type: "ack", Bytes: len(data)})
			if strings.Contains(output.String(), "FLOW_COMPLETE") {
				break
			}
		}
	}
	text := output.String()
	for _, expected := range []string{"31 101", "ñ✓", "stream-05000", "FLOW_COMPLETE"} {
		if !strings.Contains(text, expected) {
			t.Fatalf("missing %q", expected)
		}
	}
	if len(text) < 180000 {
		t.Fatal("flow-control stress output truncated")
	}
	ws.Close()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		s.mu.Lock()
		count := len(s.sessions)
		s.mu.Unlock()
		if count == 0 {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("session did not clean up after socket close")
}
