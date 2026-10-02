import test from "node:test";
import assert from "node:assert/strict";
import {
  leaf,
  splitLeaf,
  leaves,
  removeLeaf,
  sanitizeTree,
  normalizeSettings,
  shellQuote,
  safeCommand,
} from "../src/ui/app/model.js";

test("Nested splits retain all panes and collapse correctly when closing", () => {
  let tree = splitLeaf(leaf("a"), "a", "b", "row");
  tree = splitLeaf(tree, "b", "c", "col");
  assert.deepEqual(leaves(tree), ["a", "b", "c"]);
  tree = removeLeaf(tree, "b");
  assert.deepEqual(leaves(tree), ["a", "c"]);
  assert.equal(tree.b.type, "leaf");
  tree = removeLeaf(tree, "a");
  assert.deepEqual(tree, leaf("c"));
  assert.equal(removeLeaf(tree, "c"), null);
});
test("Restoring a damaged layout removes duplicate and absent sessions", () => {
  const tree = {
    type: "split",
    axis: "bad",
    ratio: 9,
    a: leaf("a"),
    b: { type: "split", a: leaf("a"), b: leaf("missing") },
  };
  assert.deepEqual(sanitizeTree(tree, new Set(["a"])), leaf("a"));
});
test("Preferences enforce memory and rendering limits", () => {
  const s = normalizeSettings({
    fontSize: 200,
    scrollback: 999999,
    theme: "unknown",
    leftWidth: 1,
    historyEnabled: "yes",
  });
  assert.equal(s.fontSize, 22);
  assert.equal(s.scrollback, 10000);
  assert.equal(s.theme, "obsidian");
  assert.equal(s.leftWidth, 180);
  assert.equal(s.historyEnabled, false);
});
test("Paths with quotes are encoded for the selected shell", () => {
  assert.equal(shellQuote("a'b", "bash"), "'a'\\''b'");
  assert.equal(shellQuote("a'b", "pwsh"), "'a''b'");
  assert.equal(shellQuote("C:\\My Files", "cmd"), '"C:\\My Files"');
});
test("Composer rejects control sequences but keeps multiline paste reviewable", () => {
  assert.equal(safeCommand("echo one\x1b\x00\ntwo"), "echo one\ntwo");
});

test("Legacy eight-pane layouts become eight dormant tabs with one visible", async () => {
  const { restoreWorkspaces, viewTree, replaceLeaf } = await import(
    "../src/ui/app/model.js"
  );
  const ids = Array.from({ length: 8 }, (_, i) => "p" + i);
  let tree = leaf(ids[0]);
  for (const id of ids.slice(1))
    tree = splitLeaf(tree, leaves(tree).at(-1), id, "row");
  const restored = restoreWorkspaces([{ id: "legacy", tree }], new Set(ids));
  assert.deepEqual(restored[0].tabs, ids);
  assert.deepEqual(leaves(restored[0].tree), ["p0"]);
  assert.equal(leaves(viewTree(ids)).length, 3);
  assert.deepEqual(leaves(replaceLeaf(viewTree(["a", "b", "c"]), "b", "d")), [
    "a",
    "d",
    "c",
  ]);
});
test("Restoring v2 preserves tab order and filters invalid and duplicate references", async () => {
  const { restoreWorkspaces } = await import("../src/ui/app/model.js");
  const restored = restoreWorkspaces(
    [
      { id: "w", tabs: ["c", "missing", "b", "b"], activePane: "b" },
      { id: "x", tabs: ["c", "a"] },
      { id: "x", tabs: ["d"] },
    ],
    new Set(["a", "b", "c", "d"]),
  );
  assert.deepEqual(restored[0].tabs, ["c", "b"]);
  assert.deepEqual(leaves(restored[0].tree), ["b"]);
  assert.deepEqual(restored[1].tabs, ["a"]);
  assert.equal(restored.length, 2);
});
