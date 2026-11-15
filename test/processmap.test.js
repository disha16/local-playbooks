import test from 'node:test';
import assert from 'node:assert/strict';
import { mineProcess, timelineToEvents, renderProcessMap } from '../src/processmap/index.js';

const min = 60_000;
// builds one case from [activity, minutes] pairs, back to back
const mk = (id, steps, t0 = 0) => {
  let t = t0;
  return steps.map(([activity, m]) => {
    const e = { case: id, activity, start: t, end: t + m * min };
    t = e.end;
    return e;
  });
};

const log = [
  ...mk('c1', [['Open claim', 1], ['Check eligibility', 2], ['Submit auth', 5]]),
  ...mk('c2', [['Open claim', 1], ['Check eligibility', 2], ['Submit auth', 5]]),
  ...mk('c3', [['Open claim', 1], ['Check eligibility', 4], ['Open claim', 1], ['Check eligibility', 2], ['Submit auth', 9]]),
];

test('counts steps, edges and paths', () => {
  const m = mineProcess(log);
  assert.equal(m.cases, 3);
  assert.equal(m.events, 11);
  const e = (a, b) => m.edges.find((x) => x.from === a && x.to === b);
  assert.equal(e('Open claim', 'Check eligibility').count, 4);
  assert.equal(e('Check eligibility', 'Submit auth').count, 3);
  assert.equal(e('Check eligibility', 'Open claim').count, 1);
  assert.equal(m.paths[0].count, 2);
  assert.deepEqual(m.paths[0].steps, ['Open claim', 'Check eligibility', 'Submit auth']);
  assert.equal(m.variantCount, 2);
  assert.deepEqual(m.starts, [{ activity: 'Open claim', count: 3 }]);
  assert.deepEqual(m.ends, [{ activity: 'Submit auth', count: 3 }]);
});

test('dependency measure matches the HeuristicsMiner formula', () => {
  const m = mineProcess(log);
  const e = (a, b) => m.edges.find((x) => x.from === a && x.to === b);
  assert.equal(e('Open claim', 'Check eligibility').dependency, (4 - 1) / (4 + 1 + 1));
  assert.equal(e('Check eligibility', 'Submit auth').dependency, 3 / 4);
  // filtering drops the weak backward edge
  const f = mineProcess(log, { minDependency: 0.3 });
  assert.equal(f.edges.find((x) => x.from === 'Check eligibility' && x.to === 'Open claim'), undefined);
});

test('time per step, slow spots and rework', () => {
  const m = mineProcess(log);
  const a = (n) => m.activities.find((x) => x.name === n);
  assert.equal(a('Submit auth').medianMs, 5 * min);
  assert.equal(a('Submit auth').totalMs, 19 * min);
  assert.equal(m.slowSteps[0].name, 'Submit auth');
  assert.equal(m.rework.repeatVisits, 2);
  assert.deepEqual(m.rework.backAndForth, [{ a: 'Check eligibility', b: 'Open claim', count: 1 }]);
});

test('self loops and missing end times', () => {
  const m = mineProcess([
    { case: 'x', activity: 'Call payer', start: 0 },
    { case: 'x', activity: 'Call payer', start: 2 * min },
    { case: 'x', activity: 'Log note', start: 5 * min },
  ]);
  assert.deepEqual(m.rework.selfLoops, [{ activity: 'Call payer', count: 1 }]);
  assert.equal(m.edges.find((e) => e.from === e.to).dependency, 0.5);
  assert.equal(m.activities.find((a) => a.name === 'Call payer').totalMs, 5 * min);
});

test('timeline to events: merges repeats, splits sessions on idle gaps', () => {
  const ev = timelineToEvents([
    { timestamp: 0, app: 'Epic' },
    { timestamp: 1 * min, app: 'Epic' },
    { timestamp: 2 * min, app: 'Chrome' },
    { timestamp: 3 * min, app: 'Epic' },
    { timestamp: 120 * min, app: 'Excel' },
  ]);
  assert.deepEqual(ev.map((e) => [e.case, e.activity]), [
    ['session-1', 'Epic'], ['session-1', 'Chrome'], ['session-1', 'Epic'], ['session-2', 'Excel'],
  ]);
  assert.equal(ev[0].end, 2 * min);
});

test('renders markdown with a diagram', () => {
  const md = renderProcessMap(mineProcess(log));
  assert.match(md, /```mermaid\nflowchart LR/);
  assert.match(md, /Open claim → Check eligibility → Submit auth \(2x, 67%\)/);
  assert.match(md, /## Rework/);
});

test('end to end: fake capture API → process map, window titles redacted', async () => {
  const http = await import('node:http');
  const { runMap } = await import('../src/processmap/index.js');
  const at = (m) => new Date(Date.UTC(2026, 10, 14, 14, m)).toISOString();
  const ocr = [
    [0, 'Epic', 'Chart MRN: 99887766'], [1, 'Epic', 'Chart MRN: 99887766'], [3, 'Google Chrome', 'Availity'],
    [6, 'Epic', 'Chart MRN: 99887766'], [8, 'Google Chrome', 'Availity'],
  ].map(([m, app_name, window_name]) => ({ type: 'OCR', content: { text: 'x y z', timestamp: at(m), app_name, window_name } }));
  const server = http.createServer((req, res) => {
    const type = new URL(req.url, 'http://x').searchParams.get('content_type');
    const data = type === 'ocr' ? ocr : [];
    res.end(JSON.stringify({ data, pagination: { total: data.length } }));
  });
  await new Promise((r) => server.listen(0, r));
  try {
    const args = { start: new Date(at(0)), end: new Date(at(30)), screenpipeUrl: `http://127.0.0.1:${server.address().port}` };
    const a = await runMap(args);
    assert.equal(a.map.events, 4);
    assert.equal(a.map.edges.find((e) => e.from === 'Epic' && e.to === 'Google Chrome').count, 2);
    assert.equal(a.map.activities.find((x) => x.name === 'Epic').totalMs, 5 * min);
    const w = await runMap({ ...args, by: 'window' });
    assert.ok(!w.markdown.includes('99887766'));
    assert.match(w.markdown, /Epic: Chart \[ID\]/);
  } finally {
    server.close();
  }
});
