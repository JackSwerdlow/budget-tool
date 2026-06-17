// Both adapters must surface failures as one shape so the UI's error handling is
// transport-agnostic: http.ts throws Error on !res.ok; the SQL plugin rejects with a
// different shape (often a string or { message }).
export function normalizeError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (typeof e === 'string') return new Error(e);
  if (e && typeof e === 'object' && 'message' in e) return new Error(String((e as { message: unknown }).message));
  return new Error('Unknown data error');
}
