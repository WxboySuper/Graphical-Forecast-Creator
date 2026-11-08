/** Shared JSON response helper for the feedback Worker modules. */
export const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers });
