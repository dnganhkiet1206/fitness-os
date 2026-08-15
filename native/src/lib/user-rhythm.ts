/**
 * What time of day this person actually does each thing.
 *
 * ── why the app needs it ──
 *
 * Every "when" in the app is a constant somebody typed. Koa starts worrying
 * about the streak at 18:00; the nudge windows open at 11:00 and 14:00 and
 * 16:00. Those numbers describe an imagined person who eats lunch at noon and
 * trains after work. For the nurse on nights they are not slightly off, they
 * are inverted — the app is anxious while she sleeps and silent while she
 * trains.
 *
 * Send-time personalisation is the least glamorous and most effective thing the
 * large recommenders do, and it needs no model of *what* somebody wants: only
 * when they are actually there. This is that, for one person, on their phone.
 *
 * ── why the arithmetic is not an average ──
 *
 * Hours are a circle. Somebody who logs supper at 23:00, 00:00 and 01:00 has a
 * habit at **midnight**, and the arithmetic mean of 23, 0 and 1 is **8 in the
 * morning** — a number that is not merely imprecise, it is on the other side of
 * the day, and it is the answer every naive implementation gives.
 *
 * So each observation is a unit vector at `2π · hour / 24`, and the habit is the
 * direction of their sum (Fisher, *Statistical Analysis of Circular Data*). The
 * length of that sum divided by the count is **R**, between 0 and 1: how much
 * the person agrees with themselves. R near 1 is a clock; R near 0 is somebody
 * with no pattern at all, and the honest thing to do with that is nothing —
 * `habit()` returns `null` rather than a confident time nobody keeps.
 *
 * ── it learns from use, and asks nothing ──
 *
 * No history query and no new table: one running sum per thing, updated the
 * moment the app sees a quest go from undone to done. Ten bytes of state,
 * accumulated on the device, never sent anywhere.
 */

/** Running circular sums. `n` is the count; the sums are of unit vectors. */
export interface HourStat {
  n: number;
  sin: number;
  cos: number;
}

export const emptyHours = (): HourStat => ({ n: 0, sin: 0, cos: 0 });

const TAU = Math.PI * 2;
const toAngle = (hour: number) => (TAU * (((hour % 24) + 24) % 24)) / 24;

/** Fold one "they did it at this hour" into the running sums. */
export function observeHour(s: HourStat, hour: number): HourStat {
  const a = toAngle(hour);
  return { n: s.n + 1, sin: s.sin + Math.sin(a), cos: s.cos + Math.cos(a) };
}

/**
 * Fewer than this and there is no habit, only a coincidence.
 *
 * Three observations at the same hour give R = 1, which is perfect agreement
 * and means nothing — everybody's first three of anything agree.
 */
export const MIN_OBS = 6;

/**
 * How much agreement counts as a habit.
 *
 * R = 0.6 is roughly a circular standard deviation of an hour and a half, which
 * is about as loose as "she trains in the evening" can be and still be worth
 * acting on.
 */
export const MIN_R = 0.6;

export interface Habit {
  /** the habitual hour, 0–24, fractional */
  hour: number;
  /** agreement, 0–1 — 1 is a metronome */
  strength: number;
  /** circular standard deviation, in hours */
  spread: number;
}

/** The habit, or `null` when there is not enough agreement to claim one. */
export function habit(s: HourStat): Habit | null {
  if (s.n < MIN_OBS) return null;
  const r = Math.sqrt(s.sin * s.sin + s.cos * s.cos) / s.n;
  if (r < MIN_R) return null;

  let angle = Math.atan2(s.sin, s.cos);
  if (angle < 0) angle += TAU;

  /* Circular standard deviation: √(−2 ln R) radians. It goes to 0 as agreement
     goes to perfect and to infinity as it goes to none, which is why `MIN_R`
     gates it — without that this can return a spread wider than the day. */
  const spreadRad = Math.sqrt(-2 * Math.log(r));

  return {
    hour: (angle / TAU) * 24,
    strength: r,
    spread: (spreadRad / TAU) * 24,
  };
}


/**
 * The hour by which this person is *late* for something, or `null`.
 *
 * Habit plus a margin of its own spread, so a loose habit gets more rope than a
 * strict one. `SLACK` sets how many spreads of grace — under two, somebody whose
 * training hour wanders by an hour and a half gets told off for being normal.
 *
 * Never earlier than `floor`: the caller's own constant is a floor, not a
 * replacement, because a habit of eating at 07:00 does not make 08:00 an
 * emergency.
 */
export const SLACK = 2;

/**
 * How far past the habit the caller's floor may still pull the answer.
 *
 * The floor exists so a 07:00 breakfast habit does not make 08:00 an emergency
 * — it buys a few more hours before anybody is nagged. It was never meant to
 * *replace* a habit that sits somewhere else on the clock entirely.
 *
 * Six hours is the same reach the old `isLate` window used, and it is the point
 * where "wait a bit longer" stops being a nudge and starts being a different
 * time of day.
 */
export const FLOOR_REACH = 6;

/**
 * ── the floor is a floor on the circle, not on the number line ──
 *
 * This was `Math.max(floor, Math.min(late, 23))`, which is linear arithmetic on
 * a value that lives on a 24-hour circle — the exact mistake the rest of this
 * file exists to avoid.
 *
 * A night-shift nurse who trains at 01:00 has `hour ≈ 1`, so `late ≈ 2`, and
 * `Math.max(16, 2)` returns **16**: the default for somebody the app knows
 * nothing about. Having learned her routine precisely, it then threw the answer
 * away — asking "chưa tập à?" from 16:00 while she slept, and staying silent at
 * 01:00 when she actually trained. Learning her habit made her experience
 * *identical* to a stranger's, which is worse than not learning it, because the
 * app is now confidently wrong at the one hour it had evidence about.
 *
 * `Math.min(late, 23)` was the same error at the other end: a 23:00 habit
 * clamped to 23:00 instead of wrapping past midnight to 01:00.
 *
 * So the floor now applies only when it is *just ahead* of the habit's own late
 * hour — within `FLOOR_REACH`, going forwards around the clock. Further than
 * that and the floor is plainly describing a different part of somebody else's
 * day, and the habit wins.
 */
export function lateHour(h: Habit | null, floor: number): number {
  if (!h) return floor;
  const late = wrap24(h.hour + SLACK * h.spread);
  return forward(late, floor) <= FLOOR_REACH ? wrap24(floor) : late;
}

/** Hours from `a` forward to `b`, going the way the clock goes. */
export function forward(a: number, b: number): number {
  return wrap24(b - a);
}

const wrap24 = (h: number) => ((h % 24) + 24) % 24;

/**
 * ── why there is no `isLate` or `hoursBetween` here any more ──
 *
 * There was an `isLate(habit, now, floor)`: a fixed six-hour window after
 * `lateHour`. It answered the question the whole of this file exists for —
 * *is this person past the hour they would normally have done it* — it was
 * documented, it was tested, and it had **no caller in the app at all**. The
 * mascot went on asking on four hours somebody typed for an imagined day while
 * the model that knew better sat one import away. `tools/linked.mjs` exists so
 * that cannot happen quietly again.
 *
 * Wiring it up is what showed why it had never fitted: six hours is right for a
 * workout and wrong for a meal. Somebody who has not eaten by seven in the
 * evening must still be asked, and a fixed window silences the ask exactly when
 * it matters most. The window belongs to the caller, who knows whether the
 * thing closes.
 *
 * So `lateHour` is the single answer to "from when", the window is `GAP_SPAN`
 * in `lib/mascot-message.ts`, and there is no second opinion to drift from
 * this one.
 *
 * `hoursBetween` went with it — it existed only to serve `isLate`. Its lesson
 * did not: it once wrote `+36` where it meant `+24`, which rotated every answer
 * half a day, so the one question the function existed to answer came back
 * "no" all evening. `tools/personalize.mjs` caught it. Any clock arithmetic in
 * this app wraps at 24 and is tested at midnight, because midnight is the hour
 * every one of these bugs has been found at.
 */
