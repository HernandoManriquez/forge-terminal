import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parameters,
  resolveSnippet,
  normalizeSnippet,
  importSnippets,
  exportSnippets,
} from "../src/ui/app/snippets/model.js";
test("Unique parameters resolve defaults and repeated references without execution", () => {
  const template = "ssh {{user}}@{{host}} -p {{port:22}}; echo {{user}}";
  assert.deepEqual(
    parameters(template).map((p) => p.name),
    ["user", "host", "port"],
  );
  assert.deepEqual(resolveSnippet(template).missing, ["user", "host"]);
  assert.equal(
    resolveSnippet(template, { user: "ana", host: "test.local" }).command,
    "ssh ana@test.local -p 22; echo ana",
  );
  assert.throws(() => parameters("{{x:1}} {{x:2}}"), /distintos/);
});
test("Parameter values are literal, one line, and bounded; Docker braces remain unchanged", () => {
  assert.equal(
    resolveSnippet('echo "{{x}}"', { x: "$HOME; hi" }).command,
    'echo "$HOME; hi"',
  );
  assert.throws(() => resolveSnippet("{{x}}", { x: "one\ntwo" }), /controles/);
  assert.throws(() => resolveSnippet("{{x}}", { x: "a".repeat(8193) }), /8192/);
  assert.equal(
    resolveSnippet("docker ps --format '{{.Names}}'").command,
    "docker ps --format '{{.Names}}'",
  );
});
test("Portable snippets preserve templates/categories/favorites and receive fresh import IDs", () => {
  const s = normalizeSnippet({
    id: "old",
    name: " SSH ",
    command: "ssh {{user}}@{{host}}",
    category: "SSH",
    favorite: false,
  });
  const out = importSnippets(exportSnippets([s]));
  assert.equal(out[0].name, "SSH");
  assert.equal(out[0].command, s.command);
  assert.equal(out[0].favorite, false);
  assert.notEqual(out[0].id, s.id);
  assert.throws(() => importSnippets('[{"name":"bad"}]'), /requiere/);
  assert.throws(
    () => normalizeSnippet({ name: "Bad", command: "echo\u0007" }),
    /inválido/,
  );
});
