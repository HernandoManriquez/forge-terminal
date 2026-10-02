package server

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

func (s *Server) exportOutput(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<20)).Decode(&request); err != nil {
		fail(w, err, 400)
		return
	}
	dir := filepath.Join(s.configDir, "exports")
	if err := os.MkdirAll(dir, 0700); err != nil {
		fail(w, err, 500)
		return
	}
	path := filepath.Join(dir, "forge-"+time.Now().Format("20060102-150405")+"-"+sessionID()[:6]+".txt")
	if err := os.WriteFile(path, []byte(request.Text), 0600); err != nil {
		fail(w, err, 500)
		return
	}
	writeJSON(w, map[string]string{"path": path})
}
