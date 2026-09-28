const SECTIONS = new Set(['Added', 'Changed', 'Fixed', 'Security', 'Dependencies']);
const ENTRY_PATTERN = /^- \*\*[^*\r\n]{1,80}:\*\* [^\r\n<>]{15,450}$/u;
const MARKUP_PATTERN = /[\x60<>]/;
const URL_PATTERN = /https?:\/\//i;
const MARKDOWN_LINK_PATTERN = /\[[^\]\r\n]+\]\([^)]+\)/;

const decodeModelResult = (raw) => {
  if (typeof raw !== 'string' || raw.length > 16_000) throw new Error('OpenCode changelog result is empty or too large.');
  try { return JSON.parse(raw); } catch { throw new Error('OpenCode changelog result must be JSON.'); }
};

const assertPatternAbsent = (entry, pattern) => {
  if (pattern.test(entry)) throw new Error('OpenCode returned an entry outside the allowed changelog format or size.');
};

const validateEntryFormat = (entries) => {
  entries.forEach((entry) => {
    assertPatternAbsent(entry, MARKUP_PATTERN);
    assertPatternAbsent(entry, URL_PATTERN);
    assertPatternAbsent(entry, MARKDOWN_LINK_PATTERN);
    if (!ENTRY_PATTERN.test(entry)) throw new Error('OpenCode returned an entry outside the allowed changelog format or size.');
  });
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
  if (!result || !['complete', 'inconclusive', 'no-change'].includes(result.status)) throw new Error('OpenCode changelog status is invalid.');
  if (result.status === 'inconclusive') return { status: 'inconclusive' };
  if (result.status === 'no-change') return { status: 'no-change' };
  return { status: 'complete', section: result.section, entries: validateModelEntries(result) };
};

/** Check that the model result agrees with the PR's trusted impact decision. */
export const assertOpenCodeChangelogResultEligible = (result, { isDependabot, impact }) => {
  if (result.status === 'no-change') {
    if (isDependabot && impact === 'none') return;
    throw new Error('OpenCode may return no-change only for a Dependabot PR declared Changelog-Impact: none.');
  }
  if (result.status !== 'complete') throw new Error('OpenCode could not produce a sufficiently grounded changelog entry; add it manually and rerun CI.');
  if (impact === 'none') throw new Error('OpenCode returned a changelog entry for a PR declared Changelog-Impact: none.');
};
