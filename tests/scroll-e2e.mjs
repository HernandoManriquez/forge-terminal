import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { fixture, command, terminalContains } from "./ui-fixture.mjs";
const f = await fixture("scroll", null, { deviceScaleFactor: 1.25 }),
  { page } = f,
  results = [];
async function check(name, fn) {
  await fn();
  results.push({ name, status: "PASS" });
  console.log("PASS", name);
}
async function geometry() {
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".terminal-pane")].every((p) => {
      const last = p.querySelector(".xterm-rows")?.lastElementChild,
        host = p.querySelector(".terminal-surface");
      return (
        last &&
        last.getBoundingClientRect().bottom <=
          host.getBoundingClientRect().bottom + 0.5
      );
    }),
  );
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll(".terminal-pane")].map((p) => {
      const h = p.querySelector(".terminal-surface").getBoundingClientRect(),
        r = p
          .querySelector(".xterm-rows")
          .lastElementChild.getBoundingClientRect(),
        b = p.getBoundingClientRect();
      return {
        last: r.bottom,
        host: h.bottom,
        bottom: b.bottom,
        height: r.height,
      };
    }),
  );
  for (const r of rows) {
    assert.ok(r.height > 0);
    assert.ok(r.last <= r.host + 0.5);
    assert.ok(r.bottom - r.last >= 9, JSON.stringify(r));
  }
}
async function atBottom() {
  await page.waitForFunction(() => {
    const v = document.querySelector(".terminal-pane.active .xterm-viewport");
    return v.scrollHeight - v.clientHeight - v.scrollTop <= 1;
  });
}
try {
  await check(
    "Burst output and long prompt show complete final row",
    async () => {
      await command(
        page,
        "PS1='PS D:\\Documentos\\forge-terminal> '; for i in $(seq 1 160); do printf 'BURST_%03d\\n' \"$i\"; done",
      );
      await terminalContains(page, "BURST_160");
      await atBottom();
      await geometry();
    },
  );
  await check(
    "Complete rows across fonts, window sizes and fractional screen scale",
    async () => {
      for (const [height, font] of [
        [650, "14"],
        [733, "18"],
        [900, "22"],
        [768, "12"],
      ]) {
        await page.setViewportSize({ width: 1400, height });
        await page.locator("#settings-button").click();
        await page.locator("#pref-font").selectOption(font);
        await page.locator("#done-settings").click();
        await geometry();
        await atBottom();
      }
      await page.setViewportSize({ width: 1440, height: 850 });
    },
  );
  await check(
    "Two and three panes fit full rows in both orientations",
    async () => {
      for (const n of [2, 3]) {
        await page.locator("#view-" + n).click();
        await page.waitForFunction(
          (n) =>
            document.querySelectorAll(".terminal-pane.connected").length === n,
          n,
        );
        await geometry();
      }
      await page.locator("#split-col").click();
      await geometry();
      await page.locator("#view-1").click();
      await geometry();
    },
  );
  await check(
    "Output follows bottom; history pauses and survives resize; following resumes",
    async () => {
      await command(
        page,
        "PS1='forge> '; for i in $(seq 1 100); do printf 'STREAM_%03d\\n' \"$i\"; sleep 0.035; done; printf 'STREAM_%s\\n' FINISHED",
      );
      await terminalContains(page, "STREAM_020");
      await atBottom();
      await geometry();
      const v = page.locator(".terminal-pane.active .xterm-viewport");
      await page.locator(".terminal-pane.active .xterm-screen").hover();
      await page.mouse.wheel(0, -500);
      await page.waitForFunction(() => {
        const v = document.querySelector(
          ".terminal-pane.active .xterm-viewport",
        );
        return v.scrollHeight - v.clientHeight - v.scrollTop > 100;
      });
      // xterm aligns wheel pixels to complete rows on the next render frame.
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const top = await v.evaluate((e) => e.scrollTop);
      const firstRow = page.locator(
        ".terminal-pane.active .xterm-rows > :first-child",
      );
      const before = await firstRow.textContent();
      await page.setViewportSize({ width: 1440, height: 887 });
      await geometry();
      await page.waitForTimeout(400);
      const afterTop = await v.evaluate((e) => e.scrollTop);
      assert.ok(
        Math.abs(afterTop - top) < 2,
        "history position moved: " + JSON.stringify({ top, afterTop }),
      );
      assert.equal(
        await firstRow.textContent(),
        before,
        "visible history line changed",
      );
      await page.mouse.wheel(0, 100000);
      await atBottom();
      await terminalContains(page, "STREAM_FINISHED");
      await atBottom();
      await geometry();
      await page.screenshot({ path: "reports/forge-terminal-scroll.png" });
    },
  );
  assert.deepEqual(f.errors, []);
  await writeFile(
    "reports/scroll-e2e.json",
    JSON.stringify(
      { status: "PASS", passed: results.length, results },
      null,
      2,
    ),
  );
} catch (e) {
  await writeFile(
    "reports/scroll-e2e.json",
    JSON.stringify(
      { status: "FAIL", results, error: String(e.stack) },
      null,
      2,
    ),
  );
  await page.screenshot({ path: "reports/scroll-failure.png" });
  throw e;
} finally {
  await f.close();
}
