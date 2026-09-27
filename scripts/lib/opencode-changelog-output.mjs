const SECTIONS = new Set(['Added', 'Changed', 'Fixed', 'Security', 'Dependencies']);
const ENTRY_PATTERN = /^- \*\*[^*\r\n]{1,80}:\*\* [^\r\n<>]{15,450}$/u;

const decodeModelResult = (raw) => {
  if (typeof raw !== 'string' || raw.length > 16_000) throw new Error('OpenCode changelog result is empty or too large.');
  try { return JSON.parse(raw); } catch { throw new Error('OpenCode changelog result must be JSON.'); }
};

const validateEntryFormat = (entries) => {
  for (const entry of entries) {
    if (!ENTRY_PATTERN.test(entry)) throw new Error('OpenCode returned an entry outside the allowed changelog format or size.');
    if (/[\x60<>]/.test(entry)) throw new Error('OpenCode returned an entry outside the allowed changelog format or size.');
    if (/https?:\/\//i.test(entry)) throw new Error('OpenCode returned an entry outside the allowed changelog format or size.');
    if (/\[[^\]\r\n]+\]\([^)]+\)/.test(entry)) throw new Error('OpenCode returned an entry outside the allowed changelog format or size.');
  }
  return entries;
};

const normalizeModelEntries = (entries) => {
  if (!Array.isArray(entries)) throw new Error('OpenCode changelog must contain one to four entries.');
  if (entries.length < 1 || entries.length > 4) throw new Error('OpenCode changelog must contain one to four entries.');
  return validateEntryFormat(entries.map((entry) => String(entry).trim()));
};

const validateModelEntries = (result) => {
  if (!SECTIONS.has(result.section)) throw new Error('OpenCode changelog section is invalid.');
  const entries = normalizeModelEntries(result.entries);
  if (new Set(entries).size !== entries.length) throw new Error('OpenCode returned duplicate changelog entries.');
  return entries;
};

/** Parse and bound the untrusted model response. */
export const parseOpenCodeChangelogResult = (raw) => {
  const result = decodeModelResult(raw);
  if (!result || !['complete', 'inconclusive'].includes(result.status)) throw new Error('OpenCode changelog status is invalid.');
  if (result.status === 'inconclusive') return { status: 'inconclusive' };
  return { status: 'complete', section: result.section, entries: validateModelEntries(result) };
};
