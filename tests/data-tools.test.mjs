import { test } from "node:test";
import assert from "node:assert/strict";
import { transformData, jsonTokens } from "../src/ui/app/data-tools/model.js";
const run = (text, format = "json", operation = "format", extra = {}) =>
  transformData({ text, format, operation, ...extra });
test("JSON format/minify preserve large integer and numeric spelling", () => {
  const text =
    ' {"id":9223372036854775807,"n":1.2300e+9,"s":"x  y", "a": [true,null]} ';
  const formatted = run(text).result;
  assert.ok(formatted.includes("9223372036854775807"));
  assert.ok(formatted.includes("1.2300e+9"));
  assert.equal(
    run(formatted, "json", "minify").result,
    '{"id":9223372036854775807,"n":1.2300e+9,"s":"x  y","a":[true,null]}',
  );
  assert.throws(() => run(text, "json", "convert"), /precisión/);
});
test("JSON errors identify location and reject malformed escapes, commas, tokens and depth", () => {
  assert.throws(() => run('{\n"a":\n}'), /Línea 3, columna 1/);
  for (const s of [
    "[1,]",
    '{"a" 1}',
    '{"a":"\\x"}',
    "01",
    "true false",
    '"a\nb"',
    "[",
    '"x',
    "\ufeff{}",
    "[1.]",
  ])
    assert.throws(() => jsonTokens(s));
  assert.throws(() => run("[".repeat(130) + "0" + "]".repeat(130)), /128/);
  assert.throws(() => run('{"a":1,"a":2}', "json", "convert"), /duplicadas/);
});
test("JSON and YAML convert with stable values; YAML comments survive formatting", () => {
  const source = '{"name":"ñ","on":true,"list":[1,2],"__proto__":"literal"}';
  const y = run(source, "json", "convert").result;
  const j = run(y, "yaml", "convert").result;
  assert.deepEqual(JSON.parse(j), JSON.parse(source));
  assert.ok(run("# keep\nx: 2\n", "yaml").result.includes("# keep"));
  assert.throws(() => run("a: 1\na: 2", "yaml"), /Línea 2/);
  assert.throws(() => run("x: .inf", "yaml", "convert"), /infinito/);
  assert.throws(() => run("a: &a [*a]", "yaml", "convert"), /circular/);
});
