package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

const apiBodyLimit = 256 << 10
const apiResponseLimit = 2 << 20

type httpPair struct {
	Key     string `json:"key"`
	Value   string `json:"value"`
	Enabled bool   `json:"enabled"`
}
type httpTestRequest struct {
	Method  string     `json:"method"`
	URL     string     `json:"url"`
	Headers []httpPair `json:"headers"`
	Body    string     `json:"body"`
}

var headerName = regexp.MustCompile("^[!#$%&'*+.^_`|~0-9a-zA-Z-]+$")

func validHTTPURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Hostname() == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil {
		return nil, errors.New("Usa una URL HTTP/HTTPS absoluta; introduce credenciales en Autenticación")
	}
	return u, nil
}
func executeHTTP(ctx context.Context, in httpTestRequest) (map[string]any, error) {
	if !strings.Contains("|GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|", "|"+in.Method+"|") {
		return nil, errors.New("Método no admitido")
	}
	if len(in.Body) > apiBodyLimit || len(in.URL) > 16384 || len(in.Headers) > 100 {
		return nil, errors.New("Petición demasiado grande")
	}
	if _, err := validHTTPURL(in.URL); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, in.Method, in.URL, strings.NewReader(in.Body))
	if err != nil {
		return nil, err
	}
	size := 0
	for _, h := range in.Headers {
		size += len(h.Key) + len(h.Value)
		if !headerName.MatchString(h.Key) || strings.ContainsAny(h.Value, "\r\n\x00") || size > 32768 {
			return nil, errors.New("Cabecera inválida o demasiado grande")
		}
		switch strings.ToLower(h.Key) {
		case "host", "content-length", "transfer-encoding", "connection", "expect":
			return nil, errors.New("Cabecera gestionada por HTTP: " + h.Key)
		}
		req.Header.Add(h.Key, h.Value)
	}
	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", "Forge/0.4")
	}
	if req.Header.Get("Accept") == "" {
		req.Header.Set("Accept", "*/*")
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.DisableCompression = true
	transport.ForceAttemptHTTP2 = false
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, apiResponseLimit+1))
	if err != nil {
		return nil, err
	}
	truncated := len(body) > apiResponseLimit
	if truncated {
		body = body[:apiResponseLimit]
	}
	binary := !utf8.Valid(body) || strings.IndexByte(string(body), 0) >= 0
	rendered := string(body)
	if binary {
		rendered = base64.StdEncoding.EncodeToString(body)
	}
	return map[string]any{"status": resp.StatusCode, "statusText": resp.Status, "protocol": resp.Proto, "headers": resp.Header, "body": rendered, "binary": binary, "truncated": truncated, "size": len(body), "timeMs": time.Since(start).Milliseconds()}, nil
}
func (s *Server) apiTest(w http.ResponseWriter, r *http.Request) {
	select {
	case s.apiSlots <- struct{}{}:
		defer func() { <-s.apiSlots }()
	default:
		fail(w, errors.New("Hay cuatro peticiones en curso"), 429)
		return
	}
	var in httpTestRequest
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&in) != nil {
		fail(w, errors.New("Petición inválida"), 400)
		return
	}
	result, err := executeHTTP(r.Context(), in)
	if err != nil {
		fail(w, err, 400)
		return
	}
	writeJSON(w, result)
}

// Saved requests contain request shapes, never auth values or response bodies.
// URL path/name are intentionally persisted: secrets there must use placeholders.
var apiPlaceholder = regexp.MustCompile(`^\{\{[A-Za-z_][A-Za-z0-9_]*\}\}$`)

type savedAPIRequest struct {
	ID       string            `json:"id"`
	Name     string            `json:"name"`
	Method   string            `json:"method"`
	URL      string            `json:"url"`
	Params   []httpPair        `json:"params"`
	Headers  []httpPair        `json:"headers"`
	Form     []httpPair        `json:"form"`
	BodyType string            `json:"bodyType"`
	Body     string            `json:"body"`
	Auth     map[string]string `json:"auth"`
	At       string            `json:"at,omitempty"`
	Status   int               `json:"status,omitempty"`
}

func scrubPairs(pairs []httpPair) []httpPair {
	if len(pairs) > 100 {
		pairs = pairs[:100]
	}
	for i := range pairs {
		if len(pairs[i].Key) > 256 {
			pairs[i].Key = pairs[i].Key[:256]
		}
		if !apiPlaceholder.MatchString(pairs[i].Value) {
			pairs[i].Value = ""
		}
	}
	return pairs
}
func scrubSavedRequests(raw json.RawMessage, limit int) (json.RawMessage, error) {
	var saved []savedAPIRequest
	if json.Unmarshal(raw, &saved) != nil {
		return nil, errors.New("Lista de peticiones inválida")
	}
	if len(saved) > limit {
		saved = saved[len(saved)-limit:]
	}
	for i := range saved {
		q := &saved[i]
		if len(q.Name) > 80 {
			q.Name = q.Name[:80]
		}
		if len(q.ID) > 100 {
			q.ID = ""
		}
		u, err := url.Parse(q.URL)
		if err != nil || u.Hostname() == "" || (u.Scheme != "http" && u.Scheme != "https") {
			return nil, errors.New("URL guardada inválida")
		}
		u.User = nil
		u.Fragment = ""
		query := u.Query()
		for key, values := range query {
			for j, v := range values {
				if !apiPlaceholder.MatchString(v) {
					values[j] = ""
				}
			}
			query[key] = values
		}
		u.RawQuery = query.Encode()
		q.URL = u.String()
		q.Params = scrubPairs(q.Params)
		q.Headers = scrubPairs(q.Headers)
		q.Form = scrubPairs(q.Form)
		if !apiPlaceholder.MatchString(q.Body) {
			q.Body = ""
		}
		kind := q.Auth["type"]
		q.Auth = map[string]string{"type": kind}
	}
	b, err := json.Marshal(saved)
	return b, err
}
