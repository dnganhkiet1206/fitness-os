import { localDateStr, parseLocalDate } from './local-date';

/**
 * The training card's numbers, in one place.
 *
 * ── the card disagreed with itself ──
 *
 * The acute-to-chronic ratio was drawn three times, by three different rules:
 *
 *   - the **marker colour**: `>= 0.8 && <= 1.3` green, `> 1.3` yellow, else red
 *   - the **pill caption**: five bands — Detraining / Low / Optimal / Elevated
 *     / Spike, splitting at 0.65, 0.8, 1.3, 1.6
 *   - the **legend row**: the same five bands again, hand-written as strings
 *
 * The first is not the other two. At **1.7** the marker was drawn yellow while
 * the pill beside it read "Spike" and the legend under it called >1.6 red. At
 * **0.7** the marker was red while the legend called 0.65–0.8 yellow. One
 * number, one card, two colours and two verdicts.
 *
 * The five-band version is the correct one, and not by majority: it is what
 * `readiness-engine.ts:61-70` scores load against — 80 inside 0.8–1.3, 65 for
 * 0.65–0.8, 55 for 1.3–1.6, 45 below 0.65. The card's colour ternary was the
 * odd one out, and it was the one painting the dot.
 *
 * So there is one table. The bar reads it, the pill reads it, the tick marks
 * read it, and the help sheet reads it.
 */

export type AcwrZoneKey = 'detraining' | 'low' | 'optimal' | 'elevated' | 'spike';

/**
 * The one acute:chronic ratio that stands for a range of days.
 *
 * ── the bug this exists for (BUG-103) ──
 *
 * The weekly review computed its **own** ACWR, from a different quantity, with
 * a different denominator:
 *
 *     const load28d   = sum(monthLogs.map((l) => Number(l.volume_load) || 0));
 *     const chronicAvg = load28d / 28;
 *     const acwr = chronicAvg > 0 ? (load7d / 7) / chronicAvg : 0;
 *
 * Four differences from the canonical path, every one of them a regression that
 * `readiness-engine.ts` had already fixed and written down:
 *
 *   - **tonnage instead of internal load.** A watch import carries
 *     `volume_load: 0` and `sets: []` on purpose, so a running week reads as a
 *     week of no training rather than a week that cannot be scored.
 *   - **a flat 28.** `getACWR` divides by `max(chronicDays, 7)` — the days the
 *     window actually covers — precisely so a new account is not averaged over
 *     three weeks that never happened.
 *   - **zero for "cannot tell".** The engine returns `null`.
 *   - **no `hasEnoughData` gate.**
 *
 * Measured on PostgreSQL 16.13, one barbell session every other day — training
 * perfectly evenly — with the real `recomputeDailyLog` and the real engine:
 *
 *     lịch sử    engine (Today)      weekly review
 *     1 tuần     1.00 · optimal      4.00 · spike   → "Giảm 15-20% volume … tránh chấn thương"
 *     2 tuần     1.06 · optimal      2.29 · spike   → "Giảm 15-20% …"
 *     4 tuần     1.10 · optimal      1.14 · optimal
 *
 * Identical in all six timezones including both DST days, so it was arithmetic
 * rather than date handling. Two screens, two verdicts, same person, same day —
 * and the screen with the wrong one is the screen that tells people to deload
 * to avoid injury.
 *
 * ── so the ratio is read, never recomputed ──
 *
 * `daily_logs.acwr` is written by `recomputeDailyLog` from `computeReadiness`,
 * and that is the only place this number is produced. This function picks
 * *which* day's ratio represents a range; it does not compute one.
 *
 * **The newest day that has one.** ACWR is already a rolling window ending on
 * its own day, so the last day of a range carries the answer for that range;
 * averaging seven rolling ratios would be a ratio of nothing. Days are compared
 * as `YYYY-MM-DD` strings, which sort correctly and need no timezone.
 *
 * **`null` survives.** A row whose `acwr` is null is a day the engine refused to
 * score, and skipping it is not the same as substituting zero: the column is
 * nullable with no default exactly so the two can be told apart. If no day in
 * the range has a ratio, the answer is `null` — "we cannot tell you yet" — and
 * never `0`, which means "you trained nothing against a baseline that exists".
 */
export function latestAcwr(
  rows: readonly { date?: string | null; acwr?: number | string | null }[],
): number | null {
  let best: { date: string; acwr: number } | null = null;
  for (const r of rows ?? []) {
    if (r?.acwr == null) continue;
    const v = Number(r.acwr);
    if (!Number.isFinite(v)) continue;
    const d = String(r.date ?? '');
    if (best === null || d > best.date) best = { date: d, acwr: v };
  }
  return best === null ? null : best.acwr;
}

/**
 * Which band a ratio is in.
 *
 * This is `readiness-engine.ts:66-70` written out in the engine's own order,
 * deliberately as a chain of predicates rather than a tidy table of edges.
 * The edges are not symmetric and no uniform rule reproduces them: **0.8–1.3
 * is inclusive at both ends** and the neighbouring bands fill in around it, so
 * `0.65` is `low`, `0.8` is `optimal`, `1.3` is `optimal`, and `1.6` is
 * `elevated`. A table with one "boundaries belong upward" rule would move 1.3
 * out of the safe band — a card telling somebody to back off on the exact
 * ratio the engine calls ideal.
 */
export function acwrZone(acwr: number): AcwrZoneKey {
  if (acwr >= 0.8 && acwr <= 1.3) return 'optimal';
  if (acwr >= 0.65 && acwr < 0.8) return 'low';
  if (acwr > 1.3 && acwr <= 1.6) return 'elevated';
  if (acwr < 0.65) return 'detraining';
  return 'spike';
}

/**
 * The bands as the card and the help sheet write them out.
 *
 * Display only — `acwrZone` decides which one a number is in. They are here so
 * the bar's tick marks, the pill and the explainer quote one set of ranges
 * instead of three hand-typed copies that drift apart, which is exactly what
 * happened to the colours.
 */
export const ACWR_BANDS: readonly { key: AcwrZoneKey; label: string }[] = [
  { key: 'detraining', label: '< 0.65' },
  { key: 'low', label: '0.65 – 0.8' },
  { key: 'optimal', label: '0.8 – 1.3' },
  { key: 'elevated', label: '1.3 – 1.6' },
  { key: 'spike', label: '> 1.6' },
];

/** The band the card wants you in, named once for the bar and its ticks. */
export const ACWR_OPTIMAL = { from: 0.8, to: 1.3 } as const;

/** The right-hand end of the drawn scale. Ratios past it pin to the end. */
export const ACWR_MAX = 2;

/**
 * The ratio as a comparison instead of a quotient.
 *
 * `1.7` is not a fact about a person's week. It is a fact about the quotient of
 * two rolling averages, and reading it requires knowing that 1 is the neutral
 * point, that the numerator is seven days, that the denominator is twenty-eight,
 * and that both are per-day rather than per-week. Nobody does that arithmetic
 * standing in a kitchen looking at a phone.
 *
 * `nặng hơn 70% so với thói quen` is the same fact, and needs none of it.
 *
 * The percentage is a distance from 1, not from zero: 1.7 is 70% more, 0.42 is
 * 58% less. Reporting `170%` and `42%` instead would be arithmetically true and
 * read as "you did 170% of something", which is the wrong quantity by a factor
 * that changes with every value.
 */
export function loadComparison(acwr: number): { heavier: boolean; percent: number } {
  return { heavier: acwr >= 1, percent: Math.round(Math.abs(acwr - 1) * 100) };
}

/**
 * How many days the 28-day load figure actually covers.
 *
 * Measured from the oldest session inside the window, because dividing by a
 * flat 28 for somebody who started last week averages their training over three
 * weeks that never happened.
 *
 * Shared with `daily-log-service.ts`, which computes the same span to feed the
 * readiness engine. It was written out in that file only, so the card had no
 * way to agree with it — see `averageWeek` below.
 */
export const CHRONIC_MIN_DAYS = 7;

export function chronicDays(sessions: { date_time?: string | null }[], now: Date = new Date()): number {
  let oldest: number | null = null;
  for (const s of sessions) {
    const t = Date.parse(String(s.date_time ?? ''));
    if (Number.isFinite(t) && (oldest === null || t < oldest)) oldest = t;
  }
  if (oldest === null) return 0;
  return Math.min(28, Math.ceil((now.getTime() - oldest) / 86_400_000) + 1);
}

/**
 * The chronic side of the ratio, per week rather than per day.
 *
 * The card shows the two quantities the ratio compares so that the verdict can
 * be checked rather than believed, and they have to be in the same unit for
 * that to work: "an average week" against which "the last seven days" is
 * directly comparable. Per-*day* is how the engine computes it and is useless
 * to read — a number about a day nobody trained on.
 *
 * ── the card used to contradict itself ──
 *
 * This was `volume28d / 4`: a flat four weeks, regardless of how much history
 * the window held. The engine had already stopped doing that — it divides by
 * `max(chronicDays, 7)` precisely because a flat 28 made a new lifter's
 * perfectly even week read as a fourfold spike.
 *
 * So the card printed two numbers *and* a percentage derived from the engine's
 * ratio, and for anybody newer than a month those did not agree. Ten days in,
 * the pair on screen divided to about 2.8× the ratio the sentence beside them
 * was computed from. The card exists so the verdict can be checked by hand, and
 * checking it by hand disproved it.
 *
 * With a full window this returns exactly what it always did — `v28 / 4` — so
 * nothing changes for anybody who has been training a month.
 */
export function averageWeek(volume28d: number, days: number = 28): number {
  return (volume28d * 7) / Math.max(days, CHRONIC_MIN_DAYS);
}

/** Where a ratio sits on the 0–`ACWR_MAX` track, as a percentage. */
export function acwrPercent(acwr: number): number {
  return Math.max(0, Math.min((acwr / ACWR_MAX) * 100, 100));
}

/**
 * How many calendar days ago something happened.
 *
 * Both instants are folded to local midnight before subtracting, so this
 * counts *days on the calendar* rather than 24-hour blocks. A session at 23:00
 * last night is one day ago at 07:00 this morning, not zero. `Math.round`
 * absorbs the 23- and 25-hour days that daylight saving produces — the same
 * trap `weekDates` was rebuilt to avoid.
 */
export function daysSince(dateTime: string, now: Date = new Date()): number {
  const then = parseLocalDate(localDateStr(new Date(dateTime)));
  const today = parseLocalDate(localDateStr(now));
  return Math.max(0, Math.round((today.getTime() - then.getTime()) / 86400000));
}

export interface WeekBucket {
  /** total volume load in that week, in kilograms as stored */
  volume: number;
  sessions: number;
}

/**
 * The last `weeks` weeks of volume, oldest first.
 *
 * ── why the card needed this ──
 *
 * It said "this week is 70% heavier than your habit" and showed the two
 * numbers behind that claim, which is enough to *check* it and not enough to
 * *understand* it. Seventy percent heavier could be the fourth week of a
 * deliberate build or a single wild Saturday after a fortnight off, and the
 * card treated those identically. A training card with no direction in it is
 * a card that can only ever report the present tense.
 *
 * ── the boundaries are the same ones the queries use ──
 *
 * `useWorkoutSessions(n)` filters on `daysAgoISO(n)`, which is
 * `setDate(getDate() - n)` — a *calendar* offset, so "seven days ago" is the
 * same clock time seven dates back and spans 167 or 169 hours across a
 * daylight-saving change rather than a flat 168.
 *
 * These buckets are cut on exactly those instants. That is not fussiness: it
 * makes the most recent bucket **the same set of sessions** as the seven-day
 * figure printed above the chart. Bucketing on `daysSince / 7` instead would
 * be calendar-correct in its own right and would still, twice a year and at
 * every boundary, put a session in a different bucket than the number beside
 * it — a bar that disagrees with the total directly above it.
 */
export function weeklyVolumes(
  rows: readonly { date_time: string; volume_load?: number | null }[],
  weeks: number,
  now: Date = new Date(),
): WeekBucket[] {
  // edge[k] is the instant "7k days before now"; bucket k covers [edge[k+1], edge[k])
  const edge: number[] = [];
  for (let k = 0; k <= weeks; k++) {
    const d = new Date(now);
    d.setDate(d.getDate() - 7 * k);
    edge.push(d.getTime());
  }

  const out: WeekBucket[] = Array.from({ length: weeks }, () => ({ volume: 0, sessions: 0 }));
  for (const row of rows) {
    const t = new Date(row.date_time).getTime();
    if (Number.isNaN(t) || t < edge[weeks]) continue;
    for (let k = 0; k < weeks; k++) {
      /*
        The newest bucket has no upper edge, deliberately.

        `useLogWorkoutSession` stamps a session at **local noon** of the day it
        belongs to, so a workout logged at nine in the morning carries a
        timestamp three hours in the future. Closing bucket 0 at `now` would
        drop it — while the seven-day query, which is `.gte(...)` with no upper
        bound, keeps it. The bar and the total printed above it would disagree
        by a whole session, on the most common day of all: today.
      */
      const inBucket = k === 0 ? t >= edge[1] : t >= edge[k + 1] && t < edge[k];
      if (inBucket) {
        out[k].volume += Number(row.volume_load) || 0;
        out[k].sessions += 1;
        break;
      }
    }
  }
  // oldest first, which is how a chart is read
  return out.reverse();
}

/** How many weeks of history the card draws. */
export const TREND_WEEKS = 8;

/**
 * Whether the "latest session" is old enough that saying so matters.
 *
 * The card's top row is fed by "the most recent session", which has no time
 * limit on it — so a card showing `Push Day · RPE 8 · 4,200 kg` looked
 * identical whether that happened this morning or five weeks ago. With the
 * ratio falling underneath it for exactly that reason, the card was reporting
 * the cause and the effect and connecting neither.
 *
 * Seven days, because that is the acute window: once the last session is
 * outside it, the 7-day figures on this card are genuinely zero and the ratio
 * is decaying because nothing has happened, which is a different situation
 * from training lightly.
 */
export const STALE_AFTER_DAYS = 7;
