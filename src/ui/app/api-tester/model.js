import { shellQuote } from "../model.js";
export const blankRequest = () => ({
  id: crypto.randomUUID(),
  name: "Nueva petición",
  method: "GET",
  url: "http://127.0.0.1:8080",
  params: [],
  headers: [],
  form: [],
  bodyType: "none",
  body: "",
  auth: { type: "none", token: "", username: "", password: "" },
});
export function interpolate(text, vars = {}) {
  return String(text || "").replace(/\{\{([A-Za-z_]\w*)\}\}/g, (_, name) => {
    if (!Object.hasOwn(vars, name) || vars[name] === "")
      throw Error("Falta la variable " + name);
    return vars[name];
  });
}
const utf8base64 = (s) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)));
export function buildRequest(draft, vars = {}) {
  const resolve = (s) => interpolate(s, vars);
  const url = new URL(
    String(draft.url).replace(
      /(?:\{\{|%7b%7b)([A-Za-z_]\w*)(?:\}\}|%7d%7d)/gi,
      (_, name) => encodeURIComponent(resolve("{{" + name + "}}")),
    ),
  );
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw Error("Usa HTTP/HTTPS y la sección Autenticación");
  const active = (rows) =>
    (rows || [])
      .filter((r) => r.enabled !== false && r.key.trim())
      .map((r) => ({
        key: resolve(r.key.trim()),
        value: resolve(r.value),
        enabled: true,
      }));
  for (const p of active(draft.params)) url.searchParams.append(p.key, p.value);
  let headers = active(draft.headers),
    body = "";
  if (draft.auth?.type === "bearer")
    headers.push({
      key: "Authorization",
      value: "Bearer " + resolve(draft.auth.token),
      enabled: true,
    });
  if (draft.auth?.type === "basic")
    headers.push({
      key: "Authorization",
      value:
        "Basic " +
        utf8base64(
          resolve(draft.auth.username) + ":" + resolve(draft.auth.password),
        ),
      enabled: true,
    });
  const setDefault = (key, value) => {
    if (!headers.some((h) => h.key.toLowerCase() === key.toLowerCase()))
      headers.push({ key, value, enabled: true });
  };
  if (draft.bodyType === "form") {
    body = new URLSearchParams(
      active(draft.form).map((p) => [p.key, p.value]),
    ).toString();
    setDefault("Content-Type", "application/x-www-form-urlencoded");
  }
  if (["raw", "json"].includes(draft.bodyType)) {
    body = resolve(draft.body);
    if (draft.bodyType === "json") JSON.parse(body);
    setDefault(
      "Content-Type",
      draft.bodyType === "json" ? "application/json" : "text/plain",
    );
  }
  setDefault("Accept", "*/*");
  setDefault("User-Agent", "Forge/0.4");
  for (const h of headers) {
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(h.key) || /[\r\n\0]/.test(h.value))
      throw Error("Cabecera inválida");
  }
  if (new TextEncoder().encode(body).length > 256 * 1024)
    throw Error("El cuerpo supera 256 KiB");
  return { method: draft.method, url: url.href, headers, body };
}
function utf16base64(s) {
  const b = [];
  for (let i = 0; i < s.length; i++) {
    const n = s.charCodeAt(i);
    b.push(n & 255, n >> 8);
  }
  return btoa(String.fromCharCode(...b));
}
export function curlCommand(req, profile = "bash") {
  const args = [
    "-q",
    ...(req.method === "HEAD" ? ["--head"] : []),
    "--http1.1",
    "--globoff",
    "--max-time",
    "30",
    "--request",
    req.method,
    "--url",
    req.url,
    ...req.headers.flatMap((h) => ["--header", h.key + ": " + h.value]),
  ];
  if (req.body) args.push("--data-raw", req.body);
  if (["pwsh", "powershell", "cmd"].includes(profile)) {
    // Config on stdin preserves Unicode and JSON quotes on Windows PowerShell 5.1 too.
    const quoted = (s) =>
      '"' +
      s
        .replaceAll("\\", "\\\\")
        .replaceAll('"', '\\"')
        .replaceAll("\n", "\\n")
        .replaceAll("\r", "\\r")
        .replaceAll("\t", "\\t") +
      '"';
    const config = [
      ...(req.method === "HEAD" ? ["head"] : []),
      "http1.1",
      "globoff",
      "max-time = 30",
      "request = " + quoted(req.method),
      "url = " + quoted(req.url),
      ...req.headers.map((h) => "header = " + quoted(h.key + ": " + h.value)),
      ...(req.body ? ["data-raw = " + quoted(req.body)] : []),
    ].join("\n");
    const script =
      "& { $OutputEncoding = [System.Text.UTF8Encoding]::new($false); " +
      shellQuote(config, "powershell") +
      " | curl.exe -q --config - }";
    return profile === "cmd"
      ? "powershell.exe -NoProfile -EncodedCommand " + utf16base64(script)
      : script;
  }
  return "curl " + args.map((a) => shellQuote(a, profile)).join(" ");
}
export function safeTemplate(draft) {
  const c = JSON.parse(JSON.stringify(draft));
  const safe = (s) => (/^\{\{[A-Za-z_]\w*\}\}$/.test(s || "") ? s : "");
  const u = new URL(c.url);
  u.username = u.password = u.hash = "";
  for (const key of new Set(u.searchParams.keys())) {
    const vals = u.searchParams.getAll(key).map(safe);
    u.searchParams.delete(key);
    for (const v of vals) u.searchParams.append(key, v);
  }
  c.url = u.href;
  for (const key of ["params", "headers", "form"])
    c[key] = (c[key] || []).map((r) => ({ ...r, value: safe(r.value) }));
  c.body = safe(c.body);
  c.auth = { type: c.auth?.type || "none" };
  return c;
}
