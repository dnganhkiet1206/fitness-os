/**
 * What somebody typed into the reps box.
 *
 * ── why a hold is typed and not a fifth column ──
 *
 * `log-workout.tsx`'s set row is already an index, a name, a weight, a rep
 * count and a delete button across a phone's width. Exercise Intelligence needs
 * one more number — the seconds of a plank or a hang, which have no reps at all
 * — and adding a fifth input would take the width out of the exercise name,
 * which is the field people actually read the row by.
 *
 * So a hold is written the way people already write it down: `45s`. The hint
 * under the sets says so, in both languages, next to the one it already gives
 * about leaving the weight empty.
 *
 * ── it lives here because it is a rule, not a widget ──
 *
 * Two screens write sets and both will need it, and the parsing has edges — a
 * bare `s`, `0s`, a decimal, a minus sign, whitespace — that are only checkable
 * if the function can be loaded without React. That is the same reason
 * `exercise-key.ts` and `sleep-window.ts` sit out here.
 */

/**
 * Bounds, and what they are for.
 *
 * Not training limits — nobody is being told they may not do a 400-rep set.
 * They are absurdity bounds, and they exist because this box can be pasted
 * into: `1e3` reads as one thousand repetitions through `Number`, and a single
 * pasted row like that would move a trend that six real sessions built. An hour
 * is the same idea for a hold.
 */
export const MAX_REPS = 1000;
export const MAX_HOLD_SEC = 3600;

export interface RepEntry {
  /** repetitions, or 0 for a hold */
  reps: number;
  /** seconds held, or null when this is an ordinary set */
  durationSec: number | null;
}

/**
 * `"8"` → 8 reps. `"45s"` → a 45-second hold. Anything unusable → 0 reps and no
 * duration, which every caller already treats as an unfinished row.
 *
 * Trailing `s` only, and case-insensitive: `45S` is the same thumb on the same
 * key. A leading unit (`s45`) is not accepted, because it is not a thing anybody
 * writes and accepting it would mean guessing at what else might be a unit.
 */
export function parseRepEntry(raw: string | null | undefined): RepEntry {
  const text = String(raw ?? '').trim();
  if (!text) return { reps: 0, durationSec: null };

  const held = /^(\d+(?:\.\d+)?)\s*s$/i.exec(text);
  if (held) {
    const sec = Math.round(Number(held[1]));
    /* `0s` is not a hold anybody did. It comes back as an unfinished row rather
       than as a zero-second one, for the same reason a set with no reps does. */
    return sec > 0 && sec <= MAX_HOLD_SEC ? { reps: 0, durationSec: sec } : { reps: 0, durationSec: null };
  }

  /*
    Digits, and nothing else.

    Not `Number(text)` with an integer test, which was the first version and let
    `1e3` through as one thousand repetitions — `Number` accepts scientific
    notation and `Number.isInteger(1000)` is perfectly true. The box is a
    number pad, a rep count is written in digits, and a pattern that says so
    rejects `1e3`, `+8`, `8.5`, `-5`, `Infinity` and `abc` in one line instead
    of in five tests that each have to be thought of.
  */
  if (!/^\d+$/.test(text)) return { reps: 0, durationSec: null };
  const n = Number(text);
  if (n <= 0 || n > MAX_REPS) return { reps: 0, durationSec: null };
  return { reps: n, durationSec: null };
}

/** Whether this row records anything at all. */
export const entered = (e: RepEntry): boolean => e.reps > 0 || (e.durationSec ?? 0) > 0;
