export const PAGE_SIZE = 75;
export function visibleRows(snapshot, prefs) {
  const query = (prefs.search || "").toLowerCase();
  const rows = (
    prefs.view === "processes" ? snapshot.processes : snapshot.ports
  ).filter((row) => {
    if (prefs.pid && row.pid !== prefs.pid) return false;
    if (
      prefs.view !== "processes" &&
      ((prefs.protocol && row.protocol !== prefs.protocol) ||
        (prefs.listening && !["LISTEN", "BOUND"].includes(row.state)))
    )
      return false;
    return [
      row.pid,
      row.name,
      row.process,
      row.port,
      row.address,
      row.user,
      row.state,
    ].some((v) =>
      String(v ?? "")
        .toLowerCase()
        .includes(query),
    );
  });
  const key = prefs.sort || (prefs.view === "processes" ? "pid" : "port");
  return rows.sort((a, b) => {
    const av = a[key],
      bv = b[key];
    if (av == null) return 1;
    if (bv == null) return -1;
    return (
      (typeof av === "number"
        ? av - bv
        : String(av).localeCompare(String(bv))) * (prefs.desc ? -1 : 1)
    );
  });
}
export function portURL(port, scheme) {
  let host = port.address;
  if (["0.0.0.0", "::", "::0", ""].includes(host)) host = "127.0.0.1";
  if (host.includes(":")) host = "[" + host + "]";
  return `${scheme || ([443, 8443].includes(port.port) ? "https" : "http")}://${host}:${port.port}`;
}
export const likelyHTTP = (p) =>
  p.protocol === "TCP" &&
  [
    80, 443, 3000, 4200, 5000, 5173, 8000, 8080, 8081, 8443, 8888, 9000,
  ].includes(p.port);
export function nativeCommand(platform, view, pid) {
  if (pid)
    return platform === "windows"
      ? `Stop-Process -Id ${Number(pid)}`
      : `kill -TERM ${Number(pid)}`;
  return platform === "windows"
    ? view === "ports"
      ? "Get-NetTCPConnection; Get-NetUDPEndpoint"
      : "Get-Process | Sort-Object WorkingSet64 -Descending"
    : view === "ports"
      ? "ss -tunap"
      : "ps -eo pid,ppid,user,pcpu,rss,args --sort=-rss";
}
