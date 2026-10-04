import { $, escape, on } from "../tools/shared.js";
import { eventShortcut, normalizeShortcut } from "../actions/registry.js";
export function openShortcuts(ui, r, store, initial = "") {
  ui.open(
    "Atajos de teclado",
    `<label class="field">Buscar acción<input id="shortcut-search" value="${escape(initial)}" placeholder="Terminal, editor, API…"></label><p class="muted">Selecciona un campo y pulsa la combinación. Terminal y Editor pueden reutilizar teclas. Ctrl+C conserva la interrupción del shell mientras no lo reasignes.</p><div id="shortcut-conflict" role="alert" class="tool-notice" hidden></div><div id="shortcut-list"></div>`,
  );
  const assign = async (id, keys, replace = false) => {
    const conflicts = r.assign(id, keys, replace);
    if (conflicts.length) {
      const box = $("#shortcut-conflict");
      box.hidden = false;
      box.innerHTML = `Combinación asignada a: ${conflicts.map((a) => escape(a.label)).join(", ")}<div class="tool-row"><button id="shortcut-replace" class="button primary">Reemplazar</button><button id="shortcut-cancel" class="button">Cancelar</button></div>`;
      on("#shortcut-replace", () => assign(id, keys, true));
      on("#shortcut-cancel", () => {
        box.hidden = true;
        paint();
      });
      return;
    }
    await store.save({ shortcuts: r.overrides });
    $("#shortcut-conflict").hidden = true;
    paint();
  };
  const paint = () => {
    $("#shortcut-list").innerHTML = r
      .list($("#shortcut-search").value)
      .map(
        (a) =>
          `<div class="shortcut-item" data-shortcut-id="${escape(a.id)}"><div><strong>${escape(a.label)}</strong><small>${escape(a.category)} · ${escape(a.context)}</small></div><input class="shortcut-input" aria-label="Atajo ${escape(a.label)}" value="${escape(r.keys(a.id).join(", "))}" placeholder="Sin asignar"><button class="button shortcut-save">Guardar</button><button class="button shortcut-remove">Quitar</button><button class="button shortcut-reset">Restaurar</button></div>`,
      )
      .join("");
    for (const row of document.querySelectorAll("[data-shortcut-id]")) {
      const id = row.dataset.shortcutId,
        input = row.querySelector("input");
      input.onkeydown = (e) => {
        if (e.key === "Tab") return;
        if (e.key === "Escape") {
          input.blur();
          return;
        }
        e.preventDefault();
        if (["Backspace", "Delete"].includes(e.key)) {
          input.value = "";
          return;
        }
        try {
          const key = eventShortcut(e);
          if (key) input.value = normalizeShortcut(key);
        } catch {}
      };
      row.querySelector(".shortcut-save").onclick = () =>
        assign(id, input.value ? input.value.split(",") : []).catch((e) =>
          ui.toast(e.message),
        );
      row.querySelector(".shortcut-remove").onclick = () =>
        assign(id, []).catch((e) => ui.toast(e.message));
      row.querySelector(".shortcut-reset").onclick = () =>
        assign(id, r.actions.get(id).shortcuts).catch((e) =>
          ui.toast(e.message),
        );
    }
  };
  on("#shortcut-search", paint, "input");
  paint();
}
