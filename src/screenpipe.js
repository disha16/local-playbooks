// Reads activity from a locally running Screenpipe (https://github.com/screenpipe/screenpipe).
// Screenpipe does the capture, OCR and transcription; we only read its local API.

export const DEFAULT_SCREENPIPE_URL = process.env.SCREENPIPE_URL || "http://localhost:3030";

export async function checkHealth(baseUrl = DEFAULT_SCREENPIPE_URL) {
  try {
    const res = await fetch(`${baseUrl}/health`);
    return { ok: res.ok, status: res.status, body: await res.text() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Pull OCR, audio and UI (accessibility) items between start and end.
 * Returns normalized events sorted by time.
 */
export async function fetchActivity({
  start,
  end,
  app,
  baseUrl = DEFAULT_SCREENPIPE_URL,
  pageSize = 500,
  maxItems = 20000,
}) {
  const events = [];
  for (const contentType of ["ocr", "audio", "accessibility"]) {
    let offset = 0;
    while (events.length < maxItems) {
      const params = new URLSearchParams({
        content_type: contentType,
        limit: String(pageSize),
        offset: String(offset),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      });
      if (app && contentType !== "audio") params.set("app_name", app);
      let res;
      try {
        res = await fetch(`${baseUrl}/search?${params}`);
      } catch {
        throw new Error(`Can't reach Screenpipe at ${baseUrl}. Is it running?`);
      }
      if (!res.ok) {
        throw new Error(`Screenpipe /search returned ${res.status}: ${await res.text()}`);
      }
      const json = await res.json();
      const data = json.data || [];
      for (const item of data) {
        const ev = normalize(item);
        if (ev) events.push(ev);
      }
      offset += data.length;
      const total = json.pagination?.total ?? 0;
      if (data.length === 0 || offset >= total) break;
    }
  }
  events.sort((a, b) => a.ts - b.ts);
  return events;
}

export function normalize(item) {
  const c = item?.content;
  if (!c) return null;
  switch (item.type) {
    case "OCR":
    case "UI":
      if (!c.text?.trim()) return null;
      return {
        ts: new Date(c.timestamp),
        kind: item.type === "OCR" ? "screen" : "ui",
        app: c.app_name || "unknown",
        window: c.window_name || "",
        url: c.browser_url || "",
        text: c.text,
      };
    case "Audio":
      if (!c.transcription?.trim()) return null;
      return {
        ts: new Date(c.timestamp),
        kind: "audio",
        app: c.device_type === "Output" ? "audio (speaker)" : "audio (mic)",
        window: c.speaker?.name || "",
        url: "",
        text: c.transcription,
      };
    default:
      return null;
  }
}
