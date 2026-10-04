import { ActionRegistry } from "./actions/registry.js";
import { registerCatalog } from "./actions/catalog.js";
import { openPalette } from "./command-palette/palette.js";
import { openShortcuts } from "./shortcuts/preferences.js";
import { ToolsStore, createToolUI } from "./tools/shared.js";
const $ = (s) => document.querySelector(s),
  text = $("#editor-text");
let doc = null,
  savedText = "",
  hasBuffer = false,
  busy = false,
  navigating = false,
  folder = "",
  parent = "",
  epoch = 0,
  closing = false,
  boot = {},
  lastTitle = "";
const dirty = () => hasBuffer && text.value !== savedText;
async function api(path, body) {
  const r = await fetch(
    path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "No se pudo completar la operación");
  return d;
}
function error(message = "") {
  $("#editor-error").textContent = message;
  $("#editor-error").hidden = !message;
}
function updateCursor() {
  const prefix = text.value.slice(0, text.selectionStart);
  $("#editor-cursor").textContent =
    `Línea ${prefix.split("\n").length}, columna ${prefix.length - prefix.lastIndexOf("\n")}`;
}
function update() {
  const changed = dirty(),
    name = doc?.name || "Sin título";
  $("#editor-title").textContent = doc?.path || name;
  $("#editor-title").title = doc?.path || name;
  $("#editor-dirty").hidden = !changed;
  $("#editor-state").textContent = busy
    ? "Procesando…"
    : changed
      ? "Cambios sin guardar"
      : hasBuffer
        ? "Sin cambios pendientes"
        : "Preparado";
  $("#editor-format").textContent =
    "UTF-8" +
    (doc?.bom ? " BOM" : "") +
    " · " +
    (doc?.newline || (boot.platform === "windows" ? "CRLF" : "LF"));
  for (const id of [
    "editor-new",
    "editor-open",
    "editor-save",
    "editor-save-as",
    "editor-reload",
  ])
    $("#" + id).disabled =
      busy ||
      !boot.startupCwd ||
      ((id === "editor-save" || id === "editor-save-as") && !hasBuffer) ||
      (id === "editor-reload" && !doc);
  text.disabled = !hasBuffer;
  text.readOnly = busy;
  const title = (changed ? "● " : "") + name + " — Forge Editor";
  if (lastTitle !== title) {
    lastTitle = document.title = title;
    window.forgeEditorTitle?.(title);
  }
  for (const row of document.querySelectorAll(".editor-file"))
    row.classList.toggle("active", row.dataset.path === doc?.path);
  updateCursor();
}
function dialog({ title, description, value, choices }) {
  const modal = $("#editor-dialog");
  if (modal.open) return Promise.resolve({ action: "cancel" });
  $("#editor-dialog-title").textContent = title;
  $("#editor-dialog-description").textContent = description || "";
  $("#editor-dialog-field").hidden = value === undefined;
  $("#editor-dialog-input").value = value ?? "";
  $("#editor-dialog-error").textContent = "";
  $("#editor-dialog-buttons").replaceChildren();
  return new Promise((resolve) => {
    const finish = (action) => {
      const result = { action, value: $("#editor-dialog-input").value };
      if (action !== "cancel" && value !== undefined && !result.value.trim()) {
        $("#editor-dialog-error").textContent = "Indica una ruta";
        return;
      }
      modal.close();
      resolve(result);
    };
    for (const [id, label, primary] of choices) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.action = id;
      b.textContent = label;
      if (primary) b.className = "primary";
      b.onclick = () => finish(id);
      $("#editor-dialog-buttons").append(b);
    }
    $("#editor-dialog-form").onsubmit = (e) => {
      e.preventDefault();
      finish(choices.find((c) => c[2])?.[0] || "cancel");
    };
    modal.oncancel = (e) => {
      e.preventDefault();
      finish("cancel");
    };
    modal.showModal();
    if (value !== undefined) {
      $("#editor-dialog-input").focus();
      $("#editor-dialog-input").select();
    } else $("#editor-dialog-buttons [data-action=cancel]")?.focus();
  });
}
function join(dir, name) {
  return dir.replace(/[\\/]$/, "") + (dir.includes("\\") ? "\\" : "/") + name;
}
async function save(as = false) {
  if (busy || !hasBuffer) return false;
  let path = doc?.path,
    create = !doc;
  if (as || !path) {
    const c = await dialog({
      title: "Guardar como",
      description:
        "Elige un nombre nuevo. No se reemplazarán otros archivos existentes.",
      value: path || join(folder || boot.startupCwd, "sin-titulo.txt"),
      choices: [
        ["cancel", "Cancelar"],
        ["save", "Guardar", true],
      ],
    });
    if (c.action === "cancel") return false;
    path = c.value;
    create = path !== doc?.path;
  }
  const snapshot = text.value;
  busy = true;
  update();
  error();
  try {
    const result = await api("/api/editor/save", {
      path,
      text: snapshot,
      version: create ? "" : doc.version,
      create,
      newline: doc?.newline || (boot.platform === "windows" ? "CRLF" : "LF"),
      bom: doc?.bom || false,
    });
    doc = result;
    savedText = result.text;
    await loadFolder(result.directory);
    return true;
  } catch (e) {
    error(e.message);
    return false;
  } finally {
    busy = false;
    update();
  }
}
async function canLeave() {
  if (busy) {
    error("Espera a que termine la operación actual");
    return false;
  }
  if (!dirty()) return true;
  const c = await dialog({
    title: "Cambios sin guardar",
    description:
      "¿Qué quieres hacer con los cambios de " +
      (doc?.name || "Sin título") +
      "?",
    choices: [
      ["cancel", "Cancelar"],
      ["discard", "Descartar"],
      ["save", "Guardar y continuar", true],
    ],
  });
  return c.action === "discard" || (c.action === "save" && (await save()));
}
async function openFile(path, reload = false) {
  if (navigating || busy || (!reload && path === doc?.path)) return;
  navigating = true;
  try {
    if (!(await canLeave())) return;
    busy = true;
    update();
    const result = await api(
      "/api/editor/file?" + new URLSearchParams({ path }),
    );
    doc = result;
    savedText = result.text;
    hasBuffer = true;
    text.value = result.text;
    error();
    await loadFolder(result.directory);
    text.scrollTop = 0;
    text.setSelectionRange(0, 0);
  } catch (e) {
    error(e.message);
  } finally {
    busy = false;
    navigating = false;
    update();
    text.focus();
  }
}
async function loadFolder(path) {
  if (!path) return;
  const request = ++epoch;
  try {
    const r = await api(
      "/api/files?" +
        new URLSearchParams({
          path,
          hidden: $("#editor-hidden").checked ? "1" : "0",
        }),
    );
    if (request !== epoch) return;
    folder = r.path;
    parent = r.parent;
    $("#editor-folder").value = folder;
    $("#editor-folder").title = folder;
    const list = $("#editor-files");
    list.replaceChildren();
    for (const entry of r.entries) {
      const row = document.createElement("button");
      row.className = "editor-file";
      row.dataset.path = entry.path;
      row.title = entry.path;
      const icon = document.createElement("span");
      icon.className = "file-icon";
      icon.textContent = entry.directory ? "▸" : "·";
      const name = document.createElement("span");
      name.textContent = entry.name;
      row.append(icon, name);
      row.onclick = () =>
        entry.directory ? loadFolder(entry.path) : openFile(entry.path);
      list.append(row);
    }
    if (!r.entries.length || r.truncated) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = r.truncated
        ? "Vista limitada a 200 entradas."
        : "Carpeta vacía";
      list.append(p);
    }
    update();
  } catch (e) {
    if (request === epoch) error(e.message);
  }
}
async function openPathDialog() {
  if (busy || !boot.startupCwd) return;
  const c = await dialog({
    title: "Abrir archivo",
    description: "Indica la ruta absoluta de un archivo de texto.",
    value: doc?.path || folder || boot.startupCwd,
    choices: [
      ["cancel", "Cancelar"],
      ["open", "Abrir", true],
    ],
  });
  if (c.action === "open") await openFile(c.value);
}
async function newFile() {
  if (navigating || busy || !boot.startupCwd) return;
  navigating = true;
  try {
    if (!(await canLeave())) return;
    doc = null;
    text.value = savedText = "";
    hasBuffer = true;
    error();
    update();
    text.focus();
  } finally {
    navigating = false;
  }
}
async function requestClose() {
  if (navigating || closing) return;
  navigating = true;
  try {
    if (!(await canLeave())) return;
    closing = true;
    if (window.forgeEditorClose) await window.forgeEditorClose();
    else window.close();
  } finally {
    navigating = false;
  }
}
let editorRegistry, editorStore, editorToolUI;
function setupEditorActions() {
  editorRegistry = new ActionRegistry(editorStore.state.shortcuts || {});
  const toolDialog = document.createElement("dialog");
  toolDialog.id = "editor-tool-window";
  document.body.append(toolDialog);
  let cleanup;
  const close = () => {
    cleanup?.();
    cleanup = null;
    toolDialog.close();
    toolDialog.innerHTML = "";
    text.focus();
  };
  editorToolUI = createToolUI({
    showModal: (html) => {
      close();
      toolDialog.innerHTML = `<div id="modal">${html}</div>`;
      toolDialog.showModal();
      toolDialog.querySelector(".modal-close").onclick = close;
    },
    closeModal: close,
    setCleanup: (fn) => {
      cleanup = fn;
    },
    toast: error,
  });
  toolDialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  registerCatalog(editorRegistry, {
    "editor.fileOpen": openPathDialog,
    "editor.new": newFile,
    "editor.save": () => save(),
    "editor.saveAs": () => save(true),
    "editor.close": requestClose,
    "editor.search": openFind,
    "commandPalette.open": () =>
      openPalette(editorToolUI, editorRegistry, "editor"),
    "shortcuts.open": () =>
      openShortcuts(editorToolUI, editorRegistry, editorStore),
  });
  for (const [id, action] of Object.entries({
    "editor-new": "editor.new",
    "editor-open": "editor.fileOpen",
    "editor-save": "editor.save",
    "editor-save-as": "editor.saveAs",
    "editor-close": "editor.close",
  }))
    $("#" + id).onclick = () =>
      editorRegistry.invoke(action, "editor").catch((e) => error(e.message));
  $("#editor-reload").onclick = () => doc && openFile(doc.path, true);
  window.addEventListener("focus", () =>
    editorStore
      .load()
      .then((state) => {
        editorRegistry.overrides = state.shortcuts || {};
      })
      .catch(() => {}),
  );
}
function openFind() {
  let bar = $("#editor-find-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "editor-find-bar";
    bar.className = "tool-row";
    bar.innerHTML =
      '<input id="editor-find" aria-label="Buscar en archivo" placeholder="Buscar en archivo"><button id="editor-find-prev">Anterior</button><button id="editor-find-next">Siguiente</button><span id="editor-find-status" role="status"></span><button id="editor-find-close" aria-label="Cerrar búsqueda">×</button>';
    text.before(bar);
    const find = (back) => {
      const q = $("#editor-find").value;
      if (!q) return;
      const content = text.value.toLowerCase(),
        query = q.toLowerCase();
      let pos = back
        ? content.lastIndexOf(query, Math.max(0, text.selectionStart - 1))
        : content.indexOf(query, text.selectionEnd);
      if (pos < 0)
        pos = back ? content.lastIndexOf(query) : content.indexOf(query);
      $("#editor-find-status").textContent =
        pos < 0 ? "Sin coincidencias" : "Coincidencia";
      if (pos >= 0) {
        text.focus();
        text.setSelectionRange(pos, pos + q.length);
        text.scrollTop = Math.max(
          0,
          (text.value.slice(0, pos).split("\n").length - 3) *
            (parseFloat(getComputedStyle(text).lineHeight) || 20),
        );
      }
    };
    $("#editor-find-next").onclick = () => find(false);
    $("#editor-find-prev").onclick = () => find(true);
    $("#editor-find").onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        find(e.shiftKey);
      }
    };
    $("#editor-find-close").onclick = () => {
      bar.hidden = true;
      text.focus();
    };
  }
  bar.hidden = false;
  $("#editor-find").focus();
  $("#editor-find").select();
}
$("#editor-up").onclick = () => loadFolder(parent);
$("#editor-refresh").onclick = () => loadFolder(folder);
$("#editor-hidden").onchange = () => loadFolder(folder);
$("#editor-folder-form").onsubmit = (e) => {
  e.preventDefault();
  loadFolder($("#editor-folder").value);
};
$("#editor-wrap").onchange = () => {
  text.wrap = $("#editor-wrap").checked ? "soft" : "off";
};
text.oninput = update;
for (const name of ["keyup", "click", "select"])
  text.addEventListener(name, updateCursor);
document.addEventListener("keydown", (e) => {
  if ($("#editor-dialog").open || $("#editor-tool-window")?.open) return;
  if (
    e.key === "Escape" &&
    $("#editor-find-bar") &&
    !$("#editor-find-bar").hidden
  ) {
    $("#editor-find-close").click();
    return;
  }
  const a = editorRegistry?.resolve(e, "editor");
  if (!a || e.repeat) return;
  e.preventDefault();
  editorRegistry.invoke(a.id, "editor").catch((e) => error(e.message));
});

window.addEventListener("beforeunload", (e) => {
  if (!closing && dirty()) {
    e.preventDefault();
    e.returnValue = "";
  }
});
window.forgeRequestClose = requestClose;
window.forgeEditorReady?.();
update();
async function init() {
  try {
    boot = await api("/api/bootstrap");
    editorStore = new ToolsStore(api);
    await editorStore.load();
    setupEditorActions();
    const s = boot.config?.settings || {};
    document.documentElement.dataset.theme = [
      "obsidian",
      "midnight",
      "paper",
    ].includes(s.theme)
      ? s.theme
      : "obsidian";
    text.style.fontSize = Math.min(22, Math.max(11, s.fontSize || 14)) + "px";
    $("#editor-hidden").checked = s.showHidden !== false;
    await loadFolder(boot.startupCwd);
    const path =
      new URLSearchParams(location.search).get("path") || boot.editorFile;
    if (path) await openFile(path);
    else update();
  } catch (e) {
    error(e.message);
  }
}
init();
