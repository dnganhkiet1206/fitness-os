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
