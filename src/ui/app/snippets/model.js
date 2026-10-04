const parameterRE = /\{\{([A-Za-z_][\w-]*)(?::([^{}]*))?\}\}/g;
export function parameters(template) {
  const found = new Map();
  for (const match of String(template).matchAll(parameterRE)) {
    const [_, name, defaultValue] = match;
    const previous = found.get(name);
    if (
      previous &&
      defaultValue !== undefined &&
      previous.defaultValue !== undefined &&
      previous.defaultValue !== defaultValue
    )
      throw Error("Valores por defecto distintos para " + name);
    if (!previous) found.set(name, { name, defaultValue });
    else if (previous.defaultValue === undefined)
      previous.defaultValue = defaultValue;
  }
  if (found.size > 30) throw Error("Máximo 30 parámetros");
  return [...found.values()];
}
export function resolveSnippet(template, values = {}) {
  const params = parameters(template),
    missing = [],
    map = Object.fromEntries(params.map((p) => [p.name, p]));
  const command = template.replace(parameterRE, (whole, name) => {
    const value = Object.hasOwn(values, name)
      ? String(values[name])
      : map[name].defaultValue;
    if (value === undefined || value === "") {
      if (!missing.includes(name)) missing.push(name);
      return whole;
    }
    if (/[\x00-\x1f\x7f]/.test(value))
      throw Error(
        "El parámetro " +
          name +
          " contiene saltos o controles; escribe texto de una línea",
      );
    return value;
  });
  if (command.length > 8192)
    throw Error("El comando completo supera 8192 caracteres");
  return { command, missing };
}
export function normalizeSnippet(raw, id = crypto.randomUUID()) {
  if (
    !raw ||
    typeof raw.name !== "string" ||
    !raw.name.trim() ||
    typeof raw.command !== "string" ||
    !raw.command.trim()
  )
    throw Error("Cada snippet requiere nombre y comando");
  const command = raw.command.replace(/\r\n?/g, "\n");
  if (command.length > 8192 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(command))
    throw Error("Comando inválido o mayor de 8192 caracteres");
  parameters(command);
  return {
    id:
      typeof raw.id === "string" && /^[\w-]{1,100}$/.test(raw.id) ? raw.id : id,
    name: raw.name.trim().slice(0, 80),
    command,
    category: String(raw.category || raw.tag || "Custom").slice(0, 40),
    favorite: raw.favorite !== false,
  };
}
export function importSnippets(text) {
  if (new TextEncoder().encode(text).length > 900 * 1024)
    throw Error("Importación máxima: 900 KiB");
  const data = JSON.parse(text),
    rows = Array.isArray(data) ? data : data.snippets;
  if (!Array.isArray(rows) || rows.length > 100)
    throw Error("Usa un array o {snippets: []}, máximo 100");
  return rows.map((raw) => ({
    ...normalizeSnippet(raw),
    id: crypto.randomUUID(),
  }));
}
export const exportSnippets = (rows) =>
  JSON.stringify(
    {
      version: 1,
      snippets: rows.map(({ id, name, command, category, favorite }) => ({
        id,
        name,
        command,
        category,
        favorite,
      })),
    },
    null,
    2,
  );
