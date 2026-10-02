export const MAX_PANES = 8;
export const leaf = (id) => ({ type: "leaf", id });
export function leaves(tree) {
  return !tree
    ? []
    : tree.type === "leaf"
      ? [tree.id]
      : [...leaves(tree.a), ...leaves(tree.b)];
}
export function splitLeaf(tree, id, newId, axis) {
  if (tree.type === "leaf")
    return tree.id === id
      ? { type: "split", axis, ratio: 0.5, a: tree, b: leaf(newId) }
      : tree;
  return {
    ...tree,
    a: splitLeaf(tree.a, id, newId, axis),
    b: splitLeaf(tree.b, id, newId, axis),
  };
}
export function removeLeaf(tree, id) {
  if (tree.type === "leaf") return tree.id === id ? null : tree;
  const a = removeLeaf(tree.a, id),
    b = removeLeaf(tree.b, id);
  return !a ? b : !b ? a : { ...tree, a, b };
}
export function sanitizeTree(tree, valid, seen = new Set(), depth = 0) {
  if (!tree || depth > 12) return null;
  if (tree.type === "leaf") {
    if (!valid.has(tree.id) || seen.has(tree.id)) return null;
    seen.add(tree.id);
    return leaf(tree.id);
  }
  if (tree.type !== "split") return null;
  const a = sanitizeTree(tree.a, valid, seen, depth + 1),
    b = sanitizeTree(tree.b, valid, seen, depth + 1);
  if (!a) return b;
  if (!b) return a;
  return {
    type: "split",
    axis: tree.axis === "col" ? "col" : "row",
    ratio: Math.max(0.15, Math.min(0.85, Number(tree.ratio) || 0.5)),
    a,
    b,
  };
}
export function defaultSettings() {
  return {
    theme: "obsidian",
    fontSize: 14,
    scrollback: 3000,
    leftVisible: true,
    rightVisible: true,
    leftWidth: 220,
    rightWidth: 256,
    showFiles: true,
    showMetrics: true,
    showSnippets: true,
    showHidden: false,
    restore: true,
    historyEnabled: false,
  };
}
export function normalizeSettings(raw = {}) {
  const d = defaultSettings();
  for (const k of Object.keys(d)) {
    if (typeof raw[k] === typeof d[k]) d[k] = raw[k];
  }
  d.fontSize = Math.max(11, Math.min(22, d.fontSize));
  d.scrollback = Math.max(500, Math.min(10000, d.scrollback));
  d.leftWidth = Math.max(180, Math.min(360, d.leftWidth));
  d.rightWidth = Math.max(220, Math.min(380, d.rightWidth));
  if (!["obsidian", "midnight", "paper"].includes(d.theme))
    d.theme = "obsidian";
  return d;
}
export function safeCommand(text) {
  return String(text)
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
    .slice(0, 8192);
}
export function shellQuote(text, profile) {
  if (profile === "cmd") return '"' + text.replaceAll('"', "") + '"';
  if (profile === "pwsh" || profile === "powershell")
    return "'" + text.replaceAll("'", "''") + "'";
  return "'" + text.replaceAll("'", "'\\''") + "'";
}
export function shortPath(path, home) {
  return path === home
    ? "~"
    : path.startsWith(home + "/") || path.startsWith(home + "\\")
      ? "~" + path.slice(home.length)
      : path;
}
