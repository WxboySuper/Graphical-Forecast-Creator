function createPayload(env, record) {
  const tag = record.build_target === 'beta' ? env.FEEDBACK_DISCORD_TAG_BETA : env.FEEDBACK_DISCORD_TAG_PROD;
  const trailer = `
**Page:** ${record.page}
**Version:** ${record.app_version}
**Plan:** ${record.plan ?? 'unknown'}
**ID:** ${record.id}`;
  // Truncate the message, never the trailer, so the ID needed to correlate a thread always survives.
  const description = `**Feedback:** ${record.message.slice(0, 4096 - 14 - trailer.length)}${trailer}`;
  return {
    thread_name: `[${record.build_target === 'beta' ? 'BETA' : 'PROD'}] ${record.category}: ${record.message.slice(0, 80)}`.slice(0, 100),
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

export async function notifyDiscord(env, ctx, record) {
  if (!env.FEEDBACK_DISCORD_WEBHOOK_URL) return;
  ctx.waitUntil((async () => {
    const status = await postDiscord(env, record);
    try {
      await env.FEEDBACK_DB.prepare('UPDATE feedback SET discord_status = ? WHERE id = ?').bind(status, record.id).run();
    } catch {
      // The feedback row is already stored; a failed status update must not surface as an unhandled rejection.
    }
  })());
}
