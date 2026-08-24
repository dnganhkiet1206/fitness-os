/**
 * What a person is told when a write fails.
 *
 * ── the bug this exists for ──
 *
 * Forty-odd call sites were `onError: (e: Error) => toast.error(e.message)`,
 * and the thing they throw is whatever Supabase handed back — so the message
 * shown in the pop-up is the message PostgreSQL wrote for a developer.
 * Measured against this app's own schema on PostgreSQL 16.13:
 *
 *     permission denied for table daily_logs
 *     duplicate key value violates unique constraint "daily_logs_user_id_date_key"
 *     null value in column "user_id" of relation "daily_logs" violates not-null constraint
 *     invalid input syntax for type date: "not-a-date"
 *     new row violates row-level security policy for table "meal_entries"
 *
 * Table names, constraint names, column names and SQL type names, in English,
 * in a toast, to somebody who tapped Save. It is frightening rather than
 * informative: none of it names anything the reader can do, and "permission
 * denied" reads like an accusation when it usually means the session expired.
 *
 * ── the rule ──
 *
 * An error the **app** wrote is already a sentence for a person — `plausible.ts`
 * explains that 600 bpm is out of range, `health-sync-write.ts` says which day
 * failed to rebuild. Those must keep showing. An error a **system** wrote is
 * for a developer, and the reader gets a sentence about what happened and what
 * to do instead.
 *
 * The two are told apart by shape, not by a list of message texts: PostgREST
 * and GoTrue errors carry a `code` (SQLSTATE like `23505`, or `PGRST116`) or an
 * HTTP `status`; an `Error` the app constructed carries neither. That is a
 * property of the object rather than of its wording, so it survives a new
 * message being added anywhere without this file being told.
 *
 * ── why it returns a key ──
 *
 * The toast store is module-level and the language lives in React context, so
 * nothing here can localize. It returns a key and `NeonToastHost` renders it —
 * the same "store a token, localize at render" split `readiness-i18n.ts` uses,
 * and the reason a person who switches language mid-session sees the new
 * wording rather than the wording that was active when the write failed.
 *
 * Nothing here imports anything, so `tools/error-copy.mjs` can compile it and
 * run the real function against the real error shapes.
 */

/** What went wrong, at the granularity a reader can act on. */
export type FailureKind =
  /** never reached the server */
  | 'offline'
  /** the session is gone, or the row belongs to somebody else */
  | 'signed-out'
  /** this row already exists — usually a double tap */
  | 'duplicate'
  /** the value itself is not storable: wrong shape, out of range, too long */
  | 'invalid'
  /** it was there a moment ago and is not now */
  | 'not-found'
  /** the server answered, and the answer was that it fell over */
  | 'server'
  /** reached it, came back in a shape we do not understand */
  | 'unknown';

/** Message keys, so the host shows the right something. */
export const FAILURE_KEY: Record<FailureKind, string> = {
  offline: 'errOffline',
  'signed-out': 'errSignedOut',
  duplicate: 'errDuplicate',
  invalid: 'errInvalid',
  'not-found': 'errNotFound',
  server: 'errServer',
  unknown: 'errUnknown',
};

/** SQLSTATE classes this app can actually produce, mapped once. */
const SQLSTATE: Record<string, FailureKind> = {
  '23505': 'duplicate', // unique_violation
  '23503': 'invalid', // foreign_key_violation
  '23502': 'invalid', // not_null_violation
  '23514': 'invalid', // check_violation
  '22001': 'invalid', // string_data_right_truncation
  '22003': 'invalid', // numeric_value_out_of_range
  '22007': 'invalid', // invalid_datetime_format
  '22P02': 'invalid', // invalid_text_representation
  '42501': 'signed-out', // insufficient_privilege — RLS, in practice a dead session
  '42703': 'server', // undefined_column: a schema/client mismatch, not the reader's doing
  '42P01': 'server', // undefined_table
  PGRST116: 'not-found', // no rows where exactly one was required
  PGRST301: 'signed-out', // JWT expired
};

/**
 * Did a **system** write this, or did the app?
 *
 * `null` means the app wrote it and its own message should be shown. Anything
 * else is a kind whose copy replaces the raw text.
 */
export function classifyError(err: unknown): FailureKind | null {
  if (err == null || typeof err !== 'object') return null;
  const e = err as { code?: unknown; status?: unknown; name?: unknown; message?: unknown };

  const code = typeof e.code === 'string' ? e.code : null;
  const status = typeof e.status === 'number' ? e.status : null;
  const name = typeof e.name === 'string' ? e.name : '';
  const message = typeof e.message === 'string' ? e.message : '';

  /*
    A fetch that never landed. `TypeError: Network request failed` is what
    React Native throws, and it has no code and no status — so it would
    otherwise read as app-authored and put "Network request failed" on screen.
    Matched on the two shapes RN and undici actually produce rather than on the
    word "network", which a real sentence could contain.
  */
  if (name === 'TypeError' && /network request failed|failed to fetch|load failed/i.test(message)) {
    return 'offline';
  }
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT') return 'offline';

  /* Not a system error: no code, no status, no auth-error name. */
  const isAuthError = /^Auth\w*Error$/.test(name);
  if (code == null && status == null && !isAuthError) return null;

  if (code != null && SQLSTATE[code]) return SQLSTATE[code];

  if (status === 401 || status === 403) return 'signed-out';
  if (status === 404) return 'not-found';
  if (status === 409) return 'duplicate';
  if (status === 422 || status === 400) return 'invalid';
  if (status != null && status >= 500) return 'server';

  /*
    A code we do not have a case for is still a system error — showing its raw
    text is the thing this file exists to stop, so it becomes `unknown` rather
    than falling through to the message.
  */
  return 'unknown';
}

/**
 * The i18n key to show for a failure, or `null` to show the error's own text.
 *
 * One call at each `onError`, so a screen never decides this for itself.
 */
export function failureKeyFor(err: unknown): string | null {
  const kind = classifyError(err);
  return kind == null ? null : FAILURE_KEY[kind];
}

/**
 * The sentence to show, for a caller that needs one **now**.
 *
 * `Alert.alert` takes a string rather than rendering a component, so the toast
 * host's resolve-at-render trick is not available to it. Screens using an alert
 * pass their own dictionary instead; the classification is still this file's,
 * so an alert and a toast say the same thing about the same failure.
 */
export function errorText(err: unknown, dict: Record<string, unknown>): string {
  const key = failureKeyFor(err);
  if (key != null) {
    /* The dictionary is not uniformly strings — one entry is a nested map — so
       the lookup is checked rather than cast. A key with no copy yields an
       empty string, which the callers treat as "fall back to your own line". */
    const copy = dict[key];
    return typeof copy === 'string' ? copy : '';
  }
  return err instanceof Error ? err.message : String(err ?? '');
}
