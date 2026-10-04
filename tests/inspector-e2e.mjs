import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fixture } from "./ui-fixture.mjs";
let requests = 0;
const target = http.createServer((req, res) => {
  requests++;
  res.end('{"ok":true}');
});
await new Promise((r) => target.listen(0, "127.0.0.1", r));
const port = target.address().port;
const child = spawn("sleep", ["30"]);
const f = await fixture("inspector"),
  { page } = f,
  results = [];
async function check(name, fn) {
  await fn();
  results.push({ name, status: "PASS" });
  console.log("PASS", name);
}
try {
  await check(
    "Real listening port has PID, filters and HTTP prefill without sending",
    async () => {
      await page.keyboard.press("Control+Alt+p");
      await page.waitForFunction(() =>
        document
          .querySelector("#inspect-time")
          ?.textContent.includes("Actualizado"),
      );
      await page.locator("#inspect-search").fill(String(port));
      await page
        .getByRole("button", { name: "Acciones puerto " + port, exact: true })
        .click();
      assert.ok(
        (await page.locator("#inspect-table").textContent()).includes(
          String(process.pid),
        ),
      );
      await page.locator("#port-scheme").selectOption("https");
      await page.locator("#port-api").click();
      assert.equal(
        await page.locator("#api-url").inputValue(),
        "https://127.0.0.1:" + port,
      );
      assert.equal(requests, 0);
      assert.equal(await page.locator("#api-method").inputValue(), "GET");
      await page.keyboard.press("Escape");
    },
  );
  await check(
    "Process detail, cancellation and confirmed termination affect only owned child",
    async () => {
      await page.keyboard.press("Control+Alt+p");
      await page.waitForFunction(() =>
        document
          .querySelector("#inspect-time")
          ?.textContent.includes("Actualizado"),
      );
      await page.locator("#inspect-processes").click();
      await page.locator("#inspect-search").fill(String(child.pid));
      await page
        .getByRole("button", { name: "Detalles PID " + child.pid, exact: true })
        .click();
      await page.locator("#process-terminate").click();
      await page.locator("#process-cancel").click();
      assert.equal(child.exitCode, null);
      assert.equal(child.signalCode, null);
      await page.locator("#process-terminate").click();
      const exited = new Promise((r) => child.once("exit", r));
      await page.locator("#process-confirm-kill").click();
      await exited;
      assert.equal(child.signalCode, "SIGTERM");
      await page.waitForFunction(
        () => document.querySelector("#inspect-refresh")?.disabled === false,
      );
      await page.screenshot({ path: "reports/forge-inspector.png" });
      await page.keyboard.press("Escape");
    },
  );
  await check(
    "Inspector preferences survive reload and no tool opens by default",
    async () => {
      await page.reload();
      await page.waitForSelector(".terminal-pane.connected");
      assert.equal(await page.locator("#modal-layer").isVisible(), false);
      await page.keyboard.press("Control+Alt+p");
      assert.equal(
        await page.locator("#inspect-processes").getAttribute("aria-selected"),
        "true",
      );
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#modal-layer").isVisible(), false);
    },
  );
  assert.deepEqual(f.errors, []);
  await writeFile(
    "reports/inspector-e2e.json",
    JSON.stringify(
      { status: "PASS", passed: results.length, results },
      null,
      2,
    ),
  );
} catch (e) {
  await page.screenshot({ path: "reports/inspector-failure.png" });
  throw e;
} finally {
  if (child.exitCode === null && child.signalCode === null) child.kill();
  await f.close();
  target.closeAllConnections();
  await new Promise((r) => target.close(r));
}
