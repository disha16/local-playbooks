import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { redact } from "../src/redact.js";
import { condense, toTimelineText, chunkText } from "../src/condense.js";
import { run } from "../src/pipeline.js";
import { createEndpointEngine } from "../src/llm/endpoint.js";

const T0 = new Date("2026-11-14T14:00:00Z");
const at = (min) => new Date(T0.getTime() + min * 60e3).toISOString();

const FIXTURE = {
  ocr: [
    { type: "OCR", content: { text: "Availity Portal\nPrior Authorization Request\nMember ID: ABC123456\nCPT 72148 MRI lumbar", timestamp: at(1), app_name: "Google Chrome", window_name: "Availity" } },
    { type: "OCR", content: { text: "Availity Portal\nPrior Authorization Request\nMember ID: ABC123456\nUpload clinical notes", timestamp: at(2), app_name: "Google Chrome", window_name: "Availity" } },
    { type: "OCR", content: { text: "Epic - Patient chart\nDOB 04/12/1980\nCall 617-555-0199", timestamp: at(5), app_name: "Epic", window_name: "Chart" } },
  ],
  audio: [
    { type: "Audio", content: { transcription: "If the payer asks for notes, attach the last two visits.", timestamp: at(3), device_type: "Input", speaker: { name: "Me" } } },
  ],
  accessibility: [],
};

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler).listen(0, () =>
      resolve({ server, url: `http://127.0.0.1:${server.address().port}` })
    );
  });
}

test("redact removes structured identifiers", () => {
  const { text, count } = redact("Email a@b.com, SSN 123-45-6789, DOB 04/12/1980, MRN: 99887766, call (617) 555-0199. Dr Smith", {
    extraTerms: ["Dr Smith"],
  });
  for (const leaked of ["a@b.com", "123-45-6789", "04/12/1980", "99887766", "555-0199", "Smith"]) {
    assert.ok(!text.includes(leaked), `leaked ${leaked}: ${text}`);
  }
  assert.ok(count >= 6);
});

test("condense drops repeated screen text", () => {
  const events = FIXTURE.ocr.slice(0, 2).map((i) => ({
    ts: new Date(i.content.timestamp), kind: "screen", app: i.content.app_name, window: i.content.window_name, url: "", text: i.content.text,
  }));
  const blocks = condense(events);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].lines.filter((l) => l === "Availity Portal").length, 1);
  assert.ok(toTimelineText(blocks).includes("Upload clinical notes"));
});

test("chunkText respects size", () => {
  const chunks = chunkText(Array.from({ length: 50 }, (_, i) => `block ${i} `.repeat(20)).join("\n\n"), 1000);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= 1000));
});

test("end to end: Screenpipe → redaction → endpoint", async () => {
  const sp = await startServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const type = u.searchParams.get("content_type");
    const offset = Number(u.searchParams.get("offset"));
    const all = FIXTURE[type] || [];
    const data = offset === 0 ? all : [];
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ data, pagination: { limit: 500, offset, total: all.length } }));
  });

  const prompts = [];
  const ai = await startServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      prompts.push(JSON.parse(body).messages[1].content);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: "<think>x</think>## What happened\n- Submitted a prior auth" } }] }));
    });
  });

  try {
    const engine = createEndpointEngine({ url: `${ai.url}/v1`, model: "test" });
    const { markdown, stats } = await run({
      mode: "playbook",
      start: T0,
      end: new Date(T0.getTime() + 3600e3),
      engine,
      screenpipeUrl: sp.url,
      extraTerms: [],
    });
    assert.equal(stats.events, 4);
    assert.ok(markdown.includes("Submitted a prior auth"));
    assert.ok(!markdown.includes("<think>"));
    const sent = prompts.join("\n");
    assert.ok(sent.includes("CPT 72148"), "keeps useful work content");
    assert.ok(sent.includes("attach the last two visits"), "includes audio");
    for (const leaked of ["ABC123456", "04/12/1980", "617-555-0199"]) {
      assert.ok(!sent.includes(leaked), `leaked ${leaked} to model`);
    }
  } finally {
    sp.server.close();
    ai.server.close();
  }
});
