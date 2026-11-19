// Level 1: a small model that runs inside this app via llama.cpp (node-llama-cpp).
// No Ollama or separate server. The model downloads once on first use.

import os from "node:os";
import path from "node:path";

export const DEFAULT_LOCAL_MODEL =
  process.env.LOCAL_PLAYBOOKS_MODEL || "hf:bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M";

export const MODELS_DIR =
  process.env.LOCAL_PLAYBOOKS_MODELS_DIR || path.join(os.homedir(), ".local-playbooks", "models");

export async function createLocalEngine({ model = DEFAULT_LOCAL_MODEL, contextSize = 8192, allowDownload = true, onProgress } = {}) {
  let lib;
  try {
    lib = await import("node-llama-cpp");
  } catch {
    throw new Error(
      "The built-in model needs node-llama-cpp. Run `npm install node-llama-cpp`, or use --engine endpoint."
    );
  }
  const { getLlama, LlamaChatSession, resolveModelFile } = lib;

  const modelPath = await resolveModelFile(model, { directory: MODELS_DIR, download: allowDownload ? "auto" : false, onProgress });
  const llama = await getLlama({ build: "never" });
  const loaded = await llama.loadModel({ modelPath });
  const context = await loaded.createContext({ contextSize });

  return {
    name: `built-in (${path.basename(modelPath)})`,
    // Roughly 3 chars per token; leave room for the prompt and answer.
    maxInputChars: Math.floor(contextSize * 3 * 0.6),
    async complete(system, user) {
      const sequence = context.getSequence();
      try {
        const session = new LlamaChatSession({ contextSequence: sequence, systemPrompt: system });
        const answer = await session.prompt(user, { maxTokens: 1200, temperature: 0.2 });
        return stripThinking(answer);
      } finally {
        sequence.dispose();
      }
    },
    async close() {
      await context.dispose();
      await loaded.dispose();
    },
  };
}

export function stripThinking(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}
