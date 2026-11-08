import { deleteFeedback, getFeedback, listFeedback, patchFeedback } from './admin.mjs';
import { authorizeViewer } from './access.mjs';
import { json } from './response.mjs';
import { renderViewerPage } from './viewer-page.mjs';

const statuses = ['new', 'triaged', 'resolved', 'wontfix'];
const targets = ['beta', 'production'];
const categories = ['bug', 'idea', 'praise', 'question', 'other'];
const corsFreeHeaders = { 'cache-control': 'no-store' };

function nonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pageResponse() {
  const value = nonce();
  const csp = `default-src 'none'; script-src 'nonce-${value}'; style-src 'nonce-${value}'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
  return new Response(renderViewerPage(value), { headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': csp,
  } });
}

const GROUP_COLUMNS = ['status', 'build_target', 'category'];

async function groupedCounts(db, column) {
  if (!GROUP_COLUMNS.includes(column)) throw new Error('Unsupported summary column');
  const result = await db.prepare(`SELECT ${column} AS value, COUNT(*) AS count FROM feedback GROUP BY ${column}`).all();
  return result.results;
}

function fillCounts(rows, keys) {
  const counts = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const row of rows) if (Object.hasOwn(counts, row.value)) counts[row.value] = row.count;
  return counts;
}

async function summary(db) {
  const totalRow = await db.prepare('SELECT COUNT(*) AS total FROM feedback').first();
  const [statusRows, targetRows, categoryRows] = await Promise.all([
    groupedCounts(db, 'status'), groupedCounts(db, 'build_target'), groupedCounts(db, 'category'),
  ]);
  return json({
    total: totalRow?.total ?? 0,
    byStatus: fillCounts(statusRows, statuses),
    byTarget: fillCounts(targetRows, targets),
    byCategory: fillCounts(categoryRows, categories),
  }, 200, corsFreeHeaders);
}

function isMutationAllowed(request, url) {
  if (request.headers.get('origin') !== url.origin) return false;
  return request.headers.get('x-gfc-viewer') === '1';
}

function feedbackId(pathname) {
  const match = pathname.match(/^\/admin\/api\/feedback\/([^/]+)$/);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return null; }
}

const feedbackRoutes = [
  { method: 'GET', withId: false, mutating: false, run: ({ url, env }) => listFeedback(url, env.FEEDBACK_DB) },
  { method: 'GET', withId: true, mutating: false, run: ({ id, env }) => getFeedback(id, env.FEEDBACK_DB) },
  { method: 'PATCH', withId: true, mutating: true, run: ({ request, id, env }) => patchFeedback(request, id, env.FEEDBACK_DB) },
  { method: 'DELETE', withId: true, mutating: true, run: ({ id, env }) => deleteFeedback(id, env.FEEDBACK_DB) },
];

async function runFeedbackRoute(request, url, env, id) {
  const route = feedbackRoutes.find((item) => item.method === request.method && item.withId === (id !== null));
  if (!route) return json({ error: 'Not found' }, 404);
  if (route.mutating && !isMutationAllowed(request, url)) return json({ error: 'Same-origin request required' }, 403);
  return route.run({ request, url, env, id });
}

async function dispatch(request, url, env) {
  if (['/admin', '/admin/'].includes(url.pathname) && request.method === 'GET') return pageResponse();
  if (url.pathname === '/admin/api/summary' && request.method === 'GET') return summary(env.FEEDBACK_DB);
  if (url.pathname === '/admin/api/feedback') return runFeedbackRoute(request, url, env, null);
  if (url.pathname.startsWith('/admin/api/feedback/')) {
    const id = feedbackId(url.pathname);
    if (id === null) return json({ error: 'Not found' }, 404, corsFreeHeaders);
    return runFeedbackRoute(request, url, env, id);
  }
  return json({ error: 'Not found' }, 404, corsFreeHeaders);
}

export async function handleViewer(request, env, url) {
  const auth = await authorizeViewer(request, env);
  if (auth.response) return auth.response;
  const response = await dispatch(request, url, env);
  for (const [name, value] of Object.entries(corsFreeHeaders)) response.headers.set(name, value);
  return response;
}
