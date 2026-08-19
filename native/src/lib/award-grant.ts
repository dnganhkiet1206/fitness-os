/**
 * Which medals a person has earned, and how to tell "already had it" from
 * "something went wrong".
 *
 * ── why this is a file and not four `if`s inside the hook ──
 *
 * The same reason `health-days.ts` and `step-days.ts` are files: the decision
 * lives inside `useCheckAwards`, which imports React and Supabase and cannot be
 * loaded in Node — and an award is the one thing in this app that is
 * **permanent**. `awards` carries `UNIQUE (user_id, award_key)` and no UPDATE
 * policy, so a row written here is history, and history that can only be
 * reviewed by reading is history nobody checks.
 *
 * ── the two bugs this was written for ──
 *
 * **1. A duplicate was recognised by the English words in a PostgreSQL error.**
 *
 *     if (error && !error.message.includes('duplicate')) throw error;
 *
 * The message really is `duplicate key value violates unique constraint
 * "awards_user_id_award_key_key"` — measured on PostgreSQL 16.13 — so it works
 * today, and it is the third time this exact shape has been found here:
 * `DailyLogRebuildError` and `WrongAccountError` are both classes rather than
 * message prefixes *because a decision keyed on the wording of a string breaks
 * the first time somebody rewords the string*, and Chain P's deleted-account
 * check was re-anchored from a variable name to `404 || user_not_found` for the
 * same reason. `code` is right there, it is `23505`, and it is the part of the
 * contract that does not get reworded.
 *
 * And the blast radius is not one medal. A `grant` that throws leaves
 * `checkAndGrant`'s single outer `catch {}` to swallow it, and **every award
 * after it in that pass is skipped** — silently.
 *
 * **2. One award's failure cost all the others.** The pass granted awards one
 * after another inside a single `try`, so an insert refused for any reason took
 * the rest of the list with it. Measured, with the first grant failing:
 *
 *     grant streak_3   → lỗi
 *     first_workout    → KHÔNG được xét
 *     steps_10k        → KHÔNG được xét
 *
 * Awards are independent facts about a person. Nothing about a failed streak
 * medal says anything about whether they have logged their first workout, and a
 * failure that is deterministic — a refusal rather than a blip — means the
 * unrelated medals are never granted at all.
 *
 * ── what is deliberately NOT decided here ──
 *
 * Whether an award should survive its condition becoming false. Every medal in
 * the catalogue is written once and never revisited, which reads as *historical
 * achievement* semantics, and nothing in the repository states it. See the
 * Chain T product-decision note in `docs/FORENSIC-AUDIT.md`.
 */

/** The medal catalogue — structure and thresholds only. Display text lives in
 *  `gamification-i18n` (`AWARD_TEXT`), keyed by `key`. */
export const AWARD_DEFINITIONS = [
  { key: 'streak_3', type: 'streak', icon: 'flame', tier: 'bronze', requirement: 3 },
  { key: 'streak_7', type: 'streak', icon: 'flame', tier: 'silver', requirement: 7 },
  { key: 'streak_14', type: 'streak', icon: 'flame', tier: 'gold', requirement: 14 },
  { key: 'streak_30', type: 'streak', icon: 'flame', tier: 'platinum', requirement: 30 },
  /* Past a month the ladder used to stop, which is the wrong end to stop at:
     the people still logging on day 100 are the ones the app is working for,
     and they were being told nothing. These stay platinum because a new tier
     would mean a new colour in `TIER_CONFIG` and a value the awards table has
     never seen — the escalation is in the names and in how rare they are. */
  { key: 'streak_60', type: 'streak', icon: 'flame', tier: 'platinum', requirement: 60 },
  { key: 'streak_100', type: 'streak', icon: 'flame', tier: 'platinum', requirement: 100 },
  { key: 'streak_180', type: 'streak', icon: 'flame', tier: 'platinum', requirement: 180 },
  { key: 'streak_365', type: 'streak', icon: 'flame', tier: 'platinum', requirement: 365 },
  { key: 'first_workout', type: 'first_workout', icon: 'dumbbell', tier: 'bronze' },
  { key: 'workouts_10', type: 'volume_milestone', icon: 'dumbbell', tier: 'silver', requirement: 10 },
  { key: 'workouts_50', type: 'volume_milestone', icon: 'dumbbell', tier: 'gold', requirement: 50 },
  { key: 'workouts_100', type: 'volume_milestone', icon: 'dumbbell', tier: 'platinum', requirement: 100 },
  { key: 'first_pr', type: 'pr', icon: 'trophy', tier: 'silver' },
  { key: 'pr_5', type: 'pr', icon: 'trophy', tier: 'gold', requirement: 5 },
  { key: 'steps_10k', type: 'steps_goal', icon: 'footprints', tier: 'bronze' },
] as const;

export type AwardDef = (typeof AWARD_DEFINITIONS)[number];

/**
 * What the four source reads found.
 *
 * `null` means *"this could not be read"*, and it is not the same as zero. A
 * failed query used to arrive here as `undefined` and be indistinguishable from
 * "no workouts yet" — which is harmless for a threshold that is never met, and
 * exactly the shape that grants nothing while looking like it decided
 * something. Nothing below reads a `null` as evidence.
 */
export interface AwardSources {
  /** consecutive logged days, from `streakFrom` */
  streak: number | null;
  workoutCount: number | null;
  prCount: number | null;
  /** today's step count */
  steps: number | null;
}

/** A number that can be compared against a threshold at all. */
function usable(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Every medal earned and not yet held.
 *
 * Pure, and total: given the same sources and the same earned set it returns
 * the same list, in catalogue order, with no duplicates. The caller grants them
 * one at a time and one failure does not touch the rest.
 */
export function awardsToGrant(sources: AwardSources, earned: ReadonlySet<string>): AwardDef[] {
  const out: AwardDef[] = [];
  const add = (key: string) => {
    if (earned.has(key)) return;
    const def = AWARD_DEFINITIONS.find((d) => d.key === key);
    if (def && !out.includes(def)) out.push(def);
  };

  if (usable(sources.streak)) {
    for (const def of AWARD_DEFINITIONS) {
      if (def.type === 'streak' && 'requirement' in def && sources.streak >= def.requirement) add(def.key);
    }
  }
  if (usable(sources.workoutCount)) {
    if (sources.workoutCount >= 1) add('first_workout');
    for (const key of ['workouts_10', 'workouts_50', 'workouts_100'] as const) {
      const def = AWARD_DEFINITIONS.find((d) => d.key === key)!;
      if ('requirement' in def && sources.workoutCount >= def.requirement) add(key);
    }
  }
  if (usable(sources.prCount)) {
    if (sources.prCount >= 1) add('first_pr');
    if (sources.prCount >= 5) add('pr_5');
  }
  if (usable(sources.steps) && sources.steps >= 10000) add('steps_10k');

  return out;
}

/**
 * Did this insert fail because the medal was already there?
 *
 * `23505` is PostgreSQL's unique-violation SQLSTATE, forwarded by PostgREST as
 * `code`. It is the same value whatever language the server speaks and whatever
 * the constraint is called — both of which the message contains and neither of
 * which is a contract.
 */
export function isDuplicateAward(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === '23505';
}

/**
 * Grant every medal on the list, each on its own.
 *
 * The loop is here rather than in the hook because *"one failure must not cost
 * the others"* is the invariant, and an invariant that lives inside a React
 * callback cannot be run. `grantOne` is whatever actually writes the row.
 *
 * Returns what happened, so the caller can decide whether anything needs
 * refreshing — and so a test can assert that a refusal in the middle of the
 * list left the medals on both sides of it alone.
 */
export async function grantAll(
  defs: readonly AwardDef[],
  grantOne: (def: AwardDef) => Promise<void>,
): Promise<{ granted: string[]; failed: string[] }> {
  const granted: string[] = [];
  const failed: string[] = [];
  for (const def of defs) {
    try {
      await grantOne(def);
      granted.push(def.key);
    } catch {
      /* This medal did not land. The next pass will try it again, and every
         other medal on the list is a separate fact about a separate thing. */
      failed.push(def.key);
    }
  }
  return { granted, failed };
}
