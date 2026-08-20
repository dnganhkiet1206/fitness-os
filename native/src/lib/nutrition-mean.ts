/**
 * The mean of one metric, over the days that actually carry that metric.
 *
 * ── why this is a file and not six lines inside the screen ──
 *
 * The same reason `step-days.ts` sits apart from `health.ts` and `health-days.ts`
 * sits apart from `use-health-sync`: `weekly-review.tsx` imports React, Reanimated
 * and the icon set, so nothing in it can be loaded in Node — and this rule is
 * exactly the kind that is wrong in a way reading it does not reveal. A detector
 * that cannot execute the real function has to reimplement it, and a check that
 * reimplements the thing it checks agrees with itself by construction.
 *
 * `tools/nutrition-averages.mjs` calls the function below against a real
 * PostgreSQL cluster.
 *
 * ── the bug it exists for ──
 *
 * `avg(logs.map((l) => Number(l.kcal) || 0))` averaged a metric across rows
 * where the metric is absent. A `daily_logs` row is not evidence that somebody
 * ate: `use-health-sync` upserts `{ user_id, date, steps }` for up to thirteen
 * finished HealthKit days and an upsert **creates** the row, and Chain AB
 * measured that a day whose only meal is deleted keeps its row at zero too. So
 * the denominator was "how many rows happen to exist" — a number that moves
 * with whether the person granted Health access, which has nothing to do with
 * what they ate.
 *
 * Measured against PostgreSQL 16.13 with the rows the sync really writes.
 * Somebody eating exactly 2,100 kcal and 150 g of protein on every day they
 * logged, HealthKit having written a row for all seven days of the week:
 *
 *     ngày ghi thật   TB calo   TB đạm   cảnh báo "đạm thấp"
 *     3               900       64       CÓ
 *     5               1.500     107      CÓ
 *     6               1.800     129      –
 *     7               2.100     150      –
 *
 * The figure shown is the truth multiplied by `ngày ghi / 7`. Somebody hitting
 * 150 g on every day they ate, logging five of seven, is told they averaged
 * 107 g — and told to eat more protein on the strength of it.
 *
 * ── why not `LOGGED_DAY_FILTER` ──
 *
 * Because it answers a different question, and Chain AC measured the gap. With
 * three meal days, two workout-only days and two step-only days:
 *
 *     sự thật              : 2.100 / 150
 *     không lọc            :   900 /  64
 *     LOGGED_DAY_FILTER    : 1.260 /  90   ← vẫn lệch
 *     lọc theo chính chỉ số: 2.100 / 150
 *
 * A day somebody trained on but logged no food is a logged day — correctly, and
 * that is the question `LOGGED_DAY_FILTER` was written for — but it carries
 * `kcal = 0`, so it still drags a calorie mean down. Applying the canonical
 * filter here would shrink the error without removing it and leave a number
 * that looks repaired. That is the worse outcome of the two.
 *
 * Per metric, therefore, which is the convention the repository already keeps:
 * `adaptiveTDEE` filters `d.kcal > 0`, `useKcalHistory` and
 * `useSleepDurationHistory` filter their own column. `adaptive-tdee.ts` states
 * the reason in one line — *"A day with no meals logged is a day with no
 * information, not a day of eating nothing"*.
 *
 * ── the three rules, each of which was a way to get it wrong ──
 *
 * **Each metric gets its own population.** A day carrying protein but no
 * calories still counts toward the protein mean, and the reverse. Qualifying
 * protein on `kcal > 0` would be the same class of error in a new place.
 *
 * **A value that is not a finite number is not a day.** `null`, `undefined` and
 * `NaN` all arrive here — `Number(null)` is `0` and `Number(undefined)` is
 * `NaN` — and none of them is evidence about eating.
 *
 * **The count travels with the mean.** A recommendation drawn from two days is
 * not the same claim as one drawn from seven, and the caller has to be able to
 * tell. Every gate that used to read "how many rows are there" needs "how many
 * days is this number built from" instead.
 */
export interface MetricMean {
  /** mean over the qualifying days; 0 when there are none — check `count` first */
  mean: number;
  /** how many days carried the metric */
  count: number;
}

export function metricMean<T>(rows: readonly T[], read: (row: T) => number): MetricMean {
  const values: number[] = [];
  for (const row of rows) {
    const v = read(row);
    if (Number.isFinite(v) && v > 0) values.push(v);
  }
  return {
    mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
    count: values.length,
  };
}

/**
 * Days carrying nutrition at all — either macro counts as food recorded.
 *
 * Separate from `metricMean` because it answers a different question: not *"what
 * did they average"* but *"is there anything here to talk about"*. A meal logged
 * with no protein is still a meal, so a card whose empty state says *"chưa có dữ
 * liệu dinh dưỡng"* must not hide itself on the strength of the protein column
 * alone.
 */
export function nutritionDays<T>(
  rows: readonly T[],
  kcal: (row: T) => number,
  protein: (row: T) => number,
): number {
  return rows.filter((r) => {
    const k = kcal(r);
    const p = protein(r);
    return (Number.isFinite(k) && k > 0) || (Number.isFinite(p) && p > 0);
  }).length;
}
