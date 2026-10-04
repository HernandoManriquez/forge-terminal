import { parseDocument, stringify as yamlStringify, LineCounter } from "yaml";
export const DATA_LIMIT = 512 * 1024;
export function dataError(text, offset, message) {
  const before = text.slice(0, Math.max(0, offset));
  const line = before.split("\n").length,
    column = before.length - before.lastIndexOf("\n");
  return Error(`Línea ${line}, columna ${column}: ${message}`);
}
// Strict JSON tokens retain numeric spelling: formatting never rounds large IDs.
export function jsonTokens(text) {
  let i = 0;
  const tokens = [];
  const fail = (msg) => {
    throw dataError(text, i, msg);
  };
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      if (!/[\t\r\n ]/.test(text[i])) fail("Espacio no permitido en JSON");
      i++;
      continue;
    }
    const start = i,
      c = text[i];
    if ("{}[],:".includes(c)) {
      tokens.push({ raw: c, start });
      i++;
      continue;
    }
    if (c === '"') {
      i++;
      let done = false;
      while (i < text.length) {
        if (text[i] === '"') {
          i++;
          done = true;
          break;
        }
        if (text.charCodeAt(i) < 32) fail("Control sin escapar en cadena");
        if (text[i] === "\\") {
          i++;
          if (text[i] === "u") {
            if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5)))
              fail("Escape Unicode inválido");
            i += 5;
            continue;
          }
          if (!text[i] || !'"\\/bfnrt'.includes(text[i]))
            fail("Escape inválido");
        }
        i++;
      }
      if (!done) fail("Cadena sin cerrar");
      tokens.push({ raw: text.slice(start, i), start });
      continue;
    }
    const m = text
      .slice(i)
      .match(
        /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/,
      );
    if (!m) fail("Token inesperado");
    tokens.push({ raw: m[0], start });
    i += m[0].length;
  }
  let n = 0;
  const duplicates = [];
  const error = (msg) => {
    throw dataError(text, tokens[n]?.start ?? text.length, msg);
  };
  const take = (v) => {
    if (tokens[n]?.raw !== v) error("Se esperaba " + v);
    n++;
  };
  const value = (depth = 0) => {
    if (depth > 128) error("Profundidad máxima: 128");
    const t = tokens[n]?.raw;
    if (!t) error("Falta un valor");
    if (t === "{") {
      n++;
      const names = new Set();
      if (tokens[n]?.raw === "}") {
        n++;
        return;
      }
      while (true) {
        if (!tokens[n]?.raw.startsWith('"'))
          error("Se esperaba una clave entre comillas");
        const key = JSON.parse(tokens[n].raw);
        if (names.has(key)) duplicates.push(key);
        names.add(key);
        n++;
        take(":");
        value(depth + 1);
        if (tokens[n]?.raw === "}") break;
        take(",");
      }
      n++;
      return;
    }
    if (t === "[") {
      n++;
      if (tokens[n]?.raw === "]") {
        n++;
        return;
      }
      while (true) {
        value(depth + 1);
        if (tokens[n]?.raw === "]") break;
        take(",");
      }
      n++;
      return;
    }
    if (t.startsWith('"') || /^(?:-?\d|true$|false$|null$)/.test(t)) {
      n++;
      return;
    }
    error("Valor inesperado");
  };
  value();
  if (n !== tokens.length) error("Contenido después del valor JSON");
  return { tokens, duplicates };
}
function formatJSON(text, minify, indent) {
  const { tokens } = jsonTokens(text);
  if (minify) return tokens.map((t) => t.raw).join("");
  let result = "",
    depth = 0;
  const newline = () => "\n" + " ".repeat(depth * indent);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].raw,
      next = tokens[i + 1]?.raw,
      prev = tokens[i - 1]?.raw;
    if (t === "{" || t === "[") {
      result += t;
      depth++;
      if (next !== "}" && next !== "]") result += newline();
    } else if (t === "}" || t === "]") {
      depth--;
      if (prev !== "{" && prev !== "[") result += newline();
      result += t;
    } else if (t === ",") result += "," + newline();
    else if (t === ":") result += ": ";
    else result += t;
  }
  return result;
}
function jsonValue(text) {
  const { tokens, duplicates } = jsonTokens(text);
  if (duplicates.length)
    throw Error("La conversión perdería claves duplicadas: " + duplicates[0]);
  for (const t of tokens) {
    if (/^-?\d/.test(t.raw)) {
      const n = Number(t.raw);
      if (
        !Number.isFinite(n) ||
        (Number.isInteger(n) && !Number.isSafeInteger(n))
      )
        throw dataError(
          text,
          t.start,
          "Número fuera de la precisión segura; usa una cadena para convertir",
        );
    }
  }
  return JSON.parse(text);
}
function yamlDoc(text) {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, {
    lineCounter,
    strict: true,
    uniqueKeys: true,
    stringKeys: true,
    intAsBigInt: true,
  });
  const err = doc.errors[0] || doc.warnings[0];
  if (err) {
    const pos = err.linePos?.[0] || lineCounter.linePos(err.pos?.[0] || 0);
    throw Error(
      `Línea ${pos.line}, columna ${pos.col}: ${err.message.split("\n")[0]}`,
    );
  }
  const depthCheck = (node, depth = 0) => {
    if (depth > 128) throw Error("Profundidad máxima: 128");
    if (node?.items)
      for (const child of node.items) depthCheck(child, depth + 1);
    if (node && Object.hasOwn(node, "key")) {
      depthCheck(node.key, depth);
      depthCheck(node.value, depth);
    }
  };
  depthCheck(doc.contents);
  return doc;
}
function yamlValue(doc) {
  const value = doc.toJS({ maxAliasCount: 50, mapAsMap: true });
  const seen = new Set();
  function plain(v, depth = 0) {
    if (depth > 128) throw Error("Profundidad máxima: 128");
    if (typeof v === "bigint") {
      if (
        v > BigInt(Number.MAX_SAFE_INTEGER) ||
        v < BigInt(Number.MIN_SAFE_INTEGER)
      )
        throw Error("Entero fuera de precisión segura: conviértelo a cadena");
      return Number(v);
    }
    if (typeof v === "number" && !Number.isFinite(v))
      throw Error("JSON no admite NaN ni infinito");
    if (v && typeof v === "object") {
      if (seen.has(v))
        throw Error("Referencia YAML circular no convertible a JSON");
      seen.add(v);
      let out;
      if (v instanceof Map) {
        out = Object.create(null);
        for (const [key, x] of v) {
          if (typeof key !== "string")
            throw Error("JSON requiere claves de texto");
          out[key] = plain(x, depth + 1);
        }
      } else if (Array.isArray(v)) out = v.map((x) => plain(x, depth + 1));
      else throw Error("Tipo YAML no convertible");
      seen.delete(v);
      return out;
    }
    return v;
  }
  return plain(value);
}
function parseXML(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw Error("DTD y entidades externas no admitidas");
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const err =
    doc.getElementsByTagNameNS(
      "http://www.mozilla.org/newlayout/xml/parsererror.xml",
      "parsererror",
    )[0] ||
    doc.getElementsByTagNameNS(
      "http://www.w3.org/1999/xhtml",
      "parsererror",
    )[0];
  if (err) {
    const msg = err.textContent;
    const lc = msg.match(/line\s+(\d+).*column\s+(\d+)/i);
    throw Error(
      lc
        ? `Línea ${lc[1]}, columna ${lc[2]}: XML inválido · ${msg}`
        : "XML inválido: " + msg,
    );
  }
  if (!doc.documentElement) throw Error("Falta elemento raíz");
  let count = 0;
  const visit = (node, depth) => {
    if (depth > 128 || ++count > 50000)
      throw Error("XML excede 128 niveles o 50.000 nodos");
    for (const c of node.childNodes) visit(c, depth + 1);
  };
  visit(doc, 0);
  return doc;
}
function formatXML(text, minify, indent) {
  const doc = parseXML(text);
  const visit = (el, depth = 0, inherited = false) => {
    const own = el.getAttribute("xml:space");
    const preserve = own === "preserve" || (own !== "default" && inherited);
    const elements = [...el.children];
    const mixed = [...el.childNodes].some(
      (n) => (n.nodeType === 3 && n.textContent.trim()) || n.nodeType === 4,
    );
    for (const c of elements) visit(c, depth + 1, preserve);
    if (!preserve && elements.length && !mixed) {
      for (const n of [...el.childNodes])
        if (n.nodeType === 3 && !n.textContent.trim()) n.remove();
      if (!minify) {
        for (const n of [...el.childNodes])
          el.insertBefore(
            doc.createTextNode("\n" + " ".repeat((depth + 1) * indent)),
            n,
          );
        el.append(doc.createTextNode("\n" + " ".repeat(depth * indent)));
      }
    }
  };
  visit(doc.documentElement);
  const declaration = text.match(/^\s*(<\?xml\s[^?]*\?>)/)?.[1];
  return (
    (declaration ? declaration + (minify ? "" : "\n") : "") +
    new XMLSerializer().serializeToString(doc)
  );
}
function xmlValue(text) {
  const doc = parseXML(text);
  if ([...doc.childNodes].some((n) => n.nodeType === 8 || n.nodeType === 7))
    throw Error("La conversión omitiría comentarios o instrucciones XML");
  function read(el) {
    if (
      el.prefix ||
      el.hasAttribute("xmlns") ||
      [...el.attributes].some((a) => a.name.startsWith("xmlns:"))
    )
      throw Error(
        "Conversión XML con namespaces no admitida; puedes formatear y validar",
      );
    if ([...el.childNodes].some((n) => n.nodeType === 8 || n.nodeType === 7))
      throw Error("La conversión omitiría comentarios o instrucciones XML");
    const children = [...el.children],
      attrs = [...el.attributes],
      value = Object.create(null);
    for (const a of attrs) value["@" + a.name] = a.value;
    const txt = [...el.childNodes]
      .filter((n) => [3, 4].includes(n.nodeType))
      .map((n) => n.textContent)
      .join("");
    if (children.length && txt.trim())
      throw Error("Contenido XML mixto: conversión ambigua");
    if (!children.length) {
      if (!attrs.length) return txt;
      value["#text"] = txt;
      return value;
    }
    let last = "",
      seen = new Set();
    for (const child of children) {
      const key = child.tagName;
      if (seen.has(key) && last !== key)
        throw Error(
          "Elementos XML intercalados: la conversión perdería su orden",
        );
      seen.add(key);
      last = key;
      const v = read(child);
      if (Object.hasOwn(value, key))
        value[key] = Array.isArray(value[key])
          ? [...value[key], v]
          : [value[key], v];
      else value[key] = v;
    }
    return value;
  }
  return { [doc.documentElement.tagName]: read(doc.documentElement) };
}
function jsonXML(value, root, indent) {
  if (!/^[A-Za-z_][\w.-]*$/.test(root))
    throw Error("Nombre de raíz XML inválido");
  const doc = document.implementation.createDocument("", root);
  function fill(el, v, depth = 0) {
    if (depth > 128) throw Error("Profundidad máxima: 128");
    if (v === null) return;
    if (typeof v !== "object") {
      el.textContent = String(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) {
        const child = doc.createElement("item");
        el.append(child);
        fill(child, x, depth + 1);
      }
      return;
    }
    for (const [key, x] of Object.entries(v)) {
      if (key === "#text") {
        if (x !== null && typeof x === "object")
          throw Error("#text debe ser un escalar");
        el.append(doc.createTextNode(String(x ?? "")));
        continue;
      }
      const name = key.startsWith("@") ? key.slice(1) : key;
      if (!/^[A-Za-z_][\w.-]*$/.test(name))
        throw Error("Clave no válida para XML: " + key);
      if (key.startsWith("@")) {
        if (typeof x === "object" && x !== null)
          throw Error("Atributo XML debe ser escalar");
        el.setAttribute(name, String(x ?? ""));
        continue;
      }
      for (const item of Array.isArray(x) ? x : [x]) {
        const child = doc.createElement(name);
        el.append(child);
        fill(child, item, depth + 1);
      }
    }
  }
  fill(doc.documentElement, value);
  return formatXML(new XMLSerializer().serializeToString(doc), false, indent);
}
export function transformData({
  text,
  format = "json",
  operation = "format",
  target = "yaml",
  indent = 2,
  root = "root",
}) {
  if (new TextEncoder().encode(text).length > DATA_LIMIT)
    throw Error("Máximo 512 KiB por operación");
  indent = [2, 4].includes(Number(indent)) ? Number(indent) : 2;
  if (format === "json") {
    jsonTokens(text);
    if (operation === "validate")
      return { message: "JSON válido", result: null };
    if (operation === "convert") {
      const v = jsonValue(text);
      return {
        result:
          target === "xml"
            ? jsonXML(v, root, indent)
            : yamlStringify(v, { indent }),
        format: target,
      };
    }
    return { result: formatJSON(text, operation === "minify", indent), format };
  }
  if (format === "yaml") {
    const doc = yamlDoc(text);
    if (operation === "validate") {
      doc.toJS({ maxAliasCount: 50 });
      return { message: "YAML válido", result: null };
    }
    if (operation === "convert")
      return {
        result: JSON.stringify(yamlValue(doc), null, indent),
        format: "json",
      };
    if (operation === "minify") throw Error("YAML ofrece formato y validación");
    return { result: doc.toString({ indent }), format };
  }
  if (format === "xml") {
    parseXML(text);
    if (operation === "validate")
      return { message: "XML válido (sintaxis)", result: null };
    if (operation === "convert")
      return {
        result: JSON.stringify(xmlValue(text), null, indent),
        format: "json",
      };
    return { result: formatXML(text, operation === "minify", indent), format };
  }
  throw Error("Formato no admitido");
}
export const looksJSON = (text) => /^\s*[\[{]/.test(text || "");
