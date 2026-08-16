// ASCND – Readiness & Recovery Engine
// Evidence-inspired pseudo-formula using HRV (RMSSD), RHR, sleep, training load

import type { ReadinessConfidence, ReadinessInput, ReadinessResult } from './types';

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mad(arr: number[]): number {
  const med = median(arr);
  const deviations = arr.map(v => Math.abs(v - med));
  return median(deviations);
}

/**
 * ── why the dispersion estimate has a floor ──
 *
 * `1.4826 * MAD` is the standard robust estimate of σ, and it is only an
 * estimate of *spread*. When the sample has no spread it estimates zero, and
 * dividing by zero-plus-epsilon does not produce a large z — it produces a
 * meaningless one.
 *
 * This is not an edge case here. Resting heart rate is stored as a whole number
 * and the baseline window is five to twenty-eight readings, so identical values
 * are ordinary: `[58, 58, 58, 60, 62]` has a median of 58 and a **MAD of 0**.
 *
 * With `1e-6` as the divisor, a reading **one beat** above the median gave
 * `z ≈ 10⁶`, clamped to 3, scoring `50 - 12·3` = **14/100** — the identical
 * score to a reading forty beats high. The metric stopped being a measurement
 * and became a three-step function: 86 below the median, 50 exactly on it, 14
 * anywhere above. At weight 0.20 that moves readiness seven to nine points,
 * enough to turn a green day amber, and the explanation panel printed "Nhịp tim
 * nghỉ: cao (14)" about a single beat of ordinary variation.
 *
 * The floor is expressed in the metric's own units by the caller, because the
 * right value is a fact about the instrument: heart rate is integer bpm, so
 * differences below 1 bpm are not resolvable and must not be scored as if they
 * were. The `1e-6` stays underneath as a last guard against a caller passing
 * zero.
 */
function robustZ(x: number, med: number, madVal: number, floor: number): number {
  return (x - med) / (1.4826 * Math.max(madVal, floor) + 1e-6);
}

// Sub-score calculators
function computeHRVScore(hrv: number, history: number[]): number | null {
  if (history.length < 5) return null;
  const base = median(history);
  const madVal = mad(history);
  /* 1 ms: SDNN/RMSSD are reported to the millisecond, so a smaller spread than
     that is rounding, not physiology. */
  let z = robustZ(hrv, base, madVal, 1);
  z = clamp(z, -3, 3);
  return clamp(50 + 15 * z, 0, 100);
}

/**
 * Resting heart rate against this person's own baseline, or `null`.
 *
 * The last of the four to stop inventing a value. It returned a flat **50** with
 * no reading and again with fewer than five in the baseline — neutral rather
 * than punitive, which is why it survived three passes, but still a number
 * carrying 0.20 of the score (0.25 without HRV) that describes nobody.
 *
 * It drags the answer toward the middle in both directions. Somebody sleeping
 * well and training sensibly, with no resting-HR reading, scores 77 instead of
 * 86 — nine points of "average" contributed by a measurement that does not
 * exist. Somebody genuinely struggling is flattered by the same amount.
 *
 * Five readings is the same floor HRV uses: a median and a MAD built from four
 * points is not a baseline, it is four points.
 */
function computeRHRScore(rhr: number, history: number[]): number | null {
  if (history.length < 5) return null;
  const base = median(history);
  const madVal = mad(history);
  /* 1 bpm: resting heart rate is stored as a whole number, so this is the
     smallest difference the instrument can actually resolve. */
  let z = robustZ(rhr, base, madVal, 1);
  z = clamp(z, -3, 3);
  return clamp(50 - 12 * z, 0, 100);
}

/**
 * Last night, scored — or `null` when there was no last night to score.
 *
 * ── the bug this returns null for ──
 *
 * `sleep_duration_min` is `0` when no sleep row exists for the day, and zero
 * used to walk straight into the ratio below: `0 / 480` scores **20**, exactly
 * as if somebody had lain awake all night. Weighted 0.30 — or 0.45 when there
 * is no HRV either — and then the `< 240` override capped the whole score at
 * 40.
 *
 * So a person with three biometric readings and no sleep tracking was told,
 * with a number and a colour, that they were **not recovered**. Not because
 * they had slept badly; because the app had never been told how they slept.
 * Nothing on the screen distinguished the two, and the advice that follows a
 * red score — rest, cut volume — is advice about their body derived from an
 * absence of data about their body.
 *
 * Zero minutes of sleep is not a measurement. HRV already worked this way
 * (`computeHRVScore` returns null without enough history and the weights
 * redistribute); sleep now does too.
 */
function computeSleepScore(sleepMin: number | undefined, targetMin: number, debtMin: number): number | null {
  if (sleepMin === undefined || sleepMin === null || sleepMin <= 0) return null;
  const ratio = sleepMin / (targetMin || 480);
  let score: number;
  if (ratio >= 1.0) {
    score = 90 + Math.min(10, (ratio - 1) * 20);
  } else if (ratio >= 0.85) {
    score = 60 + ((ratio - 0.85) / 0.15) * 30;
  } else {
    score = 20 + (ratio / 0.85) * 40;
  }
  // Sleep debt penalty
  score -= clamp((debtMin / 60) * 5, 0, 15);
  return clamp(score, 0, 100);
}

/**
 * Training load, or `null` when there is no training to score.
 *
 * With no sessions logged at all the ratio came out 0, which lands in the
 * `< 0.65` bucket and scores **45** — the band that means "detrained, you have
 * been doing too little". Somebody who logs sleep and biometrics but keeps
 * their training elsewhere was marked down every day for a gap in the app's
 * records rather than a gap in their week.
 *
 * Same shape as sleep and HRV: absence is not a low value, it is no value.
 */
function computeLoadScore(
  load7d: number,
  load28d: number,
  chronicDays: number,
  soreness?: number,
): number | null {
  if (load28d <= 0) return null;
  const acwr = getACWR(load7d, load28d, chronicDays);
  let score: number;
  if (acwr >= 0.8 && acwr <= 1.3) score = 80;
  else if (acwr >= 0.65 && acwr < 0.8) score = 65;
  else if (acwr > 1.3 && acwr <= 1.6) score = 55;
  else if (acwr < 0.65) score = 45;
  else score = 35; // > 1.6

  if (soreness !== undefined && soreness > 6) {
    score -= (soreness - 6) * 4;
  }
  return clamp(score, 0, 100);
}

/**
 * Acute:chronic workload ratio.
 *
 * ── the denominator has to be days that happened ──
 *
 * Chronic load was `load28d / 28` — a twenty-eight day average over a window
 * that, for anybody newer than a month, is mostly days they had not yet
 * installed the app. Measured on the engine, somebody training **perfectly
 * evenly**:
 *
 *     buổi tập đầu tiên   →  ACWR 4.00   ("spike", nguy hiểm)
 *     tập đều 2 tuần      →  ACWR 2.00   ("spike")
 *     tập đều 4 tuần      →  ACWR 1.00   (đúng)
 *
 * Three weeks of being told they were ramping dangerously, for training exactly
 * the same amount every week. The ratio was not measuring their training; it
 * was measuring how long they had owned the app.
 *
 * `chronicDays` is how much history the 28-day figure actually covers. With one
 * week of data, chronic equals acute and the ratio is 1.0 — which is the honest
 * answer: you cannot spike above a baseline that does not exist yet.
 */
function getACWR(load7d: number, load28d: number, chronicDays: number): number {
  const acute = load7d / 7;
  /* Never fewer than seven: a chronic window shorter than the acute one makes
     the ratio a comparison of a week against part of itself. */
  const chronic = load28d / Math.max(chronicDays, 7);
  return acute / (chronic + 1e-6);
}

/**
 * How many dimensions the score rests on, banded.
 *
 * ── one rule, two readers ──
 *
 * The engine knows the count directly. The dashboard has to recover it from
 * `readiness_explain`, which encodes every sub-score it measured — so the two
 * arrive at the count by different routes and must not band it by different
 * numbers. This repository has been bitten by a duplicated threshold six times;
 * the banding lives here and both call it.
 *
 * Three or four dimensions is triangulation. Two is a pair. One is a real
 * number built from a single measurement, and a screen showing it should be
 * able to say so rather than presenting it with the weight of a full reading.
 *
 * Deliberately a count and not a percentage: there is no basis for calling a
 * two-input score "50% confident", and there is a basis for saying it rests on
 * two things instead of four.
 */
export function readinessConfidence(dimensions: number): ReadinessConfidence {
  if (dimensions >= 3) return 'high';
  if (dimensions === 2) return 'medium';
  return 'low';
}

export function computeReadiness(input: ReadinessInput): ReadinessResult | null {
  const hasHRV = input.hrv_today != null && input.hrv_history_28d.length >= 5;

  const hrvScore = hasHRV
    ? computeHRVScore(input.hrv_today!, input.hrv_history_28d)
    : null;

  const rhrScore = input.rhr_today
    ? computeRHRScore(input.rhr_today, input.rhr_history_28d)
    : null;

  const sleepScore = computeSleepScore(
    input.sleep_min_lastnight,
    input.sleep_target_min,
    input.sleep_debt_7d_min
  );

  /* How many days the 28-day load figure actually covers. Absent on older
     callers, in which case the full window is assumed — the same answer as
     before this parameter existed. */
  const chronicDays = input.training_days_28d ?? 28;

  const loadScore = computeLoadScore(
    input.training_load_7d,
    input.training_load_28d,
    chronicDays,
    input.soreness_today
  );

  /*
    ── `null` when there is no chronic base, and 0 only when there is ──

    `getACWR(0, 0, …)` returns 0, so an account that has never logged a session
    stored the same `acwr` as somebody who trained hard for a month and then
    took a full rest week. Those are opposite states: one is "nothing is known",
    the other is "thoroughly rested". A missing measurement had been given a
    number, and a number is a claim.

    So the ratio exists only when there is something to be a ratio *of*. Zero
    keeps its real meaning — a week with no training against a baseline that
    does exist — which is a fact worth having and worth distinguishing from an
    empty account.
  */
  const acwr =
    input.training_load_28d > 0
      ? getACWR(input.training_load_7d, input.training_load_28d, chronicDays)
      : null;

  /*
    Weighted combination over the terms that exist.

    The two four-term and three-term rows are the weights this engine has always
    used and are left exactly as they were, so no existing score moves. The two
    rows without sleep are new — they are what used to be answered by scoring an
    absent night as twenty.

    Each row sums to 1.0. A score built from fewer inputs is thinner, but it is
    about the person; the alternative was a fuller-looking number that was
    partly about nothing.
  */
  const present: { w: number; score: number }[] = [];
  const add = (w: number, score: number | null) => {
    if (score !== null) present.push({ w, score });
  };

  /*
    The two historical rows are reproduced exactly, and everything else is the
    same base weights renormalised over whatever is present.

    Written this way because there are now three terms that can be absent — HRV
    needs five readings of history, sleep needs a night that was recorded, load
    needs a session that was logged — and eight explicit branches would be eight
    places for the numbers to drift apart. Pinning the two combinations that
    already shipped means no existing score moves; the rest are new cases that
    previously did not exist because absence was being scored as a low value.
  */
  if (hrvScore !== null && sleepScore !== null && loadScore !== null) {
    add(0.30, hrvScore); add(0.20, rhrScore); add(0.30, sleepScore); add(0.20, loadScore);
  } else if (hrvScore === null && sleepScore !== null && loadScore !== null) {
    add(0.25, rhrScore); add(0.45, sleepScore); add(0.30, loadScore);
  } else {
    add(0.30, hrvScore); add(0.20, rhrScore); add(0.30, sleepScore); add(0.20, loadScore);
  }

  /*
    Nothing measurable at all.

    Reachable: three biometric readings satisfies the caller's gate but not the
    five a baseline needs, and somebody with no sleep row and no logged training
    then has four null sub-scores. Averaging an empty list gives 0, which would
    render as a readiness of zero — the most alarming number on the screen,
    produced by having no data whatsoever.

    `null` instead, and the caller writes no score. A blank gauge is honest;
    a red one is a false statement about somebody's body.
  */
  if (present.length === 0) return null;

  const totalWeight = present.reduce((sum, t) => sum + t.w, 0);
  let raw = present.reduce((sum, t) => sum + t.w * t.score, 0) / (totalWeight || 1);

  // Safety overrides
  if (input.illness_flag) raw = Math.min(raw, 35);
  if (input.pain_flag_max !== undefined && input.pain_flag_max >= 7) raw = Math.min(raw, 45);
  /* Only a night that was actually measured can be a short one. This used to
     read `input.sleep_min_lastnight < 240`, which is true of every day with no
     sleep row at all — capping readiness at 40 for the crime of not owning a
     sleep tracker. */
  if (sleepScore !== null && input.sleep_min_lastnight !== undefined && input.sleep_min_lastnight < 240) {
    raw = Math.min(raw, 40);
  }

  const score = Math.round(clamp(raw, 0, 100));

  // Status
  const status = score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red';

  // Top 2 factors explanation. `key` is the language-neutral token the UI
  // localizes at render; `name`/`impact` stay Vietnamese for the prose/AI.
  const factors: { key: string; name: string; score: number; impact: string }[] = [];
  if (hrvScore !== null) {
    factors.push({
      key: 'hrv',
      name: 'HRV',
      score: hrvScore,
      impact: hrvScore < 40 ? 'thấp' : hrvScore > 70 ? 'tốt' : 'trung bình',
    });
  }
  if (rhrScore !== null) {
    factors.push({ key: 'rhr', name: 'Nhịp tim nghỉ', score: rhrScore, impact: rhrScore < 40 ? 'cao' : rhrScore > 70 ? 'tốt' : 'trung bình' });
  }
  /* Absent from the list entirely rather than listed at zero. The explain line
     takes the two lowest factors, so a sleep score invented for a night nobody
     measured would not merely be wrong — it would be the headline. */
  if (sleepScore !== null) {
    factors.push({ key: 'sleep', name: 'Giấc ngủ', score: sleepScore, impact: sleepScore < 40 ? 'kém' : sleepScore > 70 ? 'tốt' : 'trung bình' });
  }
  /* Same reason sleep is conditional: the explain line takes the two lowest
     factors, so a load score invented for somebody who logs no training would
     become the headline advice. */
  if (loadScore !== null) {
    factors.push({ key: 'load', name: 'Tải tập', score: loadScore, impact: loadScore < 40 ? 'quá tải' : loadScore > 70 ? 'tối ưu' : 'trung bình' });
  }

  factors.sort((a, b) => a.score - b.score);
  const top2 = factors.slice(0, 2);
  const explain = top2.map(f => `${f.name}: ${f.impact} (${Math.round(f.score)})`).join(' · ');
  // Encode ALL sub-scores (not just the top 2) so the gauge can show the
  // RHR / Sleep / Load tiles; the explain line still uses the 2 lowest.
  const explainToken = factors.map(f => `${f.key}:${Math.round(f.score)}`).join('|');

  // Recommendation — keep prose + a stable key so the UI can localize it
  let recommendation: string;
  let recommendationKey: string;
  if (status === 'green' && acwr != null && acwr <= 1.2) {
    recommendationKey = 'green_optimal';
    recommendation = 'Tập theo kế hoạch — đẩy top set + backoff sets.';
  } else if (status === 'green') {
    recommendationKey = 'green_watch';
    recommendation = 'Sẵn sàng tập. Theo dõi khối lượng — ACWR hơi cao.';
  } else if (status === 'yellow' && sleepScore !== null && sleepScore < 50) {
    recommendationKey = 'yellow_sleep';
    recommendation = 'Giữ cường độ, giảm 15% tổng sets. Ưu tiên ngủ tối nay.';
  } else if (status === 'yellow') {
    recommendationKey = 'yellow_reduce';
    recommendation = 'Giảm volume 5–10%. Tập trung kỹ thuật và phục hồi.';
  } else if (status === 'red' && rhrScore !== null && rhrScore < 40 && sleepScore !== null && sleepScore < 40) {
    recommendationKey = 'red_rest';
    recommendation = 'Nên nghỉ ngơi. Cardio nhẹ tối đa 20–30 phút.';
  } else if (status === 'red') {
    recommendationKey = 'red_recover';
    recommendation = 'Chỉ phục hồi tích cực — zone 2, mobility, thở.';
  } else {
    recommendationKey = 'listen';
    recommendation = 'Lắng nghe cơ thể. Vận động nhẹ nếu cảm thấy ổn.';
  }

  return {
    score,
    status,
    explain,
    recommendation,
    explainToken,
    recommendationKey,
    subscores: {
      hrv: hrvScore !== null ? Math.round(hrvScore) : undefined,
      rhr: rhrScore !== null ? Math.round(rhrScore) : undefined,
      /* undefined, not 0 — the gauge draws a tile per sub-score and a zero
         tile reads as "you scored nothing" rather than "not measured". */
      sleep: sleepScore !== null ? Math.round(sleepScore) : undefined,
      load: loadScore !== null ? Math.round(loadScore) : undefined,
    },
    acwr: acwr == null ? null : Math.round(acwr * 100) / 100,
    /*
      Banded by how many of the four dimensions survived, and nothing else.

      Three or four is `high`: the score is triangulating. Two is `medium`. One
      is `low`, and one is common — somebody with a sleep row and nothing else
      gets a perfectly real number built from a single measurement, and the
      screen showing it should be able to say so rather than presenting it with
      the same weight as a fully-measured day.

      Deliberately not a percentage. There is no basis for saying a two-input
      score is "50% confident"; there is a basis for saying it rests on two
      things instead of four.
    */
    confidence: readinessConfidence(present.length),
  };
}
