import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fixture } from "./ui-fixture.mjs";
const f = await fixture("actions", async (dir) =>
    writeFile(path.join(dir, "notes.txt"), "alpha beta alpha\n"),
  ),
  { page } = f,
  results = [];
async function check(name, fn) {
  await fn();
  results.push({ name, status: "PASS" });
  console.log("PASS", name);
}
try {
  await check(
    "Palette fuzzy navigation uses common registry and context availability",
    async () => {
      await page.keyboard.press("Control+Shift+P");
      await page.locator("#palette-input").fill("prfrn");
      await page.keyboard.press("Enter");
      await page.locator("#pref-font").waitFor();
      await page.keyboard.press("Escape");
      await page.keyboard.press("Control+k");
      await page.locator("#palette-input").fill("Buscar en archivo");
      assert.equal(
        await page
          .locator(".palette-action")
          .first()
          .getAttribute("aria-disabled"),
        "true",
      );
      await page.keyboard.press("Escape");
    },
  );
  await check(
    "Shortcut assignment, conflict cancel/replace and persistence",
    async () => {
      await page.locator("#settings-button").click();
      await page.locator("#keyboard-settings").click();
      const row = page.locator('[data-shortcut-id="terminal.new"]');
      await row.locator("input").click();
      await page.keyboard.press("Control+Shift+d");
      await row.locator(".shortcut-save").click();
      await page.locator("#shortcut-conflict").waitFor({ state: "visible" });
      await page.locator("#shortcut-cancel").click();
      assert.equal(await row.locator("input").inputValue(), "Ctrl+Shift+T");
      await row.locator("input").click();
      await page.keyboard.press("Control+Shift+d");
      await row.locator(".shortcut-save").click();
      await page.locator("#shortcut-replace").click();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-shortcut-id="terminal.split"] input')
            ?.value === "",
      );
      await row.locator("input").click();
      await page.keyboard.press("Control+Alt+n");
      await row.locator(".shortcut-save").click();
      await page.waitForFunction(async () => {
        const s = await fetch("/api/tools/state").then((r) => r.json());
        return s.shortcuts["terminal.new"][0] === "Ctrl+Alt+N";
      });
      await page.keyboard.press("Escape");
      await page.keyboard.press("Control+Alt+n");
      await page.locator("#new-cwd").waitFor();
      await page.keyboard.press("Escape");
      await page.reload();
      await page.waitForSelector(".terminal-pane.connected");
      await page.keyboard.press("Control+Alt+n");
      await page.locator("#new-cwd").waitFor();
      await page.keyboard.press("Escape");
    },
  );
  await check(
    "Ctrl+F searches terminal output and editor content independently",
    async () => {
      await page.keyboard.press("Control+f");
      await page.locator("#search-input").waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      const file = page.locator(".file-entry").filter({ hasText: "notes.txt" });
      await file.click({ button: "right" });
      const popup = f.context.waitForEvent("page");
      await page.getByRole("menuitem", { name: "Editar", exact: true }).click();
      const editor = await popup;
      await editor.locator("#editor-text").waitFor({ state: "visible" });
      await editor.waitForFunction(() =>
        document.querySelector("#editor-text").value.includes("alpha"),
      );
      await editor.keyboard.press("Control+f");
      await editor.locator("#editor-find").fill("beta");
      await editor.locator("#editor-find-next").click();
      assert.equal(
        await editor
          .locator("#editor-text")
          .evaluate((e) => e.value.slice(e.selectionStart, e.selectionEnd)),
        "beta",
      );
      await editor.close();
    },
  );
  assert.deepEqual(f.errors, []);
  await writeFile(
    "reports/actions-e2e.json",
    JSON.stringify(
      { status: "PASS", passed: results.length, results },
      null,
      2,
    ),
  );
} catch (e) {
  await page.screenshot({ path: "reports/actions-failure.png" });
  throw e;
} finally {
  await f.close();
}
