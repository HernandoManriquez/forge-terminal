import { test } from "node:test";
import assert from "node:assert/strict";
import {
  visibleRows,
  portURL,
  likelyHTTP,
  nativeCommand,
  PAGE_SIZE,
} from "../src/ui/app/port-process-inspector/model.js";
test("Inspector filters real-shape snapshots and sorts missing metrics last", () => {
  const processes = Array.from({ length: 5000 }, (_, i) => ({
    pid: i + 1,
    name: "worker-" + i,
    cpu: i === 5 ? null : i,
    memory: i * 1024,
  }));
  const sorted = visibleRows(
    { processes },
    { view: "processes", sort: "cpu", desc: true },
  );
  assert.equal(sorted.length, 5000);
  assert.equal(sorted[0].pid, 5000);
  assert.equal(sorted.at(-1).cpu, null);
  assert.equal(sorted.slice(0, PAGE_SIZE).length, 75);
  const ports = [
    { port: 8080, protocol: "TCP", state: "LISTEN", process: "node", pid: 9 },
    { port: 22, protocol: "TCP", state: "ESTABLISHED", pid: 2 },
    { port: 53, protocol: "UDP", state: "BOUND", pid: 3 },
  ];
  assert.equal(
    visibleRows(
      { ports },
      { view: "ports", listening: true, protocol: "TCP", search: "node" },
    ).length,
    1,
  );
  assert.equal(visibleRows({ ports }, { view: "ports", pid: 3 })[0].port, 53);
});
test("HTTP port actions preserve explicit HTTPS, IPv6 and wildcard loopback", () => {
  assert.equal(
    portURL({ address: "0.0.0.0", port: 8080 }),
    "http://127.0.0.1:8080",
  );
  assert.equal(portURL({ address: "::1", port: 8443 }), "https://[::1]:8443");
  assert.equal(
    portURL({ address: "127.0.0.1", port: 9000 }, "https"),
    "https://127.0.0.1:9000",
  );
  assert.equal(likelyHTTP({ port: 5432, protocol: "TCP" }), false);
  assert.equal(
    nativeCommand("windows", "processes", 34),
    "Stop-Process -Id 34",
  );
});
