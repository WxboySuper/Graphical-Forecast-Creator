/** Shared JSON response helper for the feedback Worker modules. */
/** Every JSON response is private and non-sniffable, and callers cannot loosen this, because bodies can carry feedback text and opted-in emails. */
const SAFE_DEFAULTS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
export const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { ...headers, ...SAFE_DEFAULTS } });
