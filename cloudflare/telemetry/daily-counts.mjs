import { digest } from '../feedback/auth.mjs';

export const DAY_MS = 86_400_000;

export function utcDay(now) {
  return new Date(now).toISOString().slice(0, 10);
}

export async function dailyHash(secret, day, namespace, value) {
  if (!secret) throw new Error('TELEMETRY_HASH_SECRET is required');
  const salt = await digest(`${secret}:${day}`);
  return digest(`${namespace}:${salt}:${value}`);
}

export async function recordUnique(db, kind, day, hash) {
  const result = await db
    .prepare('INSERT OR IGNORE INTO telemetry_dedupe (kind, day, hash) VALUES (?, ?, ?)')
    .bind(kind, day, hash)
    .run();
  return (result?.meta?.changes ?? 0) > 0;
}

export async function purgeOldDedupe(db, currentDay) {
  await db.prepare('DELETE FROM telemetry_dedupe WHERE day < ?').bind(currentDay).run();
}
