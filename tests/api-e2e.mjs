import assert from "node:assert/strict";
import http from "node:http";
import { writeFile } from "node:fs/promises";
import { fixture, terminalContains } from "./ui-fixture.mjs";
const received = [],
  target = http.createServer(async (req, res) => {
    let body = "";
    for await (const b of req) body += b;
    received.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body,
    });
    if (req.url.startsWith("/slow")) {
      await new Promise((r) => setTimeout(r, 2000));
    }
    res.writeHead(201, {
      "Content-Type": "application/json",
      "X-Test": "Forge",
    });
    res.end(JSON.stringify({ ok: true, body }));
  });
await new Promise((r) => target.listen(0, "127.0.0.1", r));
const f = await fixture("api"),
  { page } = f,
  results = [];
const endpoint = "http://127.0.0.1:" + target.address().port;
async function check(name, fn) {
  await fn();
  results.push({ name, status: "PASS" });
  console.log("PASS", name);
}
try {
  await check(
    "API Tester sends real method, query, JSON and bearer auth",
    async () => {
      await page.keyboard.press("Control+Alt+c");
      await page.locator("#api-url").fill(endpoint + "/echo");
      await page.locator("#api-method").selectOption("POST");
      await page.locator('.add-pair[data-kind="params"]').click();
      await page.getByLabel("Clave params", { exact: true }).fill("search");
      await page.getByLabel("Valor params", { exact: true }).fill("hello ñ&x");
      await page.locator("#api-auth").selectOption("bearer");
      await page.locator("#api-token").fill("DUMMY_SECRET");
      await page.locator("#api-body-type").selectOption("json");
      await page.locator("#api-body").fill('{"name":"Andrés"}');
      await page.locator("#api-send").click();
      await page.waitForFunction(() =>
        document.querySelector("#api-status")?.textContent.includes("201"),
      );
      assert.equal(received[0].method, "POST");
      assert.equal(
        new URL(received[0].url, endpoint).searchParams.get("search"),
        "hello ñ&x",
      );
      assert.equal(received[0].headers.authorization, "Bearer DUMMY_SECRET");
      assert.equal(JSON.parse(received[0].body).name, "Andrés");
      assert.ok(
        (await page.locator("#api-curl").textContent()).includes("curl"),
      );
      await page.locator('[data-tab="headers"]').click();
      assert.ok(
        (await page.locator("#api-response-content").textContent()).includes(
          "X-Test",
        ),
      );
      await page.locator('[data-tab="raw"]').click();
      assert.ok(
        (await page.locator("#api-response-content").textContent()).includes(
          "HTTP/1.1 201",
        ),
      );
      await page.locator('[data-tab="body"]').click();
      assert.ok(await page.locator(".json-key").count());
      await page.locator("#api-response").scrollIntoViewIfNeeded();
      await page.screenshot({ path: "reports/forge-api.png" });
    },
  );
  await check(
    "Saved requests and bounded history never persist live secrets or response bodies",
    async () => {
      await page.locator("#api-name").fill("Echo request");
      await page.locator("#api-save").click();
      await page.waitForFunction(
        () => document.querySelectorAll("#api-saved option").length === 2,
      );
      const state = await page.evaluate(() =>
        fetch("/api/tools/state").then((r) => r.json()),
      );
      assert.equal(JSON.stringify(state).includes("DUMMY_SECRET"), false);
      assert.equal(state.requests[0].body, "");
      assert.equal(state.requests[0].params[0].value, "");
      assert.equal(state.requestHistory.length, 1);
      assert.equal(state.requestHistory[0].body, "");
      await page.locator("#api-duplicate").click();
      await page.waitForFunction(
        () => document.querySelectorAll("#api-saved option").length === 3,
      );
    },
  );
  await check(
    "Equivalent cURL runs in the existing real terminal",
    async () => {
      await page.locator("#api-run").click();
      await terminalContains(page, '"ok":true');
      assert.equal(received.length, 2);
      assert.equal(received[1].body, received[0].body);
      assert.equal(
        received[1].headers.authorization,
        received[0].headers.authorization,
      );
    },
  );
  await check(
    "Repeat is session-scoped; cancellation leaves the terminal usable",
    async () => {
      await page.keyboard.press("Control+Shift+p");
      await page.locator("#palette-input").fill("Repetir última");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() =>
        document.querySelector("#api-status")?.textContent.includes("201"),
      );
      assert.equal(received.length, 3);
      await page.locator("#api-url").fill(endpoint + "/slow");
      await page.locator("#api-send").click();
      await page.locator("#api-cancel").click();
      await page.waitForFunction(() =>
        document
          .querySelector("#tool-error")
          ?.textContent.includes("cancelada"),
      );
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#modal-layer").isVisible(), false);
      await page.reload();
      await page.waitForSelector(".terminal-pane.connected");
      await page.keyboard.press("Control+Shift+p");
      await page.locator("#palette-input").fill("Repetir última");
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
  assert.deepEqual(f.errors, []);
  await writeFile(
    "reports/api-e2e.json",
    JSON.stringify(
      { status: "PASS", passed: results.length, results },
      null,
      2,
    ),
  );
} catch (e) {
  await page.screenshot({ path: "reports/api-failure.png" });
  throw e;
} finally {
  await f.close();
  target.closeAllConnections();
  await new Promise((r) => target.close(r));
}
