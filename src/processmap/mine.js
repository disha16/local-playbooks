// Process mining, written from the published literature only:
//  - Directly-follows graph: van der Aalst, "Process Mining: Data Science in Action" (2016)
//  - Dependency measure: Weijters, van der Aalst, de Medeiros,
//    "Process Mining with the HeuristicsMiner Algorithm" (2006)
// No third-party process-mining code was read or used.

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const SEP = '\u0000';

// events: [{ case, activity, start, end? }], times in ms or ISO strings
export function mineProcess(events, opts = {}) {
  const { minEdgeCount = 1, minDependency = -1, topVariants = 10 } = opts;
  const t = (v) => (typeof v === 'number' ? v : v instanceof Date ? v.getTime() : Date.parse(v));

  // group into cases (traces), ordered by time
  const cases = new Map();
  for (const e of events) {
    const ev = { activity: String(e.activity), start: t(e.start), end: e.end != null ? t(e.end) : null };
    if (!cases.has(e.case)) cases.set(e.case, []);
    cases.get(e.case).push(ev);
  }
  for (const trace of cases.values()) {
    trace.sort((a, b) => a.start - b.start);
    trace.forEach((ev, i) => {
      if (ev.end == null) ev.end = trace[i + 1]?.start ?? ev.start; // no end: runs until next step
    });
  }

  const act = new Map(); // activity -> stats
  const edge = new Map(); // "a\0b" -> { count, waits }
  const starts = new Map();
  const ends = new Map();
  const variants = new Map();
  const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
  let totalEvents = 0;
  let repeatVisits = 0;

  for (const trace of cases.values()) {
    if (!trace.length) continue;
    bump(starts, trace[0].activity);
    bump(ends, trace.at(-1).activity);
    bump(variants, trace.map((e) => e.activity).join(SEP));
    const seen = new Set();
    trace.forEach((ev, i) => {
      totalEvents++;
      if (!act.has(ev.activity)) act.set(ev.activity, { durations: [], cases: 0, repeats: 0 });
      const a = act.get(ev.activity);
      a.durations.push(Math.max(0, ev.end - ev.start));
      if (seen.has(ev.activity)) {
        a.repeats++;
        repeatVisits++;
      } else {
        seen.add(ev.activity);
        a.cases++;
      }
      const next = trace[i + 1];
      if (next) {
        const k = ev.activity + SEP + next.activity;
        if (!edge.has(k)) edge.set(k, { count: 0, waits: [] });
        const ed = edge.get(k);
        ed.count++;
        ed.waits.push(Math.max(0, next.start - ev.end));
      }
    });
  }

  const cnt = (a, b) => edge.get(a + SEP + b)?.count ?? 0;
  // HeuristicsMiner dependency: near 1 = "b really follows a", near 0 = noise/either order
  const dependency = (a, b) => {
    const ab = cnt(a, b);
    if (a === b) return ab / (ab + 1);
    const ba = cnt(b, a);
    return (ab - ba) / (ab + ba + 1);
  };

  const totalTime = [...act.values()].reduce((s, a) => s + a.durations.reduce((x, y) => x + y, 0), 0);
  const activities = [...act.entries()]
    .map(([name, a]) => {
      const total = a.durations.reduce((x, y) => x + y, 0);
      return {
        name,
        count: a.durations.length,
        cases: a.cases,
        repeats: a.repeats,
        totalMs: total,
        meanMs: mean(a.durations),
        medianMs: median(a.durations),
        timeShare: totalTime ? total / totalTime : 0,
      };
    })
    .sort((x, y) => y.count - x.count);

  const allEdges = [...edge.entries()].map(([k, ed]) => {
    const [from, to] = k.split(SEP);
    return { from, to, count: ed.count, dependency: dependency(from, to), meanWaitMs: mean(ed.waits), medianWaitMs: median(ed.waits) };
  });
  const edges = allEdges
    .filter((e) => e.count >= minEdgeCount && e.dependency >= minDependency)
    .sort((x, y) => y.count - x.count);

  const nCases = [...cases.values()].filter((tr) => tr.length).length;
  const paths = [...variants.entries()]
    .map(([k, count]) => ({ steps: k.split(SEP), count, share: nCases ? count / nCases : 0 }))
    .sort((x, y) => y.count - x.count)
    .slice(0, topVariants);

  // rework: doing the same step again, or bouncing a -> b -> a
  const selfLoops = allEdges.filter((e) => e.from === e.to).map((e) => ({ activity: e.from, count: e.count }));
  const backAndForth = [];
  for (const e of allEdges) {
    if (e.from < e.to && cnt(e.to, e.from) > 0) backAndForth.push({ a: e.from, b: e.to, count: Math.min(e.count, cnt(e.to, e.from)) });
  }
  backAndForth.sort((x, y) => y.count - x.count);

  const slowSteps = [...activities].filter((a) => a.totalMs > 0).sort((x, y) => y.totalMs - x.totalMs).slice(0, 5);
  const slowHandoffs = allEdges.filter((e) => e.medianWaitMs > 0).sort((x, y) => y.medianWaitMs - x.medianWaitMs).slice(0, 5);

  const toList = (m) => [...m.entries()].map(([activity, count]) => ({ activity, count })).sort((x, y) => y.count - x.count);
  return {
    cases: nCases,
    events: totalEvents,
    activities,
    edges,
    paths,
    variantCount: variants.size,
    starts: toList(starts),
    ends: toList(ends),
    rework: {
      rate: totalEvents ? repeatVisits / totalEvents : 0,
      repeatVisits,
      repeatedSteps: activities.filter((a) => a.repeats > 0).map((a) => ({ activity: a.name, repeats: a.repeats })).sort((x, y) => y.repeats - x.repeats),
      selfLoops,
      backAndForth,
    },
    slowSteps,
    slowHandoffs,
  };
}
