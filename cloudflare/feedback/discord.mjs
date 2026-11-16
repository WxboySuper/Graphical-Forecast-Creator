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
  return {
    thread_name: truncate(`[${record.build_target === 'beta' ? 'BETA' : 'PROD'}] ${record.category}: ${truncate(record.message, 80)}`, 100),
    content: `Feedback ${record.id}`,
    embeds: [{ description }],
    allowed_mentions: { parse: [] },
    ...(tag ? { applied_tags: [tag] } : {}),
  };
}

async function sendWebhook(env, payload) {
  try {
    const url = new URL(env.FEEDBACK_DISCORD_WEBHOOK_URL);
    url.searchParams.set('wait', 'true');
    const response = await (env.FETCH ?? fetch)(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    return response.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

export async function postDiscord(env, record) {
  if (!env.FEEDBACK_DISCORD_WEBHOOK_URL) return 'disabled';
  return sendWebhook(env, createPayload(env, record));
}

async function deliver(env, record) {
  let status = 'failed';
  try {
    status = await postDiscord(env, record);
  } catch {
    // Building or sending the payload failed; the row is stored and is marked failed below.
  }
  try {
    await env.FEEDBACK_DB.prepare('UPDATE feedback SET discord_status = ? WHERE id = ?').bind(status, record.id).run();
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
