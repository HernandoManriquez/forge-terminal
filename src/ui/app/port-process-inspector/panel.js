import { $, escape, on, copyText } from "../tools/shared.js";
import {
  PAGE_SIZE,
  visibleRows,
  portURL,
  likelyHTTP,
  nativeCommand,
} from "./model.js";
export function createInspector({ ui, api, store, openAPI, openDirectory }) {
  let snapshot = { ports: [], processes: [], warnings: [] },
    prefs = {
      view: "ports",
      search: "",
      protocol: "",
      listening: true,
      sort: "port",
      desc: false,
      ...store.state.inspectorPrefs,
    },
    page = 0,
    selected = null,
    version = 0;
  const mem = (v) => (v == null ? "—" : (v / 1048576).toFixed(1) + " MB");
  const cpu = (v) => (v == null ? "—" : v.toFixed(1) + "%");
  async function open() {
    let alive = true;
    const mine = ++version;
    selected = null;
    ui.open(
      "Puertos y procesos",
      `<div class="tool-row"><div class="tool-tabs"><button id="inspect-ports" class="button" aria-selected="${prefs.view === "ports"}">Puertos</button><button id="inspect-processes" class="button" aria-selected="${prefs.view === "processes"}">Procesos</button></div><button id="inspect-refresh" class="button primary">Actualizar</button><button id="inspect-copy-command" class="button">Copiar comando equivalente</button><span id="inspect-time" class="muted" role="status"></span></div><div class="tool-row"><input id="inspect-search" class="grow" aria-label="Buscar puerto o proceso" placeholder="Puerto, PID, proceso, dirección…" value="${escape(prefs.search)}"><select id="inspect-protocol" aria-label="Protocolo"><option value="">TCP y UDP</option><option>TCP</option><option>UDP</option></select><label id="inspect-listening-label"><input id="inspect-listening" type="checkbox" ${prefs.listening ? "checked" : ""}> Solo escucha / UDP enlazado</label><button id="inspect-clear-pid" class="button" ${prefs.pid ? "" : "hidden"}>Quitar filtro PID ${prefs.pid || ""}</button></div><div id="inspect-notes" class="muted"></div><div id="inspect-table" class="tool-table-wrap"></div><div class="tool-row"><button id="inspect-prev" class="button">Anterior</button><span id="inspect-page" role="status"></span><button id="inspect-next" class="button">Siguiente</button></div><div id="inspect-selection"></div><p class="muted">CPU se calcula entre actualizaciones: 100% equivale a un núcleo. — significa dato no disponible. Los permisos pueden ocultar procesos, PID o rutas; no se eleva privilegios. Actualización manual.</p>`,
      {
        cleanup: () => {
          alive = false;
        },
      },
    );
    $("#inspect-protocol").value = prefs.protocol || "";
    const persist = () =>
      store.save({
        inspectorPrefs: {
          view: prefs.view,
          protocol: prefs.protocol,
          listening: prefs.listening,
          sort: prefs.sort,
          desc: prefs.desc,
        },
      });
    const copyButton = (label, value, id) =>
      `<button class="button" id="${id}" ${value == null || value === "" ? "disabled" : ""}>${label}</button>`;
    const selectPort = (port) => {
      selected = port;
      const scheme = [443, 8443].includes(port.port) ? "https" : "http";
      $("#inspect-selection").innerHTML =
        `<h3>${escape(port.protocol + " " + port.address + ":" + port.port)}</h3><div class="tool-row"><button id="port-copy-port" class="button">Copiar puerto</button><button id="port-copy-pid" class="button" ${port.pid ? "" : "disabled"}>Copiar PID</button><button id="port-copy-address" class="button">Copiar dirección</button><button id="port-process" class="button" ${port.pid ? "" : "disabled"}>Ver proceso</button><button id="port-terminate" class="button" ${port.pid ? "" : "disabled"}>Terminar proceso…</button><select id="port-scheme" aria-label="Esquema HTTP"><option ${scheme === "http" ? "selected" : ""}>http</option><option ${scheme === "https" ? "selected" : ""}>https</option></select><button id="port-api" class="button" ${port.protocol === "TCP" ? "" : "disabled"}>Abrir en API Tester</button><button id="port-browser" class="button" ${likelyHTTP(port) ? "" : "hidden"}>Abrir navegador</button></div>${!likelyHTTP(port) && port.protocol === "TCP" ? '<label><input id="port-explicit-http" type="checkbox"> Tratar explícitamente este puerto como HTTP/HTTPS</label>' : ""}<p class="muted">API Tester prepara una petición GET; tú decides cuándo enviarla.</p>`;
      on("#port-copy-port", () => copyText(String(port.port)));
      on("#port-copy-pid", () => copyText(String(port.pid)));
      on("#port-copy-address", () => copyText(port.address));
      on("#port-process", () => detail(port.pid));
      on("#port-terminate", () => detail(port.pid, true));
      on("#port-api", () =>
        openAPI({
          url: portURL(port, $("#port-scheme").value),
          method: "GET",
          name: "Puerto " + port.port,
        }),
      );
      on("#port-browser", () =>
        api("/api/tools/browser", {
          url: portURL(port, $("#port-scheme").value),
        }),
      );
      on(
        "#port-explicit-http",
        (e) => {
          $("#port-browser").hidden = !e.target.checked;
        },
        "change",
      );
    };
    const paint = () => {
      const proc = prefs.view === "processes";
      $("#inspect-protocol").hidden = proc;
      $("#inspect-listening-label").hidden = proc;
      $("#inspect-ports").setAttribute("aria-selected", String(!proc));
      $("#inspect-processes").setAttribute("aria-selected", String(proc));
      const rows = visibleRows(snapshot, prefs);
      page = Math.min(
        page,
        Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1),
      );
      const visible = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      const headers = proc
        ? [
            ["pid", "PID"],
            ["name", "Proceso"],
            ["cpu", "CPU"],
            ["memory", "Memoria"],
            ["user", "Usuario"],
          ]
        : [
            ["port", "Puerto"],
            ["protocol", "Protocolo"],
            ["address", "Dirección"],
            ["pid", "PID"],
            ["process", "Proceso"],
            ["state", "Estado"],
          ];
      $("#inspect-table").innerHTML =
        `<table class="tool-table"><thead><tr>${headers.map(([key, label]) => `<th><button class="text-button" data-sort="${key}">${label}${prefs.sort === key ? (prefs.desc ? " ↓" : " ↑") : ""}</button></th>`).join("")}<th>Acciones</th></tr></thead><tbody>${visible.map((r, i) => `<tr data-inspect-row="${i}">${(proc ? [r.pid, r.name || "—", cpu(r.cpu), mem(r.memory), r.user || "—"] : [r.port, r.protocol, r.address, r.pid || "—", r.process || "—", r.state]).map((v) => `<td>${escape(v)}</td>`).join("")}<td><button class="button inspect-row-action" data-index="${i}" aria-label="${proc ? "Detalles PID " + r.pid : "Acciones puerto " + r.port}">${proc ? "Detalles" : "Acciones"}</button></td></tr>`).join("") || `<tr><td colspan="7">Sin coincidencias</td></tr>`}</tbody></table>`;
      $("#inspect-page").textContent =
        `${rows.length} resultados · ${rows.length ? page + 1 : 0} / ${Math.ceil(rows.length / PAGE_SIZE)}`;
      $("#inspect-prev").disabled = page === 0;
      $("#inspect-next").disabled = (page + 1) * PAGE_SIZE >= rows.length;
      for (const b of document.querySelectorAll("[data-sort]"))
        b.onclick = () => {
          prefs.desc =
            prefs.sort === b.dataset.sort
              ? !prefs.desc
              : ["cpu", "memory"].includes(b.dataset.sort);
          prefs.sort = b.dataset.sort;
          page = 0;
          paint();
          persist().catch((e) => ui.toast(e.message));
        };
      for (const row of document.querySelectorAll("[data-inspect-row]")) {
        const item = visible[Number(row.dataset.inspectRow)];
        const action = () =>
          proc
            ? detail(item.pid).catch((e) => ui.toast(e.message))
            : selectPort(item);
        row.querySelector("button").onclick = action;
        row.oncontextmenu = (e) => {
          e.preventDefault();
          action();
        };
      }
    };
    const refresh = async () => {
      const button = $("#inspect-refresh");
      button.disabled = true;
      try {
        const result = await api("/api/tools/inspect");
        if (!alive || mine !== version) return;
        snapshot = result;
        selected = null;
        $("#inspect-selection").innerHTML = "";
        $("#inspect-notes").textContent = result.warnings.join(" · ");
        $("#inspect-time").textContent =
          "Actualizado " + new Date(result.at).toLocaleTimeString();
        paint();
      } finally {
        if (alive && mine === version) button.disabled = false;
      }
    };
    async function detail(pid, terminate = false) {
      const info = await api("/api/tools/process?pid=" + pid);
      if (!alive || mine !== version) return;
      const live = snapshot.processes.find((p) => p.pid === pid);
      $("#inspect-selection").innerHTML =
        `<section class="tool-notice" id="process-detail"><h3>${escape(info.name || "Proceso")} · PID ${info.pid}</h3><p>PPID ${info.ppid || "—"} · ${escape(info.user || "Usuario no disponible")} · CPU ${cpu(live?.cpu)} · ${mem(info.memory)}</p><p>${info.critical ? "Proceso crítico identificado por el sistema. " : !info.criticalKnown ? "La plataforma no puede clasificar todos los procesos críticos. " : ""}${escape(info.protected)}</p><strong>Ejecutable</strong><pre>${escape(info.exe || "No disponible")}</pre><strong>Comando</strong><pre id="process-command">${escape(info.command || "No disponible")}</pre><strong>Carpeta</strong><pre>${escape(info.cwd || "No disponible")}</pre><p>Puertos: ${escape(info.ports.map((p) => p.protocol + " " + p.port).join(", ") || "No disponibles")}</p><div class="tool-row">${copyButton("Copiar PID", pid, "process-copy-pid")}${copyButton("Copiar comando", info.command, "process-copy-command")}<button id="process-directory" class="button" ${info.cwd ? "" : "disabled"}>Abrir carpeta</button><button id="process-ports" class="button">Ver puertos</button><button id="process-terminate" class="button" ${info.protected ? "disabled" : ""}>Terminar…</button><button id="process-copy-kill" class="button">Copiar comando de terminación</button></div><div id="process-confirm" hidden></div></section>`;
      on("#process-copy-pid", () => copyText(String(pid)));
      on("#process-copy-command", () => copyText(info.command));
      on("#process-copy-kill", () =>
        copyText(nativeCommand(snapshot.platform, "processes", pid)),
      );
      on("#process-directory", () => {
        ui.close();
        return openDirectory(info.cwd);
      });
      on("#process-ports", () => {
        prefs.view = "ports";
        prefs.pid = pid;
        prefs.search = "";
        prefs.listening = false;
        open();
      });
      const confirm = () => {
        if (info.protected) return;
        const box = $("#process-confirm");
        box.hidden = false;
        box.innerHTML = `<h3>¿Terminar este proceso?</h3><p>PID ${pid} · ${escape(info.name)}. ${snapshot.platform === "windows" ? "Windows finaliza el proceso inmediatamente." : "Linux envía SIGTERM; el proceso puede manejar o ignorar la señal."} Puede perder trabajo sin guardar.</p><button id="process-cancel" class="button">Cancelar</button> <button id="process-confirm-kill" class="button primary">Terminar proceso</button>`;
        on("#process-cancel", () => {
          box.hidden = true;
        });
        on("#process-confirm-kill", async () => {
          const result = await api("/api/tools/process/terminate", {
            pid,
            identity: info.identity,
            confirmed: true,
          });
          if (!alive) return;
          ui.toast(result.message);
          await refresh();
        });
        $("#process-cancel").focus();
        box.scrollIntoView({ block: "nearest" });
      };
      on("#process-terminate", confirm);
      $("#process-detail").scrollIntoView({ block: "nearest" });
      if (terminate) confirm();
    }
    for (const [id, view] of [
      ["#inspect-ports", "ports"],
      ["#inspect-processes", "processes"],
    ])
      on(id, () => {
        prefs.view = view;
        prefs.sort = view === "ports" ? "port" : "pid";
        prefs.desc = false;
        page = 0;
        selected = null;
        $("#inspect-selection").innerHTML = "";
        paint();
        return persist();
      });
    on(
      "#inspect-search",
      (e) => {
        prefs.search = e.target.value;
        page = 0;
        paint();
      },
      "input",
    );
    on(
      "#inspect-protocol",
      (e) => {
        prefs.protocol = e.target.value;
        page = 0;
        paint();
        return persist();
      },
      "change",
    );
    on(
      "#inspect-listening",
      (e) => {
        prefs.listening = e.target.checked;
        page = 0;
        paint();
        return persist();
      },
      "change",
    );
    on("#inspect-clear-pid", () => {
      delete prefs.pid;
      $("#inspect-clear-pid").hidden = true;
      page = 0;
      paint();
    });
    on("#inspect-prev", () => {
      page--;
      paint();
    });
    on("#inspect-next", () => {
      page++;
      paint();
    });
    on("#inspect-refresh", refresh);
    on("#inspect-copy-command", () =>
      copyText(nativeCommand(snapshot.platform, prefs.view)),
    );
    paint();
    await refresh();
  }
  return { open };
}
