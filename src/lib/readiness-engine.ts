// Fitness OS – Readiness & Recovery Engine
// Evidence-inspired pseudo-formula using HRV (RMSSD), RHR, sleep, training load

import type { ReadinessInput, ReadinessResult } from './types';

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

function robustZ(x: number, med: number, madVal: number): number {
  return (x - med) / (1.4826 * madVal + 1e-6);
}

// Sub-score calculators
function computeHRVScore(hrv: number, history: number[]): number | null {
  if (history.length < 5) return null;
  const base = median(history);
  const madVal = mad(history);
  let z = robustZ(hrv, base, madVal);
  z = clamp(z, -3, 3);
  return clamp(50 + 15 * z, 0, 100);
}

function computeRHRScore(rhr: number, history: number[]): number {
  if (history.length < 5) return 50;
  const base = median(history);
  const madVal = mad(history);
  let z = robustZ(rhr, base, madVal);
  z = clamp(z, -3, 3);
  return clamp(50 - 12 * z, 0, 100);
}

function computeSleepScore(sleepMin: number, targetMin: number, debtMin: number): number {
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

function computeLoadScore(load7d: number, load28d: number, soreness?: number): number {
  const acute = load7d / 7;
  const chronic = load28d / 28;
  const acwr = acute / (chronic + 1e-6);
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

function getACWR(load7d: number, load28d: number): number {
  const acute = load7d / 7;
  const chronic = load28d / 28;
  return acute / (chronic + 1e-6);
}

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const hasHRV = input.hrv_today != null && input.hrv_history_28d.length >= 5;

  const hrvScore = hasHRV
    ? computeHRVScore(input.hrv_today!, input.hrv_history_28d)
    : null;

  const rhrScore = input.rhr_today
    ? computeRHRScore(input.rhr_today, input.rhr_history_28d)
    : 50;

  const sleepScore = computeSleepScore(
    input.sleep_min_lastnight,
    input.sleep_target_min,
    input.sleep_debt_7d_min
  );

  const loadScore = computeLoadScore(
    input.training_load_7d,
    input.training_load_28d,
    input.soreness_today
  );

  const acwr = getACWR(input.training_load_7d, input.training_load_28d);

  // Weighted combination
  let raw: number;
  if (hrvScore !== null) {
    raw = 0.30 * hrvScore + 0.20 * rhrScore + 0.30 * sleepScore + 0.20 * loadScore;
  } else {
    raw = 0.25 * rhrScore + 0.45 * sleepScore + 0.30 * loadScore;
  }

  // Safety overrides
  if (input.illness_flag) raw = Math.min(raw, 35);
  if (input.pain_flag_max !== undefined && input.pain_flag_max >= 7) raw = Math.min(raw, 45);
  if (input.sleep_min_lastnight < 240) raw = Math.min(raw, 40);

  const score = Math.round(clamp(raw, 0, 100));

  // Status
  const status = score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red';

  // Top 2 factors explanation
  const factors: { name: string; score: number; impact: string }[] = [];
  if (hrvScore !== null) {
    factors.push({
      name: 'HRV',
      score: hrvScore,
      impact: hrvScore < 40 ? 'low' : hrvScore > 70 ? 'good' : 'moderate',
    });
  }
  factors.push(
    { name: 'Resting HR', score: rhrScore, impact: rhrScore < 40 ? 'elevated' : rhrScore > 70 ? 'good' : 'moderate' },
    { name: 'Sleep', score: sleepScore, impact: sleepScore < 40 ? 'poor' : sleepScore > 70 ? 'good' : 'moderate' },
    { name: 'Training Load', score: loadScore, impact: loadScore < 40 ? 'overloaded' : loadScore > 70 ? 'optimal' : 'moderate' },
  );

  factors.sort((a, b) => a.score - b.score);
  const top2 = factors.slice(0, 2);
  const explain = top2.map(f => `${f.name}: ${f.impact} (${Math.round(f.score)})`).join(' · ');

  // Recommendation
  let recommendation: string;
  if (status === 'green' && acwr <= 1.2) {
    recommendation = 'Train as planned — push top sets + backoff sets.';
  } else if (status === 'green') {
    recommendation = 'Good to train. Monitor volume — ACWR slightly elevated.';
  } else if (status === 'yellow' && sleepScore < 50) {
    recommendation = 'Keep intensity, cut total sets by 15%. Prioritize sleep tonight.';
  } else if (status === 'yellow') {
    recommendation = 'Reduce volume 5–10%. Focus on technique and recovery.';
  } else if (status === 'red' && rhrScore < 40 && sleepScore < 40) {
    recommendation = 'Rest day recommended. Light cardio 20–30 min max.';
  } else if (status === 'red') {
    recommendation = 'Active recovery only — zone 2 cardio, mobility, breathing.';
  } else {
    recommendation = 'Listen to your body. Light activity if you feel up to it.';
  }

  return {
    score,
    status,
    explain,
    recommendation,
    subscores: {
      hrv: hrvScore !== null ? Math.round(hrvScore) : undefined,
      rhr: Math.round(rhrScore),
      sleep: Math.round(sleepScore),
      load: Math.round(loadScore),
    },
    acwr: Math.round(acwr * 100) / 100,
  };
}
