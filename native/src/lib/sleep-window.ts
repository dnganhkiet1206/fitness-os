/**
 * Which calendar days a bedtime and a waketime belong to.
 *
 * ── why this is its own file ──
 *
 * The rule used to be one expression inside `log-sleep.tsx`:
 *
 *     withDate(bedtime, bedtime.getHours() >= 12 ? -1 : 0)
 *
 * "A bedtime after noon belongs to yesterday" — read off the bedtime alone,
 * never looking at when the person got up. Correct for a night, wrong for
 * everything else.
 *
 * An afternoon nap, asleep 14:00 and awake 16:00, put the bedtime on yesterday
 * at 14:00 and the waketime on today at 16:00: a **26-hour night**, 1,560
 * minutes. The sheet printed "26h 00m" about itself. `daily_logs` took it,
 * `computeSleepScore` divided by an 8-hour target, landed in the `ratio >= 1`
 * branch and returned **100/100** — the heaviest single input to readiness, at
 * weight 0.30 — and the seven-day mean then wiped a real week of sleep debt.
 *
 * The reverse was quieter and worse: asleep 11:00, awake 07:00 produced a
 * *negative* span. The sheet clamped it for display only, so what reached the
 * database was −240.
 *
 * It lives here, pure and alone, because a rule about time that only exists
 * inside a screen cannot be run against a table of cases — and this is a rule
 * whose failures are all at the edges.
 */

/** Put a picker's clock time onto a real day, `dayOffset` days from `ref`. */
export function onDay(time: { getHours(): number; getMinutes(): number }, ref: Date, dayOffset: number): Date {
  const d = new Date(ref.getTime());
  d.setDate(d.getDate() + dayOffset);
  d.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return d;
}

export interface SleepSpan {
  bedDate: Date;
  wakeDate: Date;
  /** Never negative. */
  minutes: number;
}

/**
 * The waketime settles it.
 *
 * Both times are placed on `ref` first. The bedtime moves back a day only when
 * it has to — when waking would otherwise be at or before falling asleep. So a
 * nap stays inside one day, and 23:00 → 07:00 still spans midnight.
 *
 * Equal times count as crossing midnight rather than as a zero-length sleep:
 * somebody who sets both pickers the same has described a full day, and 1,440
 * minutes is refused downstream by `sleep_duration_min`, where a 0 would slip
 * through the `<= 0` guard in `computeSleepScore` as "no data" instead.
 */
export function sleepSpan(
  bedtime: { getHours(): number; getMinutes(): number },
  waketime: { getHours(): number; getMinutes(): number },
  ref: Date = new Date(),
): SleepSpan {
  const wakeDate = onDay(waketime, ref, 0);
  const bedSameDay = onDay(bedtime, ref, 0);
  const bedDate =
    wakeDate.getTime() <= bedSameDay.getTime() ? onDay(bedtime, ref, -1) : bedSameDay;
  return {
    bedDate,
    wakeDate,
    minutes: Math.max(0, Math.round((wakeDate.getTime() - bedDate.getTime()) / 60000)),
  };
}
