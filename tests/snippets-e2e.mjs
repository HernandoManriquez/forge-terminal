import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { fixture, terminalContains } from "./ui-fixture.mjs";
const f = await fixture("snippets"),
  { page } = f,
  results = [];
let snippetID;
async function check(name, fn) {
  await fn();
  results.push({ name, status: "PASS" });
  console.log("PASS", name);
}
const card = () =>
  page
    .locator("[data-snippet]")
    .filter({ hasText: "Echo parametrizado" })
    .first();
try {
  await check(
    "Create parameterized snippet, live preview, explicit run and no saved parameter values",
    async () => {
      await page.keyboard.press("Control+Alt+s");
      await page.locator("#snippets-new").click();
      await page.locator("#snippet-name").fill("Echo parametrizado");
      await page.locator("#snippet-category").fill("Development");
      await page
        .locator("#snippet-command")
        .fill("printf '%s\\n' '{{message:SNIPPET_DEFAULT}}'");
      await page.locator("#snippet-save").click();
      await card().waitFor();
      snippetID = await card().getAttribute("data-snippet");
      await card().locator(".snippet-prepare").click();
      assert.ok(
        (await page.locator("#snippet-preview").textContent()).includes(
          "SNIPPET_DEFAULT",
        ),
      );
      assert.equal(
        (
          await page.locator(".terminal-pane.active .xterm-rows").textContent()
        ).includes("SNIPPET_DEFAULT"),
        false,
      );
      await page.getByLabel("Parámetro message").fill("USER_MEMORY_ONLY");
      await page.screenshot({ path: "reports/forge-snippets.png", animations: "disabled" });
      await page.locator("#snippet-run").click();
      await terminalContains(page, "USER_MEMORY_ONLY");
      const state = await page.evaluate(() =>
        fetch("/api/tools/state").then((r) => r.json()),
      );
      assert.equal(
        JSON.stringify(state.snippets).includes("USER_MEMORY_ONLY"),
        false,
      );
    },
  );
  await check(
    "Favorites, duplication, editing, category search and deletion persist",
    async () => {
      await page.keyboard.press("Control+Alt+s");
      await card().locator(".snippet-star").click();
      await page.waitForFunction(
        (id) =>
          document
            .querySelector('[data-snippet="' + id + '"] .snippet-star')
            ?.getAttribute("aria-pressed") === "false",
        snippetID,
      );
      assert.equal(
        await card().locator(".snippet-star").getAttribute("aria-pressed"),
        "false",
      );
      await card().locator(".snippet-duplicate").click();
      await page
        .locator("[data-snippet]")
        .filter({ hasText: "Echo parametrizado (copia)" })
        .waitFor();
      const copy = page
        .locator("[data-snippet]")
        .filter({ hasText: "Echo parametrizado (copia)" });
      await copy.locator(".snippet-edit").click();
      await page.locator("#snippet-name").fill("Copia editada");
      await page.locator("#snippet-save").click();
      await page.locator("#snippets-category").selectOption("Development");
      await page.locator("#snippets-search").fill("Copia editada");
      assert.equal(await page.locator("[data-snippet]").count(), 1);
      await page.locator(".snippet-remove").click();
      await page.locator(".cancel-remove").click();
      assert.equal(await page.locator("[data-snippet]").count(), 1);
      await page.locator(".snippet-remove").click();
      await page.locator(".confirm-remove").click();
      await page.waitForFunction(
        () => document.querySelectorAll("[data-snippet]").length === 0,
      );
      await page.locator("#snippets-search").fill("");
      await page.locator("#snippets-category").selectOption("");
    },
  );
  await check(
    "Assigned snippet shortcut prepares without running and survives restart",
    async () => {
      await card().locator(".snippet-shortcut").click();
      const shortcut = page.locator(
        '[data-shortcut-id="snippet.' + snippetID + '"]',
      );
      await shortcut.locator("input").click();
      await page.keyboard.press("Control+Alt+e");
      await shortcut.locator(".shortcut-save").click();
      await page.waitForFunction(async (id) => {
        const s = await fetch("/api/tools/state").then((r) => r.json());
        return s.shortcuts["snippet." + id]?.[0] === "Ctrl+Alt+E";
      }, snippetID);
      await page.keyboard.press("Escape");
      await page.reload();
      await page.waitForSelector(".terminal-pane.connected");
      assert.equal(await page.locator("#modal-layer").isVisible(), false);
      await page.keyboard.press("Control+Alt+e");
      await page.locator("#snippet-preview").waitFor();
      assert.ok(
        (await page.locator("#snippet-preview").textContent()).includes(
          "SNIPPET_DEFAULT",
        ),
      );
      assert.equal(
        (
          await page.locator(".terminal-pane.active .xterm-rows").textContent()
        ).includes("SNIPPET_DEFAULT"),
        false,
      );
      await page.keyboard.press("Escape");
    },
  );
  await check(
    "Portable JSON export/import uses templates and never runs restored commands",
    async () => {
      await page.keyboard.press("Control+Alt+s");
      await page.locator("#snippets-export").click();
      const exported = await page.locator("#snippets-json").inputValue();
      assert.equal(
        JSON.parse(exported).snippets.some((s) => s.id === snippetID),
        true,
      );
      await page.locator("#snippets-portable-back").click();
      await page.locator("#snippets-import").click();
      await page
        .locator("#snippets-json")
        .fill(
          JSON.stringify([
            {
              name: "Imported",
              command: "echo IMPORT_MUST_NOT_RUN",
              category: "Custom",
            },
          ]),
        );
      await page.locator("#snippets-portable-action").click();
      await page
        .locator("[data-snippet]")
        .filter({ hasText: "Imported" })
        .waitFor();
      await page.keyboard.press("Escape");
      assert.equal(
        (
          await page.locator(".terminal-pane.active .xterm-rows").textContent()
        ).includes("IMPORT_MUST_NOT_RUN"),
        false,
      );
    },
  );
  assert.deepEqual(f.errors, []);
  await writeFile(
    "reports/snippets-e2e.json",
    JSON.stringify(
      { status: "PASS", passed: results.length, results },
      null,
      2,
    ),
  );
} catch (e) {
  await page.screenshot({ path: "reports/snippets-failure.png" });
  throw e;
} finally {
  await f.close();
}
