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

const DEFAULT_URL = 'https://guqmbqtgxqleuwajvwvg.supabase.co';
const DEFAULT_KEY = 'sb_publishable_HU-mMPAU34iCDOHOukYPWA_XY_Vh9nX';

/** Trailing slashes are easy to paste in and break every URL built from this. */
const trim = (u: string) => u.replace(/\/+$/, '');

export const SUPABASE_URL = trim(process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_URL);
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY || DEFAULT_KEY;

/**
 * The URL and the key have to name the same project.
 *
 * ── the failure this exists to stop ──
 *
 * They are two variables and they are a PAIR. Swapping projects by changing one
 * of them — the URL in the code, the key left in `.env`, or the other way round
 * — produces an app where every single request is rejected, the sign-in screen
 * fails with nothing informative, and no screen has any data. There is no error
 * anywhere that says "these do not match"; there is just an app that does not
 * work, and a search for the bug in the wrong place.
 *
 * A Supabase anon key is a JWT whose payload names its project:
 * `{"iss":"supabase","ref":"<project-ref>","role":"anon"}`. So the mismatch is
 * not something to be careful about — it is something that can be READ, here,
 * before anything tries to use it.
 *
 * Newer projects issue `sb_publishable_…` keys instead, which carry no claims.
 * Those are skipped rather than guessed at: a check that invents a verdict it
 * cannot support is worse than no check.
 */
function projectOf(url: string): string | null {
  return /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url)?.[1] ?? null;
}

function keyProject(key: string): string | null {
  if (!key.startsWith('ey')) return null; // sb_publishable_… — nothing to read
  try {
    const body = key.split('.')[1];
    if (!body) return null;
    const json = JSON.parse(
      /* `atob` rather than Buffer: this runs in the app, where Node globals are
         not there. base64url is not base64, so the two swapped characters and
         the missing padding have to be put back first. */
      atob(body.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(body.length / 4) * 4, '=')),
    ) as { ref?: unknown };
    return typeof json.ref === 'string' ? json.ref : null;
  } catch {
    return null;
  }
}

{
  const fromUrl = projectOf(SUPABASE_URL);
  const fromKey = keyProject(SUPABASE_ANON_KEY);
  if (fromUrl && fromKey && fromUrl !== fromKey) {
    throw new Error(
      `Supabase URL and key name different projects: URL is "${fromUrl}", key is "${fromKey}". ` +
        'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY together from the same ' +
        "project's API settings — a key from another project is rejected on every request.",
    );
  }
}

/**
 * True when `.env` actually supplied the backend, rather than the defaults.
 *
 * This used to be `SUPABASE_URL !== DEFAULT_URL`, which answered the question
 * by accident: it was only ever right while the default pointed at a project
 * nobody would configure on purpose. Now that the default IS the real project,
 * that test reads false for a correctly configured app — the diagnostics screen
 * would report "running on the fallback" to somebody whose `.env` is perfect.
 *
 * Ask the thing being asked: were the variables set.
 */
export const USING_CONFIGURED_BACKEND =
  Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL) && Boolean(process.env.EXPO_PUBLIC_SUPABASE_KEY);

/**
 * Every edge function the app calls, in one place.
 *
 * Not a convenience — a checklist. Connecting a new project means deploying
 * exactly these six, and a name that exists in the app but not in the project
 * fails at the moment a user taps the feature rather than at deploy time. This
 * list is what `edge.ts` reports against, so a missing deployment says which
 * function is missing.
 *
 * All of them have source in `supabase/functions/`. Having source is not the
 * same as being deployed, which is the whole reason this list exists: the app
 * reports `not-deployed` per function name, and `delete-account` is the one
 * that has not been pushed to any project yet.
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
