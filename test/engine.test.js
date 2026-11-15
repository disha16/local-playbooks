import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { startEngine, stopEngine, engineStatus } from "../src/engine.js";

const fake = path.join(path.dirname(fileURLToPath(import.meta.url)), "fake-engine.js");
const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

test("engine: start, status, stop; telemetry always off", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lp-engine-"));
  const port = await freePort();
  const opts = { port, dataDir, command: [process.execPath, fake], timeoutMs: 15000 };
  try {
    const r = await startEngine(opts);
    assert.equal(r.started, true);
    const args = JSON.parse(fs.readFileSync(path.join(dataDir, "args.json"), "utf8"));
    assert.deepEqual(args.slice(0, 5), ["record", "--port", String(port), "--data-dir", dataDir]);
    assert.ok(args.includes("--disable-telemetry"));
    assert.ok(!args.some((x) => x.includes("pii")));
    assert.equal((await engineStatus({ port, dataDir })).running, true);
    assert.equal((await startEngine(opts)).already, true);
  } finally {
    assert.equal((await stopEngine({ dataDir })).stopped, true);
  }
  assert.equal((await engineStatus({ port, dataDir })).running, false);
});

test("engine: clear error when the binary is missing", async () => {
  await assert.rejects(startEngine({ port: await freePort(), binary: null, dataDir: os.tmpdir() }), /not found/);
});
