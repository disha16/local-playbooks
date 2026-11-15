// Level 2: any OpenAI-compatible server you control — vLLM on a hospital GPU box,
// Azure OpenAI / AWS Bedrock gateways in your own account, LM Studio, Ollama, etc.

import { stripThinking } from "./local.js";

export function createEndpointEngine({
  url = process.env.LOCAL_PLAYBOOKS_ENDPOINT,
  apiKey = process.env.LOCAL_PLAYBOOKS_API_KEY,
  model = process.env.LOCAL_PLAYBOOKS_ENDPOINT_MODEL,
  maxInputChars = Number(process.env.LOCAL_PLAYBOOKS_MAX_INPUT_CHARS) || 60000,
} = {}) {
  if (!url) {
    throw new Error(
      "No endpoint set. Pass --endpoint <url> or set LOCAL_PLAYBOOKS_ENDPOINT (e.g. http://gpu-server:8000/v1)."
    );
  }
  const base = url.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
  return {
    name: `endpoint (${base}${model ? `, ${model}` : ""})`,
    maxInputChars,
    async complete(system, user) {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: model || "default",
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Endpoint returned ${res.status}: ${await res.text()}`);
      const json = await res.json();
      return stripThinking(json.choices?.[0]?.message?.content ?? "");
    },
    async close() {},
  };
}
