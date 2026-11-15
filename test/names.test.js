import { test } from "node:test";
import assert from "node:assert/strict";
import { redactNames } from "../src/names.js";
import { redact } from "../src/redact.js";

// Stand-in for the model: reports what Privacy Filter would for this text.
const fake = async (text) => {
  const out = [];
  if (text.includes("Jane Doe")) out.push({ entity_group: "private_person", word: "Jane Doe", score: 0.99 });
  if (text.includes("12 Elm St")) out.push({ entity_group: "private_address", word: " 12 Elm St", score: 0.9 });
  out.push({ entity_group: "private_person", word: "Epic", score: 0.2 }); // low confidence: ignored
  return out;
};

test("names: hides names and addresses everywhere, then regex catches IDs", async () => {
  const text = "Patient Jane Doe, 12 Elm St\nMRN: 99887766\nCalled jane  doe back in Epic";
  const a = await redactNames(text, fake);
  assert.equal(a.count, 3);
  const b = redact(a.text);
  assert.equal(b.text, "Patient [NAME], [ADDRESS]\n[ID]\nCalled [NAME] back in Epic");
});

test("names: long text is checked in parts", async () => {
  let calls = 0;
  const text = Array.from({ length: 50 }, (_, i) => `line ${i} `.repeat(20)).join("\n") + "\nJane Doe";
  const r = await redactNames(text, async (t) => (calls++, fake(t)), { maxChars: 1000 });
  assert.ok(calls > 1);
  assert.ok(!r.text.includes("Jane Doe"));
});
