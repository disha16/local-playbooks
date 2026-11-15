// Starts and stops the bundled capture engine (playbooks-capture) as a background process.
// The engine records the screen and audio and serves a local API that src/screenpipe.js reads.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkHealth } from "./screenpipe.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXE = process.platform === "win32" ? "playbooks-capture.exe" : "playbooks-capture";

export const DEFAULT_DATA_DIR = path.join(os.homedir(), "LocalPlaybooks", ".capture");
export const DEFAULT_PORT = 3030;

/** Where the engine binary lives: LOCAL_PLAYBOOKS_ENGINE, or engine-bin/<platform>-<arch>/ next to the app. */
export function findEngine() {
  const candidates = [
    process.env.LOCAL_PLAYBOOKS_ENGINE,
    path.join(ROOT, "engine-bin", `${process.platform}-${process.arch}`, EXE),
    process.resourcesPath && path.join(process.resourcesPath, "engine-bin", EXE),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

const pidFile = (dataDir) => path.join(dataDir, "engine.pid");

function readPid(dataDir) {
  try {
    const pid = Number(fs.readFileSync(pidFile(dataDir), "utf8").trim());
    process.kill(pid, 0); // throws if that process is gone
    return pid;
  } catch {
    return null;
  }
}

export async function engineStatus({ port = DEFAULT_PORT, dataDir = DEFAULT_DATA_DIR } = {}) {
  const health = await checkHealth(`http://localhost:${port}`);
  return { running: health.ok, pid: readPid(dataDir), port, dataDir, binary: findEngine() };
}

/**
 * Start recording in the background. Returns once the local API answers.
 * Telemetry is always off. The upstream PII model options are never turned on.
 */
export async function startEngine({
  port = DEFAULT_PORT,
  dataDir = DEFAULT_DATA_DIR,
  audio = true,
  binary = findEngine(),
  command, // test hook: [program, ...args] used instead of the binary
  timeoutMs = 120_000,
} = {}) {
  const url = `http://localhost:${port}`;
  if ((await checkHealth(url)).ok) return { started: false, already: true, pid: readPid(dataDir), url };
  if (!binary && !command) {
    throw new Error("Capture engine not found. Reinstall the app, or set LOCAL_PLAYBOOKS_ENGINE to the playbooks-capture program.");
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const args = ["record", "--port", String(port), "--data-dir", dataDir, "--disable-telemetry"];
  if (!audio) args.push("--disable-audio");
  const [program, ...pre] = command || [binary];
  const log = fs.openSync(path.join(dataDir, "engine.log"), "a");
  const child = spawn(program, [...pre, ...args], { detached: true, stdio: ["ignore", log, log], windowsHide: true });
  let exited = null;
  child.on("exit", (code) => (exited = code ?? 1));
  child.on("error", (err) => (exited = err.message));
  child.unref();
  fs.writeFileSync(pidFile(dataDir), String(child.pid));

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exited !== null) throw new Error(`Capture engine stopped right away (${exited}). See ${path.join(dataDir, "engine.log")}`);
    if ((await checkHealth(url)).ok) return { started: true, pid: child.pid, url };
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Capture engine did not answer within ${Math.round(timeoutMs / 1000)}s. See ${path.join(dataDir, "engine.log")}`);
}

export async function stopEngine({ dataDir = DEFAULT_DATA_DIR } = {}) {
  const pid = readPid(dataDir);
  if (!pid) return { stopped: false };
  process.kill(pid);
  for (let i = 0; i < 40 && readPid(dataDir); i++) await new Promise((r) => setTimeout(r, 250));
  fs.rmSync(pidFile(dataDir), { force: true });
  return { stopped: true, pid };
}
