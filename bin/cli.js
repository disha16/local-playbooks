#!/usr/bin/env node
import { parseArgs } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { run } from "../src/pipeline.js";
import { startEngine, stopEngine, engineStatus } from "../src/engine.js";
import { createNameDetector } from "../src/names.js";
import { runMap } from "../src/processmap/index.js";
import { checkHealth, DEFAULT_SCREENPIPE_URL } from "../src/screenpipe.js";
import { createLocalEngine, DEFAULT_LOCAL_MODEL } from "../src/llm/local.js";
import { createEndpointEngine } from "../src/llm/endpoint.js";

const HELP = `local-playbooks — summaries and playbooks from your Screenpipe history, with AI on your machine.

Usage:
  local-playbooks summary  [options]   What you did, main tasks, open items
  local-playbooks playbook [options]   Step-by-step guides for workflows you repeated
  local-playbooks map      [options]   Process map: step order, common paths, time per step, rework (no AI needed)
  local-playbooks start                Start recording in the background (add --no-audio to skip audio)
  local-playbooks stop                 Stop recording
  local-playbooks status               Is it recording?
  local-playbooks doctor               Check Screenpipe and the AI engine

Time window (default: last 2 hours):
  --since <2h|30m|1d>      Look back this far
  --from <time> --to <time>  Exact window, e.g. "2026-11-14 09:00"

Options:
  --app <name>             Only include one app (e.g. "Google Chrome")
  --engine <local|endpoint>  local = built-in small model (default); endpoint = your own server
  --model <uri>            Built-in model to use (default: ${DEFAULT_LOCAL_MODEL})
  --endpoint <url>         OpenAI-compatible URL, e.g. http://gpu-server:8000/v1
  --endpoint-model <name>  Model name on that server
  --by <app|window>        Process map steps: one per app (default) or per app window
  --no-names               Skip the name/address detection model (pattern rules only)
  --redact <a,b,c>         Extra words to hide (names, clinic names...)
  --out <dir>              Where to save notes (default: ~/LocalPlaybooks)
  --screenpipe <url>       Screenpipe API (default: ${DEFAULT_SCREENPIPE_URL})
  -h, --help
`;

function parseDuration(s) {
  const m = /^(\d+(?:\.\d+)?)\s*(m|h|d)$/i.exec(s || "");
  if (!m) throw new Error(`Can't read --since "${s}". Use e.g. 30m, 2h, 1d.`);
  const n = Number(m[1]);
  return n * { m: 60e3, h: 3600e3, d: 86400e3 }[m[2].toLowerCase()];
}

function parseTime(s, flag) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`Can't read ${flag} "${s}".`);
  return d;
}

async function makeEngine(v) {
  if ((v.engine || "local") === "endpoint") {
    return createEndpointEngine({
      ...(v.endpoint ? { url: v.endpoint } : {}),
      ...(v["endpoint-model"] ? { model: v["endpoint-model"] } : {}),
    });
  }
  console.error("Loading built-in model (first run downloads it, ~2 GB)…");
  return createLocalEngine({ ...(v.model ? { model: v.model } : {}) });
}

async function main() {
  const { values: v, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      since: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      app: { type: "string" },
      engine: { type: "string" },
      model: { type: "string" },
      endpoint: { type: "string" },
      "endpoint-model": { type: "string" },
      redact: { type: "string" },
      by: { type: "string" },
      "no-audio": { type: "boolean" },
      "no-names": { type: "boolean" },
      out: { type: "string" },
      screenpipe: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  const cmd = positionals[0];
  if (v.help || !cmd) {
    console.log(HELP);
    return;
  }
  const screenpipeUrl = v.screenpipe || DEFAULT_SCREENPIPE_URL;

  if (cmd === "start") {
    console.error("Starting capture (first run downloads speech models and asks for screen/microphone permission)…");
    const r = await startEngine({ audio: !v["no-audio"] });
    console.log(r.already ? "Already recording." : `Recording. Data stays in ~/LocalPlaybooks/.capture (process ${r.pid}).`);
    return;
  }
  if (cmd === "stop") {
    const r = await stopEngine();
    console.log(r.stopped ? "Recording stopped." : "Nothing to stop (not started by local-playbooks).");
    return;
  }
  if (cmd === "status") {
    const s = await engineStatus();
    console.log(s.running ? `Recording (port ${s.port}).` : "Not recording. Run: local-playbooks start");
    console.log(s.binary ? `Capture engine: ${s.binary}` : "Capture engine: not found");
    return;
  }

  if (cmd === "doctor") {
    const h = await checkHealth(screenpipeUrl);
    console.log(h.ok ? `✓ Screenpipe is running at ${screenpipeUrl}` : `✗ Can't reach Screenpipe at ${screenpipeUrl} (${h.error || h.status}). Is it running?`);
    try {
      const engine = await makeEngine(v);
      const reply = await engine.complete("Reply with one word.", "Say OK.");
      console.log(`✓ AI engine works: ${engine.name} → "${reply.slice(0, 40)}"`);
      await engine.close();
    } catch (err) {
      console.log(`✗ AI engine: ${err.message}`);
    }
    return;
  }

  if (!["summary", "playbook", "map"].includes(cmd)) throw new Error(`Unknown command "${cmd}". Run with --help.`);

  const end = v.to ? parseTime(v.to, "--to") : new Date();
  const start = v.from ? parseTime(v.from, "--from") : new Date(end.getTime() - parseDuration(v.since || "2h"));
  if (start >= end) throw new Error("Start time must be before end time.");

  const extraTerms = v.redact ? v.redact.split(",").map((s) => s.trim()) : [];
  const engine = cmd === "map" ? { close: async () => {} } : await makeEngine(v);
  try {
    let nameDetector = null;
    if (cmd !== "map" && !v["no-names"]) {
      console.error("Loading name detection model (first run downloads it)…");
      nameDetector = await createNameDetector().catch((err) => {
        console.error(`! Name detection could not start (${err.message}).`);
        return null;
      });
      if (!nameDetector) console.error("! Name detection is OFF: names will NOT be hidden. Pattern rules still apply. Use --redact for names.");
    }
    const common = { start, end, app: v.app, screenpipeUrl, extraTerms, onStep: (msg) => console.error(`• ${msg}`) };
    const { markdown, stats } =
      cmd === "map" ? await runMap({ ...common, by: v.by || "app" }) : await run({ ...common, mode: cmd, engine, nameDetector });
    if (!markdown) {
      console.error("No Screenpipe activity found in that window. Is Screenpipe recording?");
      process.exitCode = 1;
      return;
    }
    const outDir = v.out || path.join(os.homedir(), "LocalPlaybooks");
    await fs.mkdir(outDir, { recursive: true });
    const stamp = start.toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const file = path.join(outDir, `${stamp}-${cmd}.md`);
    await fs.writeFile(file, markdown);
    console.log(markdown);
    console.error(`Saved to ${file} (${stats.events} captures)`);
  } finally {
    await engine.close();
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
