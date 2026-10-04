package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAPITesterRealHTTP(t *testing.T) {
	var seen string
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		seen = r.Method + " " + r.URL.RawQuery + " " + string(b) + " " + r.Header.Get("Authorization")
		if r.Header.Get("Cookie") != "" {
			t.Error("unexpected cookie")
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(201)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer target.Close()
	out, err := executeHTTP(context.Background(), httpTestRequest{Method: "POST", URL: target.URL + "?a=1", Headers: []httpPair{{Key: "Authorization", Value: "Bearer test-secret"}}, Body: `{"name":"ñ"}`})
	if err != nil {
		t.Fatal(err)
	}
	if out["status"] != 201 || !strings.Contains(seen, `POST a=1 {"name":"ñ"} Bearer test-secret`) {
		t.Fatalf("%v %s", out, seen)
	}
}
func TestAPITesterRedirectLimitsAndValidation(t *testing.T) {
	redirected := false
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/redirect":
			http.Redirect(w, r, "/final", 302)
		case "/final":
			redirected = true
		case "/big":
			_, _ = w.Write([]byte(strings.Repeat("a", apiResponseLimit+100)))
		default:
			_, _ = w.Write([]byte{0, 1, 255})
		}
	}))
	defer target.Close()
	out, err := executeHTTP(context.Background(), httpTestRequest{Method: "GET", URL: target.URL + "/redirect"})
	if err != nil || out["status"] != 302 || redirected {
		t.Fatal(out, err)
	}
	out, err = executeHTTP(context.Background(), httpTestRequest{Method: "GET", URL: target.URL + "/big"})
	if err != nil || out["truncated"] != true || out["size"] != apiResponseLimit {
		t.Fatal(err)
	}
	out, err = executeHTTP(context.Background(), httpTestRequest{Method: "GET", URL: target.URL})
	if err != nil || out["binary"] != true {
		t.Fatal(err)
	}
	for _, in := range []httpTestRequest{{Method: "CONNECT", URL: target.URL}, {Method: "GET", URL: "file:///etc/passwd"}, {Method: "GET", URL: "http://a:b@localhost"}, {Method: "GET", URL: target.URL, Headers: []httpPair{{Key: "X-Test", Value: "bad\r\nHeader: injected"}}}, {Method: "POST", URL: target.URL, Body: strings.Repeat("x", apiBodyLimit+1)}} {
		if _, err := executeHTTP(context.Background(), in); err == nil {
			t.Error("accepted invalid request", in.Method)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := executeHTTP(ctx, httpTestRequest{Method: "GET", URL: target.URL}); err == nil {
		t.Error("request ignored cancellation")
	}
}
func TestAPIStoredTemplatesOmitSecrets(t *testing.T) {
	raw := json.RawMessage(`[{"id":"one","name":"Test","method":"POST","url":"https://user:URLSECRET@example.com/path?token=QUERYSECRET#HASHSECRET","headers":[{"key":"Authorization","value":"Bearer HEADERSECRET","enabled":true}],"params":[{"key":"page","value":"{{PAGE}}","enabled":true}],"body":"BODYSECRET","auth":{"type":"basic","username":"USERSECRET","password":"PASSWORDSECRET"}}]`)
	out, err := scrubSavedRequests(raw, 20)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(out), "SECRET") {
		t.Fatal("secret persisted", string(out))
	}
	if !strings.Contains(string(out), "{{PAGE}}") {
		t.Fatal("lost variable reference")
	}
}
