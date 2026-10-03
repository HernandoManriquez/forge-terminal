package server

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

const maxEditorBytes = 2 << 20

var errEditorConflict = errors.New("El archivo cambió en el disco. Conserva tus cambios con Guardar como, o recarga el archivo")

type editorDocument struct {
	Path      string `json:"path"`
	Name      string `json:"name"`
	Directory string `json:"directory"`
	Text      string `json:"text"`
	Version   string `json:"version"`
	Newline   string `json:"newline"`
	BOM       bool   `json:"bom"`
	Size      int    `json:"size"`
	resolved  string
	mode      os.FileMode
}

func (s *Server) ConfigureEditor(file string, launch func(string) error) {
	s.editorFile, s.editorLauncher = file, launch
}
func (s *Server) landingPage() string {
	if s.editorFile != "" {
		return "/editor.html?path=" + url.QueryEscape(s.editorFile)
	}
	return "/"
}
func readEditorFile(path string) (*editorDocument, error) {
	if !filepath.IsAbs(path) {
		return nil, errors.New("Usa una ruta absoluta de archivo")
	}
	path = filepath.Clean(path)
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return nil, err
	}
	f, err := os.Open(resolved)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, errors.New("Selecciona un archivo de texto regular")
	}
	b, err := io.ReadAll(io.LimitReader(f, maxEditorBytes+1))
	if err != nil {
		return nil, err
	}
	if len(b) > maxEditorBytes {
		return nil, errors.New("El editor admite archivos de hasta 2 MiB")
	}
	if !utf8.Valid(b) || bytes.IndexByte(b, 0) >= 0 {
		return nil, errors.New("El editor admite texto UTF-8; este archivo es binario o usa otra codificación")
	}
	hash := sha256.New()
	hash.Write([]byte(resolved + "\x00"))
	hash.Write(b)
	doc := &editorDocument{Path: path, Name: filepath.Base(path), Directory: filepath.Dir(path), Version: fmt.Sprintf("%x", hash.Sum(nil)), Newline: "LF", Size: len(b), resolved: resolved, mode: info.Mode().Perm()}
	doc.BOM = bytes.HasPrefix(b, []byte{0xef, 0xbb, 0xbf})
	if doc.BOM {
		b = b[3:]
	}
	text := string(b)
	if strings.Contains(text, "\r") {
		clean := strings.ReplaceAll(text, "\r\n", "")
		if strings.ContainsAny(clean, "\r\n") {
			return nil, errors.New("El archivo mezcla saltos de línea o usa CR; conviértelo a LF o CRLF antes de editarlo")
		}
		doc.Newline = "CRLF"
		text = strings.ReplaceAll(text, "\r\n", "\n")
	}
	doc.Text = text
	return doc, nil
}
func (s *Server) editorOpen(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Path string `json:"path"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&input) != nil {
		fail(w, errors.New("Ruta inválida"), 400)
		return
	}
	doc, err := readEditorFile(input.Path)
	if err != nil {
		fail(w, err, 400)
		return
	}
	if s.editorLauncher != nil {
		if err := s.editorLauncher(doc.Path); err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, map[string]any{"native": true})
		return
	}
	writeJSON(w, map[string]any{"url": "/editor.html?path=" + url.QueryEscape(doc.Path)})
}
func (s *Server) editorRead(w http.ResponseWriter, r *http.Request) {
	doc, err := readEditorFile(r.URL.Query().Get("path"))
	if err != nil {
		fail(w, err, 400)
		return
	}
	writeJSON(w, doc)
}

type editorSaveRequest struct {
	Path    string `json:"path"`
	Text    string `json:"text"`
	Version string `json:"version"`
	Create  bool   `json:"create"`
	Newline string `json:"newline"`
	BOM     bool   `json:"bom"`
}

func saveEditorFile(in editorSaveRequest) (*editorDocument, error) {
	if !filepath.IsAbs(in.Path) {
		return nil, errors.New("Usa una ruta absoluta de archivo")
	}
	if !utf8.ValidString(in.Text) || strings.ContainsAny(in.Text, "\x00\r") {
		return nil, errors.New("Contenido inválido: se requiere texto UTF-8 con saltos LF")
	}
	if in.Newline != "LF" && in.Newline != "CRLF" {
		return nil, errors.New("Formato de salto de línea inválido")
	}
	text := in.Text
	if in.Newline == "CRLF" {
		text = strings.ReplaceAll(text, "\n", "\r\n")
	}
	if in.BOM {
		text = "\ufeff" + text
	}
	if len(text) > maxEditorBytes {
		return nil, errors.New("El editor admite archivos de hasta 2 MiB")
	}
	path := filepath.Clean(in.Path)
	if in.Create {
		f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0666)
		if os.IsExist(err) {
			return nil, errors.New("Ya existe ese archivo. Elige otro nombre o abre el archivo existente")
		}
		if err != nil {
			return nil, err
		}
		_, err = io.WriteString(f, text)
		if err == nil {
			err = f.Sync()
		}
		closeErr := f.Close()
		if err == nil {
			err = closeErr
		}
		if err != nil {
			os.Remove(path)
			return nil, err
		}
		return readEditorFile(path)
	}
	current, err := readEditorFile(path)
	if err != nil {
		return nil, err
	}
	if in.Version == "" || current.Version != in.Version {
		return nil, errEditorConflict
	}
	probe, err := os.OpenFile(current.resolved, os.O_WRONLY, 0)
	if err != nil {
		return nil, err
	}
	if err = probe.Close(); err != nil {
		return nil, err
	}
	f, err := os.CreateTemp(filepath.Dir(current.resolved), ".forge-save-*")
	if err != nil {
		return nil, err
	}
	defer os.Remove(f.Name())
	err = f.Chmod(current.mode)
	if err == nil {
		_, err = io.WriteString(f, text)
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return nil, err
	}
	latest, err := readEditorFile(path)
	if err != nil {
		return nil, err
	}
	if latest.Version != current.Version {
		return nil, errEditorConflict
	}
	if err = os.Rename(f.Name(), current.resolved); err != nil {
		return nil, err
	}
	return readEditorFile(path)
}
func (s *Server) editorSave(w http.ResponseWriter, r *http.Request) {
	var input editorSaveRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 6*maxEditorBytes+16384)).Decode(&input); err != nil {
		fail(w, errors.New("Contenido inválido o demasiado grande"), 400)
		return
	}
	s.editorMu.Lock()
	defer s.editorMu.Unlock()
	doc, err := saveEditorFile(input)
	if err != nil {
		code := 400
		if errors.Is(err, errEditorConflict) {
			code = 409
		}
		fail(w, err, code)
		return
	}
	writeJSON(w, doc)
}
