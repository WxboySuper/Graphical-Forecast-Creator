import { FirstLookReviewUnavailableError } from './opencode-first-look-review-unavailable.mjs';

const changedFilePathSet = (context) => {
  const paths = context.changedFilePaths ?? context.files?.map((file) => file.path) ?? [];
  return new Set(paths);
};

const requireNonEmptyReviewedPath = (path) => {
  if (typeof path !== 'string' || !path.trim()) {
    throw new FirstLookReviewUnavailableError('filesReviewed must contain non-empty changed-file paths.');
  }
  return path.trim();
};

export function assertContextReadFlag(rawResult) {
  if (rawResult.contextRead !== true) {
    throw new FirstLookReviewUnavailableError(
      'First-look review must set contextRead to true after reading the attached PR context and diff.',
    );
  }
}

export function parseFilesReviewed(filesReviewed, context) {
  if (!Array.isArray(filesReviewed)) {
    throw new FirstLookReviewUnavailableError('First-look review must include a filesReviewed string array.');
  }
  const changed = changedFilePathSet(context);
  if (changed.size === 0) return [];
  const reviewed = filesReviewed.map((path) => {
    const normalized = requireNonEmptyReviewedPath(path);
    if (!changed.has(normalized)) {
      throw new FirstLookReviewUnavailableError('filesReviewed paths must be drawn from the PR changed-file list.');
    }
    return normalized;
  });
  if (!reviewed.length) {
    throw new FirstLookReviewUnavailableError('filesReviewed must list at least one changed PR file that was reviewed.');
  }
  return [...new Set(reviewed)];
}
