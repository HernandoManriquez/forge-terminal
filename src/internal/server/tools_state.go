package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
)

func (s *Server) readToolsState() map[string]json.RawMessage {
	state := map[string]json.RawMessage{}
	b, err := os.ReadFile(filepath.Join(s.configDir, "tools.json"))
	if err == nil {
		_ = json.Unmarshal(b, &state)
	}
	if state == nil {
		state = map[string]json.RawMessage{}
	}
	return state
}
func (s *Server) toolsState(w http.ResponseWriter, r *http.Request) {
	s.configMu.Lock()
	defer s.configMu.Unlock()
	writeJSON(w, s.readToolsState())
}
func (s *Server) saveToolsState(w http.ResponseWriter, r *http.Request) {
	var patch map[string]json.RawMessage
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&patch) != nil || patch == nil {
		fail(w, errors.New("Estado de herramientas inválido o demasiado grande"), 400)
		return
	}
	allowed := map[string]bool{"shortcuts": true, "requests": true, "requestHistory": true, "snippets": true, "dataPrefs": true, "inspectorPrefs": true}
	for key := range patch {
		if !allowed[key] {
			fail(w, errors.New("Preferencia desconocida"), 400)
			return
		}
	}
	for key, limit := range map[string]int{"requests": 50, "requestHistory": 20} {
		if raw, ok := patch[key]; ok {
			clean, err := scrubSavedRequests(raw, limit)
			if err != nil {
				fail(w, err, 400)
				return
			}
			patch[key] = clean
		}
	}
	s.configMu.Lock()
	defer s.configMu.Unlock()
	state := s.readToolsState()
	for key, v := range patch {
		state[key] = v
	}
	b, err := json.Marshal(state)
	if err != nil || len(b) > 1<<20 {
		fail(w, errors.New("Estado de herramientas excede 1 MiB"), 413)
		return
	}
	f, err := os.CreateTemp(s.configDir, ".tools-*")
	if err != nil {
		fail(w, err, 500)
		return
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(b); err == nil {
		err = f.Sync()
	}
	ce := f.Close()
	if err == nil {
		err = ce
	}
	if err == nil {
		err = os.Rename(f.Name(), filepath.Join(s.configDir, "tools.json"))
	}
	if err != nil {
		fail(w, err, 500)
		return
	}
	writeJSON(w, state)
}
