import { $, escape, on, copyText } from "../tools/shared.js";
import {
  normalizeSnippet,
  parameters,
  resolveSnippet,
  importSnippets,
  exportSnippets,
} from "./model.js";
export function createSnippets({
  ui,
  store,
  registry,
  runTerminal,
  insert,
  shortcuts,
  onChange,
  api,
  cwd,
}) {
  let rows = [],
    search = "",
    category = "",
    favorites = false,
    saving = false;
  const changed = () => {
    for (const id of registry.actions.keys())
      if (id.startsWith("snippet.")) registry.actions.delete(id);
    for (const s of rows)
      registry.register({
        id: "snippet." + s.id,
        label: "Preparar " + s.name,
        category: "Snippets · " + s.category,
        run: () => prepare(s.id),
      });
    onChange(rows);
  };
  const save = async (next) => {
    if (next.length > 100) throw Error("Máximo 100 snippets");
    if (saving) throw Error("Espera a que termine el guardado");
    saving = true;
    try {
      await store.save({ snippets: next });
      rows = next;
      changed();
    } finally {
      saving = false;
    }
  };
  async function initialize(legacy) {
    let invalid = 0;
    rows = (
      Array.isArray(store.state.snippets) ? store.state.snippets : legacy
    ).flatMap((s) => {
      try {
        return [normalizeSnippet(s)];
      } catch {
        invalid++;
        return [];
      }
    });
    if (invalid)
      ui.toast(
        invalid + " snippets inválidos en la configuración; revisa tools.json",
      );
    const seen = new Set();
    rows = rows.slice(0, 100).map((s) => {
      if (seen.has(s.id)) s.id = crypto.randomUUID();
      seen.add(s.id);
      return s;
    });
    if (!Array.isArray(store.state.snippets))
      await store.save({ snippets: rows });
    changed();
  }
  function open() {
    const categories = [
      ...new Set([
        "SSH",
        "Docker",
        "Git",
        "Development",
        "Custom",
        ...rows.map((s) => s.category),
      ]),
    ];
    ui.open(
      "Snippets",
      `<div class="tool-row"><input id="snippets-search" class="grow" aria-label="Buscar snippet" placeholder="Buscar nombre o comando…" value="${escape(search)}"><select id="snippets-category" aria-label="Categoría de snippets"><option value="">Todas las categorías</option>${categories.map((c) => `<option ${c === category ? "selected" : ""}>${escape(c)}</option>`).join("")}</select><label><input id="snippets-favorites" type="checkbox" ${favorites ? "checked" : ""}> Favoritos</label><button id="snippets-new" class="button primary">Nuevo</button><button id="snippets-import" class="button">Importar JSON</button><button id="snippets-export" class="button">Exportar JSON</button></div><div id="snippets-list"></div><p class="muted">Seleccionar o restaurar un snippet nunca lo ejecuta. Preparar permite revisar parámetros antes de pulsar Ejecutar. Los favoritos sin parámetros siguen disponibles en la barra de comandos.</p>`,
    );
    const paint = () => {
      if (!$("#snippets-list")) return;
      const found = rows.filter(
        (s) =>
          (!category || s.category === category) &&
          (!favorites || s.favorite) &&
          [s.name, s.command, s.category].some((v) =>
            v.toLowerCase().includes(search.toLowerCase()),
          ),
      );
      $("#snippets-list").innerHTML =
        found
          .map(
            (s) =>
              `<section class="snippet-card" data-snippet="${s.id}"><div class="tool-row"><strong>${escape(s.name)}</strong><small class="muted">${escape(s.category)}</small><button class="button snippet-star" aria-label="${s.favorite ? "Quitar de" : "Agregar a"} favoritos ${escape(s.name)}" aria-pressed="${s.favorite}">${s.favorite ? "★" : "☆"}</button></div><pre>${escape(s.command)}</pre><div class="tool-row"><button class="button snippet-prepare">Preparar</button><button class="button snippet-copy">Copiar</button><button class="button snippet-edit">Editar</button><button class="button snippet-duplicate">Duplicar</button><button class="button snippet-shortcut">Asignar atajo</button><button class="button snippet-remove">Eliminar…</button></div><div class="snippet-confirm" hidden></div></section>`,
          )
          .join("") || '<p class="empty-state">No hay coincidencias</p>';
      for (const card of document.querySelectorAll("[data-snippet]")) {
        const id = card.dataset.snippet,
          s = rows.find((s) => s.id === id);
        const wire = (selector, fn) =>
          (card.querySelector(selector).onclick = () =>
            Promise.resolve()
              .then(fn)
              .catch((e) => ui.toast(e.message)));
        wire(".snippet-prepare", () =>
          registry.invoke("snippet." + id, "terminal"),
        );
        wire(".snippet-copy", () =>
          parameters(s.command).length ? prepare(id) : copyText(s.command),
        );
        wire(".snippet-edit", () => edit(id));
        wire(".snippet-duplicate", async () => {
          await save([
            ...rows,
            {
              ...s,
              id: crypto.randomUUID(),
              name: (s.name + " (copia)").slice(0, 80),
            },
          ]);
          if ($("#snippets-list")) open();
        });
        wire(".snippet-star", async () => {
          await toggleFavorite(id);
          paint();
        });
        wire(".snippet-shortcut", () => shortcuts("snippet." + id));
        wire(".snippet-remove", () => {
          const box = card.querySelector(".snippet-confirm");
          box.hidden = false;
          box.innerHTML =
            '<p>¿Eliminar este snippet guardado?</p><button class="button cancel-remove">Cancelar</button> <button class="button confirm-remove">Eliminar</button>';
          box.querySelector(".cancel-remove").onclick = () => {
            box.hidden = true;
          };
          box.querySelector(".confirm-remove").onclick = async () => {
            try {
              await save(rows.filter((x) => x.id !== id));
              delete registry.overrides["snippet." + id];
              delete registry.overrides["favorite." + id];
              await store.save({ shortcuts: registry.overrides });
              paint();
            } catch (e) {
              ui.toast(e.message);
            }
          };
        });
      }
    };
    on(
      "#snippets-search",
      (e) => {
        search = e.target.value;
        paint();
      },
      "input",
    );
    on(
      "#snippets-category",
      (e) => {
        category = e.target.value;
        paint();
      },
      "change",
    );
    on(
      "#snippets-favorites",
      (e) => {
        favorites = e.target.checked;
        paint();
      },
      "change",
    );
    on("#snippets-new", () => edit());
    on("#snippets-import", () => portable(false));
    on("#snippets-export", () => portable(true));
    paint();
  }
  function edit(id, initial = "") {
    let alive = true;
    const old = rows.find((s) => s.id === id),
      value = old || {
        name: "",
        command: initial,
        category: "Custom",
        favorite: true,
      };
    ui.open(
      old ? "Editar snippet" : "Nuevo snippet",
      `<label class="field">Nombre<input id="snippet-name" maxlength="80" value="${escape(value.name)}"></label><label class="field">Categoría<input id="snippet-category" maxlength="40" value="${escape(value.category)}"></label><label class="field">Comando<textarea id="snippet-command" aria-label="Plantilla de comando" maxlength="8192" spellcheck="false">${escape(value.command)}</textarea></label><p class="muted">Usa {{nombre}} o {{puerto:22}}. Las plantillas se guardan como texto local; usa parámetros para datos que no quieras guardar.</p><label><input id="snippet-favorite" type="checkbox" ${value.favorite ? "checked" : ""}> Favorito</label><div class="tool-row"><button id="snippet-save" class="button primary">Guardar</button><button id="snippet-cancel" class="button">Volver</button></div>`,
      {
        cleanup: () => {
          alive = false;
        },
      },
    );
    on("#snippet-save", async () => {
      const s = normalizeSnippet({
        id: old?.id,
        name: $("#snippet-name").value,
        command: $("#snippet-command").value,
        category: $("#snippet-category").value,
        favorite: $("#snippet-favorite").checked,
      });
      await save([...rows.filter((x) => x.id !== s.id), s]);
      if (alive) open();
    });
    on("#snippet-cancel", open);
  }
  function prepare(id) {
    const s = rows.find((s) => s.id === id);
    if (!s) throw Error("Snippet no disponible");
    const params = parameters(s.command),
      values = Object.fromEntries(
        params.map((p) => [p.name, p.defaultValue || ""]),
      );
    ui.open(
      s.name,
      `${params.map((p, i) => `<label class="field">${escape(p.name)}<input class="snippet-param" data-param-index="${i}" aria-label="Parámetro ${escape(p.name)}" value="${escape(values[p.name])}" autocomplete="off"></label>`).join("")}<strong>Vista previa</strong><pre id="snippet-preview" tabindex="0"></pre><p id="snippet-missing" class="muted"></p><p class="muted">Los parámetros se insertan literalmente. Incluye las comillas necesarias en la plantilla para tu shell. Revisa el comando antes de ejecutarlo.</p><div class="tool-row"><button id="snippet-run" class="button primary">Ejecutar</button><button id="snippet-copy-result" class="button">Copiar</button><button id="snippet-insert" class="button">Insertar en barra</button><button id="snippet-back" class="button">Snippets</button></div>`,
    );
    let resolved;
    const preview = () => {
      for (const input of document.querySelectorAll(".snippet-param"))
        values[params[Number(input.dataset.paramIndex)].name] = input.value;
      try {
        resolved = resolveSnippet(s.command, values);
        $("#snippet-preview").textContent = resolved.command;
        $("#snippet-missing").textContent = resolved.missing.length
          ? "Completa: " + resolved.missing.join(", ")
          : "Listo para revisar";
        for (const id of [
          "snippet-run",
          "snippet-copy-result",
          "snippet-insert",
        ])
          $("#" + id).disabled = !!resolved.missing.length;
      } catch (e) {
        resolved = null;
        $("#snippet-missing").textContent = e.message;
        for (const id of [
          "snippet-run",
          "snippet-copy-result",
          "snippet-insert",
        ])
          $("#" + id).disabled = true;
      }
    };
    for (const input of document.querySelectorAll(".snippet-param"))
      input.oninput = preview;
    preview();
    on("#snippet-run", () => {
      if (resolved && !resolved.missing.length)
        return runTerminal(resolved.command);
    });
    on("#snippet-copy-result", () => copyText(resolved.command));
    on("#snippet-insert", () => {
      ui.close();
      insert(resolved.command);
    });
    on("#snippet-back", open);
  }
  async function toggleFavorite(id) {
    await save(
      rows.map((s) => (s.id === id ? { ...s, favorite: !s.favorite } : s)),
    );
  }
  function portable(exporting) {
    let alive = true;
    ui.open(
      exporting ? "Exportar snippets" : "Importar snippets",
      `<label class="field">JSON portable<textarea id="snippets-json" spellcheck="false" ${exporting ? "readonly" : ""}>${exporting ? escape(exportSnippets(rows)) : ""}</textarea></label><div class="tool-row"><input id="snippets-file" class="grow" aria-label="Archivo de snippets" value="${escape(cwd())}" placeholder="Ruta absoluta del archivo JSON"><button id="snippets-file-action" class="button">${exporting ? "Guardar como" : "Abrir archivo"}</button></div><p class="muted">Importar añade copias con IDs nuevos, sin ejecutar comandos ni asignar atajos automáticamente. Máximo 100 snippets. Los valores introducidos en parámetros no se exportan ni guardan.</p><div class="tool-row"><button id="snippets-portable-action" class="button primary">${exporting ? "Copiar JSON" : "Importar"}</button><button id="snippets-portable-back" class="button">Volver</button></div>`,
      {
        cleanup: () => {
          alive = false;
        },
      },
    );
    on("#snippets-portable-action", async () => {
      if (exporting) return copyText($("#snippets-json").value);
      const imported = importSnippets($("#snippets-json").value);
      await save([...rows, ...imported]);
      if (alive) open();
    });
    on("#snippets-file-action", async () => {
      const path = $("#snippets-file").value;
      if (exporting) {
        await api("/api/editor/save", {
          path,
          text: exportSnippets(rows),
          create: true,
          newline: "LF",
          bom: false,
        });
        if (alive) ui.toast("Snippets guardados");
      } else {
        const doc = await api(
          "/api/editor/file?" + new URLSearchParams({ path }),
        );
        if (alive) $("#snippets-json").value = doc.text;
      }
    });
    on("#snippets-portable-back", open);
  }
  return { initialize, open, edit, prepare, toggleFavorite };
}
