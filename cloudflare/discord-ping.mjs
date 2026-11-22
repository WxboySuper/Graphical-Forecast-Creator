// Shared by the feedback and telemetry Workers. Mentions only the configured user, never @everyone, @here, or roles.
const USER_ID = /^\d{5,25}$/;

/** Prefixes the payload with a mention of DISCORD_PING_USER_ID and allows exactly that one mention; unchanged when unset. */
export function withPing(env, payload) {
  const id = String(env.DISCORD_PING_USER_ID ?? '').trim();
  if (!USER_ID.test(id)) return payload;
  return {
    ...payload,
    content: payload.content ? `<@${id}> ${payload.content}` : `<@${id}>`,
    allowed_mentions: { parse: [], users: [id] },
  };
}
