const mods = ["Ctrl", "Alt", "Shift", "Meta"];
const fold = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
export function normalizeShortcut(value) {
  if (!value) return "";
  const seen = new Set();
  let key = "";
  for (const token of String(value)
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const m = mods.find((m) => m.toLowerCase() === token.toLowerCase());
    if (m) seen.add(m);
    else {
      if (key) throw Error("Usa una sola tecla con modificadores");
      key = token.length === 1 ? token.toUpperCase() : token;
    }
  }
  if (!key || (!seen.size && !/^F(?:[1-9]|1[0-2])$/.test(key)))
    throw Error("Usa Ctrl, Alt o Meta con una tecla, o F1–F12");
  return [...mods.filter((m) => seen.has(m)), key].join("+");
}
export function eventShortcut(e) {
  if (
    e.isComposing ||
    e.getModifierState?.("AltGraph") ||
    ["Control", "Alt", "Shift", "Meta"].includes(e.key)
  )
    return "";
  return [
    e.ctrlKey && "Ctrl",
    e.altKey && "Alt",
    e.shiftKey && "Shift",
    e.metaKey && "Meta",
    e.code === "Space"
      ? "Space"
      : e.key.length === 1
        ? e.key.toUpperCase()
        : e.key,
  ]
    .filter(Boolean)
    .join("+");
}
export function fuzzyScore(query, text) {
  query = fold(query.replace(/^>\s*/, ""));
  text = fold(text);
  let score = 0,
    index = -1;
  for (const c of query) {
    const n = text.indexOf(c, index + 1);
    if (n < 0) return -Infinity;
    score += n === index + 1 ? 8 : 1;
    if (n === 0 || /[\s.:/]/.test(text[n - 1])) score += 4;
    index = n;
  }
  return query ? score - text.length / 100 : 0;
}
export class ActionRegistry {
  constructor(overrides = {}) {
    this.actions = new Map();
    this.overrides =
      overrides && typeof overrides === "object" && !Array.isArray(overrides)
        ? overrides
        : {};
  }
  register(a) {
    if (!a.id || this.actions.has(a.id))
      throw Error("Acción duplicada: " + a.id);
    this.actions.set(a.id, { context: "terminal", shortcuts: [], ...a });
    return () => this.actions.delete(a.id);
  }
  keys(id) {
    const values = Object.hasOwn(this.overrides, id)
      ? this.overrides[id]
      : this.actions.get(id)?.shortcuts || [];
    return Array.isArray(values)
      ? values.flatMap((v) => {
          try {
            return normalizeShortcut(v) || [];
          } catch {
            return [];
          }
        })
      : [];
  }
  enabled(a, c) {
    return (
      !!a?.run &&
      (a.context === "global" || a.context === c) &&
      (a.enabled?.() ?? true)
    );
  }
  list(q = "", c = "terminal") {
    return [...this.actions.values()]
      .map((a) => ({
        ...a,
        keys: this.keys(a.id),
        available: this.enabled(a, c),
        score: fuzzyScore(q, `${a.label} ${a.category || ""} ${a.id}`),
      }))
      .filter((a) => a.score !== -Infinity)
      .sort((a, b) => b.score - a.score);
  }
  resolve(e, c) {
    const key = eventShortcut(e);
    return [...this.actions.values()].find(
      (a) => this.enabled(a, c) && this.keys(a.id).includes(key),
    );
  }
  conflicts(id, keys) {
    const a = this.actions.get(id);
    return [...this.actions.values()].filter(
      (b) =>
        b.id !== id &&
        (a.context === "global" ||
          b.context === "global" ||
          a.context === b.context) &&
        this.keys(b.id).some((k) => keys.includes(k)),
    );
  }
  assign(id, keys, replace = false) {
    if (!this.actions.has(id)) throw Error("Acción desconocida");
    keys = [...new Set(keys.map(normalizeShortcut).filter(Boolean))];
    const conflicts = this.conflicts(id, keys);
    if (conflicts.length && !replace) return conflicts;
    for (const a of conflicts)
      this.overrides[a.id] = this.keys(a.id).filter((k) => !keys.includes(k));
    this.overrides[id] = keys;
    return [];
  }
  async invoke(id, c, ...args) {
    const a = this.actions.get(id);
    if (!this.enabled(a, c)) return false;
    await a.run(...args);
    return true;
  }
}
