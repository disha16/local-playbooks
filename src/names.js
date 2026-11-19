// Finds names, addresses and other personal details with OpenAI Privacy Filter
// (Apache 2.0, https://github.com/openai/privacy-filter), run locally through Transformers.js.
// The regex rules in redact.js still run afterwards as a backup for record and claim numbers.

export const PRIVACY_MODEL = process.env.LOCAL_PLAYBOOKS_PRIVACY_MODEL || "openai/privacy-filter";

const TAGS = {
  private_person: "NAME",
  private_address: "ADDRESS",
  private_email: "EMAIL",
  private_phone: "PHONE",
  private_url: "URL",
  private_date: "DATE",
  account_number: "ID",
  secret: "SECRET",
};

/** Loads the model (downloads it on first use). Returns null if Transformers.js is not installed. */
export async function createNameDetector({ model = PRIVACY_MODEL, allowDownload = true,
  cacheDir = process.env.LOCAL_PLAYBOOKS_PRIVACY_CACHE, onProgress } = {}) {
  let tf;
  try {
    tf = await import("@huggingface/transformers");
  } catch {
    return null;
  }
  tf.env.allowRemoteModels = allowDownload;
  const classify = await tf.pipeline("token-classification", model, { dtype: "q4", device: "cpu",
    local_files_only: !allowDownload, ...(cacheDir ? {cache_dir: cacheDir} : {}), progress_callback: onProgress });
  const detect = (text) => classify(text, { aggregation_strategy: "simple" });
  detect.close = () => classify.dispose();
  return detect;
}

function splitByLines(text, max) {
  const parts = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if (cur && cur.length + line.length + 1 > max) {
      parts.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n${line}` : line;
  }
  if (cur) parts.push(cur);
  return parts;
}

/**
 * Replaces everything the detector finds. Each found phrase is replaced everywhere in the
 * text, so a name spotted once is also hidden where the model missed it.
 */
export async function redactNames(text, detect, { maxChars = 4000, minScore = 0.5 } = {}) {
  const found = new Map(); // phrase -> tag
  for (const part of splitByLines(text, maxChars)) {
    for (const e of await detect(part)) {
      const label = String(e.entity_group || e.entity || "").replace(/^[BIES]-/, "");
      const tag = TAGS[label];
      const phrase = String(e.word || "").trim();
      if (!tag || phrase.length < 2 || (e.score ?? 1) < minScore) continue;
      if (/^\[[A-Z]+\]$/.test(phrase)) continue;
      found.set(phrase, tag);
    }
  }
  let out = text;
  let count = 0;
  // longest first, so "Jane Doe" is replaced before "Jane"
  for (const [phrase, tag] of [...found].sort((a, b) => b[0].length - a[0].length)) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"), "gi");
    out = out.replace(re, () => {
      count++;
      return `[${tag}]`;
    });
  }
  return { text: out, count };
}
