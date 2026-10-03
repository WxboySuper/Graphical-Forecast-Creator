export class FirstLookReviewUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FirstLookReviewUnavailableError';
  }
}

export const isFirstLookReviewUnavailableError = (error) =>
  error instanceof FirstLookReviewUnavailableError || error?.name === 'FirstLookReviewUnavailableError';

export function renderOpenCodeFirstLookUnavailableComment(context, reason) {
  const ciLine = context.ci?.url
    ? `- Checks | CI: ${context.ci.url}${context.ci.conclusion ? ` (${context.ci.conclusion})` : ''}`
    : null;
  return [
    '## OpenCode first-look review unavailable',
    reason,
    '',
    'This revision was not scored because the reviewer could not produce a usable review from the PR diff/context.',
    ...(ciLine ? ['', '## CI status', ciLine] : []),
  ].join('\n');
}
