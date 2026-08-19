/**
 * The gate between the disk and the learner.
 *
 * ── why the arithmetic being right was not enough ──
 *
 * `bandit.ts` is correct. Measured against an independent Marsaglia–Tsang
 * sampler over 100 000 draws it matches the analytic mean and variance at every
 * shape; a thousand random histories of two hundred observations produced no
 * invalid posterior, `α + β` never passed `CAP`, and neither parameter ever fell
 * below 1. Every one of its functions is right about every input it was written
 * for.
 *
 * The inputs it was written for are not the inputs it gets. `loadPersonalModel`
 * did
 *
 *     arms: { ...base.arms, ...(parsed.arms ?? {}) }
 *
 * so whatever is in `ascnd_personal_model_v1` *is* the posterior. A blob that
 * `JSON.parse` accepts is a live model, and the things JSON accepts include
 * strings where numbers should be, `null`, `{}`, negative counts, and numbers
 * far larger than `CAP` — none of which any code between the disk and
 * `sampleBeta` looks at.
 *
 * ── what that bought, all of it measured through the real module ──
 *
 * **The app stops rendering.** `sampleBeta` draws Gamma(k) as the sum of k
 * exponentials, so its loop runs `alpha` times. That is exact and cheap for the
 * counts `reward()` produces, which is why it was written that way, and it is
 * unbounded for the counts the disk can produce:
 *
 *     alpha 1e6  →  0.9999998  in    37ms
 *     alpha 1e8  →  0.99999999 in  3212ms
 *     alpha 1e9  →  chưa bao giờ trả về (giết ở 8 giây)
 *     alpha 1e308→  chưa bao giờ trả về (giết ở 8 giây)
 *
 * `1e9` is a number JSON writes without comment. `rankQuests` runs inside a
 * `useMemo` on the Today render path, so this is not a slow frame, it is a dead
 * JS thread — on every launch, for ever, because the number is on the disk.
 *
 * **A corrupt count becomes a confident belief.** `reward()` does `alpha += 1`,
 * and `+` on a string concatenates:
 *
 *     {alpha:"5", beta:"2"}  +một lần thắng  →  {alpha:26, beta:1}
 *
 * `"5" + 1` is `"51"`, `"51" + "2"` reads as 512 which is past `CAP`, and the
 * halving turns it into twenty-six wins out of twenty-seven. Five-out-of-seven
 * became the most confident arm in the model, in valid integers, so nothing
 * downstream can ever tell it happened.
 *
 * **An arm becomes unbeatable, or impossible.** `{alpha:0, beta:0}` never trips
 * the `CAP` branch, so `beta` stays 0 through every reward; `sampleBeta` then
 * divides by `x + 0` and returns exactly **1** on every draw — that quest is
 * first in every ranking for the life of the install. `{alpha:-5}` is the mirror:
 * the loop runs zero times, the draw is exactly **0**, and the quest is last for
 * ever. Neither throws.
 *
 * **`mean` and `sampleBeta` disagree about the same arm.** For `{alpha:"5",
 * beta:"2"}`, `mean` computes `5 / "52"` = 0.096 while the sampler draws
 * Beta(5, 2) ≈ 0.87. The number shown and the number used are different beliefs.
 *
 * ── so the fix is one seam, not five patches ──
 *
 * Every one of those is the same sentence: *nothing checks the blob*. This is
 * the third time this chain has been found — `habit()` for the hour statistics,
 * `normaliseBudget` for the appearance budget, and now the beliefs — and the
 * cure has been the same each time. Coerce at the boundary, once, to exactly the
 * shape the arithmetic downstream already assumes, and let every function past
 * that point keep being written for the inputs it was written for.
 *
 * Unreadable falls back to the **prior**, not to a flat `newArm()`: the priors
 * are the editorial order, and a corrupt blob should cost somebody what the app
 * has learned, not what it always believed.
 */

import { CAP, newArm, type Arm } from './bandit';

/**
 * The largest count a real posterior can hold.
 *
 * Not a new rule — it is the one `reward()` already maintains. It halves once
 * `α + β` passes `CAP`, so a genuine arm never has either parameter above
 * `CAP − 1`, and anything above that did not come from the learner.
 */
export const MAX_COUNT = CAP - 1;

/**
 * A count is a whole number of observations between 1 and `MAX_COUNT`, or it did
 * not come from the learner.
 *
 * ── refused, not repaired ──
 *
 * Coercing is the tempting shape and it is the wrong one. `Number('')` is 0 and
 * `Number(null)` is 0, and neither means "zero observations"; `"5"` is not five
 * wins, it is a broken write, and reading it as five is the smaller half of what
 * turned it into twenty-six. Clamping is the same mistake at the top end — an
 * `alpha` of 1e9 held down to 39 is not a repaired belief, it is thirty-nine
 * wins the person never gave, and it would pin that quest first for the life of
 * the install.
 *
 * `reward()` produces integers in `[1, MAX_COUNT]` and nothing else does, so
 * anything outside that is not evidence and is answered with the prior.
 */
const isCount = (raw: unknown): raw is number =>
  typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= MAX_COUNT;

/**
 * One stored arm, made into something the sampler's preconditions hold for.
 *
 * @param fallback the arm to keep when the stored one is not an arm at all —
 *   this quest's prior, so forgetting is a return to the editorial order.
 */
export function normaliseArm(raw: unknown, fallback: Arm = newArm()): Arm {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fallback;
  const a = raw as Partial<Record<keyof Arm, unknown>>;
  /* Whole arms, never field by field — the same rule `mergeBudget` is written
     to. An arm is *one* belief: taking the prior's `alpha` alongside a stored
     `beta` builds a ratio nobody ever held, which is a worse answer than either
     of the two it was assembled from. */
  if (!isCount(a.alpha) || !isCount(a.beta)) return fallback;
  /* Each is inside `CAP` and their sum still has to be, or the next `reward()`
     halves an arm on its first observation. Halve rather than clamp here, so the
     ratio — which is the belief — survives. */
  if (a.alpha + a.beta > CAP) {
    return {
      alpha: Math.max(1, Math.round(a.alpha / 2)),
      beta: Math.max(1, Math.round(a.beta / 2)),
    };
  }
  return { alpha: a.alpha, beta: a.beta };
}

/**
 * The stored beliefs, restricted to the quests that exist.
 *
 * Keys are taken from `base` and nowhere else. `{...base.arms, ...parsed.arms}`
 * let the disk *add* arms: `{"arms":"nope"}` spreads a string into `{0:'n',
 * 1:'o', 2:'p', 3:'e'}`, and those four ranked alongside the real quests and
 * were written straight back out again on the next save. A quest the app does
 * not have is not a belief, it is debris.
 */
export function normaliseArms<K extends string>(
  base: Record<K, Arm>,
  raw: unknown,
): Record<K, Arm> {
  const stored = (typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {});
  const outp = {} as Record<K, Arm>;
  for (const key of Object.keys(base) as K[]) {
    outp[key] = normaliseArm(stored[key], base[key]);
  }
  return outp;
}

/**
 * The outstanding asks, restricted to the quests that exist.
 *
 * ── the crash this is between ──
 *
 * `settle()` walks `asked` and calls `reward(arms[k], false)` for every key that
 * is not today's. `arms` had been forced to hold every quest; `asked` had not
 * been forced to hold *only* quests. So a key in one and not the other threw
 * `Cannot destructure property 'alpha' of 'arm' as it is undefined` — and three
 * separate blobs reach it:
 *
 *     {"asked":{"ghost":"2026-08-18"}}      – một quest đã đổi tên
 *     {"asked":"nope"}                       – trải chuỗi thành {0:'n',1:'o',…}
 *     {"pending":{"quest":"ghost",…}}        – đường di trú v1 của chính app
 *
 * The third is the app's own migration, which copies `pending.quest` across
 * without ever asking whether it is still a quest. And the throw lands badly
 * twice over: `loadPersonalModel` calls `settleStale` *after* its `try`, so it
 * becomes an unhandled rejection, and `use-mascot` calls it from a `useEffect`,
 * where it is a red screen. It also throws before `save()`, so the key it choked
 * on is never cleaned up — the next launch does it again.
 */
export function normaliseAsked<K extends string>(
  base: Record<K, Arm>,
  raw: unknown,
): Partial<Record<K, string>> {
  const stored = (typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {});
  const outp: Partial<Record<K, string>> = {};
  for (const key of Object.keys(base) as K[]) {
    const day = stored[key];
    if (typeof day === 'string' && day !== '') outp[key] = day;
  }
  return outp;
}
