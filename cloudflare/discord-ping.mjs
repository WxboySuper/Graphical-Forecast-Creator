// Shared by the feedback and telemetry Workers. Mentions only the configured user, never @everyone, @here, or roles.
const USER_ID = /^\d{5,25}$/;

/** Prefixes the payload with a mention of DISCORD_PING_USER_ID and allows exactly that one mention; unchanged when unset. */
export function withPing(env, payload) {
  if (!payload) return payload;
  const id = String(env?.DISCORD_PING_USER_ID ?? '').trim();
  if (!USER_ID.test(id)) return payload;
  return {
    ...payload,
    content: payload.content ? `<@${id}> ${payload.content}` : `<@${id}>`,
    allowed_mentions: { parse: [], users: [id] },
  };
}

/**
 * True when a Discord 400 is about threads: a text channel refusing thread_name or applied_tags, a forum needing a
 * thread, or an unknown thread.
 * An unreadable body still counts, so the text-channel fallback never regresses; other validation errors are not retried.
 */
export async function rejectsForumFields(response) {
  if (response.status !== 400) return false;
  let text;
  try { text = await response.text(); } catch { return true; }
  return !text || /thread|forum|applied_tags|unknown channel/i.test(text);
}
