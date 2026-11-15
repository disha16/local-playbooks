// Screen captures repeat the same text every few seconds. This turns raw events into a
// compact timeline: one block per stretch of time in the same app/window, with only new lines.

const MIN_LINE = 3;

export function condense(events, { maxLinesPerBlock = 60 } = {}) {
  const blocks = [];
  let current = null;
  let seenInBlock = new Set();

  for (const ev of events) {
    const key = `${ev.kind}|${ev.app}|${ev.window}`;
    if (!current || current.key !== key) {
      current = {
        key,
        kind: ev.kind,
        app: ev.app,
        window: ev.window,
        url: ev.url,
        start: ev.ts,
        end: ev.ts,
        lines: [],
      };
      seenInBlock = new Set();
      blocks.push(current);
    }
    current.end = ev.ts;
    for (const raw of ev.text.split(/\r?\n/)) {
      const line = raw.replace(/\s+/g, " ").trim();
      if (line.length < MIN_LINE) continue;
      const norm = line.toLowerCase();
      if (seenInBlock.has(norm)) continue;
      seenInBlock.add(norm);
      if (current.lines.length < maxLinesPerBlock) current.lines.push(line);
    }
  }
  return blocks.filter((b) => b.lines.length > 0);
}

const hhmm = (d) => d.toTimeString().slice(0, 5);

export function toTimelineText(blocks) {
  return blocks
    .map((b) => {
      const label =
        b.kind === "audio"
          ? `[${hhmm(b.start)}] ${b.app}${b.window ? ` – ${b.window}` : ""}`
          : `[${hhmm(b.start)}–${hhmm(b.end)}] ${b.app}${b.window ? ` – ${b.window}` : ""}${b.url ? ` (${b.url})` : ""}`;
      return `${label}\n${b.lines.map((l) => `  ${l}`).join("\n")}`;
    })
    .join("\n\n");
}

/** Split text into chunks of roughly maxChars, breaking on blank lines. */
export function chunkText(text, maxChars) {
  if (text.length <= maxChars) return [text];
  const parts = text.split(/\n\n/);
  const chunks = [];
  let buf = "";
  for (const p of parts) {
    const piece = p.length > maxChars ? p.slice(0, maxChars) : p;
    if (buf && buf.length + piece.length + 2 > maxChars) {
      chunks.push(buf);
      buf = "";
    }
    buf = buf ? `${buf}\n\n${piece}` : piece;
  }
  if (buf) chunks.push(buf);
  return chunks;
}
