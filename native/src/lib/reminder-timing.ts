/**
 * What time a reminder should actually fire, from what the app already knows.
 *
 * ── the disconnect this exists to close ──
 *
 * Four reminder times were hand-typed constants: supplements 09:00, bedtime
 * 22:30, weigh-in 07:00, workout 17:00. They are the same four numbers for
 * everybody who installs the app.
 *
 * Meanwhile the onboarding flow **asks** for a bedtime and a waketime, stores
 * them in `sleep_target_bedtime` / `sleep_target_waketime`, and the sleep card
 * prints them back. So somebody who told the app "I go to bed at half past
 * midnight and get up at eight" receives:
 *
 *   · a wind-down reminder at 22:30 — two hours before they wind down, and
 *   · a weigh-in reminder at 07:00, **an hour before they wake up**.
 *
 * A notification that wakes somebody up is worse than no notification: it is
 * how an app teaches a person to turn notifications off, and then no reminder
 * works ever again. And the app was not missing the information — it had asked
 * for it, saved it, and was drawing it on the dashboard.
 *
 * The third source is the one this app built itself: `lib/user-rhythm.ts` learns
 * the hour somebody actually logs each thing, on circular statistics, and
 * refuses to claim a habit under six observations or below 0.6 agreement. Until
 * now it fed exactly two things — the worried face's cutoff and one sentence in
 * Koa's room — and never the one feature where an hour is the whole point.
 *
 * Duolingo calls this *smart scheduling* and offers it beside the manual time
 * rather than instead of it; their reminder timing is a bandit over each
 * learner's own engagement (KDD 2020). This is the small, honest version of the
 * same idea: the app proposes, the person taps once, and nothing moves on its
 * own — silently rescheduling somebody's alarm is not personalisation.
 *
 * ── what is deliberately not guessed ──
 *
 * **Supplements.** The app holds nothing about when anybody takes them. There
 * is no reading to derive one from, so there is no suggestion — an invented
 * time dressed as a learned one is worse than the constant it replaced.
 *
 * **Sleep's learned hour.** `noteDone('sleep', hour)` records when the sleep
 * *log* was written, and people log last night's sleep in the morning. Using it
 * for a bedtime reminder would schedule the wind-down alert for breakfast. The
 * bedtime suggestion comes from the profile — a time the person actually stated
 * about going to bed — and never from that.
 */

export type TimedReminder = 'supplements' | 'bedtime' | 'weighIn' | 'workout';

export interface Clock {
  hour: number;
  minute: number;
}

export interface Known {
  /** `sleep_target_bedtime`, `HH:MM` or `HH:MM:SS` */
  bedtime?: string | null;
  /** `sleep_target_waketime` */
  waketime?: string | null;
  /** the learned hour this person logs a workout — fractional, from `habit()` */
  workoutHour?: number | null;
}

/** A wind-down alert at bedtime is not a wind-down alert. */
export const WIND_DOWN_MIN = 30;
/** Weighing happens on getting up, not before. */
export const AFTER_WAKE_MIN = 15;
/**
 * How long before the usual logging hour a workout reminder lands.
 *
 * The learned hour is when the session was *written down*, which is after it
 * was done. A reminder at that hour arrives to somebody who has just finished.
 * An hour is the assumption — stated here rather than buried, and shown to the
 * person as both numbers so they can see what it was derived from.
 */
export const WORKOUT_LEAD_MIN = 60;

/**
 * How far a suggestion must be from the current setting to be worth offering.
 *
 * Under twenty minutes it is fiddling, and a row that offers to move an alarm
 * by eight minutes is a row people learn to ignore.
 */
export const WORTH_OFFERING_MIN = 20;

/** `HH:MM` / `HH:MM:SS` → minutes past midnight, or `null` if it is not one. */
export function parseClock(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!(h >= 0 && h <= 23) || !(min >= 0 && min <= 59)) return null;
  return h * 60 + min;
}

/** Minutes past midnight → a clock, wrapping the day rather than going negative. */
export function toClock(minutes: number): Clock {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return { hour: Math.floor(wrapped / 60), minute: wrapped % 60 };
}

/**
 * The time this reminder would fire if it were derived rather than typed.
 *
 * `null` means the app genuinely does not know — the row then keeps its own
 * time and says nothing, which is the correct behaviour for a first launch and
 * for anybody who never answered the sleep questions.
 */
export function suggestedTime(key: TimedReminder, known: Known): Clock | null {
  switch (key) {
    case 'bedtime': {
      const bed = parseClock(known.bedtime);
      /* Wrapping matters here and only here: a bedtime of 00:15 minus half an
         hour is 23:45 *the evening before*, not minus fifteen minutes. */
      return bed === null ? null : toClock(bed - WIND_DOWN_MIN);
    }
    case 'weighIn': {
      const wake = parseClock(known.waketime);
      return wake === null ? null : toClock(wake + AFTER_WAKE_MIN);
    }
    case 'workout': {
      const h = known.workoutHour;
      if (h == null || !Number.isFinite(h)) return null;
      return toClock(h * 60 - WORKOUT_LEAD_MIN);
    }
    case 'supplements':
      return null;
  }
}

/**
 * Is the suggestion far enough from what is set to be worth showing?
 *
 * Measured **around the clock**: 23:50 and 00:05 are fifteen minutes apart, and
 * an app that reads them as twenty-three hours apart would offer to move a
 * midnight alarm by a day.
 */
export function worthOffering(current: Clock, suggested: Clock): boolean {
  const a = current.hour * 60 + current.minute;
  const b = suggested.hour * 60 + suggested.minute;
  const raw = Math.abs(a - b);
  return Math.min(raw, 1440 - raw) >= WORTH_OFFERING_MIN;
}

/** `7:05` — for the one-line explanation beside the offer. */
export const formatClock = (c: Clock): string =>
  `${c.hour}:${String(c.minute).padStart(2, '0')}`;
