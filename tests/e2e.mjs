import { chromium } from "playwright";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const tmp = await mkdtemp(path.join(tmpdir(), "forge-e2e-"));
const project = path.join(tmp, "demo-project");
await mkdir(path.join(project, "src"), { recursive: true });
await mkdir(path.join(project, "docs"));
await mkdir(path.join(project, "my project"));
await writeFile(
  path.join(project, "README.md"),
  "# Forge demo\nA local fixture for terminal tests.\n",
);
await writeFile(
  path.join(project, "src", "index.js"),
  'console.log("Forge ready");\n',
);
execFileSync("git", ["init", "-q", "-b", "main", project]);
await writeFile(
  path.join(tmp, "settings.json"),
  JSON.stringify({
    settings: { theme: "obsidian" },
    workspaces: [
      { id: "demo", name: "Development", tree: { type: "leaf", id: "one" } },
    ],
    panes: [{ id: "one", profile: "bash", cwd: project, label: "workspace" }],
  }),
);
const child = spawn(
  process.env.FORGE_BIN || path.resolve("build/forge-headless"),
  ["--serve", "--config-dir", tmp],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let stderr = "";
child.stderr.on("data", (d) => (stderr += d));
const url = await new Promise((resolve, reject) => {
  let out = "";
  child.stdout.on("data", (d) => {
    out += d;
    const m = out.match(/FORGE_URL=(.+)/);
    if (m) resolve(m[1]);
  });
  child.on("exit", (code) =>
    reject(new Error(`Forge exited ${code}: ${stderr}`)),
  );
  setTimeout(() => reject(new Error("startup timeout")), 15000).unref();
});
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const results = [];
async function check(name, fn) {
  await fn();
  results.push({ name, status: "PASS" });
  console.log("PASS", name);
}
async function command(text) {
  await page.locator("#command-input").fill(text);
  await page.locator("#run-command").click();
}
async function waitForTerminal(text) {
  await page.waitForFunction(
    (t) =>
      document
        .querySelector(".terminal-pane.active .xterm-rows")
        ?.textContent.includes(t),
    text,
    { timeout: 10000 },
  );
}
try {
  await page.goto(url);
  await page.waitForSelector(".terminal-pane.connected");
  await check("Real shell, Unicode and executable output", async () => {
    await command(
      `printf '\\033[2J\\033[H'; printf 'FORGE · terminal real\\n'; printf 'UNICODE_%s\\n' 'ñ✓世界'; node src/index.js`,
    );
    await waitForTerminal("UNICODE_ñ✓世界");
    await waitForTerminal("Forge ready");
  });
  await check("Autocomplete command arguments and quoted paths", async () => {
    await page.locator("#command-input").fill("git br");
    await page.waitForSelector(".suggestion");
    assert.match(await page.locator("#suggestions").innerText(), /git branch/);
    await page.locator("#command-input").press("Tab");
    assert.equal(
      await page.locator("#command-input").inputValue(),
      "git branch",
    );
    await page.locator("#command-input").fill("cd my");
    await page.waitForFunction(() =>
      document
        .querySelector("#suggestions")
        ?.textContent.includes("my project"),
    );
    await page.locator("#command-input").press("Tab");
    assert.equal(
      await page.locator("#command-input").inputValue(),
      "cd 'my project/'",
    );
    await page.locator("#command-input").fill("");
  });
  await check("Nested split layouts and independent PTYs", async () => {
    await page.locator("#split-row").click();
    await page.waitForFunction(
      () => document.querySelectorAll(".terminal-pane.connected").length === 2,
    );
    await command("printf 'SECOND_%s\\n' SESSION");
    await waitForTerminal("SECOND_SESSION");
    await page.locator("#split-col").click();
    await page.waitForFunction(
      () => document.querySelectorAll(".terminal-pane.connected").length === 3,
    );
    await command("printf 'THIRD_%s\\n' SESSION");
    await waitForTerminal("THIRD_SESSION");
    assert.equal(await page.locator(".split-col").count(), 1);
  });
  await check("Drag resizing reaches PTY dimensions", async () => {
    const separator = page.locator(".split-row > .split-resizer").first();
    const before = await page.locator("#status-size").innerText();
    const box = await separator.boundingBox();
    await page.mouse.move(box.x + 3, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x - 85, box.y + 30, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const after = await page.locator("#status-size").innerText();
    assert.notEqual(before, after);
    const [cols, rows] = after.split(" × ").map(Number);
    await command("stty size");
    await waitForTerminal(`${rows} ${cols}`);
  });
  await check("Find text in terminal output", async () => {
    await page.locator("#search-button").click();
    await page.locator("#search-input").fill("THIRD_SESSION");
    await page.waitForFunction(
      () =>
        document.querySelector("#search-result").textContent === "Coincidencia",
    );
    await page.locator("#search-close").click();
  });
  await check("Favorites require explicit execution", async () => {
    await page.locator(".snippet-main").first().click();
    assert.equal(
      await page.locator("#command-input").inputValue(),
      "git status --short",
    );
    await page.locator("#command-input").fill("");
  });
  await check("Palette navigation, focus mode and preferences", async () => {
    await page.keyboard.press("Control+k");
    await page.locator("#palette-input").fill("Modo enfoque");
    await page.locator("#palette-input").press("Enter");
    await page.waitForFunction(() =>
      document.querySelector("#app").classList.contains("focus-mode"),
    );
    await page.keyboard.press("Control+Shift+F");
    await page.locator("#settings-button").click();
    await page.locator('[data-theme-choice="paper"]').click();
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      "paper",
    );
    await page.screenshot({ path: "reports/forge-paper.png" });
    await page.locator('[data-theme-choice="obsidian"]').click();
    await page.locator("#pref-font").selectOption("13");
    await page.locator("#done-settings").click();
  });
  await check("Multiline paste requires review", async () => {
    await page
      .locator(".terminal-pane.active textarea.xterm-helper-textarea")
      .focus();
    await page.evaluate(() => {
      const target = document.querySelector(
        ".terminal-pane.active textarea.xterm-helper-textarea",
      );
      const transfer = new DataTransfer();
      transfer.setData("text/plain", "echo first\necho second");
      target.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: transfer,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await page.waitForSelector(".paste-preview");
    assert.match(
      await page.locator("#modal-title").innerText(),
      /Pegar varias/,
    );
    await page.locator(".cancel").click();
  });
  await check("Export contains real output and stays local", async () => {
    await page.locator(".terminal-pane.active .export-pane").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#modal-title")?.textContent ===
        "Salida exportada",
    );
    const file = await page.locator("#modal input").inputValue();
    const text = await readFile(file, "utf8");
    assert.match(text, /THIRD_SESSION/);
    await page.locator(".export-done").click();
  });
  await check("Layout and preferences survive reload", async () => {
    await page.locator("#save-workspace").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#toast")
        ?.textContent.includes("Espacio guardado"),
    );
    await page.reload();
    await page.waitForFunction(
      () => document.querySelectorAll(".terminal-pane.connected").length === 3,
    );
    assert.equal(await page.locator(".split-col").count(), 1);
    assert.equal(await page.locator("#main-title").innerText(), "Development");
    const config = JSON.parse(
      await readFile(path.join(tmp, "settings.json"), "utf8"),
    );
    assert.equal(config.settings.fontSize, 13);
    assert.equal(config.panes.length, 3);
  });
  await check("Process exit and restart", async () => {
    await command("exit");
    await page.waitForFunction(() =>
      document
        .querySelector(".terminal-pane.active .pane-message")
        ?.textContent.includes("finalizado"),
    );
    await page.locator(".terminal-pane.active .restart-pane").click();
    await page.locator(".confirm").click();
    await page.waitForSelector(".terminal-pane.active.connected");
  });
  await check("Closing one pane removes its session", async () => {
    await page.locator(".terminal-pane.active .close-pane").click();
    await page.locator(".confirm").click();
    await page.waitForFunction(
      () => document.querySelectorAll(".terminal-pane.connected").length === 2,
    );
    await page.waitForFunction(async () => {
      const m = await fetch("/api/metrics").then((r) => r.json());
      return m.sessions === 2;
    });
  });
  await check("No frontend exceptions or horizontal overflow", async () => {
    assert.deepEqual(errors, []);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  });
  // Actual commands populate the final screenshot; no simulated terminal output.
  await page.locator(".pane-tab").first().click();
  await command(
    `clear; printf '\\033[38;2;251;152;100mFORGE TERMINAL\\033[0m\\n'; printf 'Tu espacio de comando.\\n\\n'; git status --short; printf '\\n'; node src/index.js; printf '\\n'; ls -F`,
  );
  await waitForTerminal("Forge ready");
  await page.locator(".pane-tab").last().click();
  await command(
    `clear; printf '\\033[38;2;145;189;165mSISTEMA LOCAL\\033[0m\\n\\n'; uname -srm; printf '\\n'; printf 'Shell: %s\\n' "$BASH_VERSION"; printf '\\n'; printf 'PTY: '; tty; printf '\\n'; printf 'UTF-8  ñ  ✓  世界\\n'`,
  );
  await waitForTerminal("SISTEMA LOCAL");
  await page.locator("#command-input").fill("git ");
  await page.waitForSelector(".suggestion");
  await page.screenshot({ path: "reports/forge-terminal.png" });
  await writeFile(
    "reports/e2e.json",
    JSON.stringify({ passed: results.length, results, errors }, null, 2),
  );
  console.log("All end-to-end checks passed:", results.length);
} catch (error) {
  await page.screenshot({ path: "reports/e2e-failure.png" });
  await writeFile(
    "reports/e2e-error.txt",
    error.stack + "\n" + stderr + "\n" + errors.join("\n"),
  );
  throw error;
} finally {
  await browser.close();
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 400));
  await rm(tmp, { recursive: true, force: true });
}
