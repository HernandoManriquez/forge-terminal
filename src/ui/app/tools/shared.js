export const $ = (s) => document.querySelector(s);
export const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function on(selector, callback, event = "click") {
  const el = $(selector);
  el?.addEventListener(event, (e) =>
    Promise.resolve()
      .then(() => callback(e))
      .catch((err) => {
        const out = $("#tool-error");
        if (out) {
          out.hidden = false;
          out.textContent = err.message;
        } else console.error(err);
      }),
  );
}
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const a = document.createElement("textarea");
    a.value = text;
    document.body.append(a);
    a.select();
    const ok = document.execCommand("copy");
    a.remove();
    if (!ok) throw Error("Selecciona el texto y usa Ctrl+C para copiar");
  }
}
export class ToolsStore {
  constructor(api) {
    this.api = api;
    this.state = {};
    this.queue = Promise.resolve();
  }
  async load() {
    this.state = await this.api("/api/tools/state");
    return this.state;
  }
  save(patch) {
    Object.assign(this.state, patch);
    const snapshot = JSON.parse(JSON.stringify(patch));
    this.queue = this.queue
      .catch(() => {})
      .then(() => this.api("/api/tools/state", snapshot));
    return this.queue;
  }
}
export function createToolUI({ showModal, closeModal, setCleanup, toast }) {
  return {
    close: closeModal,
    toast,
    open(title, body, { wide = true, cleanup } = {}) {
      showModal(
        `<div class="modal-head"><div><span class="eyebrow">FORGE · HERRAMIENTAS</span><h2 id="modal-title">${escape(title)}</h2></div><button class="icon-button modal-close" aria-label="Cerrar">×</button></div><div id="tool-error" role="alert" hidden></div><div class="tool-content">${body}</div>`,
      );
      const modal = $("#modal");
      modal.classList.toggle("tool-wide", wide);
      setCleanup(() => {
        modal.classList.remove("tool-wide");
        cleanup?.();
      });
    },
  };
}
