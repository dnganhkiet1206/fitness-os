import type { AppLang } from '@/lib/i18n';

/**
 * Localized readiness explain/recommendation, keyed by stable tokens the
 * engine emits (same "render by key" pattern as awards/challenges). The
 * daily_logs columns store the tokens; every native surface localizes
 * through these tables so the language follows the user's setting instead
 * of whatever was active when the score was computed. Legacy rows that
 * stored prose fall through unchanged.
 */

type Bi = { en: string; vi: string };

/** recommendation branch → localized copy */
export const READINESS_RECO: Record<string, Bi> = {
  green_optimal: {
    en: 'Train as planned — push the top set + backoff sets.',
    vi: 'Tập theo kế hoạch — đẩy top set + backoff sets.',
  },
  green_watch: {
    en: 'Ready to train. Watch the volume — ACWR is a bit high.',
    vi: 'Sẵn sàng tập. Theo dõi khối lượng — ACWR hơi cao.',
  },
  yellow_sleep: {
    en: 'Keep the intensity, cut total sets by 15%. Prioritize sleep tonight.',
    vi: 'Giữ cường độ, giảm 15% tổng sets. Ưu tiên ngủ tối nay.',
  },
  yellow_reduce: {
    en: 'Reduce volume 5–10%. Focus on technique and recovery.',
    vi: 'Giảm volume 5–10%. Tập trung kỹ thuật và phục hồi.',
  },
  red_rest: {
    en: 'Better to rest. Light cardio, 20–30 min max.',
    vi: 'Nên nghỉ ngơi. Cardio nhẹ tối đa 20–30 phút.',
  },
  red_recover: {
    en: 'Active recovery only — zone 2, mobility, breathing.',
    vi: 'Chỉ phục hồi tích cực — zone 2, mobility, thở.',
  },
  listen: {
    en: 'Listen to your body. Move lightly if you feel up to it.',
    vi: 'Lắng nghe cơ thể. Vận động nhẹ nếu cảm thấy ổn.',
  },
};

/** factor key → localized short label */
const FACTOR_LABEL: Record<string, Bi> = {
  hrv: { en: 'HRV', vi: 'HRV' },
  rhr: { en: 'Resting HR', vi: 'Nhịp tim nghỉ' },
  sleep: { en: 'Sleep', vi: 'Giấc ngủ' },
  load: { en: 'Training load', vi: 'Tải tập' },
};

/** factor key → impact term per score bucket (low <40 / mid / high >70) */
const FACTOR_IMPACT: Record<string, { low: Bi; mid: Bi; high: Bi }> = {
  hrv: {
    low: { en: 'low', vi: 'thấp' },
    mid: { en: 'moderate', vi: 'trung bình' },
    high: { en: 'good', vi: 'tốt' },
  },
  rhr: {
    low: { en: 'high', vi: 'cao' },
    mid: { en: 'moderate', vi: 'trung bình' },
    high: { en: 'good', vi: 'tốt' },
  },
  sleep: {
    low: { en: 'poor', vi: 'kém' },
    mid: { en: 'moderate', vi: 'trung bình' },
    high: { en: 'good', vi: 'tốt' },
  },
  load: {
    low: { en: 'overreaching', vi: 'quá tải' },
    mid: { en: 'moderate', vi: 'trung bình' },
    high: { en: 'optimal', vi: 'tối ưu' },
  },
};

/** Localized recommendation; unknown token (legacy prose) is returned as-is. */
export function readinessRecoText(stored: string | null | undefined, lang: AppLang): string {
  if (!stored) return '';
  return READINESS_RECO[stored]?.[lang] ?? stored;
}

/** Parse a "rhr:50|sleep:20|load:35" token into {key, score} pairs. */
function parseFactors(stored: string): { key: string; score: number }[] {
  return stored
    .split('|')
    .map((p) => {
      const [key, scoreStr] = p.split(':');
      return { key, score: Number(scoreStr) };
    })
    .filter((p) => FACTOR_LABEL[p.key] && !Number.isNaN(p.score));
}

/**
 * Localized explain line from a token like "rhr:50|sleep:20|load:35" — shows
 * the 2 lowest sub-scores (the limiting factors). Legacy prose (no parseable
 * token) is returned unchanged so old rows still read fine.
 */
export function readinessExplainText(stored: string | null | undefined, lang: AppLang): string {
  if (!stored) return '';
  const parts = parseFactors(stored);
  if (parts.length === 0) return stored; // legacy prose
  const top2 = [...parts].sort((a, b) => a.score - b.score).slice(0, 2);
  return top2
    .map((p) => {
      const bucket = p.score < 40 ? 'low' : p.score > 70 ? 'high' : 'mid';
      return `${FACTOR_LABEL[p.key][lang]}: ${FACTOR_IMPACT[p.key][bucket][lang]} (${Math.round(p.score)})`;
    })
    .join(' · ');
}

/** Sub-scores (0–100) parsed from the explain token, for the gauge tiles. */
export function readinessSubscores(
  stored: string | null | undefined,
): { hrv?: number; rhr?: number; sleep?: number; load?: number } {
  const out: Record<string, number> = {};
  if (!stored) return out;
  for (const p of parseFactors(stored)) out[p.key] = Math.round(p.score);
  return out;
}
