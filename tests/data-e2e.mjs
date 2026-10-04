import assert from "node:assert/strict";
import path from "node:path";
import { writeFile, readFile } from "node:fs/promises";
import { fixture, command, terminalContains } from "./ui-fixture.mjs";
const f = await fixture("data", (dir) =>
    writeFile(path.join(dir, "input.json"), '{"name":"ñ","value":7}'),
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
    "JSON/YAML tools open actual file, convert and Save As without overwriting",
    async () => {
      await page.keyboard.press("Control+Alt+j");
      await page.locator("#data-file").fill(path.join(f.project, "input.json"));
      await page.locator("#data-open").click();
      await page.waitForFunction(() =>
        document.querySelector("#data-input").value.includes("value"),
      );
      await page.locator("#data-format-button").click();
      assert.equal(
        JSON.parse(await page.locator("#data-result").inputValue()).value,
        7,
      );
      await page.locator("#data-convert").click();
      assert.ok(
        (await page.locator("#data-result").inputValue()).includes("name: ñ"),
      );
      const output = path.join(f.project, "output.yaml");
      await page.locator("#data-file").fill(output);
      await page.locator("#data-save").click();
      await page.waitForFunction(() =>
        document
          .querySelector("#data-status")
          ?.textContent.includes("Guardado"),
      );
      assert.ok((await readFile(output, "utf8")).includes("name: ñ"));
      await page.locator("#data-save").click();
      await page.waitForFunction(() =>
        document
          .querySelector("#tool-error")
          ?.textContent.includes("Ya existe"),
      );
    },
  );
  await check(
    "XML formatting preserves mixed content, attributes and xml:space; conversion is explicit",
    async () => {
      await page.locator("#data-format").selectOption("xml");
      await page
        .locator("#data-input")
        .fill(
          '<root><entry id="a">hello <b>world</b> !</entry><keep xml:space="preserve">  a  </keep></root>',
        );
      await page.locator("#data-format-button").click();
      const out = await page.locator("#data-result").inputValue();
      assert.ok(out.includes("hello <b>world</b> !"));
      assert.ok(out.includes(">  a  </keep>"));
      await page.locator("#data-minify").click();
      assert.ok(
        (await page.locator("#data-result").inputValue()).includes(
          "hello <b>world</b> !",
        ),
      );
      await page
        .locator("#data-input")
        .fill('<root><item id="1">one</item><item id="2">two</item></root>');
      await page.locator("#data-convert").click();
      const converted = JSON.parse(
        await page.locator("#data-result").inputValue(),
      );
      assert.equal(converted.root.item[1]["@id"], "2");
      await page.locator("#data-format").selectOption("json");
      await page
        .locator("#data-input")
        .fill('{"item":[{"@id":1,"#text":"one"},{"@id":2,"#text":"two"}]}');
      await page.locator("#data-target").selectOption("xml");
      await page.locator("#data-convert").click();
      assert.ok(
        (await page.locator("#data-result").inputValue()).includes(
          '<item id="2">two</item>',
        ),
      );
    },
  );
  await check(
    "Invalid XML/JSON report errors and failed operations retain previous result",
    async () => {
      const before = await page.locator("#data-result").inputValue();
      await page.locator("#data-format").selectOption("xml");
      await page.locator("#data-input").fill("<root>\n<item></root>");
      await page.locator("#data-validate").click();
      await page.waitForFunction(() =>
        document
          .querySelector("#tool-error")
          ?.textContent.includes("XML inválido"),
      );
      assert.equal(await page.locator("#data-result").inputValue(), before);
      await page
        .locator("#data-input")
        .fill(
          '<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]><foo>&x;</foo>',
        );
      await page.locator("#data-validate").click();
      await page.waitForFunction(() =>
        document.querySelector("#tool-error")?.textContent.includes("DTD"),
      );
      await page.locator("#data-format").selectOption("json");
      await page.locator("#data-input").fill('{\n"a":\n}');
      await page.locator("#data-validate").click();
      await page.waitForFunction(() =>
        document
          .querySelector("#tool-error")
          ?.textContent.includes("Línea 3, columna 1"),
      );
      await page.screenshot({ path: "reports/forge-data.png" });
      await page.keyboard.press("Escape");
    },
  );
  await check(
    "Terminal selection opens Data Tools as JSON without executing it",
    async () => {
      await command(page, "printf '\\033[2J\\033[H{\"selection\":123}\\n'");
      await terminalContains(page, '{"selection":123}');
      const row = page
        .locator(".terminal-pane.active .xterm-rows>div")
        .filter({ hasText: '{"selection":123}' })
        .first();
      const box = await row.boundingBox();
      await page.mouse.move(box.x + 1, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 142, box.y + box.height / 2, { steps: 12 });
      await page.mouse.up();
      await page.mouse.click(box.x + 50, box.y + box.height / 2, {
        button: "right",
      });
      await page.getByRole("menuitem", { name: "Abrir como JSON" }).click();
      assert.ok(
        (await page.locator("#data-input").inputValue()).startsWith(
          '{"selection"',
        ),
      );
      await page.keyboard.press("Escape");
    },
  );
  assert.deepEqual(f.errors, []);
  await writeFile(
    "reports/data-e2e.json",
    JSON.stringify(
      { status: "PASS", passed: results.length, results },
      null,
      2,
    ),
  );
} catch (e) {
  await page.screenshot({ path: "reports/data-failure.png" });
  throw e;
} finally {
  await f.close();
}
