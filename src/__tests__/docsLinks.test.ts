import fs from 'fs';
import path from 'path';

const REPO_ROOT = process.cwd();
const DOC_PATHS = ['docs/repository-map.md'];

const knownTopLevelEntries = fs.readdirSync(REPO_ROOT);

/** True when a backticked span looks like a repo-relative path we should verify. */
function isLikelyRepoPath(span: string): boolean {
  if (!span || /\s/.test(span)) return false;
  if (span.startsWith('/')) return false;
  if (/[*?[\]{}]/.test(span)) return false;
  const firstSegment = span.split('/')[0];
  return knownTopLevelEntries.includes(firstSegment);
}

/** Extracts markdown links `[text](target)` that are not anchors or external URLs. */
function extractRelativeMarkdownLinks(content: string): string[] {
  const links: string[] = [];
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
  let match = linkPattern.exec(content);
  while (match) {
    const target = match[1].split('#')[0].split('?')[0];
    if (target && !target.startsWith('#') && !/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) {
      links.push(target);
    }
    match = linkPattern.exec(content);
  }
  return links;
}

describe('docs/repository-map.md links', () => {
  it.each(DOC_PATHS)('%s relative links and path references exist', (docRelPath) => {
    const docAbsPath = path.resolve(REPO_ROOT, docRelPath);
    const content = fs.readFileSync(docAbsPath, 'utf8');
    const docDir = path.dirname(docAbsPath);

    // Drop fenced code blocks first so their fence backticks do not merge inline spans.
    const inlineOnly = content.replace(/```[\s\S]*?```/g, '');
    const codeSpans = [...inlineOnly.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    const pathSpans = codeSpans.filter(isLikelyRepoPath);
    const markdownLinks = extractRelativeMarkdownLinks(content);

    const missing: Array<{ ref: string; source: string }> = [];

    for (const span of pathSpans) {
      const resolved = path.resolve(REPO_ROOT, span);
      if (!fs.existsSync(resolved)) {
        missing.push({ ref: span, source: `inline code in ${docRelPath}` });
      }
    }

    for (const link of markdownLinks) {
      const resolved = path.resolve(docDir, link);
      if (!fs.existsSync(resolved)) {
        missing.push({ ref: link, source: `markdown link in ${docRelPath}` });
      }
    }

    expect(pathSpans.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});
