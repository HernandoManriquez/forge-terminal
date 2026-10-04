import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ActionRegistry,
  normalizeShortcut,
  eventShortcut,
  fuzzyScore,
} from "../src/ui/app/actions/registry.js";
import { registerCatalog } from "../src/ui/app/actions/catalog.js";
test("Registry dispatches once and rejects duplicate actions", async () => {
  const r = new ActionRegistry();
  let count = 0;
  r.register({ id: "a", label: "A", run: () => count++ });
  assert.throws(() => r.register({ id: "a" }));
  assert.equal(await r.invoke("a", "terminal"), true);
  assert.equal(count, 1);
  assert.equal(await r.invoke("a", "editor"), false);
  assert.equal(count, 1);
});
test("Shortcut conflicts require replacement and persist removal", () => {
  const r = new ActionRegistry();
  registerCatalog(r, {});
  assert.equal(normalizeShortcut("shift+ctrl+t"), "Ctrl+Shift+T");
  assert.equal(
    r.assign("apiTester.open", ["Ctrl+Shift+T"])[0].id,
    "terminal.new",
  );
  assert.deepEqual(r.keys("terminal.new"), ["Ctrl+Shift+T"]);
  r.assign("apiTester.open", ["Ctrl+Shift+T"], true);
  assert.deepEqual(r.keys("terminal.new"), []);
  const restored = new ActionRegistry(JSON.parse(JSON.stringify(r.overrides)));
  registerCatalog(restored, {});
  assert.deepEqual(restored.keys("apiTester.open"), ["Ctrl+Shift+T"]);
  assert.throws(() => normalizeShortcut("a"));
});
test("Editor and terminal resolve Ctrl+F by context, disabled actions cannot run", async () => {
  const r = new ActionRegistry();
  registerCatalog(
    r,
    {
      "terminal.search": () => {},
      "editor.search": () => {},
      "git.open": () => {},
    },
    { "git.open": () => false },
  );
  const e = { key: "f", ctrlKey: true };
  assert.equal(r.resolve(e, "terminal").id, "terminal.search");
  assert.equal(r.resolve(e, "editor").id, "editor.search");
  assert.deepEqual(r.assign("editor.search", ["Ctrl+F"]), []);
  assert.equal(await r.invoke("git.open", "terminal"), false);
  assert.equal(r.resolve({ ...e, isComposing: true }, "terminal"), undefined);
  assert.equal(
    eventShortcut({ key: " ", code: "Space", ctrlKey: true }),
    "Ctrl+Space",
  );
});
test("Palette uses fuzzy matching and folds accents", () => {
  const r = new ActionRegistry();
  r.register({
    id: "files",
    label: "Exploración de archivos",
    category: "Datos",
    run: () => {},
  });
  assert.ok(fuzzyScore("expl ar", "Exploración de archivos") > 0);
  assert.equal(r.list("> expl ar")[0].id, "files");
  assert.deepEqual(r.list("zzzz"), []);
});
