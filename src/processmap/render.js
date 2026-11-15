// Renders a mined process map as markdown with a Mermaid diagram.

export function fmtDuration(msVal) {
  const s = Math.round(msVal / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
const pct = (x) => `${Math.round(x * 100)}%`;
const safe = (s) => String(s).replace(/["\[\]{}|<>]/g, ' ').trim();

export function toMermaid(map) {
  const id = new Map(map.activities.map((a, i) => [a.name, `s${i}`]));
  const lines = ['flowchart LR'];
  for (const a of map.activities) lines.push(`  ${id.get(a.name)}["${safe(a.name)}<br/>${a.count}x, ${fmtDuration(a.medianMs)}"]`);
  for (const e of map.edges) lines.push(`  ${id.get(e.from)} -->|${e.count}| ${id.get(e.to)}`);
  return lines.join('\n');
}

export function renderProcessMap(map, { title = 'Process map' } = {}) {
  const out = [`# ${title}`, '', `${map.cases} sessions, ${map.events} steps, ${map.variantCount} different paths.`, ''];
  out.push('## Flow', '', '```mermaid', toMermaid(map), '```', '');

  out.push('## Common paths', '');
  map.paths.forEach((p, i) => out.push(`${i + 1}. ${p.steps.join(' → ')} (${p.count}x, ${pct(p.share)})`));

  out.push('', '## Time per step', '', '| Step | Times | Typical | Average | Share of time |', '|---|---|---|---|---|');
  for (const a of map.activities) out.push(`| ${safe(a.name)} | ${a.count} | ${fmtDuration(a.medianMs)} | ${fmtDuration(a.meanMs)} | ${pct(a.timeShare)} |`);

  out.push('', '## Which step follows which', '', '| From | To | Times | Strength | Typical wait |', '|---|---|---|---|---|');
  for (const e of map.edges) out.push(`| ${safe(e.from)} | ${safe(e.to)} | ${e.count} | ${e.dependency.toFixed(2)} | ${fmtDuration(e.medianWaitMs)} |`);

  out.push('', '## Slow spots', '');
  if (!map.slowSteps.length) out.push('- None found.');
  for (const a of map.slowSteps) out.push(`- ${a.name}: ${fmtDuration(a.totalMs)} total (${pct(a.timeShare)} of all time), typically ${fmtDuration(a.medianMs)}`);
  for (const e of map.slowHandoffs) out.push(`- Wait between ${e.from} and ${e.to}: typically ${fmtDuration(e.medianWaitMs)}`);

  out.push('', '## Rework', '', `- ${pct(map.rework.rate)} of steps were repeats of a step already done in the same session.`);
  for (const r of map.rework.repeatedSteps.slice(0, 5)) out.push(`- ${r.activity}: repeated ${r.repeats}x`);
  for (const b of map.rework.backAndForth.slice(0, 5)) out.push(`- Back and forth between ${b.a} and ${b.b}: ${b.count}x`);
  return out.join('\n') + '\n';
}
