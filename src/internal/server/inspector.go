package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"runtime"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v4/common"
	gnet "github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/process"
)

type inspectedProcess struct {
	PID     int32    `json:"pid"`
	Name    string   `json:"name"`
	CPU     *float64 `json:"cpu"`
	Memory  *uint64  `json:"memory"`
	User    string   `json:"user"`
	Created int64    `json:"created"`
}
type inspectedPort struct {
	Port     uint32 `json:"port"`
	Protocol string `json:"protocol"`
	Address  string `json:"address"`
	PID      int32  `json:"pid"`
	Process  string `json:"process"`
	State    string `json:"state"`
}
type inspectorSnapshot struct {
	Processes []inspectedProcess `json:"processes"`
	Ports     []inspectedPort    `json:"ports"`
	Warnings  []string           `json:"warnings"`
	Platform  string             `json:"platform"`
	At        time.Time          `json:"at"`
}
type cpuSample struct {
	seconds float64
	at      time.Time
	created int64
}
type processInspector struct {
	mu      sync.Mutex
	samples map[int32]cpuSample
}

func nativeInspectionContext(ctx context.Context) context.Context {
	return context.WithValue(ctx, common.EnvKey, common.EnvMap{common.HostProcEnvKey: "/proc", common.HostEtcEnvKey: "/etc", common.HostSysEnvKey: "/sys"})
}
func collectPorts(ctx context.Context, names map[int32]string) ([]inspectedPort, error) {
	connections, err := gnet.ConnectionsWithContext(ctx, "inet")
	ports := make([]inspectedPort, 0)
	seen := map[string]bool{}
	for _, c := range connections {
		if c.Laddr.Port == 0 || (c.Type != 1 && c.Type != 2) {
			continue
		}
		protocol, state := "TCP", c.Status
		if c.Type == 2 {
			protocol = "UDP"
			state = "BOUND"
		}
		key := fmt.Sprintf("%s/%s/%d/%d/%s", protocol, c.Laddr.IP, c.Laddr.Port, c.Pid, state)
		if seen[key] {
			continue
		}
		seen[key] = true
		ports = append(ports, inspectedPort{c.Laddr.Port, protocol, c.Laddr.IP, c.Pid, names[c.Pid], state})
		if len(ports) >= 10000 {
			return ports, errors.New("Puertos limitados a 10.000 filas")
		}
	}
	sort.Slice(ports, func(i, j int) bool { return ports[i].Port < ports[j].Port })
	return ports, err
}
func (p *processInspector) snapshot(ctx context.Context) (inspectorSnapshot, error) {
	out := inspectorSnapshot{Processes: []inspectedProcess{}, Ports: []inspectedPort{}, Warnings: []string{}, Platform: runtime.GOOS, At: time.Now()}
	if !p.mu.TryLock() {
		return out, errors.New("Hay una actualización del inspector en curso")
	}
	defer p.mu.Unlock()
	ctx = nativeInspectionContext(ctx)
	pids, err := process.PidsWithContext(ctx)
	if err != nil {
		return out, err
	}
	if len(pids) > 5000 {
		pids = pids[:5000]
		out.Warnings = append(out.Warnings, "Procesos limitados a 5.000 filas")
	}
	next := map[int32]cpuSample{}
	names := map[int32]string{}
	for _, pid := range pids {
		if ctx.Err() != nil {
			out.Warnings = append(out.Warnings, "Tiempo de consulta agotado; datos parciales")
			break
		}
		pr, err := process.NewProcessWithContext(ctx, pid)
		if err != nil {
			continue
		}
		row := inspectedProcess{PID: pid}
		row.Name, _ = pr.NameWithContext(ctx)
		row.User, _ = pr.UsernameWithContext(ctx)
		row.Created, _ = pr.CreateTimeWithContext(ctx)
		if mem, err := pr.MemoryInfoWithContext(ctx); err == nil {
			row.Memory = &mem.RSS
		}
		if times, err := pr.TimesWithContext(ctx); err == nil {
			now := time.Now()
			seconds := times.User + times.System
			if prev, ok := p.samples[pid]; ok && prev.created == row.Created && now.Sub(prev.at) > 100*time.Millisecond && seconds >= prev.seconds {
				value := (seconds - prev.seconds) / now.Sub(prev.at).Seconds() * 100
				row.CPU = &value
			}
			next[pid] = cpuSample{seconds, now, row.Created}
		}
		names[pid] = row.Name
		out.Processes = append(out.Processes, row)
	}
	p.samples = next
	out.Ports, err = collectPorts(ctx, names)
	if err != nil {
		out.Warnings = append(out.Warnings, "Puertos parciales/no disponibles: "+err.Error())
	}
	return out, nil
}
func (s *Server) inspect(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	out, err := s.inspector.snapshot(ctx)
	if err != nil {
		fail(w, err, 503)
		return
	}
	writeJSON(w, out)
}
func inspectProcess(ctx context.Context, pid int32) (map[string]any, error) {
	ctx = nativeInspectionContext(ctx)
	identity, critical, known, err := processIdentity(pid)
	if err != nil {
		return nil, err
	}
	p, err := process.NewProcessWithContext(ctx, pid)
	if err != nil {
		return nil, err
	}
	name, _ := p.NameWithContext(ctx)
	user, _ := p.UsernameWithContext(ctx)
	ppid, _ := p.PpidWithContext(ctx)
	exe, _ := p.ExeWithContext(ctx)
	command, _ := p.CmdlineWithContext(ctx)
	cwd, _ := p.CwdWithContext(ctx)
	ports, _ := collectPorts(ctx, map[int32]string{pid: name})
	own := []inspectedPort{}
	for _, port := range ports {
		if port.PID == pid {
			own = append(own, port)
		}
	}
	current, _, _, err := processIdentity(pid)
	if err != nil || current != identity {
		return nil, errors.New("El proceso cambió durante la consulta; actualiza")
	}
	var memory *uint64
	if mem, err := p.MemoryInfoWithContext(ctx); err == nil {
		memory = &mem.RSS
	}
	protected := ""
	if critical {
		protected = "Proceso crítico identificado por el sistema"
	}
	if pid == int32(os.Getpid()) {
		protected = "Proceso de esta instancia de Forge"
	}
	if pid <= 1 {
		protected = "Proceso del sistema protegido"
	}
	return map[string]any{"pid": pid, "ppid": ppid, "name": name, "user": user, "memory": memory, "exe": exe, "command": command, "cwd": cwd, "ports": own, "identity": identity, "critical": critical, "criticalKnown": known, "protected": protected}, nil
}
func (s *Server) inspectDetail(w http.ResponseWriter, r *http.Request) {
	pid, err := strconv.ParseInt(r.URL.Query().Get("pid"), 10, 32)
	if err != nil || pid < 1 {
		fail(w, errors.New("PID inválido"), 400)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	out, err := inspectProcess(ctx, int32(pid))
	if err != nil {
		fail(w, err, 400)
		return
	}
	writeJSON(w, out)
}
func (s *Server) inspectTerminate(w http.ResponseWriter, r *http.Request) {
	var in struct {
		PID       int32  `json:"pid"`
		Identity  string `json:"identity"`
		Confirmed bool   `json:"confirmed"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&in) != nil || !in.Confirmed || in.Identity == "" {
		fail(w, errors.New("Se requiere confirmación y la identidad actual del proceso"), 400)
		return
	}
	if in.PID <= 1 || in.PID == int32(os.Getpid()) {
		fail(w, errors.New("Proceso protegido"), 403)
		return
	}
	if err := terminateIdentifiedProcess(in.PID, in.Identity); err != nil {
		fail(w, err, 400)
		return
	}
	writeJSON(w, map[string]any{"ok": true, "message": "Solicitud de terminación enviada; actualiza para verificar"})
}
func (s *Server) inspectBrowser(w http.ResponseWriter, r *http.Request) {
	var in struct {
		URL string `json:"url"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 16384)).Decode(&in) != nil {
		fail(w, errors.New("URL inválida"), 400)
		return
	}
	if _, err := validHTTPURL(in.URL); err != nil {
		fail(w, err, 400)
		return
	}
	if err := openInspectorURL(in.URL); err != nil {
		fail(w, err, 400)
		return
	}
	writeJSON(w, map[string]bool{"ok": true})
}
