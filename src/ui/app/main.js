import { createSnippets } from "./snippets/panel.js";
import { parameters } from "./snippets/model.js";
import { createDataTools } from "./data-tools/panel.js";
import { looksJSON } from "./data-tools/model.js";
import { createInspector } from "./port-process-inspector/panel.js";
import { createAPITester } from "./api-tester/panel.js";
import { ActionRegistry } from "./actions/registry.js";
import { registerCatalog } from "./actions/catalog.js";
import { openPalette } from "./command-palette/palette.js";
import { openShortcuts } from "./shortcuts/preferences.js";
import { ToolsStore, createToolUI, copyText } from "./tools/shared.js";
import "./tools/tools.css";
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
  MAX_VISIBLE,
  replaceLeaf,
  viewTree,
  restoreWorkspaces,
  removeLeaf,
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
let registry, toolsStore, toolUI, snippetsController;
const toolHandlers = {};
const runAction = (id, ...args) =>
  registry.invoke(id, "terminal", ...args).catch((e) => toast(e.message));
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
    cwd: cwd || boot.startupCwd || boot.home,
    label: "",
    state: "idle",
  };
}
function serialize() {
  return {
    version: 2,
    settings,
    snippets,
    history: settings.historyEnabled ? history.slice(-100) : [],
    activeWS,
    activePane,
    workspaces: workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      tabs: w.tabs,
      activePane: w.activePane,
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
          id: typeof s.id === "string" && s.id.length <= 100 ? s.id : uid(),
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
    for (const p of c.panes) {
      if (!p || typeof p.id !== "string" || typeof p.cwd !== "string") continue;
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
    workspaces = restoreWorkspaces(c.workspaces, new Set(panes.keys()));
    const saved = new Set(workspaces.flatMap((w) => w.tabs));
    for (const id of panes.keys()) if (!saved.has(id)) panes.delete(id);
  }
  if (!workspaces.length)
    workspaces = [{ id: uid(), name: "Mi espacio", tabs: [] }];
  activeWS = workspaces.some((w) => w.id === c.activeWS)
    ? c.activeWS
    : workspaces[0].id;
  // Launch always gets a fresh shell. Restored tabs remain dormant until selected.
  const p = paneData();
  panes.set(p.id, p);
  workspace().tabs.push(p.id);
  workspace().tree = leaf(p.id);
  workspace().activePane = activePane = p.id;
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
  $("#files-hidden").setAttribute("aria-pressed", String(settings.showHidden));
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
      if (p.term.options.fontSize !== settings.fontSize) p.fitting = true;
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
function rememberScrollPosition(p, fromInput = false) {
  // Geometry changes can clamp scrollTop before ResizeObserver updates xterm.
  if (
    p.fitting ||
    (p.host.isConnected &&
      (p.host.clientWidth !== p.fittedWidth ||
        p.host.clientHeight !== p.fittedHeight))
  )
    return;
  // Output can grow the scroll area one frame before the viewport follows it.
  // Only a user action may switch a following terminal into history mode.
  if (p.followOutput && !fromInput) return;
  const v = p.host.querySelector(".xterm-viewport");
  if (p.host.isConnected) {
    if (fromInput)
      p.followOutput = v.scrollHeight - v.clientHeight - v.scrollTop <= 1;
    if (p.followOutput) p.historyTop = undefined;
    else {
      // A viewport refresh can consume the next native scroll event. Read the
      // actual position and synchronize xterm before output or a fit can race it.
      const rowHeight =
        p.host.querySelector(".xterm-screen").getBoundingClientRect().height /
        p.term.rows;
      p.historyTop = Math.round(v.scrollTop / rowHeight);
      p.term.scrollToLine(p.historyTop);
    }
  }
}
function fitPane(p) {
  if (
    !p?.fit ||
    !p.host.isConnected ||
    p.host.clientWidth <= 20 ||
    p.host.clientHeight <= 20
  )
    return;
  cancelAnimationFrame(p.settleFitFrame);
  p.fitting = true;
  const oldColumns = p.term.cols,
    oldTop = p.historyTop ?? p.term.buffer.active.viewportY;
  try {
    p.fit.fit();
    const historyTop =
      !p.followOutput && oldColumns === p.term.cols ? oldTop : undefined;
    p.fittedWidth = p.host.clientWidth;
    p.fittedHeight = p.host.clientHeight;
    if (p.followOutput) p.term.scrollToBottom();
    else if (historyTop !== undefined) p.term.scrollToLine(historyTop);
    p.settleFitFrame = requestAnimationFrame(() => {
      if (p.host.isConnected) {
        if (p.followOutput) p.term.scrollToBottom();
        else if (historyTop !== undefined) p.term.scrollToLine(historyTop);
      }
      p.fitting = false;
      p.historyTop = p.followOutput
        ? undefined
        : p.term.buffer.active.viewportY;
    });
  } catch {
    p.fitting = false;
  }
}
function fitVisible() {
  for (const id of leaves(workspace()?.tree)) fitPane(panes.get(id));
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
  const w = workspace();
  if (!w?.tabs.includes(id)) return;
  if (!leaves(w.tree).includes(id)) {
    w.tree = replaceLeaf(w.tree, activePane, id);
    w.activePane = activePane = id;
    render();
    return;
  }
  w.activePane = activePane = id;
  for (const p of panes.values()) p.el?.classList.toggle("active", p.id === id);
  renderTabs();
  updateStatus();
  if (focus && $("#modal-layer").hidden) current()?.term?.focus();
  lastContext = "";
  refreshContext();
  scheduleSave();
}

function createPaneDOM(p) {
  if (p.el) return p.el;
  const el = document.createElement("section");
  el.className = "terminal-pane";
  el.dataset.pane = p.id;
  el.id = "pane-" + p.id;
  el.innerHTML = `<header class="pane-header"><span class="pane-dot"></span><span class="pane-label"></span><span class="pane-cwd"></span><div class="pane-actions"><button class="icon-button small restart-pane" title="Reiniciar shell" aria-label="Reiniciar shell">${icon("rotate-ccw")}</button><button class="icon-button small export-pane" title="Exportar salida" aria-label="Exportar salida">${icon("download")}</button><button class="icon-button small rename-pane" title="Renombrar panel" aria-label="Renombrar panel">${icon("more-horizontal")}</button><button class="icon-button small close-pane" title="Cerrar panel" aria-label="Cerrar panel">${icon("x")}</button></div></header><div class="terminal-host"><div class="terminal-surface"></div></div><div class="pane-message" hidden></div>`;
  p.el = el;
  p.host = el.querySelector(".terminal-surface");
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
  p.host.addEventListener("contextmenu", (e) => {
    const selection = p.term.getSelection();
    if (!looksJSON(selection)) return;
    e.preventDefault();
    closeFileMenu();
    const menu = document.createElement("div");
    menu.className = "file-context-menu";
    menu.setAttribute("role", "menu");
    fileMenu = menu;
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.textContent = "Abrir como JSON";
    button.onclick = () => {
      closeFileMenu();
      runAction("dataTools.open", selection);
    };
    menu.append(button);
    document.body.append(menu);
    menu.style.left =
      Math.min(e.clientX, innerWidth - menu.offsetWidth - 8) + "px";
    menu.style.top =
      Math.min(e.clientY, innerHeight - menu.offsetHeight - 8) + "px";
    button.focus();
    menu.onkeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeFileMenu();
        p.term.focus();
      }
    };
  });
  p.followOutput = true;
  const viewport = p.host.querySelector(".xterm-viewport");
  viewport.addEventListener("scroll", () =>
    rememberScrollPosition(p, p.draggingScrollbar),
  );
  p.host.addEventListener("pointerdown", (e) => {
    p.draggingScrollbar = e.target === viewport;
    if (p.draggingScrollbar)
      document.addEventListener(
        "pointerup",
        () => {
          p.draggingScrollbar = false;
        },
        { once: true },
      );
  });
  for (const event of ["wheel", "touchmove"])
    p.host.addEventListener(
      event,
      (e) => {
        cancelAnimationFrame(p.settleFitFrame);
        p.fitting = false;
        rememberScrollPosition(p, true);
      },
      { passive: true },
    );
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
    if (leaves(workspace()?.tree).includes(p.id)) {
      cancelAnimationFrame(p.fitFrame);
      p.fitFrame = requestAnimationFrame(() => fitPane(p));
    }
  });
  p.observer.observe(p.host);
  return el;
}

function connect(p) {
  if (p.state === "connected" || p.state === "connecting") return;
  if (liveCount() >= MAX_PANES) {
    showPaneError(
      p,
      "Hay 8 shells en ejecución. Cierra uno y pulsa reiniciar para abrir esta pestaña.",
    );
    return;
  }
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
        if (p.followOutput && p.host.isConnected) p.term.scrollToBottom();
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
      renderTabs();
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
    renderTabs();
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
    if (workspace() !== w) return;
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
    b.innerHTML = `${icon("terminal")}<span>${escapeHTML(w.name)}</span><span class="workspace-number">${w.tabs.length}</span>`;
    b.onclick = () => {
      activeWS = w.id;
      activePane = w.tabs.includes(w.activePane) ? w.activePane : w.tabs[0];
      render();
      scheduleSave();
    };
    b.ondblclick = () => renameWorkspace();
    list.append(b);
  }
}
function renderTabs() {
  const list = $("#pane-tabs"),
    visible = leaves(workspace()?.tree);
  list.replaceChildren();
  for (const id of workspace()?.tabs || []) {
    const p = panes.get(id),
      wrap = document.createElement("div"),
      b = document.createElement("button"),
      close = document.createElement("button");
    wrap.className = "tab-wrap";
    b.className =
      "pane-tab" +
      (id === activePane ? " active" : "") +
      (visible.includes(id) ? " in-view" : "") +
      (p.state === "idle" ? " dormant" : "");
    b.textContent = p.label || p.profile || "Shell";
    b.dataset.pane = id;
    b.role = "tab";
    b.setAttribute("aria-selected", String(id === activePane));
    b.setAttribute("aria-controls", "pane-" + id);
    b.title =
      b.textContent +
      " · " +
      p.cwd +
      (p.state === "idle"
        ? " · Guardada: se iniciará al abrir"
        : visible.includes(id)
          ? " · Visible"
          : " · En segundo plano");
    b.onclick = () => setActive(id);
    close.className = "tab-close";
    close.textContent = "×";
    close.setAttribute("aria-label", "Cerrar pestaña " + b.textContent);
    close.title = "Cerrar pestaña";
    close.onclick = () => closePaneDialog(id);
    wrap.append(b, close);
    list.append(wrap);
  }
  for (const p of panes.values())
    p.el?.classList.toggle("active", p.id === activePane);
  for (const n of [1, 2, 3]) {
    const b = $("#view-" + n);
    b.classList.toggle("selected", visible.length === n);
    b.setAttribute("aria-pressed", String(visible.length === n));
  }
  list
    .querySelector(".active")
    ?.scrollIntoView({ block: "nearest", inline: "nearest" });
}
function liveCount() {
  return [...panes.values()].filter(
    (p) => p.state === "connected" || p.state === "connecting",
  ).length;
}
function newPanel(profile, cwd) {
  if (liveCount() >= MAX_PANES) {
    toast("Máximo 8 shells en ejecución. Cierra uno para liberar recursos.");
    return;
  }
  const p = paneData(profile, cwd),
    w = workspace();
  panes.set(p.id, p);
  w.tabs.push(p.id);
  w.tree = replaceLeaf(w.tree, activePane, p.id);
  w.activePane = activePane = p.id;
  render();
  scheduleSave();
}
function setView(count, axis = workspace().tree?.axis || "row") {
  const w = workspace();
  count = Math.max(1, Math.min(MAX_VISIBLE, count));
  if (leaves(w.tree).length === count && (count === 1 || w.tree.axis === axis))
    return;
  const visible = [
    activePane,
    ...leaves(w.tree).filter((id) => id !== activePane),
  ];
  const ids = [...new Set([...visible, ...w.tabs])].slice(0, count);
  const needed =
    count -
    ids.length +
    ids.filter((id) => panes.get(id).state === "idle").length;
  if (liveCount() + needed > MAX_PANES) {
    toast(
      "Cierra un shell para mostrar más terminales. Máximo 8 en ejecución.",
    );
    return;
  }
  while (ids.length < count) {
    const p = paneData(current()?.profile, current()?.cwd);
    panes.set(p.id, p);
    w.tabs.push(p.id);
    ids.push(p.id);
  }
  // Retain positions when growing/changing orientation; keep the active pane when reducing.
  const ordered = [
    ...leaves(w.tree).filter((id) => ids.includes(id)),
    ...ids.filter((id) => !leaves(w.tree).includes(id)),
  ];
  w.tree = viewTree(ordered, axis);
  render();
  scheduleSave();
}
function expandView(axis) {
  setView(Math.min(MAX_VISIBLE, leaves(workspace().tree).length + 1), axis);
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
  const w = workspaces.find((w) => w.tabs.includes(id));
  if (!w) return;
  const wasActive = activePane === id;
  w.tabs = w.tabs.filter((tab) => tab !== id);
  w.tree = removeLeaf(w.tree, id);
  disposePane(panes.get(id));
  if (!w.tabs.length) workspaces = workspaces.filter((v) => v !== w);
  else {
    if (!w.tree) w.tree = leaf(w.tabs[0]);
    if (w.activePane === id) w.activePane = leaves(w.tree)[0];
  }
  if (!workspaces.length) {
    const p = paneData();
    panes.set(p.id, p);
    workspaces.push({
      id: uid(),
      name: "Mi espacio",
      tabs: [p.id],
      activePane: p.id,
      tree: leaf(p.id),
    });
  }
  if (!workspaces.some((w) => w.id === activeWS)) activeWS = workspaces[0].id;
  if (wasActive || !workspace().tabs.includes(activePane))
    activePane = workspace().activePane;
  render();
  scheduleSave();
}
function closePaneDialog(id) {
  if (panes.get(id)?.state === "idle") {
    closePane(id);
    return;
  }
  confirmDialog(
    "Cerrar terminal",
    "Se cerrará el shell de esta pestaña y sus procesos asociados.",
    "Cerrar pestaña",
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
      setTimeout(() => {
        if (panes.has(id)) connect(p);
      }, 200);
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
      ? info.git.modified +
        (info.git.truncated ? "+" : "") +
        " archivos con cambios · Ver"
      : "El estado Git aparece aquí";
    $("#git-context").classList.toggle("has-git", !!info.git);
    $("#git-context").disabled = !info.git;
    if (lastContext !== p.cwd) {
      lastContext = p.cwd;
      loadFiles(p.cwd);
      scheduleSave();
    }
  } catch {}
}
async function openGit() {
  const p = current();
  if (!p?.session || p.state !== "connected") return;
  showModal(
    `<div class="modal-head"><div><span class="eyebrow">REPOSITORIO LOCAL</span><h2 id="modal-title">Cambios y ramas</h2></div><button class="icon-button modal-close" aria-label="Cerrar">${icon("x")}</button></div><div class="git-detail-body"><div class="git-summary"><div><strong id="git-detail-branch">Cargando…</strong><div id="git-root" class="muted small-text"></div></div><button id="git-refresh" class="button subtle">${icon("refresh-cw")}Actualizar</button></div><p id="git-detail-error" role="status"></p><div class="git-columns"><div class="git-list-column"><h3>Archivos con cambios <span id="git-change-count"></span></h3><div id="git-files" class="git-files"></div><h3>Ramas locales y remotas</h3><div id="git-branches" class="git-branches"></div></div><section class="git-diff-column" aria-label="Diferencias del archivo"><h3 id="git-diff-title">Selecciona un archivo</h3><p class="muted small-text">Preparado = incluido en el próximo commit. Sin preparar = cambios de trabajo.</p><div id="git-diff" class="git-diff"></div></section></div><p class="settings-note">Solo lectura. Muestra las ramas conocidas por este repositorio, sin conectarse a remotos.</p></div>`,
  );
  $("#modal").classList.add("git-modal");
  let closed = false,
    epoch = 0,
    diffEpoch = 0,
    selectedPath = "";
  modalCleanup = () => {
    closed = true;
    epoch++;
    diffEpoch++;
  };
  const diffView = async (change) => {
    selectedPath = change.path;
    const request = ++diffEpoch;
    $("#git-diff-title").textContent = change.path;
    $("#git-diff").textContent = "Cargando diferencias…";
    for (const b of document.querySelectorAll(".git-file"))
      b.classList.toggle("selected", b.dataset.path === change.path);
    try {
      const result = await api(
        "/api/git/diff?" +
          new URLSearchParams({ id: p.session, path: change.path }),
      );
      if (closed || request !== diffEpoch) return;
      const target = $("#git-diff");
      target.replaceChildren();
      const blocks = result.untracked
        ? [["Sin seguimiento · contenido actual", result.preview]]
        : [
            ["Preparado (staged)", result.staged],
            ["Sin preparar (working tree)", result.unstaged],
          ];
      for (const [label, text] of blocks) {
        const heading = document.createElement("h4"),
          pre = document.createElement("pre");
        heading.textContent = label;
        pre.tabIndex = 0;
        const fragment = document.createDocumentFragment();
        for (const line of (text || "Sin diferencias de texto.").split("\n")) {
          const span = document.createElement("span");
          span.className =
            !result.untracked && line.startsWith("+")
              ? "diff-add"
              : !result.untracked && line.startsWith("-")
                ? "diff-remove"
                : line.startsWith("@@")
                  ? "diff-hunk"
                  : "";
          span.textContent = line + "\n";
          fragment.append(span);
        }
        pre.append(fragment);
        target.append(heading, pre);
      }
      if (result.truncated) {
        const note = document.createElement("p");
        note.textContent =
          "Vista previa limitada a 256 KiB por sección. Usa git diff en la terminal para ver todo.";
        target.append(note);
      }
    } catch (error) {
      if (!closed && request === diffEpoch)
        $("#git-diff").textContent = error.message;
    }
  };
  const load = async () => {
    const request = ++epoch;
    diffEpoch++;
    $("#git-refresh").disabled = true;
    $("#git-detail-error").textContent = "";
    try {
      const result = await api(
        "/api/git?" + new URLSearchParams({ id: p.session }),
      );
      if (closed || request !== epoch) return;
      $("#git-detail-branch").textContent =
        result.branch + (result.detached ? " · HEAD separado" : "");
      $("#git-root").textContent = result.root;
      $("#git-change-count").textContent = "(" + result.changes.length + ")";
      $("#git-files").replaceChildren();
      for (const change of result.changes) {
        const button = document.createElement("button");
        button.className = "git-file";
        button.dataset.path = change.path;
        button.title = change.original
          ? change.original + " → " + change.path
          : change.path;
        const status = document.createElement("code"),
          name = document.createElement("span");
        status.textContent = change.untracked
          ? "??"
          : (change.index + change.worktree).replaceAll(" ", "·");
        name.textContent = change.path;
        button.append(status, name);
        button.onclick = () => diffView(change);
        $("#git-files").append(button);
      }
      $("#git-branches").replaceChildren();
      for (const branch of result.branches) {
        const row = document.createElement("div"),
          name = document.createElement("strong"),
          tag = document.createElement("span");
        row.className = "git-branch-row" + (branch.current ? " current" : "");
        name.textContent = branch.name;
        tag.textContent = branch.current
          ? "ACTUAL"
          : branch.remote
            ? "REMOTA"
            : "LOCAL";
        row.title = branch.upstream
          ? "Seguimiento: " + branch.upstream
          : branch.name;
        row.append(name, tag);
        $("#git-branches").append(row);
      }
      if (!result.branches.length)
        $("#git-branches").textContent = "No hay ramas disponibles.";
      if (result.truncated)
        $("#git-detail-error").textContent =
          "La lista está limitada por tamaño; usa git status o git branch para verla completa.";
      if (!result.changes.length) {
        $("#git-files").textContent = "Árbol de trabajo limpio.";
        $("#git-diff-title").textContent = "Sin cambios";
        $("#git-diff").textContent = "No hay diferencias pendientes.";
      } else
        await diffView(
          result.changes.find((c) => c.path === selectedPath) ||
            result.changes[0],
        );
    } catch (error) {
      if (!closed && request === epoch)
        $("#git-detail-error").textContent = error.message;
    } finally {
      if (!closed && request === epoch) $("#git-refresh").disabled = false;
    }
  };
  $("#git-refresh").onclick = load;
  await load();
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
let selectedFile = "",
  fileMenu = null;
function selectFile(path) {
  selectedFile = path;
  for (const row of document.querySelectorAll(".file-entry")) {
    row.classList.toggle("selected", row.dataset.path === path);
    row.setAttribute("aria-pressed", String(row.dataset.path === path));
  }
}
function closeFileMenu() {
  fileMenu?.remove();
  fileMenu = null;
}
async function openEditor(path) {
  closeFileMenu();
  let popup;
  if (!boot.nativeEditor) {
    popup = window.open("about:blank", "_blank", "popup,width=1050,height=760");
    if (!popup) {
      toast("Permite ventanas emergentes para abrir el editor");
      return;
    }
    popup.opener = null;
  }
  try {
    await persist();
    const result = await api("/api/editor/open", { path });
    if (popup) popup.location.replace(result.url);
  } catch (e) {
    popup?.close();
    toast(e.message);
  }
}
function showFileMenu(entry, anchor, x, y) {
  closeFileMenu();
  const menu = document.createElement("div");
  fileMenu = menu;
  menu.className = "file-context-menu";
  menu.setAttribute("role", "menu");
  const actions = [
    [
      entry.directory ? "Abrir terminal aquí" : "Editar",
      () =>
        entry.directory
          ? openProfileDialog(entry.path)
          : runAction("editor.open", entry.path),
    ],
    [
      "Copiar ruta",
      async () => {
        try {
          await navigator.clipboard.writeText(entry.path);
          toast("Ruta copiada");
        } catch {
          inputDialog(
            "Copiar ruta",
            "Selecciona y copia la ruta",
            entry.path,
            () => {},
          );
        }
      },
    ],
    [
      "Insertar ruta en comandos",
      () => putComposer(shellQuote(entry.path, current()?.profile)),
    ],
  ];
  for (const [label, action] of actions) {
    const b = document.createElement("button");
    b.textContent = label;
    b.setAttribute("role", "menuitem");
    b.onclick = () => {
      closeFileMenu();
      action();
    };
    menu.append(b);
  }
  document.body.append(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.left =
    Math.max(8, Math.min(x || rect.left, innerWidth - menu.offsetWidth - 8)) +
    "px";
  menu.style.top =
    Math.max(
      8,
      Math.min(y || rect.bottom, innerHeight - menu.offsetHeight - 8),
    ) + "px";
  menu.firstElementChild.focus();
  menu.onkeydown = (e) => {
    const buttons = [...menu.querySelectorAll("button")],
      i = buttons.indexOf(document.activeElement);
    if (e.key === "Escape") {
      e.preventDefault();
      closeFileMenu();
      anchor.focus();
    }
    if (e.key === "Tab") closeFileMenu();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      buttons[
        (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length
      ].focus();
    }
  };
}
document.addEventListener("pointerdown", (e) => {
  if (fileMenu && !fileMenu.contains(e.target)) closeFileMenu();
});
window.addEventListener("focus", () => {
  if (toolsStore && registry)
    toolsStore
      .load()
      .then((state) => {
        registry.overrides = state.shortcuts || {};
      })
      .catch(() => {});
});
window.addEventListener("resize", closeFileMenu);
document.addEventListener("scroll", closeFileMenu, true);
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
      b.dataset.path = entry.path;
      b.classList.toggle("selected", entry.path === selectedFile);
      b.setAttribute("aria-pressed", String(entry.path === selectedFile));
      b.onclick = () => {
        closeFileMenu();
        if (entry.directory) loadFiles(entry.path);
        else selectFile(entry.path);
      };
      if (!entry.directory) {
        b.ondblclick = () => runAction("editor.open", entry.path);
        b.onkeydown = (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            runAction("editor.open", entry.path);
          }
        };
      }
      b.oncontextmenu = (e) => {
        e.preventDefault();
        selectFile(entry.path);
        showFileMenu(entry, b, e.clientX, e.clientY);
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
  if (registry) {
    for (const id of registry.actions.keys())
      if (id.startsWith("favorite.")) registry.actions.delete(id);
    for (const s of snippets)
      registry.register({
        id: "favorite." + s.id,
        label: s.name,
        category: "Favoritos",
        run: () =>
          parameters(s.command).length
            ? snippetsController.prepare(s.id)
            : putComposer(s.command),
      });
  }
  const list = $("#snippet-list");
  list.replaceChildren();
  for (const s of snippets) {
    const row = document.createElement("div");
    row.className = "snippet-item";
    const b = document.createElement("button");
    b.className = "snippet-main";
    b.innerHTML = `<span class="snippet-top"><strong>${escapeHTML(s.name)}</strong><span>${escapeHTML(s.tag || "PERSONAL")}</span></span><code>${escapeHTML(s.command)}</code>`;
    b.onclick = () => runAction("favorite." + s.id);
    b.title = "Insertar en barra de comandos";
    const del = document.createElement("button");
    del.className = "snippet-delete icon-button small";
    del.innerHTML = icon("x");
    del.title = "Eliminar favorito";
    del.setAttribute("aria-label", "Eliminar " + s.name);
    del.title = "Quitar de favoritos";
    del.onclick = () =>
      snippetsController.toggleFavorite(s.id).catch((e) => toast(e.message));
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
function performCommand(p, text, run, recordHistory = true) {
  p.followOutput = true;
  p.term.scrollToBottom();
  send(p, { type: "input", data: text + (run ? "\r" : "") });
  if (run && recordHistory && settings.historyEnabled) {
    history = history.filter((h) => h !== text);
    history.push(text);
    history = history.slice(-100);
    scheduleSave();
  }
  $("#command-input").value = "";
  $("#suggestions").hidden = true;
  p.term.focus();
}
function confirmPaste(p, text, run = false, recordHistory = true) {
  showModal(
    `<div class="modal-head"><h2 id="modal-title">Pegar varias líneas</h2><button class="icon-button modal-close" aria-label="Cerrar">${icon("x")}</button></div><p class="modal-description">Este texto contiene saltos de línea que el shell podría ejecutar. Revisa el contenido antes de enviarlo.</p><pre class="paste-preview">${escapeHTML(text.slice(0, 16000))}</pre><div class="modal-footer"><button class="button cancel">Cancelar</button><button class="button primary confirm-paste">Pegar en terminal</button></div>`,
  );
  $(".confirm-paste").onclick = () => {
    closeModal();
    if (run) performCommand(p, text, true, recordHistory);
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
  const modal = $("#modal");
  (
    modal.querySelector("input:not([type=checkbox]), textarea") ||
    modal.querySelector("select, button")
  )?.focus();
}
function closeModal(focus = true) {
  modalCleanup?.();
  modalCleanup = null;
  paletteOpen = false;
  $("#modal-layer").hidden = true;
  $("#modal").innerHTML = "";
  $("#modal").classList.remove("git-modal");
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
  cwd = current()?.cwd || boot.startupCwd || boot.home,
  newWorkspace = false,
) {
  if (liveCount() >= MAX_PANES) {
    toast("Límite de 8 shells en ejecución. Cierra uno antes de crear otro.");
    return;
  }
  showModal(
    `<div class="modal-head"><div><span class="eyebrow">TU SIGUIENTE SESIÓN</span><h2 id="modal-title">${newWorkspace ? "Nuevo espacio" : "Nueva terminal"}</h2></div><button class="icon-button modal-close" aria-label="Cerrar">${icon("x")}</button></div><form id="profile-form">${newWorkspace ? '<label class="field">Nombre del espacio<input id="new-space-name" value="Nuevo proyecto" required maxlength="40"></label>' : ""}<label class="field">Perfil de shell<select id="new-profile">${boot.profiles.map((p) => `<option value="${escapeHTML(p.id)}" ${p.id === current()?.profile ? "selected" : ""}>${escapeHTML(p.name)}</option>`).join("")}</select></label><label class="field">Carpeta inicial<input id="new-cwd" value="${escapeHTML(cwd)}" required></label><p class="settings-note">Se abre en una pestaña activa. Las anteriores quedan en segundo plano.</p><p class="form-error" id="profile-error"></p><div class="modal-footer"><button type="button" class="button cancel">Cancelar</button><button class="button primary">${icon("plus")}Crear</button></div></form>`,
  );
  $(".cancel").onclick = () => closeModal();
  $("#profile-form").onsubmit = async (e) => {
    e.preventDefault();
    const profile = $("#new-profile").value,
      cwd = $("#new-cwd").value,
      name = $("#new-space-name")?.value;
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
          tabs: [p.id],
          activePane: p.id,
          tree: leaf(p.id),
        };
        workspaces.push(w);
        activeWS = w.id;
        activePane = p.id;
        render();
        scheduleSave();
      } else newPanel(profile, result.path);
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
  snippetsController.edit(undefined, $("#command-input").value);
}

function settingsDialog() {
  showModal(
    `<div class="modal-head"><div><span class="eyebrow">HAZLO TUYO</span><h2 id="modal-title">Preferencias</h2></div><button class="icon-button modal-close" aria-label="Cerrar">${icon("x")}</button></div><div class="settings-content"><button id="keyboard-settings" class="button">Atajos de teclado…</button><span class="label">APARIENCIA</span><div class="theme-options">${[
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
      ["restore", "Restaurar pestañas en segundo plano"],
      ["historyEnabled", "Guardar historial de la barra de comandos"],
    ]
      .map(
        ([key, label]) =>
          `<label class="toggle-row"><span>${label}</span><input type="checkbox" data-pref="${key}" ${settings[key] ? "checked" : ""}><span class="switch"></span></label>`,
      )
      .join(
        "",
      )}<p class="settings-note">Se guardan carpetas y pestañas. Las restauradas inician un shell al abrirlas; los procesos y la salida anterior no se recuperan. El historial de la barra de comandos se guarda sin cifrar solo si lo habilitas.</p><button id="clear-history" class="text-button">Borrar historial de la barra de comandos</button><div class="settings-path"><span class="label">CONFIGURACIÓN LOCAL</span><code>${escapeHTML(boot.configPath)}</code></div></div><div class="modal-footer"><span class="muted small-text">Los cambios se guardan automáticamente</span><button id="done-settings" class="button primary">Listo</button></div>`,
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
  $("#keyboard-settings").onclick = () => runAction("shortcuts.open");
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
    toast("Historial de la barra de comandos borrado");
  };
  $("#done-settings").onclick = () => closeModal();
}

function helpDialog() {
  openShortcuts(toolUI, registry, toolsStore);
}
function palette() {
  openPalette(toolUI, registry, "terminal");
}
function toolbox() {
  const ids = [
    "apiTester.open",
    "portInspector.open",
    "dataTools.open",
    "snippets.open",
  ];
  toolUI.open(
    "Herramientas",
    `<div class="toolbox-grid">${ids
      .map((id) => {
        const a = registry.actions.get(id);
        return `<button class="button" data-tool-action="${id}"><small>${escapeHTML(a.category)}</small>${escapeHTML(a.label)}</button>`;
      })
      .join("")}</div>`,
    { wide: false },
  );
  for (const b of document.querySelectorAll("[data-tool-action]"))
    b.onclick = () => runAction(b.dataset.toolAction);
}
function runToolCommand(command) {
  const p = current();
  if (p?.state !== "connected") throw Error("Abre una terminal conectada");
  if (command.length > 8192)
    throw Error("El comando supera 8192 caracteres; usa Enviar o copia cURL");
  closeModal();
  if (/[\r\n]/.test(command)) confirmPaste(p, command, true, false);
  else performCommand(p, command, true, false);
}
function initializeActions() {
  registry = new ActionRegistry(toolsStore.state.shortcuts || {});
  toolUI = createToolUI({
    showModal,
    closeModal,
    setCleanup: (fn) => {
      modalCleanup = fn;
    },
    toast,
  });
  const handlers = {
    "terminal.new": () => openProfileDialog(),
    "terminal.close": () => closePaneDialog(activePane),
    "terminal.split": () => expandView("row"),
    "terminal.splitRows": () => expandView("col"),
    "terminal.clear": () => current()?.term?.clear(),
    "terminal.search": openSearch,
    "terminal.copy": () => copyText(current()?.term?.getSelection() || ""),
    "terminal.paste": async () => {
      const text = await navigator.clipboard.readText();
      if (/[\r\n]/.test(text)) confirmPaste(current(), text);
      else current().term.paste(text);
    },
    "terminal.export": () => exportPane(current()),
    "terminal.focus": toggleFocus,
    "command.focus": () => $("#command-input").focus(),
    "commandPalette.open": palette,
    "settings.open": settingsDialog,
    "shortcuts.open": helpDialog,
    "toolbox.open": toolbox,
    "workspace.new": () => openProfileDialog(current().cwd, true),
    "workspace.save": saveWorkspace,
    "workspace.rename": renameWorkspace,
    "explorer.toggle": toggleLeft,
    "context.toggle": toggleRight,
    "git.open": openGit,
    "editor.open": (path) =>
      path || selectedFile
        ? openEditor(path || selectedFile)
        : inputDialog(
            "Abrir editor",
            "Ruta absoluta del archivo",
            current().cwd,
            openEditor,
          ),
    "snippets.new": addSnippet,
    ...Object.fromEntries(
      [
        "apiTester.open",
        "apiTester.repeat",
        "portInspector.open",
        "dataTools.open",
        "snippets.open",
      ].map((id) => [id, (...args) => toolHandlers[id]?.(...args)]),
    ),
    ...Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [
        `terminal.tab${i + 1}`,
        () => {
          const id = workspace().tabs[i];
          if (id) setActive(id);
        },
      ]),
    ),
  };
  registerCatalog(registry, handlers, {
    "terminal.close": () => !!current()?.term,
    "terminal.clear": () => !!current()?.term,
    "git.open": () => !$("#git-context").disabled,
    ...Object.fromEntries(
      [
        "apiTester.open",
        "apiTester.repeat",
        "portInspector.open",
        "dataTools.open",
        "snippets.open",
      ].map((id) => [id, () => !!toolHandlers[id]]),
    ),
  });
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
  return !$("#modal-layer").hidden || !!registry?.resolve(e, "terminal");
}
function bindEvents() {
  $("#toolbox-button").onclick = () => runAction("toolbox.open");
  $("#palette-button").onclick = () => runAction("commandPalette.open");
  $("#settings-button").onclick = () => runAction("settings.open");
  $("#focus-button").onclick = () => runAction("terminal.focus");
  $("#left-toggle").onclick = () => runAction("explorer.toggle");
  $("#right-toggle").onclick = () => runAction("context.toggle");
  $("#snippets-toggle").onclick = () => {
    settings.rightVisible = true;
    settings.showSnippets = true;
    focused = false;
    applySettings();
    scheduleSave();
    $("#snippets-section").scrollIntoView({ block: "nearest" });
  };
  $("#new-workspace").onclick = () => runAction("workspace.new");
  $("#profile-new").onclick = () => runAction("terminal.new");
  for (const n of [1, 2, 3]) $("#view-" + n).onclick = () => setView(n);
  $("#git-context").onclick = () => runAction("git.open");
  $("#split-row").onclick = () =>
    setView(leaves(workspace().tree).length, "row");
  $("#split-col").onclick = () =>
    setView(leaves(workspace().tree).length, "col");
  $("#save-workspace").onclick = () => runAction("workspace.save");
  $("#save-tip").onclick = () => runAction("workspace.save");
  $("#help-button").onclick = () => runAction("shortcuts.open");
  $("#status-help").onclick = () => runAction("shortcuts.open");
  $("#add-snippet").onclick = () => runAction("snippets.new");
  $("#main-title").ondblclick = renameWorkspace;
  $("#files-hidden").onclick = () => {
    settings.showHidden = !settings.showHidden;
    applySettings();
    loadFiles(filePath || current().cwd);
    scheduleSave();
  };
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
  $("#search-button").onclick = () => runAction("terminal.search");
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
    const action = registry.resolve(e, "terminal");
    if (!action || e.defaultPrevented || e.repeat) return;
    e.preventDefault();
    await runAction(action.id);
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
    toolsStore = new ToolsStore(api);
    await toolsStore.load();
    initializeActions();
    const apiTester = createAPITester({
      ui: toolUI,
      store: toolsStore,
      profile: () => current()?.profile,
      runTerminal: runToolCommand,
    });
    toolHandlers["apiTester.open"] = apiTester.open;
    const inspector = createInspector({
      ui: toolUI,
      api,
      store: toolsStore,
      openAPI: (value) => runAction("apiTester.open", value),
      openDirectory: (path) => {
        settings.leftVisible = true;
        settings.showFiles = true;
        focused = false;
        applySettings();
        return loadFiles(path);
      },
    });
    toolHandlers["portInspector.open"] = inspector.open;
    const dataTools = createDataTools({
      ui: toolUI,
      api,
      store: toolsStore,
      cwd: () => filePath || current()?.cwd || boot.home,
    });
    toolHandlers["dataTools.open"] = dataTools.open;
    snippetsController = createSnippets({
      ui: toolUI,
      api,
      store: toolsStore,
      registry,
      runTerminal: runToolCommand,
      insert: putComposer,
      shortcuts: (id) => openShortcuts(toolUI, registry, toolsStore, id),
      cwd: () => filePath || current()?.cwd || boot.home,
      onChange: (rows) => {
        snippets = rows
          .filter((s) => s.favorite)
          .map((s) => ({ ...s, tag: s.category }));
        renderSnippets();
        refreshIcons();
      },
    });
    await snippetsController.initialize(snippets);
    toolHandlers["snippets.open"] = snippetsController.open;
    toolHandlers["apiTester.repeat"] = apiTester.repeat;
    registry.actions.get("apiTester.repeat").enabled = apiTester.canRepeat;
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

document.fonts.ready.then(() => requestAnimationFrame(fitVisible));
