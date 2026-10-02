import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import {
  createIcons,
  Monitor,
  Search,
  Maximize,
  Minimize,
  Settings2,
  PanelsTopLeft,
  Bookmark,
  Save,
  Plus,
  Keyboard,
  ArrowUp,
  RefreshCw,
  HardDrive,
  Columns2,
  Rows2,
  PanelRight,
  ChevronUp,
  ChevronDown,
  X,
  Sparkles,
  CornerDownLeft,
  Play,
  FolderOpen,
  Folder,
  File,
  ArrowUpRight,
  GitBranch,
  Activity,
  Lightbulb,
  ArrowRight,
  Terminal as TerminalIcon,
  Check,
  Trash2,
  Copy,
  Download,
  MoreHorizontal,
  SlidersHorizontal,
  Command,
  ChevronRight,
  RotateCcw,
  ExternalLink,
} from "lucide";
import "@xterm/xterm/css/xterm.css";
import "./style.css";
import {
  MAX_PANES,
  leaf,
  leaves,
  splitLeaf,
  removeLeaf,
  sanitizeTree,
  normalizeSettings,
  safeCommand,
  shellQuote,
  shortPath,
} from "./model.js";

const $ = (s) => document.querySelector(s);
const icons = {
  Monitor,
  Search,
  Maximize,
  Minimize,
  Settings2,
  PanelsTopLeft,
  Bookmark,
  Save,
  Plus,
  Keyboard,
  ArrowUp,
  RefreshCw,
  HardDrive,
  Columns2,
  Rows2,
  PanelRight,
  ChevronUp,
  ChevronDown,
  X,
  Sparkles,
  CornerDownLeft,
  Play,
  FolderOpen,
  Folder,
  File,
  ArrowUpRight,
  GitBranch,
  Activity,
  Lightbulb,
  ArrowRight,
  Terminal: TerminalIcon,
  Check,
  Trash2,
  Copy,
  Download,
  MoreHorizontal,
  SlidersHorizontal,
  Command,
  ChevronRight,
  RotateCcw,
  ExternalLink,
};
const icon = (name) => `<i data-lucide="${name}" class="icon"></i>`;
const refreshIcons = () =>
  createIcons({ icons, attrs: { "stroke-width": 1.6 } });
const escapeHTML = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const uid = () => crypto.randomUUID();
const panes = new Map();
let boot,
  settings,
  workspaces = [],
  activeWS,
  activePane,
  focused = false,
  saveTimer,
  toastTimer,
  filePath = "",
  fileParent = "",
  fileRequest = 0,
  lastContext = "",
  closing = false;
let snippets = [],
  history = [],
  suggestions = [],
  suggestionIndex = 0,
  completionTimer,
  completionEpoch = 0,
  modalCleanup = null,
  returnFocus = null,
  persistQueue = Promise.resolve(),
  paletteOpen = false;
const themes = {
  obsidian: {
    background: "#101419",
    foreground: "#d7dee6",
    cursor: "#fb9864",
    selectionBackground: "#654c3c",
    black: "#212831",
    red: "#ef8390",
    green: "#97c6a4",
    yellow: "#e4c789",
    blue: "#8aafd7",
    magenta: "#bea1df",
    cyan: "#88c5c9",
    white: "#d7dee6",
    brightBlack: "#778391",
    brightRed: "#ffa0a9",
    brightGreen: "#b3debc",
    brightYellow: "#f4dfa4",
    brightBlue: "#accdf1",
    brightMagenta: "#d6bdf4",
    brightCyan: "#b1e1e3",
    brightWhite: "#f4f5f7",
  },
  midnight: {
    background: "#101424",
    foreground: "#d7def7",
    cursor: "#bba4ff",
    selectionBackground: "#413769",
    black: "#252a44",
    red: "#f594b5",
    green: "#9cdfbb",
    yellow: "#efd19c",
    blue: "#9fbbff",
    magenta: "#c0a6ed",
    cyan: "#8cdbe0",
    white: "#d7def7",
    brightBlack: "#7d88b5",
    brightRed: "#ffb5cf",
    brightGreen: "#b5f2cd",
    brightYellow: "#ffe3ae",
    brightBlue: "#c4d8ff",
    brightMagenta: "#d8c3ff",
    brightCyan: "#adf1f7",
    brightWhite: "#ffffff",
  },
  paper: {
    background: "#f7f8fa",
    foreground: "#273747",
    cursor: "#b85225",
    selectionBackground: "#cddce9",
    black: "#35445a",
    red: "#ab304e",
    green: "#25704d",
    yellow: "#8b681d",
    blue: "#2868aa",
    magenta: "#7c4ba7",
    cyan: "#216f7d",
    white: "#506070",
    brightBlack: "#7a8897",
    brightRed: "#c33955",
    brightGreen: "#32815a",
    brightYellow: "#9c7218",
    brightBlue: "#397ab6",
    brightMagenta: "#9559c0",
    brightCyan: "#298493",
    brightWhite: "#172331",
  },
};

async function api(path, body) {
  const response = await fetch(
    path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok) {
    let message = await response.text();
    try {
      message = JSON.parse(message).error ?? message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 4300);
}
function current() {
  return panes.get(activePane);
}
function workspace() {
  return workspaces.find((w) => w.id === activeWS);
}
function pathLabel(path) {
  return shortPath(path || boot.home, boot.home);
}
function defaultSnippets() {
  return boot.platform === "windows"
    ? [
        {
          id: uid(),
          name: "Estado del repositorio",
          command: "git status --short",
          tag: "GIT",
        },
        {
          id: uid(),
          name: "Procesos activos",
          command:
            "Get-Process | Sort-Object CPU -Descending | Select-Object -First 10",
          tag: "SISTEMA",
        },
        {
          id: uid(),
          name: "Historial de cambios",
          command: "git log --oneline --graph -15",
          tag: "GIT",
        },
      ]
    : [
        {
          id: uid(),
          name: "Estado del repositorio",
          command: "git status --short",
          tag: "GIT",
        },
        {
          id: uid(),
          name: "Puertos en escucha",
          command: "ss -tuln",
          tag: "RED",
        },
        {
          id: uid(),
          name: "Historial de cambios",
          command: "git log --oneline --graph -15",
          tag: "GIT",
        },
      ];
}
function paneData(profile, cwd) {
  return {
    id: uid(),
    profile: profile || boot.profiles[0]?.id,
    cwd: cwd || boot.home,
    label: "",
    state: "idle",
  };
}
function serialize() {
  return {
    version: 1,
    settings,
    snippets,
    history: settings.historyEnabled ? history.slice(-100) : [],
    activeWS,
    activePane,
    workspaces: workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      tree: w.tree,
    })),
    panes: [...panes.values()].map((p) => ({
      id: p.id,
      profile: p.profile,
      cwd: p.cwd,
      label: p.label,
    })),
  };
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(
    () => persist().catch((e) => toast("No se pudo guardar: " + e.message)),
    450,
  );
}
function persist() {
  clearTimeout(saveTimer);
  const snapshot = serialize();
  persistQueue = persistQueue
    .catch(() => {})
    .then(() => api("/api/config", snapshot));
  return persistQueue;
}
function restore() {
  const c = boot.config || {};
  settings = normalizeSettings(c.settings);
  snippets = Array.isArray(c.snippets)
    ? c.snippets
        .filter(
          (s) => typeof s.name === "string" && typeof s.command === "string",
        )
        .slice(0, 60)
        .map((s) => ({
          id: uid(),
          name: s.name.slice(0, 80),
          command: safeCommand(s.command),
          tag: typeof s.tag === "string" ? s.tag.slice(0, 15) : "PERSONAL",
        }))
    : defaultSnippets();
  history =
    settings.historyEnabled && Array.isArray(c.history)
      ? c.history.filter((h) => typeof h === "string").slice(-100)
      : [];
  if (
    settings.restore &&
    Array.isArray(c.panes) &&
    Array.isArray(c.workspaces)
  ) {
    for (const p of c.panes.slice(0, MAX_PANES)) {
      if (typeof p.id !== "string" || typeof p.cwd !== "string") continue;
      panes.set(p.id, {
        id: p.id,
        cwd: p.cwd,
        profile: boot.profiles.some((s) => s.id === p.profile)
          ? p.profile
          : boot.profiles[0]?.id,
        label: typeof p.label === "string" ? p.label.slice(0, 40) : "",
        state: "idle",
      });
    }
    const seen = new Set();
    for (const w of c.workspaces.slice(0, 8)) {
      const tree = sanitizeTree(w.tree, new Set(panes.keys()), seen);
      if (tree)
        workspaces.push({
          id: typeof w.id === "string" ? w.id : uid(),
          name: String(w.name || "Espacio").slice(0, 40),
          tree,
        });
    }
    for (const id of panes.keys()) if (!seen.has(id)) panes.delete(id);
  }
  if (!workspaces.length) {
    const p = paneData();
    panes.set(p.id, p);
    workspaces = [{ id: uid(), name: "Mi espacio", tree: leaf(p.id) }];
  }
  activeWS = workspaces.some((w) => w.id === c.activeWS)
    ? c.activeWS
    : workspaces[0].id;
  activePane = leaves(workspace().tree).includes(c.activePane)
    ? c.activePane
    : leaves(workspace().tree)[0];
}

function applySettings() {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.style.setProperty(
    "--left-width",
    settings.leftWidth + "px",
  );
  document.documentElement.style.setProperty(
    "--right-width",
    settings.rightWidth + "px",
  );
  $("#app").classList.toggle("hide-left", focused || !settings.leftVisible);
  $("#app").classList.toggle("hide-right", focused || !settings.rightVisible);
  $("#app").classList.toggle("focus-mode", focused);
  $("#file-section").hidden = !settings.showFiles;
  $(".file-heading").hidden = !settings.showFiles;
  $("#metrics-section").hidden = !settings.showMetrics;
  $("#snippets-section").hidden = !settings.showSnippets;
  $("#left-toggle").classList.toggle(
    "selected",
    settings.leftVisible && !focused,
  );
  $("#right-toggle").classList.toggle(
    "selected",
    settings.rightVisible && !focused,
  );
  for (const p of panes.values())
    if (p.term) {
      p.term.options.theme = themes[settings.theme];
      p.term.options.fontSize = settings.fontSize;
      p.term.options.scrollback = settings.scrollback;
    }
  requestAnimationFrame(fitVisible);
}

function send(p, message) {
  if (p?.ws?.readyState !== WebSocket.OPEN) return;
  if (message.type === "input" && message.data.length > 4096) {
    for (let start = 0; start < message.data.length; ) {
      let end = Math.min(start + 4096, message.data.length);
      const last = message.data.charCodeAt(end - 1);
      if (end < message.data.length && last >= 0xd800 && last <= 0xdbff) end--;
      p.ws.send(
        JSON.stringify({ type: "input", data: message.data.slice(start, end) }),
      );
      start = end;
    }
    return;
  }
  p.ws.send(JSON.stringify(message));
}
function fitVisible() {
  for (const id of leaves(workspace()?.tree)) {
    const p = panes.get(id);
    if (p?.fit && p.host.clientWidth > 20 && p.host.clientHeight > 20) {
      try {
        p.fit.fit();
      } catch {}
    }
  }
  updateStatus();
}
function updateStatus() {
  const p = current();
  if (!p) return;
  $("#status-shell").textContent =
    (boot.profiles.find((x) => x.id === p.profile)?.name ||
      p.profile ||
      "Shell") +
    (p.state === "exited"
      ? " · finalizada"
      : p.state === "error"
        ? " · desconectada"
        : "");
  $("#status-cwd").textContent = pathLabel(p.cwd);
  $("#context-cwd").textContent = pathLabel(p.cwd);
  $("#status-size").textContent = p.term
    ? `${p.term.cols} × ${p.term.rows}`
    : "—";
  $("#status-platform").textContent =
    boot.platform === "windows" ? "WINDOWS" : "LINUX";
  const count = [...panes.values()].filter(
    (p) => p.state === "connected",
  ).length;
  $("#session-count").textContent =
    count + " " + (count === 1 ? "sesión" : "sesiones");
  $("#metrics-sessions").textContent = count + " / 8";
}
function setActive(id, focus = true) {
  if (!panes.has(id)) return;
  activePane = id;
  for (const p of panes.values()) p.el?.classList.toggle("active", p.id === id);
  renderTabs();
  updateStatus();
  if (focus) current()?.term?.focus();
  lastContext = "";
  refreshContext();
  scheduleSave();
}

function createPaneDOM(p) {
  if (p.el) return p.el;
  const el = document.createElement("section");
  el.className = "terminal-pane";
  el.dataset.pane = p.id;
  el.innerHTML = `<header class="pane-header"><span class="pane-dot"></span><span class="pane-label"></span><span class="pane-cwd"></span><div class="pane-actions"><button class="icon-button small restart-pane" title="Reiniciar shell" aria-label="Reiniciar shell">${icon("rotate-ccw")}</button><button class="icon-button small export-pane" title="Exportar salida" aria-label="Exportar salida">${icon("download")}</button><button class="icon-button small rename-pane" title="Renombrar panel" aria-label="Renombrar panel">${icon("more-horizontal")}</button><button class="icon-button small close-pane" title="Cerrar panel" aria-label="Cerrar panel">${icon("x")}</button></div></header><div class="terminal-host"></div><div class="pane-message" hidden></div>`;
  p.el = el;
  p.host = el.querySelector(".terminal-host");
  el.querySelector(".pane-label").textContent = p.label || p.profile;
  el.querySelector(".pane-cwd").textContent = pathLabel(p.cwd);
  p.term = new Terminal({
    theme: themes[settings.theme],
    fontFamily:
      '"Cascadia Code", "Cascadia Mono", "DejaVu Sans Mono", "Liberation Mono", Consolas, monospace',
    fontSize: settings.fontSize,
    lineHeight: 1.27,
    letterSpacing: 0,
    cursorBlink: false,
    cursorStyle: "bar",
    scrollback: settings.scrollback,
    allowProposedApi: false,
    convertEol: false,
    allowTransparency: false,
    overviewRulerWidth: 0,
    fastScrollModifier: "alt",
  });
  p.fit = new FitAddon();
  p.search = new SearchAddon();
  p.term.loadAddon(p.fit);
  p.term.loadAddon(p.search);
  p.term.open(p.host);
  p.term.attachCustomKeyEventHandler((e) => !isAppShortcut(e));
  p.term.onData((data) => send(p, { type: "input", data }));
  p.term.onResize(({ cols, rows }) => {
    send(p, { type: "resize", cols, rows });
    if (activePane === p.id) updateStatus();
  });
  p.term.onTitleChange((title) => {
    p.shellTitle = title.slice(0, 120);
    el.querySelector(".pane-label").title = p.shellTitle;
  });
  p.term.onBell(() => {
    el.classList.add("bell");
    setTimeout(() => el.classList.remove("bell"), 350);
  });
  p.term.parser.registerOscHandler(7, (data) => {
    try {
      const u = new URL(data);
      if (u.protocol === "file:") {
        let path = decodeURIComponent(u.pathname);
        if (boot.platform === "windows")
          path = path.replace(/^\/([A-Za-z]:)/, "$1").replaceAll("/", "\\");
        send(p, { type: "cwd", data: path });
      }
    } catch {}
    return true;
  });
  p.host.addEventListener("focusin", () => {
    if (activePane !== p.id) setActive(p.id, false);
  });
  el.addEventListener("pointerdown", () => {
    if (activePane !== p.id) setActive(p.id, false);
  });
  p.host.addEventListener(
    "paste",
    (e) => {
      const data = e.clipboardData?.getData("text/plain");
      if (data && /[\r\n]/.test(data)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        confirmPaste(p, data);
      }
    },
    true,
  );
  el.querySelector(".close-pane").onclick = () => closePaneDialog(p.id);
  el.querySelector(".restart-pane").onclick = () => restartDialog(p.id);
  el.querySelector(".export-pane").onclick = () => exportPane(p);
  el.querySelector(".rename-pane").onclick = () =>
    inputDialog(
      "Renombrar panel",
      "Nombre del panel",
      p.label || p.profile,
      (value) => {
        p.label = value.slice(0, 40);
        el.querySelector(".pane-label").textContent = p.label;
        renderTabs();
        scheduleSave();
      },
    );
  p.observer = new ResizeObserver(() => {
    if (leaves(workspace()?.tree).includes(p.id))
      requestAnimationFrame(() => {
        if (p.host.clientWidth > 20 && p.host.clientHeight > 20) {
          p.fit.fit();
        }
      });
  });
  p.observer.observe(p.host);
  return el;
}

function connect(p) {
  if (p.state === "connected" || p.state === "connecting") return;
  if (!p.profile) {
    showPaneError(p, "No se detectó un shell en este equipo.");
    return;
  }
  p.state = "connecting";
  p.el.querySelector(".pane-message").hidden = true;
  const qs = new URLSearchParams({
    profile: p.profile,
    cwd: p.cwd,
    cols: String(p.term.cols),
    rows: String(p.term.rows),
  });
  const ws = new WebSocket(`ws://${location.host}/ws?${qs}`);
  p.ws = ws;
  ws.binaryType = "arraybuffer";
  ws.onmessage = (e) => {
    if (p.ws !== ws) return;
    if (e.data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(e.data);
      p.term.write(bytes, () => {
        if (p.ws === ws && ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: "ack", bytes: bytes.length }));
      });
      return;
    }
    let m;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    if (m.type === "ready") {
      p.session = m.id;
      p.pid = m.pid;
      p.cwd = m.cwd;
      p.state = "connected";
      p.el.classList.add("connected");
      fitVisible();
      updateStatus();
      refreshContext();
    }
    if (m.type === "error") {
      p.state = "error";
      showPaneError(p, m.message);
    }
    if (m.type === "exit") {
      p.state = "exited";
      p.term.writeln(
        `\r\n\x1b[90m[Proceso finalizado · código ${m.code}]\x1b[0m`,
      );
      showPaneError(p, "Shell finalizado. Puedes reiniciarlo con ↻.");
    }
  };
  ws.onclose = () => {
    if (p.ws !== ws) return;
    p.el?.classList.remove("connected");
    if (p.state !== "exited" && p.state !== "closing") {
      p.state = "error";
      showPaneError(
        p,
        "No se pudo conectar. Verifica la carpeta, el shell o el límite de 8 terminales.",
      );
    }
    updateStatus();
  };
  ws.onerror = () => {};
}
function showPaneError(p, message) {
  const m = p.el.querySelector(".pane-message");
  m.textContent = message;
  m.hidden = false;
  updateStatus();
}

function treeElement(tree) {
  if (tree.type === "leaf") return createPaneDOM(panes.get(tree.id));
  const container = document.createElement("div");
  container.className = "split split-" + tree.axis;
  const a = document.createElement("div"),
    b = document.createElement("div"),
    separator = document.createElement("div");
  a.className = b.className = "split-child";
  separator.className = "split-resizer";
  separator.role = "separator";
  separator.tabIndex = 0;
  separator.setAttribute("aria-label", "Redimensionar paneles");
  separator.setAttribute(
    "aria-orientation",
    tree.axis === "row" ? "vertical" : "horizontal",
  );
  a.style.flexBasis = `${tree.ratio * 100}%`;
  b.style.flex = "1";
  a.append(treeElement(tree.a));
  b.append(treeElement(tree.b));
  container.append(a, separator, b);
  const apply = (r) => {
    tree.ratio = Math.max(0.15, Math.min(0.85, r));
    a.style.flexBasis = `${tree.ratio * 100}%`;
  };
  separator.onpointerdown = (e) => {
    e.preventDefault();
    separator.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing");
    const rect = container.getBoundingClientRect();
    const move = (e) =>
      apply(
        tree.axis === "row"
          ? (e.clientX - rect.left) / rect.width
          : (e.clientY - rect.top) / rect.height,
      );
    const end = () => {
      separator.removeEventListener("pointermove", move);
      separator.removeEventListener("pointerup", end);
      document.body.classList.remove("resizing");
      scheduleSave();
      fitVisible();
    };
    separator.addEventListener("pointermove", move);
    separator.addEventListener("pointerup", end, { once: true });
    separator.addEventListener("pointercancel", end, { once: true });
  };
  separator.onkeydown = (e) => {
    if (["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      apply(
        tree.ratio +
          (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -0.05 : 0.05),
      );
      scheduleSave();
    }
  };
  separator.ondblclick = () => {
    apply(0.5);
    scheduleSave();
  };
  return container;
}
function render() {
  const w = workspace();
  $("#workspace-title").textContent = w.name;
  $("#main-title").textContent = w.name;
  $("#terminal-grid").replaceChildren(treeElement(w.tree));
  renderWorkspaces();
  renderTabs();
  renderSnippets();
  applySettings();
  refreshIcons();
  requestAnimationFrame(() => {
    fitVisible();
    for (const id of leaves(w.tree)) {
      const p = panes.get(id);
      if (p.state === "idle") connect(p);
    }
    setActive(activePane);
  });
}
function renderWorkspaces() {
  const list = $("#workspace-list");
  list.replaceChildren();
  for (const w of workspaces) {
    const b = document.createElement("button");
    b.className = "workspace-item" + (w.id === activeWS ? " active" : "");
    b.innerHTML = `${icon("terminal")}<span>${escapeHTML(w.name)}</span><span class="workspace-number">${leaves(w.tree).length}</span>`;
    b.onclick = () => {
      activeWS = w.id;
      activePane = leaves(w.tree)[0];
      render();
      scheduleSave();
    };
    b.ondblclick = () => renameWorkspace();
    list.append(b);
  }
}
function renderTabs() {
  const list = $("#pane-tabs");
  list.replaceChildren();
  for (const id of leaves(workspace()?.tree)) {
    const p = panes.get(id),
      b = document.createElement("button");
    b.className = "pane-tab" + (id === activePane ? " active" : "");
    b.textContent = p.label || p.profile || "Shell";
    b.title = "Enfocar " + b.textContent;
    b.onclick = () => setActive(id);
    list.append(b);
  }
  for (const p of panes.values())
    p.el?.classList.toggle("active", p.id === activePane);
}
function newPanel(profile, cwd, axis = "row") {
  if (panes.size >= MAX_PANES) {
    toast("Máximo 8 paneles. Cierra uno para liberar recursos.");
    return;
  }
  const p = paneData(profile, cwd);
  panes.set(p.id, p);
  workspace().tree = splitLeaf(workspace().tree, activePane, p.id, axis);
  activePane = p.id;
  render();
  scheduleSave();
}
function disposePane(p) {
  p.state = "closing";
  p.ws?.close();
  p.observer?.disconnect();
  p.term?.dispose();
  p.el?.remove();
  panes.delete(p.id);
}
function closePane(id) {
  const w = workspaces.find((w) => leaves(w.tree).includes(id));
  if (!w) return;
  const tree = removeLeaf(w.tree, id);
  disposePane(panes.get(id));
  if (tree) {
    w.tree = tree;
  } else {
    workspaces = workspaces.filter((v) => v.id !== w.id);
  }
  if (!workspaces.length) {
    const p = paneData();
    panes.set(p.id, p);
    workspaces.push({ id: uid(), name: "Mi espacio", tree: leaf(p.id) });
  }
  if (!workspaces.some((w) => w.id === activeWS)) activeWS = workspaces[0].id;
  activePane = leaves(workspace().tree)[0];
  render();
  scheduleSave();
}
function closePaneDialog(id) {
  confirmDialog(
    "Cerrar terminal",
    "Se cerrará el shell de este panel y sus procesos asociados.",
    "Cerrar panel",
    () => closePane(id),
  );
}
function restartDialog(id) {
  confirmDialog(
    "Reiniciar terminal",
    "Se cerrará el shell actual y se iniciará uno nuevo en la carpeta del panel.",
    "Reiniciar",
    () => {
      const p = panes.get(id);
      p.state = "closing";
      p.ws?.close();
      p.ws = null;
      p.term.reset();
      p.state = "idle";
      setTimeout(() => connect(p), 200);
    },
  );
}

async function refreshContext() {
  const p = current();
  if (!p?.session || p.state !== "connected") return;
  const id = p.id;
  try {
    const info = await api(
      "/api/context?id=" +
        encodeURIComponent(p.session) +
        "&git=" +
        (settings.rightVisible && !focused ? "1" : "0"),
    );
    if (current()?.id !== id || !info.cwd) return;
    p.cwd = info.cwd;
    p.el.querySelector(".pane-cwd").textContent = pathLabel(p.cwd);
    updateStatus();
    $("#git-branch").textContent = info.git?.branch || "Sin repositorio";
    $("#git-status").textContent = info.git
      ? info.git.modified + " archivos rastreados modificados"
      : "El estado Git aparece aquí";
    $("#git-context").classList.toggle("has-git", !!info.git);
    if (lastContext !== p.cwd) {
      lastContext = p.cwd;
      loadFiles(p.cwd);
      scheduleSave();
    }
  } catch {}
}
async function refreshMetrics() {
  if (
    document.hidden ||
    !settings.showMetrics ||
    !settings.rightVisible ||
    focused
  )
    return;
  try {
    const m = await api("/api/metrics");
    $("#memory-value").textContent = (m.heapBytes / 1048576).toFixed(1) + " MB";
    $("#memory-bar").style.width =
      Math.min(100, (m.heapBytes / (64 * 1048576)) * 100) + "%";
    $("#metrics-sessions").textContent = m.sessions + " / 8";
  } catch {}
}
async function loadFiles(path) {
  if (!settings.showFiles) return;
  const epoch = ++fileRequest;
  try {
    const data = await api(
      "/api/files?" +
        new URLSearchParams({ path, hidden: settings.showHidden ? "1" : "0" }),
    );
    if (epoch !== fileRequest) return;
    filePath = data.path;
    fileParent = data.parent;
    $("#file-path").textContent = pathLabel(data.path);
    $("#file-path").title = data.path;
    const list = $("#file-list");
    list.replaceChildren();
    for (const entry of data.entries) {
      const b = document.createElement("button");
      b.className = "file-entry" + (entry.directory ? " directory" : "");
      b.innerHTML = `${icon(entry.directory ? "folder" : "file")}<span>${escapeHTML(entry.name)}</span>${entry.directory ? icon("chevron-right") : ""}`;
      b.title = entry.path;
      b.onclick = () =>
        entry.directory
          ? loadFiles(entry.path)
          : putComposer(shellQuote(entry.path, current().profile));
      b.oncontextmenu = (e) => {
        e.preventDefault();
        if (entry.directory) openProfileDialog(entry.path);
        else putComposer(shellQuote(entry.path, current().profile));
      };
      list.append(b);
    }
    if (!data.entries.length)
      list.innerHTML = '<p class="empty-state">Carpeta vacía</p>';
    if (data.truncated)
      list.insertAdjacentHTML(
        "beforeend",
        '<p class="empty-state">Vista limitada a 200 entradas.</p>',
      );
    refreshIcons();
  } catch (e) {
    if (epoch === fileRequest) {
      $("#file-list").innerHTML =
        '<p class="empty-state">' + escapeHTML(e.message) + "</p>";
    }
  }
}

function renderSnippets() {
  const list = $("#snippet-list");
  list.replaceChildren();
  for (const s of snippets) {
    const row = document.createElement("div");
    row.className = "snippet-item";
    const b = document.createElement("button");
    b.className = "snippet-main";
    b.innerHTML = `<span class="snippet-top"><strong>${escapeHTML(s.name)}</strong><span>${escapeHTML(s.tag || "PERSONAL")}</span></span><code>${escapeHTML(s.command)}</code>`;
    b.onclick = () => putComposer(s.command);
    b.title = "Insertar en compositor";
    const del = document.createElement("button");
    del.className = "snippet-delete icon-button small";
    del.innerHTML = icon("x");
    del.title = "Eliminar favorito";
    del.setAttribute("aria-label", "Eliminar " + s.name);
    del.onclick = () => {
      snippets = snippets.filter((x) => x.id !== s.id);
      renderSnippets();
      refreshIcons();
      scheduleSave();
    };
    row.append(b, del);
    list.append(row);
  }
}
function putComposer(command) {
  $("#command-input").value = command;
  $("#command-input").focus();
  requestCompletions();
}
async function requestCompletions() {
  const epoch = ++completionEpoch;
  clearTimeout(completionTimer);
  const line = $("#command-input").value;
  if (!line.trim()) {
    $("#suggestions").hidden = true;
    return;
  }
  completionTimer = setTimeout(async () => {
    try {
      const p = current();
      const remote = await api(
        "/api/completions?" +
          new URLSearchParams({ line, cwd: p.cwd, profile: p.profile }),
      );
      if (epoch !== completionEpoch) return;
      const local = [
        ...snippets.map((s) => ({
          label: s.name,
          value: s.command,
          kind: "favorite",
        })),
        ...history
          .slice()
          .reverse()
          .map((h) => ({ label: h, value: h, kind: "history" })),
      ].filter((s) => s.value.toLowerCase().startsWith(line.toLowerCase()));
      const seen = new Set();
      suggestions = [...local, ...remote]
        .filter((s) => {
          if (seen.has(s.value)) return false;
          seen.add(s.value);
          return true;
        })
        .slice(0, 7);
      suggestionIndex = 0;
      renderSuggestions();
    } catch {}
  }, 120);
}
function renderSuggestions() {
  const box = $("#suggestions");
  box.replaceChildren();
  box.hidden =
    !suggestions.length || document.activeElement !== $("#command-input");
  for (const [i, s] of suggestions.entries()) {
    const b = document.createElement("button");
    b.className = "suggestion" + (i === suggestionIndex ? " active" : "");
    const labels = {
      directory: "carpeta",
      file: "archivo",
      command: "comando",
      argument: "argumento",
      favorite: "favorito",
      history: "historial",
    };
    b.innerHTML = `${icon(s.kind === "directory" ? "folder" : s.kind === "favorite" ? "bookmark" : "terminal")}<span>${escapeHTML(s.value)}</span><small>${labels[s.kind] || s.kind}</small>${i === suggestionIndex ? "<kbd>Tab</kbd>" : ""}`;
    b.onpointerdown = (e) => {
      e.preventDefault();
      suggestionIndex = i;
      chooseSuggestion();
    };
    box.append(b);
  }
  refreshIcons();
}
function chooseSuggestion() {
  const s = suggestions[suggestionIndex];
  if (!s) return;
  $("#command-input").value = s.value;
  $("#suggestions").hidden = true;
  suggestions = [];
  completionEpoch++;
  $("#command-input").focus();
}
function insertCommand(run = false) {
  const text = safeCommand($("#command-input").value);
  if (!text.trim()) return;
  const p = current();
  if (p.state !== "connected") {
    toast("Este shell no está conectado. Reinícialo o abre otro panel.");
    return;
  }
  if (/[\r\n]/.test(text)) {
    confirmPaste(p, text, run);
    return;
  }
  performCommand(p, text, run);
}
function performCommand(p, text, run) {
  send(p, { type: "input", data: text + (run ? "\r" : "") });
  if (run && settings.historyEnabled) {
    history = history.filter((h) => h !== text);
    history.push(text);
    history = history.slice(-100);
    scheduleSave();
  }
  $("#command-input").value = "";
  $("#suggestions").hidden = true;
  p.term.focus();
}
function confirmPaste(p, text, run = false) {
  showModal(
    `<div class="modal-head"><h2 id="modal-title">Pegar varias líneas</h2><button class="icon-button modal-close" aria-label="Cerrar">${icon("x")}</button></div><p class="modal-description">Este texto contiene saltos de línea que el shell podría ejecutar. Revisa el contenido antes de enviarlo.</p><pre class="paste-preview">${escapeHTML(text.slice(0, 16000))}</pre><div class="modal-footer"><button class="button cancel">Cancelar</button><button class="button primary confirm-paste">Pegar en terminal</button></div>`,
  );
  $(".confirm-paste").onclick = () => {
    closeModal();
    if (run) performCommand(p, text, true);
    else p.term.paste(text);
  };
  $(".cancel").onclick = closeModal;
}

function showModal(html) {
  closeModal(false);
  returnFocus = document.activeElement;
  $("#modal").innerHTML = html;
  $("#modal-layer").hidden = false;
  paletteOpen = false;
  $(".modal-close")?.addEventListener("click", () => closeModal());
  refreshIcons();
  requestAnimationFrame(() =>
    $("#modal input, #modal select, #modal button")?.focus(),
  );
}
function closeModal(focus = true) {
  modalCleanup?.();
  modalCleanup = null;
  paletteOpen = false;
  $("#modal-layer").hidden = true;
  $("#modal").innerHTML = "";
  if (focus) {
    if (returnFocus?.isConnected) returnFocus.focus();
    else current()?.term?.focus();
  }
}
function inputDialog(title, label, value, onSubmit) {
  showModal(
    `<div class="modal-head"><h2 id="modal-title">${escapeHTML(title)}</h2><button class="icon-button modal-close" aria-label="Cerrar">${icon("x")}</button></div><form id="input-form"><label class="field">${escapeHTML(label)}<input id="dialog-input" value="${escapeHTML(value)}" required maxlength="512"></label><div class="modal-footer"><button type="button" class="button cancel">Cancelar</button><button class="button primary">Guardar</button></div></form>`,
  );
  $(".cancel").onclick = () => closeModal();
  $("#input-form").onsubmit = (e) => {
    e.preventDefault();
    const v = $("#dialog-input").value.trim();
    if (v) {
      closeModal();
      onSubmit(v);
    }
  };
}
function confirmDialog(title, description, action, callback) {
  showModal(
    `<div class="modal-head"><h2 id="modal-title">${escapeHTML(title)}</h2><button class="icon-button modal-close" aria-label="Cerrar">${icon("x")}</button></div><p class="modal-description">${escapeHTML(description)}</p><div class="modal-footer"><button class="button cancel">Cancelar</button><button class="button primary confirm">${escapeHTML(action)}</button></div>`,
  );
  $(".cancel").onclick = () => closeModal();
  $(".confirm").onclick = () => {
    closeModal();
    callback();
  };
}
function openProfileDialog(
  cwd = current()?.cwd || boot.home,
  newWorkspace = false,
) {
  if (panes.size >= MAX_PANES) {
    toast("Límite de 8 paneles. Cierra uno antes de crear otro.");
    return;
  }
  showModal(
    `<div class="modal-head"><div><span class="eyebrow">TU SIGUIENTE SESIÓN</span><h2 id="modal-title">${newWorkspace ? "Nuevo espacio" : "Nueva terminal"}</h2></div><button class="icon-button modal-close" aria-label="Cerrar">${icon("x")}</button></div><form id="profile-form">${newWorkspace ? '<label class="field">Nombre del espacio<input id="new-space-name" value="Nuevo proyecto" required maxlength="40"></label>' : ""}<label class="field">Perfil de shell<select id="new-profile">${boot.profiles.map((p) => `<option value="${escapeHTML(p.id)}" ${p.id === current()?.profile ? "selected" : ""}>${escapeHTML(p.name)}</option>`).join("")}</select></label><label class="field">Carpeta inicial<input id="new-cwd" value="${escapeHTML(cwd)}" required></label>${newWorkspace ? "" : '<label class="field">Distribución<select id="new-axis"><option value="row">Dividir en columnas</option><option value="col">Dividir en filas</option></select></label>'}<p class="form-error" id="profile-error"></p><div class="modal-footer"><button type="button" class="button cancel">Cancelar</button><button class="button primary">${icon("plus")}Crear</button></div></form>`,
  );
  $(".cancel").onclick = () => closeModal();
  $("#profile-form").onsubmit = async (e) => {
    e.preventDefault();
    const profile = $("#new-profile").value,
      cwd = $("#new-cwd").value,
      name = $("#new-space-name")?.value,
      axis = $("#new-axis")?.value;
    try {
      const result = await api(
        "/api/files?" + new URLSearchParams({ path: cwd }),
      );
      closeModal();
      if (newWorkspace) {
        const p = paneData(profile, result.path);
        panes.set(p.id, p);
        const w = {
          id: uid(),
          name: name || "Nuevo espacio",
          tree: leaf(p.id),
        };
        workspaces.push(w);
        activeWS = w.id;
        activePane = p.id;
        render();
        scheduleSave();
      } else newPanel(profile, result.path, axis);
    } catch (error) {
      $("#profile-error").textContent = error.message;
    }
  };
}
function renameWorkspace() {
  inputDialog("Nombre del espacio", "Nombre", workspace().name, (v) => {
    workspace().name = v.slice(0, 40);
    renderWorkspaces();
    $("#main-title").textContent = workspace().name;
    $("#workspace-title").textContent = workspace().name;
    refreshIcons();
    scheduleSave();
  });
}
async function saveWorkspace() {
  try {
    await persist();
    toast("Espacio guardado: " + workspace().name);
  } catch (e) {
    toast("No se pudo guardar: " + e.message);
  }
}
async function exportPane(p) {
  const b = p.term.buffer.active;
  let text = "";
  for (let i = 0; i < b.length; i++)
    text += (b.getLine(i)?.translateToString(true) || "") + "\n";
  try {
    const result = await api("/api/export", { text });
    showModal(
      `<div class="modal-head"><h2 id="modal-title">Salida exportada</h2><button class="icon-button modal-close" aria-label="Cerrar">${icon("x")}</button></div><p class="modal-description">Archivo de texto guardado en tu equipo. Incluye la salida visible y las líneas retenidas en memoria.</p><div class="settings-content"><label class="field">Ruta del archivo<input readonly value="${escapeHTML(result.path)}"></label></div><div class="modal-footer"><button class="button primary export-done">Listo</button></div>`,
    );
    $(".export-done").onclick = () => closeModal();
  } catch (e) {
    toast("No se pudo exportar: " + e.message);
  }
}
function addSnippet() {
  showModal(
    `<div class="modal-head"><h2 id="modal-title">Guardar comando favorito</h2><button class="icon-button modal-close" aria-label="Cerrar">${icon("x")}</button></div><form id="snippet-form"><label class="field">Nombre<input id="snippet-name" required maxlength="80" placeholder="Ej. Revisar contenedores"></label><label class="field">Comando<textarea id="snippet-command" rows="4" required maxlength="8192">${escapeHTML($("#command-input").value)}</textarea></label><p class="modal-description">Los favoritos se insertan en el compositor para que puedas revisarlos.</p><div class="modal-footer"><button class="button primary">Guardar favorito</button></div></form>`,
  );
  $("#snippet-form").onsubmit = (e) => {
    e.preventDefault();
    if (snippets.length >= 60) {
      toast("Límite de 60 favoritos");
      return;
    }
    snippets.push({
      id: uid(),
      name: $("#snippet-name").value,
      command: safeCommand($("#snippet-command").value),
      tag: "PERSONAL",
    });
    closeModal();
    renderSnippets();
    refreshIcons();
    scheduleSave();
  };
}

function settingsDialog() {
  showModal(
    `<div class="modal-head"><div><span class="eyebrow">HAZLO TUYO</span><h2 id="modal-title">Preferencias</h2></div><button class="icon-button modal-close" aria-label="Cerrar">${icon("x")}</button></div><div class="settings-content"><span class="label">APARIENCIA</span><div class="theme-options">${[
      ["obsidian", "Obsidiana", "#101419", "#fb9864"],
      ["midnight", "Medianoche", "#101424", "#bba4ff"],
      ["paper", "Papel", "#f7f8fa", "#b85225"],
    ]
      .map(
        ([id, name, bg, accent]) =>
          `<button class="theme-option ${settings.theme === id ? "selected" : ""}" data-theme-choice="${id}"><span class="theme-preview" style="background:${bg}"><span style="background:${accent}"></span><span></span><span></span></span><strong>${name}</strong></button>`,
      )
      .join(
        "",
      )}</div><div class="settings-grid"><label class="field">Tamaño de letra<select id="pref-font">${[11, 12, 13, 14, 15, 16, 18, 20, 22].map((n) => `<option ${settings.fontSize === n ? "selected" : ""}>${n}</option>`).join("")}</select></label><label class="field">Líneas de historial<select id="pref-scrollback">${[500, 1000, 3000, 5000, 10000].map((n) => `<option ${settings.scrollback === n ? "selected" : ""}>${n}</option>`).join("")}</select></label></div><span class="label">PANELES Y SESIONES</span>${[
      ["leftVisible", "Explorador y espacios"],
      ["rightVisible", "Panel de contexto"],
      ["showFiles", "Lista de archivos"],
      ["showHidden", "Mostrar archivos ocultos"],
      ["showMetrics", "Memoria del motor"],
      ["showSnippets", "Comandos favoritos"],
      ["restore", "Restaurar distribución al abrir"],
      ["historyEnabled", "Guardar historial del compositor"],
    ]
      .map(
        ([key, label]) =>
          `<label class="toggle-row"><span>${label}</span><input type="checkbox" data-pref="${key}" ${settings[key] ? "checked" : ""}><span class="switch"></span></label>`,
      )
      .join(
        "",
      )}<p class="settings-note">Se restauran carpetas y paneles con shells nuevos. Los procesos y la salida anterior no se recuperan. El historial del compositor se guarda sin cifrar solo si lo habilitas.</p><button id="clear-history" class="text-button">Borrar historial del compositor</button><div class="settings-path"><span class="label">CONFIGURACIÓN LOCAL</span><code>${escapeHTML(boot.configPath)}</code></div></div><div class="modal-footer"><span class="muted small-text">Los cambios se guardan automáticamente</span><button id="done-settings" class="button primary">Listo</button></div>`,
  );
  for (const b of document.querySelectorAll("[data-theme-choice]"))
    b.onclick = () => {
      settings.theme = b.dataset.themeChoice;
      document
        .querySelectorAll("[data-theme-choice]")
        .forEach((x) => x.classList.toggle("selected", x === b));
      applySettings();
      scheduleSave();
    };
  $("#pref-font").onchange = (e) => {
    settings.fontSize = Number(e.target.value);
    applySettings();
    scheduleSave();
  };
  $("#pref-scrollback").onchange = (e) => {
    settings.scrollback = Number(e.target.value);
    applySettings();
    scheduleSave();
  };
  for (const checkbox of document.querySelectorAll("[data-pref]"))
    checkbox.onchange = () => {
      settings[checkbox.dataset.pref] = checkbox.checked;
      if (!settings.historyEnabled) history = [];
      applySettings();
      loadFiles(filePath || current().cwd);
      scheduleSave();
    };
  $("#clear-history").onclick = () => {
    history = [];
    scheduleSave();
    toast("Historial del compositor borrado");
  };
  $("#done-settings").onclick = () => closeModal();
}

const shortcutRows = [
  ["Ctrl + K", "Abrir paleta de comandos"],
  ["Ctrl + Espacio", "Enfocar compositor"],
  ["Ctrl + Shift + T", "Nueva terminal"],
  ["Ctrl + Shift + D", "Dividir en columnas"],
  ["Ctrl + Shift + E", "Dividir en filas"],
  ["Ctrl + Shift + G", "Buscar en la salida"],
  ["Ctrl + Shift + F", "Modo enfoque"],
  ["Ctrl + Shift + S", "Guardar espacio"],
  ["Ctrl + Shift + W", "Cerrar panel"],
  ["Alt + 1…8", "Enfocar panel"],
  ["Tab", "Autocompletar (shell o compositor)"],
  ["Ctrl + C", "Interrumpir programa en terminal"],
  ["Ctrl + Shift + C", "Copiar selección"],
  ["Ctrl + Shift + V", "Pegar del portapapeles"],
];
function helpDialog() {
  showModal(
    `<div class="modal-head"><div><span class="eyebrow">MENOS CLICS. MÁS FLUJO.</span><h2 id="modal-title">Atajos de teclado</h2></div><button class="icon-button modal-close" aria-label="Cerrar">${icon("x")}</button></div><div class="shortcut-list">${shortcutRows.map(([key, label]) => `<div><span>${label}</span><kbd>${key}</kbd></div>`).join("")}</div><p class="settings-note">Arrastra los separadores para ajustar paneles. Doble clic para repartir por igual. Doble clic sobre el espacio para renombrarlo. Clic derecho sobre una carpeta para abrir una terminal allí.</p>`,
  );
}
function actions() {
  return [
    ["Nueva terminal", "Ctrl Shift T", "terminal", () => openProfileDialog()],
    [
      "Nuevo espacio de trabajo",
      "",
      "panels-top-left",
      () => openProfileDialog(current().cwd, true),
    ],
    [
      "Dividir en columnas",
      "Ctrl Shift D",
      "columns-2",
      () => newPanel(current().profile, current().cwd, "row"),
    ],
    [
      "Dividir en filas",
      "Ctrl Shift E",
      "rows-2",
      () => newPanel(current().profile, current().cwd, "col"),
    ],
    ["Guardar espacio", "Ctrl Shift S", "save", saveWorkspace],
    ["Renombrar espacio", "", "more-horizontal", renameWorkspace],
    ["Modo enfoque", "Ctrl Shift F", "maximize", toggleFocus],
    ["Buscar en terminal", "Ctrl Shift G", "search", openSearch],
    ["Preferencias", "", "settings-2", settingsDialog],
    ["Nuevo comando favorito", "", "bookmark", addSnippet],
    [
      "Exportar salida de terminal",
      "",
      "download",
      () => exportPane(current()),
    ],
    ["Mostrar u ocultar explorador", "", "folder", toggleLeft],
    ["Mostrar u ocultar contexto", "", "panel-right", toggleRight],
    ["Limpiar pantalla local", "", "rotate-ccw", () => current().term.clear()],
    ["Atajos de teclado", "", "keyboard", helpDialog],
    ...snippets.map((s) => [
      "Favorito: " + s.name,
      "",
      "bookmark",
      () => putComposer(s.command),
    ]),
  ];
}
function palette() {
  showModal(
    `<div class="palette-input-wrap">${icon("search")}<input id="palette-input" aria-label="Buscar acción" placeholder="¿Qué quieres hacer?" autocomplete="off"><kbd>Esc</kbd></div><h2 id="modal-title" class="sr-only">Paleta de comandos</h2><div id="palette-results" class="palette-results"></div><div class="palette-footer"><span>↑ ↓ navegar</span><span>↵ seleccionar</span><span>FORGE</span></div>`,
  );
  paletteOpen = true;
  let selected = 0,
    filtered = [];
  const paint = () => {
    filtered = actions().filter((a) =>
      a[0].toLowerCase().includes($("#palette-input").value.toLowerCase()),
    );
    selected = Math.min(selected, Math.max(0, filtered.length - 1));
    $("#palette-results").innerHTML =
      filtered
        .map(
          ([title, key, ic], i) =>
            `<button class="palette-action ${i === selected ? "active" : ""}" data-action="${i}">${icon(ic)}<span>${escapeHTML(title)}</span>${key ? `<kbd>${key}</kbd>` : ""}</button>`,
        )
        .join("") || '<p class="empty-state">Sin coincidencias</p>';
    document
      .querySelectorAll("[data-action]")
      .forEach((b) => (b.onclick = () => choose(Number(b.dataset.action))));
    refreshIcons();
    $(".palette-action.active")?.scrollIntoView({ block: "nearest" });
  };
  const choose = (i) => {
    const action = filtered[i];
    if (action) {
      closeModal();
      action[3]();
    }
  };
  $("#palette-input").oninput = () => {
    selected = 0;
    paint();
  };
  $("#palette-input").onkeydown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      selected =
        (selected + (e.key === "ArrowDown" ? 1 : -1) + filtered.length) %
        Math.max(1, filtered.length);
      paint();
    }
    if (e.key === "Enter") {
      e.preventDefault();
      choose(selected);
    }
  };
  paint();
}

function toggleFocus() {
  focused = !focused;
  applySettings();
  toast(
    focused ? "Modo enfoque · Ctrl+Shift+F para volver" : "Paneles visibles",
  );
}
function toggleLeft() {
  settings.leftVisible = !settings.leftVisible;
  focused = false;
  applySettings();
  scheduleSave();
}
function toggleRight() {
  settings.rightVisible = !settings.rightVisible;
  focused = false;
  applySettings();
  scheduleSave();
}
function openSearch() {
  $("#search-bar").hidden = false;
  $("#search-input").focus();
  $("#search-input").select();
  fitVisible();
}
function search(next = true) {
  const value = $("#search-input").value;
  if (!value) return;
  const found = current().search[next ? "findNext" : "findPrevious"](value, {
    caseSensitive: false,
    incremental: !next,
  });
  $("#search-result").textContent = found ? "Coincidencia" : "Sin resultados";
}
function isAppShortcut(e) {
  const k = e.key.toLowerCase();
  return (
    (e.ctrlKey &&
      (k === "k" ||
        e.code === "Space" ||
        (e.shiftKey &&
          ["t", "d", "e", "g", "f", "s", "w", "c", "v"].includes(k)))) ||
    (e.altKey && /^[1-8]$/.test(k))
  );
}
function bindEvents() {
  $("#palette-button").onclick = palette;
  $("#settings-button").onclick = settingsDialog;
  $("#focus-button").onclick = toggleFocus;
  $("#left-toggle").onclick = toggleLeft;
  $("#right-toggle").onclick = toggleRight;
  $("#snippets-toggle").onclick = () => {
    settings.rightVisible = true;
    settings.showSnippets = true;
    focused = false;
    applySettings();
    scheduleSave();
    $("#snippets-section").scrollIntoView({ block: "nearest" });
  };
  $("#new-workspace").onclick = () => openProfileDialog(current().cwd, true);
  $("#profile-new").onclick = () => openProfileDialog();
  $("#split-row").onclick = () =>
    newPanel(current().profile, current().cwd, "row");
  $("#split-col").onclick = () =>
    newPanel(current().profile, current().cwd, "col");
  $("#save-workspace").onclick = saveWorkspace;
  $("#save-tip").onclick = saveWorkspace;
  $("#help-button").onclick = helpDialog;
  $("#status-help").onclick = helpDialog;
  $("#add-snippet").onclick = addSnippet;
  $("#main-title").ondblclick = renameWorkspace;
  $("#files-up").onclick = () => loadFiles(fileParent || boot.home);
  $("#files-refresh").onclick = () => loadFiles(filePath || current().cwd);
  $("#file-path").onclick = () =>
    inputDialog(
      "Explorar carpeta",
      "Ruta absoluta",
      filePath || current().cwd,
      loadFiles,
    );
  $("#change-directory").onclick = () =>
    openProfileDialog(filePath || current().cwd);
  $("#search-button").onclick = openSearch;
  $("#search-input").oninput = () => search(false);
  $("#search-input").onkeydown = (e) => {
    if (e.key === "Enter") search(!e.shiftKey);
    if (e.key === "Escape") $("#search-close").click();
  };
  $("#search-next").onclick = () => search();
  $("#search-prev").onclick = () => search(false);
  $("#search-close").onclick = () => {
    $("#search-bar").hidden = true;
    current()?.search?.clearDecorations();
    fitVisible();
    current()?.term?.focus();
  };
  $("#command-input").oninput = requestCompletions;
  $("#command-input").onfocus = requestCompletions;
  $("#command-input").onblur = () => {
    $("#suggestions").hidden = true;
  };
  $("#command-input").onkeydown = (e) => {
    if (e.key === "Tab" && !$("#suggestions").hidden) {
      e.preventDefault();
      chooseSuggestion();
    }
    if (
      (e.key === "ArrowDown" || e.key === "ArrowUp") &&
      !$("#suggestions").hidden
    ) {
      e.preventDefault();
      suggestionIndex =
        (suggestionIndex +
          (e.key === "ArrowDown" ? 1 : -1) +
          suggestions.length) %
        suggestions.length;
      renderSuggestions();
    }
    if (e.key === "Enter") {
      e.preventDefault();
      insertCommand(!e.shiftKey);
    }
    if (e.key === "Escape") {
      $("#suggestions").hidden = true;
      current()?.term?.focus();
    }
  };
  $("#insert-command").onclick = () => insertCommand(false);
  $("#run-command").onclick = () => insertCommand(true);
  $("#modal-layer").onpointerdown = (e) => {
    if (e.target === $("#modal-layer")) closeModal();
  };
  document.addEventListener("keydown", async (e) => {
    if (!$("#modal-layer").hidden) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
      }
      if (e.key === "Tab") {
        const nodes = [
          ...$("#modal").querySelectorAll(
            'button,input,select,textarea,[tabindex="0"]',
          ),
        ].filter((el) => !el.disabled);
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
      return;
    }
    if (!isAppShortcut(e)) return;
    e.preventDefault();
    const k = e.key.toLowerCase();
    if (e.altKey) {
      const id = leaves(workspace().tree)[Number(k) - 1];
      if (id) setActive(id);
      return;
    }
    if (e.code === "Space") {
      $("#command-input").focus();
      return;
    }
    if (k === "k") {
      palette();
      return;
    }
    if (e.shiftKey) {
      const action = {
        t: () => openProfileDialog(),
        d: () => newPanel(current().profile, current().cwd, "row"),
        e: () => newPanel(current().profile, current().cwd, "col"),
        g: openSearch,
        f: toggleFocus,
        s: saveWorkspace,
        w: () => closePaneDialog(activePane),
        c: async () => {
          try {
            await navigator.clipboard.writeText(current().term.getSelection());
            toast("Selección copiada");
          } catch {
            toast("Usa el menú del sistema para copiar la selección.");
          }
        },
        v: async () => {
          try {
            const text = await navigator.clipboard.readText();
            if (/[\r\n]/.test(text)) confirmPaste(current(), text);
            else current().term.paste(text);
          } catch {
            toast("Usa Ctrl+V para pegar con el portapapeles del sistema.");
          }
        },
      };
      action[k]?.();
    }
  });
  for (const [id, key, direction] of [
    ["left-resizer", "leftWidth", 1],
    ["right-resizer", "rightWidth", -1],
  ]) {
    const handle = $("#" + id);
    handle.onpointerdown = (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const start = e.clientX,
        original = settings[key];
      document.body.classList.add("resizing");
      const move = (e) => {
        settings[key] = Math.max(
          key === "leftWidth" ? 180 : 220,
          Math.min(380, original + (e.clientX - start) * direction),
        );
        applySettings();
      };
      const end = () => {
        handle.removeEventListener("pointermove", move);
        document.body.classList.remove("resizing");
        scheduleSave();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end, { once: true });
      handle.addEventListener("pointercancel", end, { once: true });
    };
    handle.onkeydown = (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        settings[key] = Math.max(
          180,
          Math.min(
            380,
            settings[key] + (e.key === "ArrowRight" ? 10 : -10) * direction,
          ),
        );
        applySettings();
        scheduleSave();
      }
    };
  }
  window.addEventListener("beforeunload", () => {
    closing = true;
    const data = JSON.stringify(serialize());
    if (new Blob([data]).size < 60000)
      navigator.sendBeacon(
        "/api/config",
        new Blob([data], { type: "application/json" }),
      );
    for (const p of panes.values()) {
      p.state = "closing";
      p.ws?.close();
    }
  });
}

async function init() {
  try {
    boot = await api("/api/bootstrap");
    restore();
    bindEvents();
    render();
    refreshMetrics();
    setInterval(() => {
      if (!document.hidden) {
        refreshContext();
        refreshMetrics();
      }
    }, 5000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        fitVisible();
        refreshContext();
      }
    });
  } catch (e) {
    $("#terminal-grid").innerHTML =
      '<div class="startup-error"><h2>No se pudo iniciar Forge</h2><p>' +
      escapeHTML(e.message) +
      "</p><p>Cierra esta ventana y vuelve a abrir el ejecutable.</p></div>";
  }
}
init();
