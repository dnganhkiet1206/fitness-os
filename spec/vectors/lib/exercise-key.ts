/**
 * Are these two exercise names the same exercise?
 *
 * ── why this is a file and not two one-liners ──
 *
 * It was two one-liners, and they disagreed.
 *
 *   `day-progress.ts`     `(s ?? '').trim().toLowerCase()`
 *   `personal-record.ts`  `name.trim().toLowerCase().replace(/\s+/g, ' ')`
 *
 * So `"Bench  Press"` — two spaces, the ordinary result of a paste or a
 * thumb — was **one** exercise to the record detector and **two** to the
 * training week. The week said the scheduled lift had not been done, while the
 * record sheet was comparing those very rows against each other and celebrating
 * a personal record from them. Two screens describing the same session,
 * disagreeing, with nothing on either to explain it.
 *
 * This repository has now had that bug four times: `streakFrom`, two lists of
 * invalidate keys, two opinions on whether a reminder is late — and this one,
 * which I introduced myself while adding record detection. The pattern is
 * always the same and never looks like a bug in review: each copy is correct
 * where it is written, and wrong about the other.
 *
 * ── what it does ──
 *
 * Case-folds, trims, and collapses any run of whitespace to a single space, so
 * the comparison matches how a person reads the name rather than how it was
 * typed. Nullish becomes the empty string, which every caller already treats as
 * "cannot attribute this to anything".
 *
 * Deliberately no stemming, no synonym table, no punctuation stripping.
 * "Bench Press" and "Barbell Bench Press" are different names and the app has
 * no business deciding they are the same lift — that is the user's own
 * vocabulary, and guessing at it would silently merge two histories.
 */
export const exerciseKey = (name: string | null | undefined): string =>
  (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
