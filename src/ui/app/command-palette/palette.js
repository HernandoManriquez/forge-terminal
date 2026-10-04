import { $, escape, on } from "../tools/shared.js";
export function openPalette(ui, r, context = "terminal") {
  ui.open(
    "Paleta de comandos",
    '<input id="palette-input" class="tool-search" aria-label="Buscar acción" placeholder="> Buscar acciones…"><div id="palette-results" class="palette-results"></div><div class="palette-footer">↑ ↓ navegar · Enter ejecutar · Escape cerrar</div>',
    { wide: false },
  );
  let selected = 0,
    filtered = [];
  const choose = async (i) => {
    const a = filtered[i];
    if (!a?.available) return;
    ui.close();
    await r.invoke(a.id, context);
  };
  const paint = () => {
    filtered = r.list($("#palette-input").value, context);
    selected = Math.min(selected, Math.max(0, filtered.length - 1));
    $("#palette-results").innerHTML =
      filtered
        .map(
          (a, i) =>
            `<button class="palette-action ${i === selected ? "active" : ""}" data-palette-index="${i}" aria-disabled="${!a.available}"><span><small>${escape(a.category)}</small>${escape(a.label)}</span><kbd>${escape(a.keys.join(" / "))}</kbd>${!a.available ? "<small>No disponible aquí</small>" : ""}</button>`,
        )
        .join("") || '<p class="empty-state">Sin coincidencias</p>';
    for (const b of document.querySelectorAll("[data-palette-index]"))
      b.onclick = () =>
        choose(Number(b.dataset.paletteIndex)).catch((e) =>
          ui.toast(e.message),
        );
    $(".palette-action.active")?.scrollIntoView({ block: "nearest" });
  };
  on(
    "#palette-input",
    () => {
      selected = 0;
      paint();
    },
    "input",
  );
  $("#palette-input").onkeydown = (e) => {
    if (["ArrowDown", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      selected =
        (selected + (e.key === "ArrowDown" ? 1 : -1) + filtered.length) %
        Math.max(1, filtered.length);
      paint();
    }
    if (e.key === "Enter") {
      e.preventDefault();
      choose(selected).catch((e) => ui.toast(e.message));
    }
  };
  paint();
  $("#palette-input").focus();
}
