/**
 * Pull-request feature-exposure comment helpers. It gathers changed-file
 * exposure data and formats the promotion report posted by release tooling.
 */
import { formatFeatureList } from './feature-exposure-report.mjs';
import { githubRequest } from './github-api.mjs';
import { fetchAllPages, GITHUB_PAGE_SIZE } from './github-paginate.mjs';

export const PROMOTION_EXPOSURE_COMMENT_MARKER = '<!-- gfc-promotion-exposure-report -->';

/**
 * @param {{ id: number, body?: string }[]} comments
 */
export function findExistingExposureComment(comments) {
  return comments.find((comment) => comment.body?.includes(PROMOTION_EXPOSURE_COMMENT_MARKER)) ?? null;
}

/**
 * @param {boolean} ok
 */
function statusEmoji(ok) {
  return ok ? '✅' : '❌';
}

/**
 * @param {string} value
 */
export function escapeMarkdownTableCell(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/**
 * @param {{ name: string, ok: boolean, details: string }[]} checkRows
 */
function formatCheckTable(checkRows) {
  const lines = [
    '| Check | Status | Details |',
    '|---|---|---|',
    ...checkRows.map(
      (row) => `| ${row.name} | ${statusEmoji(row.ok)} | ${escapeMarkdownTableCell(row.details)} |`
    ),
  ];
  return lines.join('\n');
}

/**
 * @param {{
 *   checkRows: { name: string, ok: boolean, details: string }[],
 *   report: { sections: Record<string, { featureKey: string }[]> },
 *   newlyProductionVisible: { featureKey: string }[],
 *   runUrl?: string,
 * }} context
 */
export function formatPromotionExposureComment({ checkRows, report, newlyProductionVisible, runUrl }) {
  const exposureLines = [
    '| Exposure | Features |',
    '|---|---|',
    `| Production-enabled | ${formatFeatureList(report.sections.production)} |`,
    `| Beta-only | ${formatFeatureList(report.sections.betaOnly)} |`,
    `| Disabled | ${formatFeatureList([...report.sections.disabled, ...report.sections.localOnly])} |`,
    `| Newly production-visible (vs main) | ${formatFeatureList(newlyProductionVisible)} |`,
  ];

  const runLink = runUrl ? `[CI run](${runUrl})` : 'CI';

  return [
    PROMOTION_EXPOSURE_COMMENT_MARKER,
    '## Production exposure report',
    '',
    formatCheckTable(checkRows),
    '',
    ...exposureLines,
    '',
    `<sub>Updated by ${runLink} · Re-run locally: \`pnpm exposure:report\`</sub>`,
  ].join('\n');
}

/**
 * @param {string} repository
 * @param {string} token
 * @param {number} prNumber
 */
function listIssueComments(repository, token, prNumber) {
  return fetchAllPages((page) =>
    githubRequest(
      repository,
      token,
      `/issues/${prNumber}/comments?per_page=${GITHUB_PAGE_SIZE}&page=${page}`
    )
  );
}

/**
 * @param {{
 *   repository: string,
 *   token: string,
 *   prNumber: number,
 *   body: string,
 * }} context
 */
export async function upsertPromotionExposureComment({ repository, token, prNumber, body }) {
  const comments = await listIssueComments(repository, token, prNumber);
  const existing = findExistingExposureComment(comments);

  if (existing) {
    await githubRequest(repository, token, `/issues/comments/${existing.id}`, {
      method: 'PATCH',
      body: { body },
    });
    return { action: 'updated', commentId: existing.id };
  }

  const created = await githubRequest(repository, token, `/issues/${prNumber}/comments`, {
    method: 'POST',
    body: { body },
  });
  return { action: 'created', commentId: created.id };
}
