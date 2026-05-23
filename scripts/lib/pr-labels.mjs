import { anyFileMatches, pathMatches } from './glob-match.mjs';

/**
 * @typedef {{ head: string; base: string }} RoutingContext
 * @typedef {{ changedFiles: string[]; head: string }} ContentContext
 */

/** Labels this automation owns (removed before re-applying). */
export const MANAGED_LABELS = [
  'promotion',
  'feature',
  'fix',
  'hotfix',
  'release',
  'port',
  'refactor',
  'integration:primary',
  'integration:other',
  'has conflicts',
  'draft',
  'ci:pending',
  'ci:passing',
  'ci:failing',
  'changelog:ok',
  'changelog:missing',
  'Documentation',
  'Enhancement',
  'Bug',
  'Refactor',
  'javascript',
  'dependencies',
  'quality',
  'e2e-validated',
  'porting',
  'Component: Map',
  'Component: Outlooks',
  'Component: Drawing-Tools',
  'Component: Export',
  'Component: UI',
  'Component: Storage',
];

/** @type {Array<{ label: string; patterns: string[] }>} */
const CONTENT_LABEL_RULES = [
  { label: 'Component: Map', patterns: ['src/components/Map/**', 'src/maps/**', 'src/monitor/**', 'src/components/Monitor/**'] },
  {
    label: 'Component: Outlooks',
    patterns: [
      'src/components/OutlookPanel/**',
      'src/components/OutlookSelector/**',
      'src/components/OutlookDaySelector/**',
      'src/components/DaySelector/**',
      'src/utils/outlookUtils.*',
    ],
  },
  { label: 'Component: Drawing-Tools', patterns: ['src/components/DrawingTools/**'] },
  { label: 'Component: Export', patterns: ['src/utils/exportUtils.*', 'src/components/DrawingTools/useExportMap.*'] },
  {
    label: 'Component: Storage',
    patterns: [
      'src/components/CloudCycleManager/**',
      'src/components/CycleManager/**',
      'src/hooks/useCloud*/**',
      'src/hooks/useAutoSave.*',
      'src/hooks/useFileLoader.*',
      'src/lib/cloudCyclesService.*',
      'src/lib/firebase.*',
      'src/utils/fileUtils.*',
      'src/utils/cycleHistoryPersistence.*',
      'src/pages/CloudLibraryPage.*',
      'src/auth/**',
      'server/firebase-admin.js',
    ],
  },
  {
    label: 'Component: UI',
    patterns: [
      'src/components/ui/**',
      'src/components/Layout/**',
      'src/components/IntegratedToolbar/**',
      'src/components/Toolbar/**',
      'src/**/*.css',
      'src/App.*',
      'src/index.*',
    ],
  },
  { label: 'Documentation', patterns: ['docs/**', '**/*.md', 'src/components/Documentation/**'] },
  { label: 'dependencies', patterns: ['package.json', 'pnpm-lock.yaml', 'server/package.json', 'server/package-lock.json'] },
  { label: 'e2e-validated', patterns: ['e2e/**'] },
  { label: 'porting', patterns: ['.github/workflows/pr-porting.yml', '.github/scripts/port-changes.sh'] },
  { label: 'quality', patterns: ['.github/workflows/**', 'scripts/**', '**/*.test.*', '**/*.spec.*', '**/__tests__/**'] },
  { label: 'javascript', patterns: ['src/**', 'server/**', 'vite.config.*', 'tsconfig*.json', 'playwright.config.*'] },
];

const DOC_ONLY_PATTERNS = ['docs/**', '**/*.md', '.github/**/*.md', 'CHANGELOG.md'];

/**
 * @param {string} head
 * @returns {string | null}
 */
const branchTypeLabel = (head) => {
  if (head.startsWith('hotfix/') || head.startsWith('fix/')) return 'Bug';
  if (head.startsWith('feature/')) return 'Enhancement';
  if (head.startsWith('refactor/')) return 'Refactor';
  return null;
};

/**
 * @param {string[]} changedFiles
 */
const isDocsOnlyChange = (changedFiles) =>
  changedFiles.length > 0 &&
  changedFiles.every((file) => DOC_ONLY_PATTERNS.some((pattern) => pathMatches(file, pattern)));

/**
 * @param {string[]} changedFiles
 * @returns {Set<string>}
 */
const contentLabelsFromDiff = (changedFiles) => {
  const labels = new Set();
  for (const rule of CONTENT_LABEL_RULES) {
    if (rule.patterns.some((pattern) => anyFileMatches(changedFiles, pattern))) {
      labels.add(rule.label);
    }
  }
  return labels;
};

/** @type {Array<[prefix: string, label: string]>} */
const BRANCH_KIND_LABELS = [
  ['feature/', 'feature'],
  ['fix/', 'fix'],
  ['hotfix/', 'hotfix'],
  ['release/', 'release'],
  ['port/', 'port'],
  ['refactor/', 'refactor'],
];

/**
 * @param {string} head
 * @returns {Set<string>}
 */
const branchKindLabels = (head) => {
  const labels = new Set();
  for (const [prefix, label] of BRANCH_KIND_LABELS) {
    if (head.startsWith(prefix)) labels.add(label);
  }
  return labels;
};

/**
 * @param {string} head
 * @returns {Set<string>}
 */
const betaIntegrationLabels = (head) => {
  const labels = new Set();
  if (head.startsWith('hotfix/')) return labels;
  if (head.startsWith('feature/') || head.startsWith('fix/')) {
    labels.add('integration:primary');
    return labels;
  }
  if (head !== 'beta' && !head.startsWith('port/')) {
    labels.add('integration:other');
  }
  return labels;
};

/**
 * Branch routing and integration priority labels.
 *
 * @param {RoutingContext} context
 * @returns {Set<string>}
 */
export const routingLabels = ({ head, base }) => {
  const labels = branchKindLabels(head);
  if (head === 'beta' && base === 'main') labels.add('promotion');
  if (base === 'beta') {
    for (const label of betaIntegrationLabels(head)) labels.add(label);
  }
  return labels;
};

/**
 * Descriptive labels from branch name and changed paths.
 *
 * @param {ContentContext} context
 * @returns {Set<string>}
 */
export const descriptiveLabels = ({ changedFiles, head }) => {
  const labels = new Set();

  const typeLabel = branchTypeLabel(head);
  if (typeLabel) labels.add(typeLabel);

  if (head.startsWith('feature/release-') || head.startsWith('port/')) {
    labels.add('quality');
  }

  if (isDocsOnlyChange(changedFiles)) {
    labels.add('Documentation');
    return labels;
  }

  for (const label of contentLabelsFromDiff(changedFiles)) {
    labels.add(label);
  }

  return labels;
};

/**
 * @param {{
 *   head: string;
 *   base: string;
 *   changedFiles: string[];
 *   mergeable: boolean | null;
 *   draft: boolean;
 *   changelogOk: boolean;
 * }} context
 * @returns {string[]}
 */
export const computePrLabels = ({ head, base, changedFiles, mergeable, draft, changelogOk }) => {
  const labels = new Set([
    ...routingLabels({ head, base }),
    ...descriptiveLabels({ changedFiles, head }),
  ]);

  if (mergeable === false) labels.add('has conflicts');
  if (draft) labels.add('draft');
  labels.add(changelogOk ? 'changelog:ok' : 'changelog:missing');

  return [...labels].sort();
};
