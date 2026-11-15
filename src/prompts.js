export const SYSTEM = `You turn a person's screen activity log into clear notes.
The log was captured from their screen (text read off each window) and microphone.
It is noisy: menus, buttons and repeated UI text appear often. Ignore that noise.
Sensitive identifiers have been replaced with tags like [EMAIL] or [ID]. Never guess them.
Write in plain, concise English. Do not invent steps that are not supported by the log.`;

export const MODES = {
  summary: {
    title: "Summary",
    chunk: `Summarize this part of the activity log in 3-6 bullet points: what the person worked on, in which apps, and anything left unfinished.`,
    final: `Combine these partial summaries into one summary with these sections:
## What happened
(3-6 bullets)
## Main tasks
(each task: app(s) used, rough time)
## Open items
(anything unfinished or waiting on someone; write "None" if nothing)`,
  },
  playbook: {
    title: "Playbook",
    chunk: `From this part of the activity log, list any workflows the person carried out, as numbered steps. Include the app or website used for each step and any decision points ("if X, then Y").`,
    final: `Combine these notes into a reusable playbook a new teammate could follow. For each distinct workflow:
## <Workflow name>
**When to use:** one line
**Tools:** apps/websites involved
**Steps:**
1. ...
**Decision points:** if/then rules seen in the log
**Watch out for:** errors, rework or slow spots seen in the log
Only include workflows actually seen in the log.`,
  },
};
