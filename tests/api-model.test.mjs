import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  buildRequest,
  curlCommand,
  safeTemplate,
} from "../src/ui/app/api-tester/model.js";
const draft = {
  id: "x",
  name: "Test",
  url: "http://localhost:8123/path?existing=1",
  method: "POST",
  params: [
    { key: "query", value: "a b&c", enabled: true },
    { key: "ignored", value: "no", enabled: false },
  ],
  headers: [],
  bodyType: "json",
  body: '{"name":"{{NAME}}"}',
  form: [],
  auth: { type: "bearer", token: "{{TOKEN}}" },
};
test("HTTP model resolves variables and encodes params/auth/JSON", () => {
  const r = buildRequest(draft, { NAME: "ñ", TOKEN: "secret" });
  assert.equal(new URL(r.url).searchParams.get("query"), "a b&c");
  assert.equal(new URL(r.url).searchParams.has("ignored"), false);
  assert.ok(
    r.headers.some(
      (h) => h.key === "Authorization" && h.value === "Bearer secret",
    ),
  );
  assert.equal(JSON.parse(r.body).name, "ñ");
  assert.throws(() => buildRequest(draft, {}), /Falta/);
});
test("cURL arguments survive actual Bash parsing without evaluating input", () => {
  const r = buildRequest(
    { ...draft, body: '{"name":"$(echo BAD); \'quoted\'"}' },
    { TOKEN: "secret" },
  );
  const cmd = curlCommand(r);
  const script = "curl(){ printf '%s\\0' \"$@\"; }; " + cmd;
  const out = spawnSync("bash", ["-c", script], { encoding: "utf8" });
  assert.equal(out.status, 0);
  const args = out.stdout.split("\0");
  assert.equal(args[args.indexOf("--data-raw") + 1], r.body);
  assert.equal(args[args.indexOf("--url") + 1], r.url);
  assert.ok(args.includes("Authorization: Bearer secret"));
});
test("PowerShell streams curl config and CMD uses a literal encoded PowerShell script", () => {
  const r = buildRequest(draft, { NAME: "ñ", TOKEN: "secret" });
  const ps = curlCommand(r, "powershell");
  assert.ok(ps.includes("UTF8Encoding"));
  assert.ok(ps.includes("curl.exe -q --config -"));
  const cmd = curlCommand(r, "cmd");
  const decoded = Buffer.from(cmd.split(" ").at(-1), "base64").toString(
    "utf16le",
  );
  assert.equal(decoded, ps);
});
test("Persisted templates remove actual credential/query/body values", () => {
  const s = safeTemplate({
    ...draft,
    url: "https://user:secret@example.org/api?token=secret",
    auth: { type: "basic", username: "secret", password: "secret" },
    body: "secret",
    params: [{ key: "x", value: "secret", enabled: true }],
  });
  assert.equal(JSON.stringify(s).includes("secret"), false);
  assert.equal(s.auth.type, "basic");
  assert.equal(s.params[0].value, "");
});

test("Saved URL placeholders resolve as one URL component; HEAD handles no body", () => {
  const saved = safeTemplate({
    ...draft,
    url: "https://localhost/test?key={{KEY}}",
    bodyType: "none",
    auth: { type: "none" },
  });
  const r = buildRequest(
    { ...saved, method: "HEAD", params: [] },
    { KEY: "a&extra=1" },
  );
  assert.equal(new URL(r.url).searchParams.get("key"), "a&extra=1");
  assert.equal(new URL(r.url).searchParams.has("extra"), false);
  assert.ok(curlCommand(r).includes("--head"));
  assert.ok(curlCommand(r, "powershell").includes("head\n"));
});
