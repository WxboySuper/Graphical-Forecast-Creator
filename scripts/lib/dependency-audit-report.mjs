/**
 * Pure helpers for the dependency audit gate.
 *
 * `pnpm audit --json` writes the report to stdout and diagnostics to stderr.
 * Parsing only stdout keeps warnings on stderr from turning a real report into
 * an unparsable string, which used to make the gate pass without evaluating
 * anything.
 */

/** Parses `pnpm audit --json` stdout, returning null when it is not a JSON object. */
export const parseAuditReport = (stdout) => {
  if (typeof stdout !== 'string' || stdout.trim() === '') return null;
  try {
    const parsed = JSON.parse(stdout);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/** Returns the advisories recorded in a parsed report. */
export const auditAdvisories = (report) => Object.values(report?.advisories ?? {});

/** Returns high/critical advisories that ship a fix. */
export const fixableHighAdvisories = (report) =>
  auditAdvisories(report).filter(
    (advisory) =>
      (advisory.severity === 'high' || advisory.severity === 'critical') && advisory.fixAvailable,
  );
