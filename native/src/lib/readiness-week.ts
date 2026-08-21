import { hasRecoverySignal } from '@/lib/readiness-i18n';

/**
 * The weekly review's deload rule, and the only thing in this file.
 *
 * ── why it is a file and not three lines on the screen (BUG-109) ──
 *
 * Same reason as `step-days.ts`, `health-days.ts` and `health-sync-write.ts`:
 * `weekly-review.tsx` imports React, reanimated and the whole card layer, so
 * nothing in it can be loaded in Node — and this is a rule that is wrong in a
 * way reading it does not reveal. `tools/readiness-confidence.mjs` runs the
 * function below over rows a real `recomputeDailyLog` wrote into a real
 * PostgreSQL, which is the only way to prove it rather than assert it.
 *
 * ── the sentence this exists to stop ──
 *
 * The gate was `avgReadiness < 50 && readinessDays >= 3`, and a readiness score
 * carries no record of what produced it. Measured in all six timezones, for
 * somebody with a heavy 28-day base and one small session in the last week:
 *
 *     45 red acwr 0.01 explain "load:45"   ×3 ngày
 *     → "Cân nhắc tuần deload: giảm 40-50% volume, giữ cường độ."
 *
 * Three lines above it, the same screen's ACWR rule was saying *"ACWR thấp. Có
 * thể tăng 10-15% volume"* about the same person. Both sentences were in the
 * same list. The low score **was** the under-training, read back as fatigue.
 *
 * A deload is a recovery instruction, so it needs a recovery measurement —
 * sleep, HRV or resting heart rate. Training load is a real dimension of
 * readiness and stays in the score; it is simply not a reading of recovery.
 *
 * The mean, the threshold and `readinessDays` are exactly what they were. The
 * only new question is whether the sentence is entitled to be said.
 */

/** The shape this needs from a `daily_logs` row; the screen selects more. */
export interface ReadinessDay {
  readiness_score?: number | string | null;
  readiness_explain?: string | null;
}

/**
 * How many scored days had a recovery measurement behind them.
 *
 * Counted, not any-of: three days of a mean built from one recovery reading and
 * two load-only ones is still mostly a statement about training volume.
 */
export function recoveryBackedDays(logs: readonly ReadinessDay[]): number {
  return logs.filter((l) => l.readiness_score && hasRecoverySignal(l.readiness_explain)).length;
}

/**
 * May the weekly review tell this person to cut volume 40–50%?
 *
 * `avgReadiness` and `readinessDays` are passed in rather than recomputed here:
 * they are the screen's own numbers, unchanged by this round, and a second
 * mean living in a second file is the duplication this repository keeps paying
 * for.
 */
export function deloadWarranted(
  logs: readonly ReadinessDay[],
  avgReadiness: number,
  readinessDays: number,
): boolean {
  return avgReadiness < 50 && readinessDays >= 3 && recoveryBackedDays(logs) >= 3;
}
