import { parseOpenCodeChangelogResult } from './opencode-changelog.mjs';

const TARGET_REF_PATTERN = /^(main|stable\/\d+\.\d+\.x)$/;
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const BASELINE_REF_PATTERN = /^(?:[a-f0-9]{40}|v\d+\.\d+\.\d+(?:-beta\.\d+)?)$/i;

const validateTargetRef = (targetRef) => {
  if (typeof targetRef !== 'string') throw new Error('Prepared changelog audit target is invalid.');
  if (!TARGET_REF_PATTERN.test(targetRef)) throw new Error('Prepared changelog audit target is invalid.');
};

const validateHeadSha = (headSha) => {
  if (typeof headSha !== 'string') throw new Error('Prepared changelog audit target is invalid.');
  if (!COMMIT_SHA_PATTERN.test(headSha)) throw new Error('Prepared changelog audit target is invalid.');
};

/** Accept only changelog audit targets that the publisher can safely address. */
export const validateChangelogAuditTarget = (targetRef, headSha) => {
  validateTargetRef(targetRef);
  validateHeadSha(headSha);
  return { targetRef, headSha };
};

const isManualBaselineForTarget = (baselineRef, targetRef) => {
  if (COMMIT_SHA_PATTERN.test(baselineRef)) return true;
  const tag = /^v(\d+)\.(\d+)\.(\d+)(-beta\.\d+)?$/i.exec(baselineRef);
  if (!tag) return false;
  if (targetRef === 'main') return Boolean(tag[4]);
  const line = /^stable\/(\d+)\.(\d+)\.x$/.exec(targetRef);
  return Boolean(line && !tag[4] && tag[1] === line[1] && tag[2] === line[2]);
};

/** Resolve an optional manual baseline and require it to be an ancestor of the audited head. */
export const resolveManualChangelogAuditBaseline = ({ baselineRef, targetRef, headSha, resolveCommit, isAncestor }) => {
  if (!baselineRef) return null;
  if (typeof baselineRef !== 'string' || !BASELINE_REF_PATTERN.test(baselineRef) || !isManualBaselineForTarget(baselineRef, targetRef)) {
    throw new Error('Manual changelog audit baseline must be a full commit SHA or a version tag for the selected release line.');
  }
  if (typeof headSha !== 'string' || !COMMIT_SHA_PATTERN.test(headSha)) {
    throw new Error('Manual changelog audit target is invalid.');
  }
  const baselineSha = resolveCommit(baselineRef);
  if (typeof baselineSha !== 'string' || !COMMIT_SHA_PATTERN.test(baselineSha)) {
    throw new Error('Manual changelog audit baseline did not resolve to a commit.');
  }
  if (!isAncestor(baselineSha, headSha)) {
    throw new Error('Manual changelog audit baseline must be an ancestor of the target revision.');
  }
  return baselineSha;
};

/** Refuse to publish an audit prepared against a revision that has moved. */
export const assertChangelogAuditHead = (expectedHead, liveHead) => {
  if (liveHead !== expectedHead) {
    throw new Error('Target branch advanced while the changelog audit ran; refusing to publish stale content.');
  }
};

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
