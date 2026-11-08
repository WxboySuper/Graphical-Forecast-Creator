function createPayload(env, record) {
  const tag = record.build_target === 'beta' ? env.FEEDBACK_DISCORD_TAG_BETA : env.FEEDBACK_DISCORD_TAG_PROD;
  const description = `**Feedback:** ${record.message.slice(0, 3800)}\n**Page:** ${record.page}\n**Version:** ${record.app_version}\n**Plan:** ${record.plan ?? 'unknown'}\n**ID:** ${record.id}`.slice(0, 4096);
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
    await env.FEEDBACK_DB.prepare('UPDATE feedback SET discord_status = ? WHERE id = ?').bind(status, record.id).run();
  })());
}
