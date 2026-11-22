import { rejectsForumFields, withPing } from '../discord-ping.mjs';

// Truncate by code point so an emoji at the boundary is never split into a lone surrogate.
const truncate = (text, max) => Array.from(text).slice(0, max).join('');

function createPayload(env, record) {
  const tag = record.build_target === 'beta' ? env.FEEDBACK_DISCORD_TAG_BETA : env.FEEDBACK_DISCORD_TAG_PROD;
  const trailer = `
**Page:** ${record.page}
**Version:** ${record.app_version}
**Plan:** ${record.plan ?? 'unknown'}
**ID:** ${record.id}`;
  // Truncate the message, never the trailer, so the ID needed to correlate a thread always survives.
  const description = `**Feedback:** ${truncate(record.message, Math.max(0, 4096 - 14 - trailer.length))}${trailer}`;
  // New submissions ping DISCORD_PING_USER_ID when set; status updates stay silent.
  return withPing(env, {
    thread_name: truncate(`[${record.build_target === 'beta' ? 'BETA' : 'PROD'}] ${record.category}: ${truncate(record.message, 80)}`, 100),
    content: `Feedback ${record.id}`,
    embeds: [{ description }],
    allowed_mentions: { parse: [] },
    ...(tag ? { applied_tags: [tag] } : {}),
  });
}

// Forum posts answer with the new thread as channel_id; keep it so later status updates land in that thread.
async function threadIdFrom(response) {
  try {
    const message = await response.json();
    return /^\d{1,25}$/.test(message?.channel_id ?? '') ? message.channel_id : null;
  } catch {
    return null;
  }
}

async function post(env, webhookUrl, payload, threadId = null) {
  const url = new URL(webhookUrl);
  url.searchParams.set('wait', 'true');
  if (threadId) url.searchParams.set('thread_id', threadId);
  return (env.FETCH ?? fetch)(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
}

// Only forum webhooks accept thread_name and applied_tags; a text-channel webhook answers 400, so retry once without them.
function textChannelPayload(payload) {
  const rest = { ...payload };
  delete rest.thread_name;
  delete rest.applied_tags;
  return rest;
}

async function sendWebhook(env, payload) {
  try {
    const response = await post(env, env.FEEDBACK_DISCORD_WEBHOOK_URL, payload);
    if (response.ok) return { status: 'sent', threadId: await threadIdFrom(response) };
    if (!(await rejectsForumFields(response))) return { status: 'failed', threadId: null };
    // A text-channel post has no thread of its own, so no thread ID is stored and updates post to the channel.
    const retry = await post(env, env.FEEDBACK_DISCORD_WEBHOOK_URL, textChannelPayload(payload));
    return { status: retry.ok ? 'sent' : 'failed', threadId: null };
  } catch {
    return { status: 'failed', threadId: null };
  }
}

export async function postDiscord(env, record) {
  if (!env.FEEDBACK_DISCORD_WEBHOOK_URL) return { status: 'disabled', threadId: null };
  return sendWebhook(env, createPayload(env, record));
}

async function deliver(env, record) {
  let result = { status: 'failed', threadId: null };
  try {
    result = await postDiscord(env, record);
  } catch {
    // Building or sending the payload failed; the row is stored and is marked failed below.
  }
  try {
    await env.FEEDBACK_DB.prepare('UPDATE feedback SET discord_status = ?, discord_thread_id = ? WHERE id = ?').bind(result.status, result.threadId, record.id).run();
  } catch {
    // A failed status update must not surface as an unhandled rejection.
  }
}

export async function notifyDiscord(env, ctx, record) {
  if (!env.FEEDBACK_DISCORD_WEBHOOK_URL) return;
  const task = deliver(env, record);
  // Without an execution context (direct calls, tests) wait inline so the work is never dropped.
  if (ctx?.waitUntil) ctx.waitUntil(task);
  else await task;
}

const STATUS_LABELS = { new: 'New', read: 'Read', handled: 'Handled' };

export function statusUpdatePayload(item, status) {
  const target = item.build_target === 'beta' ? 'BETA' : 'PROD';
  return {
    content: `Feedback ${item.id} marked **${STATUS_LABELS[status] ?? status}**`,
    embeds: [{ description: `[${target}] ${item.category}: ${truncate(item.message, 200)}` }],
    allowed_mentions: { parse: [] },
  };
}

// A separate updates webhook takes every update. Otherwise the update goes into the item's forum thread when
// one is known, or straight to the main webhook's channel (a text channel, or an item without a stored thread).
function updateTarget(env, item) {
  if (env.FEEDBACK_DISCORD_UPDATES_WEBHOOK_URL) return { url: env.FEEDBACK_DISCORD_UPDATES_WEBHOOK_URL, threadId: null };
  if (env.FEEDBACK_DISCORD_WEBHOOK_URL) return { url: env.FEEDBACK_DISCORD_WEBHOOK_URL, threadId: item.discord_thread_id ?? null };
  return null;
}

// A deleted stored thread answers 404; otherwise only a thread-related 400 (a forum needing a thread, or an
// unknown thread) starts a new thread, so payload validation errors are not retried.
async function needsNewThread(response, threadId) {
  if (threadId && response.status === 404) return true;
  return rejectsForumFields(response);
}

async function rememberThread(env, id, threadId) {
  if (!threadId) return;
  try { await env.FEEDBACK_DB.prepare('UPDATE feedback SET discord_thread_id = ? WHERE id = ?').bind(threadId, id).run(); }
  catch { /* The update was posted; a later update will simply start another thread. */ }
}

async function deliverStatusUpdate(env, id, status) {
  try {
    const item = await env.FEEDBACK_DB.prepare('SELECT id, category, message, build_target, discord_thread_id FROM feedback WHERE id = ?').bind(id).first();
    const target = item && updateTarget(env, item);
    if (!target) return 'skipped';
    const payload = statusUpdatePayload(item, status);
    const response = await post(env, target.url, payload, target.threadId);
    if (response.ok) return 'sent';
    if (!(await needsNewThread(response, target.threadId))) return 'failed';
    // Start a fresh forum thread: the post was threadless on a forum, or the stored thread is gone.
    const retry = await post(env, target.url, { ...payload, thread_name: truncate(`Update: ${item.category} ${item.id}`, 100) });
    if (!retry.ok) return 'failed';
    await rememberThread(env, item.id, await threadIdFrom(retry));
    return 'sent';
  } catch {
    // Notifications are best effort; the status change is already stored.
    return 'failed';
  }
}

export async function notifyStatusUpdate(env, ctx, id, status) {
  if (!env.FEEDBACK_DISCORD_UPDATES_WEBHOOK_URL && !env.FEEDBACK_DISCORD_WEBHOOK_URL) return;
  const task = deliverStatusUpdate(env, id, status);
  if (ctx?.waitUntil) ctx.waitUntil(task);
  else await task;
}
