/**
 * Where the backend is. The only file that knows.
 *
 * ── why this exists ──
 *
 * The project URL was written out in two places — the Supabase client, and
 * `use-coach-chat.tsx`, which builds a function URL by hand because it streams and
 * cannot use `functions.invoke`. Two is enough to get wrong: swapping projects
 * meant finding both, and missing the second one produces an app that reads and
 * writes against the new project while its coach talks to the old one. Nothing
 * would look broken.
 *
 * Everything that addresses the backend now comes from here, and
 * `tools/backend-config.mjs` fails the build if a project URL appears anywhere
 * else.
 *
 * ── swapping projects ──
 *
 * Set these in `.env` (see `.env.example`) and rebuild:
 *
 *     EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
 *     EXPO_PUBLIC_SUPABASE_KEY=<the publishable / anon key>
 *
 * `EXPO_PUBLIC_` is not decoration: Expo only inlines variables with that
 * prefix into the client bundle, so a variable named without it reads as
 * `undefined` at runtime and silently falls through to the default below —
 * which is the failure mode this whole file exists to prevent. `describe()`
 * reports which one is in use so that mistake is visible rather than inferred.
 *
 * The anon key is meant to ship in the client; row-level security is what
 * governs access. It is not a secret and does not need hiding.
 *
 * ── the defaults ──
 *
 * They point at the development project this app was built against. They are
 * fallbacks, not configuration: with no `.env` the app still runs, which is
 * what makes a fresh clone useful. When the real project arrives, set the two
 * variables; nothing else changes.
 */

const DEFAULT_URL = 'https://drqgonxrtmomgrftelih.supabase.co';
const DEFAULT_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRycWdvbnhydG1vbWdyZnRlbGloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NjQ3MjMsImV4cCI6MjA4NjQ0MDcyM30.aiDCz4d5A9IFWE1M0xGWXAWtN0dIfyJnm5E62stl1Wo';

/** Trailing slashes are easy to paste in and break every URL built from this. */
const trim = (u: string) => u.replace(/\/+$/, '');

export const SUPABASE_URL = trim(process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_URL);
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY || DEFAULT_KEY;

/** True when the app is talking to whatever was configured, not the fallback. */
export const USING_CONFIGURED_BACKEND = SUPABASE_URL !== DEFAULT_URL;

/**
 * Every edge function the app calls, in one place.
 *
 * Not a convenience — a checklist. Connecting a new project means deploying
 * exactly these six, and a name that exists in the app but not in the project
 * fails at the moment a user taps the feature rather than at deploy time. This
 * list is what `edge.ts` reports against, so a missing deployment says which
 * function is missing.
 *
 * Five of them have source in `supabase/functions/`; `delete-account` does not
 * and has to be written — see `docs/connecting-a-backend.md` §3.
 */
export const EDGE_FUNCTIONS = {
  mealSuggest: 'ai-meal-suggest',
  scanFood: 'scan-food',
  weeklyReview: 'ai-weekly-review',
  smartNudges: 'ai-smart-nudges',
  coach: 'ai-coach',
  coachMemory: 'ai-coach-memory',
  /**
   * Purchases. `verifyPurchase` is called by the app after a StoreKit
   * transaction; `store-webhook` is called by Apple and is on this list for the
   * same reason the others are — this list is the deployment checklist, and a
   * webhook that was never deployed fails silently for weeks.
   */
  verifyPurchase: 'verify-purchase',
  storeWebhook: 'store-webhook',
  /**
   * Not AI. Deleting an account means deleting the *auth* user, and no client
   * key can do that — it needs the service role, which must never ship in an
   * app. So it is a function like the others, and it is on this list because
   * this list is the deployment checklist.
   */
  deleteAccount: 'delete-account',
} as const;

export type EdgeFunction = (typeof EDGE_FUNCTIONS)[keyof typeof EDGE_FUNCTIONS];

/** Absolute URL for an edge function — for the streaming caller, which cannot
 *  go through `supabase.functions.invoke`. */
export const functionUrl = (name: EdgeFunction) => `${SUPABASE_URL}/functions/v1/${name}`;

/**
 * What the app is pointed at, for a diagnostics screen or a bug report.
 *
 * The key is reported by length and prefix only. It is not a secret, but a full
 * JWT in a screenshot is noise that makes the useful part harder to read.
 */
export function describeBackend() {
  return {
    url: SUPABASE_URL,
    usingConfigured: USING_CONFIGURED_BACKEND,
    keyPreview: `${SUPABASE_ANON_KEY.slice(0, 12)}… (${SUPABASE_ANON_KEY.length} chars)`,
    edgeFunctions: Object.values(EDGE_FUNCTIONS),
  };
}
