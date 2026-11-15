// Best-effort removal of sensitive identifiers before text reaches any model.
// Pattern-based: it catches structured identifiers (emails, phone numbers, SSNs, dates,
// record/member numbers), NOT free-text names. Add names or terms via extraTerms.

const PATTERNS = [
  ["EMAIL", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  ["SSN", /\b\d{3}-\d{2}-\d{4}\b/g],
  ["PHONE", /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g],
  ["DATE", /\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19|20)?\d{2}\b/g],
  ["DATE", /\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g],
  [
    "ID",
    /\b(?:MRN|DOB|Member\s?ID|Subscriber\s?ID|Patient\s?ID|Acct|Account|Policy|Claim)\s*[#:.]?\s*[A-Z0-9-]{4,}\b/gi,
  ],
  ["CARD", /\b(?:\d[ -]?){13,19}\b/g],
  ["NUMBER", /\b\d{7,}\b/g],
];

export function redact(text, { extraTerms = [] } = {}) {
  let out = text;
  let count = 0;
  for (const [label, re] of PATTERNS) {
    out = out.replace(re, () => {
      count++;
      return `[${label}]`;
    });
  }
  for (const term of extraTerms) {
    if (!term) continue;
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, () => {
      count++;
      return "[REDACTED]";
    });
  }
  return { text: out, count };
}
