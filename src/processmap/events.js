// Turns a screen-activity timeline into an event log for process mining.
// Input entries: { timestamp|start, end?, app|app_name, window|window_name }
// Output events: { case, activity, start, end } (times in ms)

const ms = (t) => (typeof t === 'number' ? t : t instanceof Date ? t.getTime() : Date.parse(t));

export function timelineToEvents(entries, opts = {}) {
  const {
    idleGapMs = 30 * 60 * 1000, // a gap this long starts a new case (work session)
    maxStepMs = 15 * 60 * 1000, // cap for a step with no known end
    activityOf = (e) => e.activity ?? e.app ?? e.app_name ?? 'unknown',
  } = opts;

  const rows = entries
    .map((e) => ({ activity: String(activityOf(e)).trim() || 'unknown', start: ms(e.start ?? e.timestamp), end: e.end != null ? ms(e.end) : null }))
    .filter((r) => Number.isFinite(r.start))
    .sort((a, b) => a.start - b.start);

  const events = [];
  let caseNo = 0;
  let prev = null;
  for (const r of rows) {
    const lastSeen = prev ? prev.lastSeen : null;
    if (prev && r.start - lastSeen > idleGapMs) {
      caseNo++;
      prev = null;
    }
    if (prev && prev.activity === r.activity) {
      // same step continuing: stretch it
      prev.lastSeen = Math.max(prev.lastSeen, r.end ?? r.start);
      continue;
    }
    if (prev) prev.end = Math.min(r.start, prev.lastSeen + maxStepMs);
    prev = { case: `session-${caseNo + 1}`, activity: r.activity, start: r.start, end: null, lastSeen: r.end ?? r.start };
    events.push(prev);
  }
  // close open steps (last step of each case ends when it was last seen)
  for (const e of events) if (e.end == null) e.end = e.lastSeen;
  return events.map(({ lastSeen, ...e }) => e);
}
