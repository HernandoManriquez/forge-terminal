import { $, escape, on, copyText } from "../tools/shared.js";
import { transformData, DATA_LIMIT } from "./model.js";
export function createDataTools({ ui, api, store, cwd }) {
  let text = "",
    result = "",
    resultFormat = "json",
    file = "",
    prefs = {
      format: "json",
      indent: 2,
      root: "root",
      ...store.state.dataPrefs,
    };
  function open(input) {
    let alive = true;
    if (typeof input === "string") {
      text = input;
      prefs.format = "json";
      result = "";
    }
    ui.open(
      "JSON / YAML / XML",
      `<div class="tool-row"><label>Formato <select id="data-format" aria-label="Formato de datos">${["json", "yaml", "xml"].map((f) => `<option value="${f}" ${prefs.format === f ? "selected" : ""}>${f.toUpperCase()}</option>`).join("")}</select></label><label>Sangría <select id="data-indent" aria-label="Sangría"><option ${prefs.indent === 2 ? "selected" : ""}>2</option><option ${prefs.indent === 4 ? "selected" : ""}>4</option></select></label><input id="data-file" class="grow" aria-label="Ruta de archivo de datos" placeholder="Ruta absoluta para abrir o guardar como" value="${escape(file || cwd())}"><button id="data-open" class="button">Abrir archivo</button></div><div class="tool-columns"><label class="field">Entrada<textarea id="data-input" aria-label="Entrada de datos" spellcheck="false" style="min-height:300px">${escape(text)}</textarea></label><label class="field">Resultado <span id="data-result-format">${escape(resultFormat.toUpperCase())}</span><textarea id="data-result" aria-label="Resultado de datos" readonly spellcheck="false" style="min-height:300px">${escape(result)}</textarea></label></div><div class="tool-row"><button id="data-format-button" class="button primary">Formatear</button><button id="data-minify" class="button">Minificar</button><button id="data-validate" class="button">Validar</button><select id="data-target" aria-label="Formato de destino"></select><label id="data-root-label">Raíz XML <input id="data-root" value="${escape(prefs.root)}" style="width:110px"></label><button id="data-convert" class="button">Convertir</button><button id="data-copy" class="button">Copiar resultado</button><button id="data-save" class="button">Guardar como</button></div><p id="data-status" role="status" class="muted"></p><details><summary>Alcance y conversión XML</summary><p class="muted">Hasta 512 KiB y 128 niveles. La entrada y el resultado permanecen en memoria. Guardar como crea un archivo UTF-8 nuevo, nunca sobrescribe. XML: sin DTD/XSD ni entidades externas; se respeta texto mixto y xml:space al formatear. Para convertir se admiten elementos simples, atributos @nombre y texto #text; nombres repetidos forman listas. XML → JSON incluye la raíz y conserva escalares como texto; JSON → XML usa la raíz indicada, listas como elementos repetidos y null como elemento vacío. XML no conserva los tipos JSON. Namespaces, comentarios, texto mixto y elementos intercalados pueden impedir una conversión sin pérdida. Números JSON grandes se conservan al formatear; conviértelos a cadenas para cambiar de formato.</p></details>`,
      {
        cleanup: () => {
          alive = false;
        },
      },
    );
    const read = () => {
      text = $("#data-input").value;
      file = $("#data-file").value;
      prefs.format = $("#data-format").value;
      prefs.indent = Number($("#data-indent").value);
      prefs.root = $("#data-root").value;
    };
    const options = () => {
      const f = $("#data-format").value;
      $("#data-target").innerHTML = (f === "json" ? ["yaml", "xml"] : ["json"])
        .map((v) => `<option value="${v}">${v.toUpperCase()}</option>`)
        .join("");
      $("#data-minify").disabled = f === "yaml";
      $("#data-root-label").hidden = f !== "json";
    };
    options();
    const persist = () => {
      read();
      return store.save({ dataPrefs: prefs });
    };
    const run = (operation) => {
      read();
      $("#tool-error").hidden = true;
      const out = transformData({
        text,
        ...prefs,
        operation,
        target: $("#data-target").value,
      });
      if (out.result !== null) {
        result = out.result;
        resultFormat = out.format;
        $("#data-result").value = result;
        $("#data-result-format").textContent = resultFormat.toUpperCase();
      }
      $("#data-status").textContent =
        out.message ||
        "Resultado listo · " +
          new TextEncoder().encode(result).length +
          " bytes";
      return persist();
    };
    for (const [id, operation] of [
      ["data-format-button", "format"],
      ["data-minify", "minify"],
      ["data-validate", "validate"],
      ["data-convert", "convert"],
    ])
      on("#" + id, () => run(operation));
    on(
      "#data-format",
      () => {
        options();
        return persist();
      },
      "change",
    );
    on("#data-indent", persist, "change");
    on("#data-root", persist, "change");
    on("#data-input", read, "input");
    on("#data-file", read, "input");
    on("#data-copy", () => copyText(result));
    on("#data-open", async () => {
      read();
      const doc = await api(
        "/api/editor/file?" + new URLSearchParams({ path: file }),
      );
      if (!alive) return;
      if (doc.size > DATA_LIMIT)
        throw Error("La herramienta admite hasta 512 KiB");
      text = doc.text;
      file = doc.path;
      const ext = doc.name.split(".").at(-1).toLowerCase();
      if (["json", "yaml", "yml", "xml"].includes(ext))
        prefs.format = ext === "yml" ? "yaml" : ext;
      result = "";
      open();
    });
    on("#data-save", async () => {
      read();
      if (!result) throw Error("Genera un resultado antes de guardar");
      const saved = await api("/api/editor/save", {
        path: file,
        text: result,
        create: true,
        newline: "LF",
        bom: false,
      });
      if (alive) $("#data-status").textContent = "Guardado: " + saved.path;
    });
  }
  return { open };
}
