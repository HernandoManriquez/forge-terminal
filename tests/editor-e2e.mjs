import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fixture } from "./ui-fixture.mjs";
const f = await fixture("editor", async (dir) => {
  await mkdir(path.join(dir, ".ai"));
  await mkdir(path.join(dir, "docs"));
  for (const [n, s] of Object.entries({
    "notes.txt": "\ufeffHola ñ\r\nsegunda línea\r\n",
    "other.txt": "other\n",
    ".gitignore": "build/\n",
    ".ai/memory.md": "memory\n",
    "docs/help.txt": "help\n",
  }))
    await writeFile(path.join(dir, n), s);
  await writeFile(path.join(dir, "binary.bin"), Buffer.from([0, 1, 255]));
});
const { page, project } = f,
  results = [];
let editor;
async function check(name, fn) {
  await fn();
  results.push({ name, status: "PASS" });
  console.log("PASS", name);
}
const row = (name) =>
  page
    .locator(".file-entry")
    .filter({
      has: page.locator("span", {
        hasText: new RegExp("^" + name.replaceAll(".", "\\.") + "$"),
      }),
    });
const entry = (name) =>
  editor
    .locator(".editor-file")
    .filter({ hasText: new RegExp(name.replaceAll(".", "\\.") + "$") });
async function choice(action) {
  await editor.locator(`#editor-dialog [data-action="${action}"]`).click();
}
async function loaded(name) {
  await editor.waitForFunction(
    (n) =>
      document.querySelector("#editor-title").textContent.endsWith("/" + n),
    name,
  );
  await editor.waitForFunction(
    () => !document.querySelector("#editor-save").disabled,
  );
}
async function saved() {
  await editor.waitForFunction(
    () =>
      document.querySelector("#editor-state").textContent ===
      "Sin cambios pendientes",
  );
}
try {
  await check("Click selects; path insertion is explicit", async () => {
    await row("notes.txt").click();
    assert.equal(await page.locator("#command-input").inputValue(), "");
    await row("notes.txt").click({ button: "right" });
    await page
      .getByRole("menuitem", { name: "Insertar ruta en comandos" })
      .click();
    assert.ok(
      (await page.locator("#command-input").inputValue()).includes(
        path.join(project, "notes.txt"),
      ),
    );
    await page.locator("#command-input").fill("");
  });
  await check("Explorer toggle shows dotfiles and folders", async () => {
    assert.equal(await row(".gitignore").count(), 0);
    await page.locator("#files-hidden").click();
    await row(".gitignore").waitFor();
    await row(".ai").waitFor();
  });
  await check(
    "Edit opens an independent window and inherits preferences",
    async () => {
      await row("notes.txt").click({ button: "right" });
      await page.screenshot({ path: "reports/forge-explorer-menu.png" });
      const pending = page.waitForEvent("popup");
      await page.getByRole("menuitem", { name: "Editar", exact: true }).click();
      editor = await pending;
      await editor.setViewportSize({ width: 1050, height: 760 });
      await loaded("notes.txt");
      assert.equal(
        await editor.locator("#editor-text").inputValue(),
        "Hola ñ\nsegunda línea\n",
      );
      assert.equal(await editor.locator("#editor-hidden").isChecked(), true);
      await editor.screenshot({ path: "reports/forge-editor.png" });
      assert.ok(!page.url().includes("editor.html"));
    },
  );
  await check("Save preserves actual UTF-8 BOM and CRLF bytes", async () => {
    await editor.locator("#editor-text").fill("Guardado ñ\nsegunda línea\n");
    await editor.keyboard.press("Control+s");
    await saved();
    assert.equal(
      await readFile(path.join(project, "notes.txt"), "utf8"),
      "\ufeffGuardado ñ\r\nsegunda línea\r\n",
    );
  });
  await check(
    "Navigation supports cancel and save before opening",
    async () => {
      await editor.locator("#editor-text").fill("pendiente\n");
      await entry("other.txt").click();
      await choice("cancel");
      assert.equal(
        await editor.locator("#editor-text").inputValue(),
        "pendiente\n",
      );
      await entry("other.txt").click();
      await choice("save");
      await loaded("other.txt");
      assert.equal(
        await readFile(path.join(project, "notes.txt"), "utf8"),
        "\ufeffpendiente\r\n",
      );
    },
  );
  await check("Discard leaves the original unchanged", async () => {
    await editor.locator("#editor-text").fill("discard me");
    await entry("notes.txt").click();
    await choice("discard");
    await loaded("notes.txt");
    assert.equal(
      await readFile(path.join(project, "other.txt"), "utf8"),
      "other\n",
    );
  });
  await check(
    "External conflicts preserve edits; Save As recovers them",
    async () => {
      await editor.locator("#editor-text").fill("local edit\n");
      await writeFile(path.join(project, "notes.txt"), "external\n");
      await editor.locator("#editor-save").click();
      await editor.waitForFunction(() =>
        document.querySelector("#editor-error").textContent.includes("cambió"),
      );
      assert.equal(
        await editor.locator("#editor-text").inputValue(),
        "local edit\n",
      );
      assert.equal(
        await readFile(path.join(project, "notes.txt"), "utf8"),
        "external\n",
      );
      await editor.locator("#editor-save-as").click();
      await editor
        .locator("#editor-dialog-input")
        .fill(path.join(project, "recovered.txt"));
      await choice("save");
      await loaded("recovered.txt");
      await saved();
      assert.equal(
        await readFile(path.join(project, "recovered.txt"), "utf8"),
        "\ufefflocal edit\r\n",
      );
    },
  );
  await check("Save As refuses existing files", async () => {
    await editor.locator("#editor-save-as").click();
    await editor
      .locator("#editor-dialog-input")
      .fill(path.join(project, "other.txt"));
    await choice("save");
    await editor.waitForFunction(() =>
      document.querySelector("#editor-error").textContent.includes("Ya existe"),
    );
    assert.equal(
      await readFile(path.join(project, "other.txt"), "utf8"),
      "other\n",
    );
  });
  await check(
    "Folders, dotfiles and typed folder paths are navigable",
    async () => {
      await entry(".ai").click();
      await entry("memory.md").click();
      await loaded("memory.md");
      await editor.locator("#editor-up").click();
      await entry(".gitignore").click();
      await loaded(".gitignore");
      await editor.locator("#editor-folder").fill(path.join(project, "docs"));
      await editor.locator("#editor-folder").press("Enter");
      await entry("help.txt").click();
      await loaded("help.txt");
    },
  );
  await check("Binary rejection preserves current document", async () => {
    await editor.locator("#editor-open").click();
    await editor
      .locator("#editor-dialog-input")
      .fill(path.join(project, "binary.bin"));
    await choice("open");
    await editor.waitForFunction(() =>
      document.querySelector("#editor-error").textContent.includes("binario"),
    );
    assert.equal(await editor.locator("#editor-text").inputValue(), "help\n");
  });
  await check(
    "Native close entry point can cancel; Close then saves",
    async () => {
      await editor.locator("#editor-text").fill("saved before close");
      await editor.evaluate(() => {
        window.forgeRequestClose();
      });
      await choice("cancel");
      assert.equal(editor.isClosed(), false);
      await editor.locator("#editor-close").click();
      const closing = editor.waitForEvent("close");
      await choice("save");
      await closing;
      assert.equal(
        await readFile(path.join(project, "docs", "help.txt"), "utf8"),
        "saved before close",
      );
      assert.equal(
        (
          await page.request.get(new URL("/api/metrics", page.url()).href)
        ).status(),
        200,
      );
    },
  );
  await check(
    "New document warns before reload/close and can be discarded",
    async () => {
      const pending = page.waitForEvent("popup");
      await row("notes.txt").dblclick();
      editor = await pending;
      await loaded("notes.txt");
      await editor.locator("#editor-new").click();
      await editor.locator("#editor-text").fill("unsaved new document");
      const unload = editor.waitForEvent("dialog"),
        reload = editor.reload().catch(() => {}),
        prompt = await unload;
      assert.equal(prompt.type(), "beforeunload");
      await prompt.dismiss();
      await reload;
      assert.equal(
        await editor.locator("#editor-text").inputValue(),
        "unsaved new document",
      );
      await editor.locator("#editor-close").click();
      const closing = editor.waitForEvent("close");
      await choice("discard");
      await closing;
    },
  );
  assert.deepEqual(f.errors, []);
  await writeFile(
    "reports/editor-e2e.json",
    JSON.stringify(
      { status: "PASS", passed: results.length, results },
      null,
      2,
    ),
  );
} catch (e) {
  await writeFile(
    "reports/editor-e2e.json",
    JSON.stringify(
      { status: "FAIL", results, error: String(e.stack) },
      null,
      2,
    ),
  );
  if (editor && !editor.isClosed())
    await editor.screenshot({ path: "reports/editor-failure.png" });
  throw e;
} finally {
  await f.close();
}
