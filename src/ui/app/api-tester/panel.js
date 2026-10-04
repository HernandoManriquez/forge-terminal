import { $, escape, on, copyText } from "../tools/shared.js";
import {
  blankRequest,
  buildRequest,
  curlCommand,
  safeTemplate,
} from "./model.js";
export function createAPITester(ctx) {
  const { ui, store, profile, runTerminal } = ctx;
  let draft = blankRequest(),
    variables = "",
    last = null,
    version = 0;
  const pairsHTML = (kind, rows) =>
    `<div class="tool-table-wrap"><table class="tool-table" data-pairs="${kind}"><thead><tr><th>Activo</th><th>Clave</th><th>Valor</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td><input type="checkbox" aria-label="Activar ${kind}" ${r.enabled !== false ? "checked" : ""}></td><td><input aria-label="Clave ${kind}" value="${escape(r.key)}"></td><td><input aria-label="Valor ${kind}" value="${escape(r.value)}"></td><td><button class="button remove-pair" aria-label="Quitar fila">×</button></td></tr>`).join("")}</tbody></table></div><button class="button add-pair" data-kind="${kind}">+ Añadir ${kind}</button>`;
  function open(value) {
    if (value)
      draft = {
        ...blankRequest(),
        ...JSON.parse(JSON.stringify(value)),
        auth: { type: "none", ...(value.auth || {}) },
      };
    const mine = ++version;
    let controller,
      alive = true,
      response = null;
    ui.open(
      "cURL / API Tester",
      `<div class="tool-row"><input id="api-name" class="grow" aria-label="Nombre de petición" value="${escape(draft.name)}"><button id="api-save" class="button">Guardar plantilla</button><button id="api-duplicate" class="button">Duplicar</button><select id="api-saved" aria-label="Peticiones guardadas"><option value="">Guardadas…</option>${(store.state.requests || []).map((r) => `<option value="${escape(r.id)}">${escape(r.name)}</option>`).join("")}</select><select id="api-history" aria-label="Historial de peticiones"><option value="">Recientes…</option>${(store.state.requestHistory || []).map((r, i) => `<option value="${i}">${escape(r.method + " " + r.url)} · ${r.status || "—"}</option>`).join("")}</select></div>
   <div class="tool-row"><select id="api-method" aria-label="Método HTTP">${["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => `<option ${m === draft.method ? "selected" : ""}>${m}</option>`).join("")}</select><input id="api-url" class="grow" aria-label="URL HTTP" value="${escape(draft.url)}"><button id="api-send" class="button primary">Enviar</button><button id="api-cancel" class="button" disabled>Cancelar</button></div>
   <div class="tool-columns"><section><h3>Query Params</h3>${pairsHTML("params", draft.params || [])}<h3>Headers</h3>${pairsHTML("headers", draft.headers || [])}</section><section><h3>Autenticación</h3><select id="api-auth" aria-label="Autenticación">${[
     ["none", "Sin autenticación"],
     ["bearer", "Bearer Token"],
     ["basic", "Basic Auth"],
   ]
     .map(
       ([k, v]) =>
         `<option value="${k}" ${draft.auth.type === k ? "selected" : ""}>${v}</option>`,
     )
     .join(
       "",
     )}</select><div id="api-bearer"><label class="field">Token (solo en memoria)<input id="api-token" type="password" autocomplete="off" value="${escape(draft.auth.token)}"></label></div><div id="api-basic"><label class="field">Usuario<input id="api-user" autocomplete="off" value="${escape(draft.auth.username)}"></label><label class="field">Contraseña<input id="api-password" type="password" autocomplete="off" value="${escape(draft.auth.password)}"></label></div><label class="field">Variables · NOMBRE=valor · solo en memoria<textarea id="api-variables" spellcheck="false" style="min-height:70px">${escape(variables)}</textarea></label></section></div>
   <div class="tool-row"><strong>Body</strong><select id="api-body-type" aria-label="Tipo de cuerpo">${[
     ["none", "Sin cuerpo"],
     ["raw", "Raw"],
     ["json", "JSON"],
     ["form", "Form URL Encoded"],
   ]
     .map(
       ([k, v]) =>
         `<option value="${k}" ${draft.bodyType === k ? "selected" : ""}>${v}</option>`,
     )
     .join(
       "",
     )}</select></div><textarea id="api-body" aria-label="Cuerpo HTTP" spellcheck="false">${escape(draft.body)}</textarea><div id="api-form">${pairsHTML("form", draft.form || [])}</div>
   <details><summary>Guardados y credenciales</summary><p class="muted">Se guarda método, URL, nombres de campos y referencias {{VARIABLE}}. Se omiten valores de autenticación, parámetros, cabeceras y cuerpo. Los valores de variables y respuestas no se guardan. Sustituye también cualquier secreto en la ruta de la URL o en el nombre antes de guardar. Las credenciales de Basic/Bearer se usan solo al enviar.</p></details>
   <div class="tool-row"><strong>cURL equivalente</strong><button id="api-copy-curl" class="button">Copiar cURL</button><button id="api-run" class="button">Ejecutar en terminal</button></div><pre id="api-curl" tabindex="0"></pre><p class="muted">La ejecución en terminal puede dejar credenciales en el historial del shell. Enviar usa HTTP directo, sin cookies del navegador, sin seguir redirecciones; timeout 30 s.</p>
   <div id="api-response" hidden><div class="tool-row"><strong id="api-status" role="status"></strong><button id="api-copy-response" class="button">Copiar respuesta</button></div><div class="tool-tabs">${["Body", "Headers", "Raw"].map((v, i) => `<button class="button response-tab" data-tab="${v.toLowerCase()}" aria-selected="${i === 0}">${v}</button>`).join("")}</div><pre id="api-response-content" tabindex="0"></pre></div>`,
      {
        cleanup: () => {
          alive = false;
          controller?.abort();
        },
      },
    );
    const read = () => {
      for (const key of ["params", "headers", "form"])
        draft[key] = [
          ...document.querySelectorAll(`[data-pairs="${key}"] tbody tr`),
        ].map((row) => {
          const a = row.querySelectorAll("input");
          return { enabled: a[0].checked, key: a[1].value, value: a[2].value };
        });
      Object.assign(draft, {
        name: $("#api-name").value.slice(0, 80),
        method: $("#api-method").value,
        url: $("#api-url").value,
        bodyType: $("#api-body-type").value,
        body: $("#api-body").value,
        auth: {
          type: $("#api-auth").value,
          token: $("#api-token").value,
          username: $("#api-user").value,
          password: $("#api-password").value,
        },
      });
      variables = $("#api-variables").value;
      return draft;
    };
    const vars = () =>
      Object.fromEntries(
        variables
          .split("\n")
          .filter((s) => s.includes("="))
          .map((s) => [
            s.slice(0, s.indexOf("=")).trim(),
            s.slice(s.indexOf("=") + 1),
          ]),
      );
    const request = () => {
      read();
      return buildRequest(draft, vars());
    };
    const preview = () => {
      read();
      $("#api-bearer").hidden = draft.auth.type !== "bearer";
      $("#api-basic").hidden = draft.auth.type !== "basic";
      $("#api-body").hidden = !["raw", "json"].includes(draft.bodyType);
      $("#api-form").hidden = draft.bodyType !== "form";
      try {
        $("#api-curl").textContent = curlCommand(
          buildRequest(draft, vars()),
          profile(),
        );
      } catch (e) {
        $("#api-curl").textContent = "Completa la petición: " + e.message;
      }
    };
    const wireRows = () => {
      for (const b of document.querySelectorAll(".remove-pair"))
        b.onclick = () => {
          b.closest("tr").remove();
          preview();
        };
    };
    for (const b of document.querySelectorAll(".add-pair"))
      b.onclick = () => {
        const kind = b.dataset.kind;
        const tmp = document.createElement("tbody");
        tmp.innerHTML =
          '<tr><td><input type="checkbox" checked aria-label="Activar ' +
          kind +
          '"></td><td><input aria-label="Clave ' +
          kind +
          '"></td><td><input aria-label="Valor ' +
          kind +
          '"></td><td><button class="button remove-pair" aria-label="Quitar fila">×</button></td></tr>';
        const row = tmp.firstElementChild;
        document.querySelector(`[data-pairs="${kind}"] tbody`).append(row);
        wireRows();
        row.querySelectorAll("input")[1].focus();
      };
    document.querySelector(".tool-content").addEventListener("input", preview);
    document.querySelector(".tool-content").addEventListener("change", preview);
    wireRows();
    preview();
    const renderResponse = (tab = "body") => {
      if (!response) return;
      const headers = Object.entries(response.headers)
        .flatMap(([k, v]) => v.map((value) => k + ": " + value))
        .join("\n");
      let body = response.body;
      if (tab === "body" && !response.binary) {
        try {
          body = JSON.stringify(JSON.parse(body), null, 2);
        } catch {}
      }
      const out = $("#api-response-content");
      out.textContent =
        tab === "headers"
          ? headers
          : tab === "raw"
            ? response.protocol +
              " " +
              response.statusText +
              "\n" +
              headers +
              "\n\n" +
              body
            : body;
      if (tab === "body" && !response.binary) {
        try {
          JSON.parse(body);
          let end = 0,
            html = "";
          const re =
            /"(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g;
          for (const m of body.matchAll(re)) {
            html += escape(body.slice(end, m.index));
            html += `<span class="${m[0].endsWith(":") ? "json-key" : m[0].startsWith('"') ? "json-string" : "json-number"}">${escape(m[0])}</span>`;
            end = m.index + m[0].length;
          }
          out.innerHTML = html + escape(body.slice(end));
        } catch {}
      }
      for (const b of document.querySelectorAll(".response-tab"))
        b.setAttribute("aria-selected", String(b.dataset.tab === tab));
    };
    const send = async () => {
      const req = request();
      const sent = JSON.parse(JSON.stringify(draft));
      last = sent;
      controller = new AbortController();
      $("#api-send").disabled = true;
      $("#api-cancel").disabled = false;
      $("#tool-error").hidden = true;
      try {
        const r = await fetch("/api/tools/http", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
          signal: controller.signal,
        });
        const result = await r.json();
        if (!r.ok) throw Error(result.error);
        response = result;
        const history = [
          {
            ...safeTemplate(sent),
            at: new Date().toISOString(),
            status: result.status,
          },
          ...(store.state.requestHistory || []),
        ].slice(0, 20);
        await store.save({ requestHistory: history });
        if (!alive || mine !== version) return;
        $("#api-response").hidden = false;
        $("#api-status").textContent =
          `${result.statusText} · ${result.timeMs} ms · ${result.size.toLocaleString()} bytes${result.truncated ? " · respuesta truncada a 2 MiB" : ""}${result.binary ? " · binario en base64" : ""}`;
        renderResponse();
      } catch (e) {
        if (alive) {
          $("#tool-error").hidden = false;
          $("#tool-error").textContent =
            e.name === "AbortError" ? "Petición cancelada" : e.message;
        }
      } finally {
        if (alive) {
          $("#api-send").disabled = false;
          $("#api-cancel").disabled = true;
        }
      }
    };
    on("#api-send", send);
    on("#api-cancel", () => controller?.abort());
    on("#api-copy-curl", () => copyText(curlCommand(request(), profile())));
    on("#api-run", () => runTerminal(curlCommand(request(), profile())));
    on("#api-copy-response", () =>
      copyText($("#api-response-content").textContent),
    );
    for (const b of document.querySelectorAll(".response-tab"))
      b.onclick = () => renderResponse(b.dataset.tab);
    const save = async (duplicate) => {
      read();
      if (duplicate) {
        draft.id = crypto.randomUUID();
        draft.name += " (copia)";
      }
      const saved = safeTemplate(draft);
      await store.save({
        requests: [
          ...(store.state.requests || []).filter((r) => r.id !== saved.id),
          saved,
        ].slice(-50),
      });
      open(draft);
      ui.toast("Plantilla guardada sin valores sensibles");
    };
    on("#api-save", () => save(false));
    on("#api-duplicate", () => save(true));
    on(
      "#api-saved",
      (e) => {
        const r = (store.state.requests || []).find(
          (r) => r.id === e.target.value,
        );
        if (r) open(r);
      },
      "change",
    );
    on(
      "#api-history",
      (e) => {
        if (e.target.value !== "")
          open(store.state.requestHistory[Number(e.target.value)]);
      },
      "change",
    );
    return send;
  }
  return {
    open,
    canRepeat: () => !!last,
    repeat: () => {
      if (!last) throw Error("No hay petición anterior en esta sesión");
      return open(last)();
    },
  };
}
