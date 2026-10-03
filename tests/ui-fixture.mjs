import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
export async function fixture(name, setup, options = {}) {
  const tmp = await mkdtemp(path.join(tmpdir(), `forge-${name}-`)),
    project = path.join(tmp, "project with spaces");
  await mkdir(project);
  await writeFile(
    path.join(tmp, "settings.json"),
    JSON.stringify({ settings: { showHidden: false, theme: "obsidian" } }),
  );
  await setup?.(project);
  const child = spawn(
    process.env.FORGE_BIN || path.resolve("build/forge-headless"),
    ["--serve", "--config-dir", tmp],
    { cwd: project, stdio: ["ignore", "pipe", "pipe"] },
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
    setTimeout(() => reject(new Error("Startup timed out")), 15000).unref();
  });
  const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.FORGE_CHROME,
      args: ["--no-sandbox"],
    }),
    context = await browser.newContext({
      viewport: { width: 1280, height: 850 },
      ...options,
    });
  context.setDefaultTimeout(12000);
  context.setDefaultNavigationTimeout(12000);
  const page = await context.newPage(),
    errors = [];
  context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector(".terminal-pane.connected");
  return {
    project,
    page,
    context,
    browser,
    errors,
    async close() {
      await browser.close();
      child.kill("SIGTERM");
      await new Promise((resolve) =>
        child.exitCode !== null ? resolve() : child.once("exit", resolve),
      );
      await rm(tmp, { recursive: true, force: true });
    },
  };
}
export async function command(page, text) {
  await page.locator("#command-input").fill(text);
  await page.locator("#run-command").click();
}
export async function terminalContains(page, text) {
  await page.waitForFunction(
    (t) =>
      document
        .querySelector(".terminal-pane.active .xterm-rows")
        ?.textContent.includes(t),
    text,
    { timeout: 10000 },
  );
}
