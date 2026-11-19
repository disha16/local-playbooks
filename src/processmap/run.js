import { fetchActivity } from '../screenpipe.js';
import { redact } from '../redact.js';
import { timelineToEvents } from './events.js';
import { mineProcess } from './mine.js';
import { renderProcessMap } from './render.js';

/**
 * Capture history -> event log -> process map (markdown). No AI model involved.
 * by "app": one step per app. by "window": one step per app window; window titles are
 * redacted first because they can contain patient names or record numbers.
 */
export async function runMap({ start, end, app, screenpipeUrl, by = 'app', extraTerms = [], headers, onStep = () => {} }) {
  if (!['app', 'window'].includes(by)) throw new Error(`Unknown --by "${by}". Use app or window.`);
  onStep(`Reading activity ${start.toLocaleString()} → ${end.toLocaleString()}`);
  const raw = await fetchActivity({ start, end, app, baseUrl: screenpipeUrl, headers });
  const screen = raw.filter((e) => e.kind !== 'audio');
  if (screen.length === 0) return { markdown: null, stats: { events: raw.length } };

  const label = (e) => {
    if (by === 'app' || !e.window) return e.app;
    return `${e.app}: ${redact(e.window, { extraTerms }).text}`;
  };
  const events = timelineToEvents(screen.map((e) => ({ timestamp: e.ts, activity: label(e) })));
  const map = mineProcess(events);
  onStep(`${screen.length} captures → ${map.events} steps in ${map.cases} sessions`);
  const markdown = renderProcessMap(map, { title: `Process map: ${start.toLocaleString()} – ${end.toLocaleString()}` });
  return { markdown, stats: { events: raw.length, steps: map.events, sessions: map.cases }, map };
}
