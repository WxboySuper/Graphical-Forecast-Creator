import { parseOpenCodeChangelogResult } from './opencode-changelog.mjs';

/** Validate the model's bounded changelog audit response. */
export const parseOpenCodeChangelogAuditResult = (raw) => {
  if (typeof raw !== 'string' || raw.length > 16_000) throw new Error('Changelog audit result is empty or too large.');
  let result;
  try { result = JSON.parse(raw); } catch { throw new Error('Changelog audit result must be JSON.'); }
  if (!result || !['current', 'update', 'inconclusive'].includes(result.status)) throw new Error('Changelog audit status is invalid.');
  if (result.status !== 'update') return { status: result.status };
  const validated = parseOpenCodeChangelogResult(JSON.stringify({
    status: 'complete',
    section: result.section,
    entries: result.entries,
  }));
  return { status: 'update', section: validated.section, entries: validated.entries };
};
