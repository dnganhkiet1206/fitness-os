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
  /* Green with no ACWR at all. `green_watch` used to answer this case and told
     people their ratio was high when none had been computed — see the branch
     in `readiness-engine.ts`. Says what is true instead: there is no training
     history yet, so build one gradually. */
  green_no_load: {
    en: 'Ready to train. No sessions yet to compute ACWR — add volume gradually.',
    vi: 'Sẵn sàng tập. Chưa có buổi tập nào để tính ACWR — tăng khối lượng từ từ.',
  },
  yellow_sleep: {
    en: 'Keep the intensity, cut total sets by 15%. Prioritize sleep tonight.',
    vi: 'Giữ cường độ, giảm 15% tổng sets. Ưu tiên ngủ tối nay.',
  },
  yellow_reduce: {
    en: 'Reduce volume 5–10%. Focus on technique and recovery.',
    vi: 'Giảm volume 5–10%. Tập trung kỹ thuật và phục hồi.',
  },
  /* Red where the only thing measured was training load. `red_recover` used to
     answer this too and prescribed active recovery to somebody whose sleep,
     HRV and resting heart rate the app had never read — see the branch in
     `readiness-engine.ts`. Names the cause it actually has, and says plainly
     that recovery is unmeasured rather than implying it was measured and bad.
     Steering "back toward your usual" is right in both directions: a load-only
     red is a ratio far under 0.65 or far over 1.6, and this copy does not have
     to guess which. */
  red_load_only: {
    en: 'Low from training load, not recovery. Steer volume back toward your usual, and log sleep for a fuller reading.',
    vi: 'Điểm thấp do tải tập, không phải do phục hồi. Đưa khối lượng về gần thói quen, và ghi giấc ngủ để có thêm cơ sở.',
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

/**
 * The three dimensions that are measurements of *recovery*.
 *
 * Training load is the fourth dimension of readiness and a real one — it has a
 * band and a weight like the other three, and it belongs in the score. What it
 * is not is a reading of how somebody recovered. It is a description of what
 * they did to themselves, computed entirely from sessions they logged.
 */
export const RECOVERY_COMPONENTS = ['hrv', 'rhr', 'sleep'] as const;

/**
 * Did this stored readiness rest on anything that measured recovery?
 *
 * ── the two sentences this exists to stop ──
 *
 * `readiness_score` and `readiness_status` cross every consumer boundary in
 * this app carrying no record of what produced them. Measured on PostgreSQL
 * 16.13, in all six timezones, for somebody with a heavy 28-day base and one
 * small session in the last week:
 *
 *     điểm 45 · trạng thái red · acwr 0.01 · explain "load:45"
 *
 * ACWR of **0.01** — this person has barely trained. Nothing about their sleep,
 * their heart rate or their HRV was measured at all. Two screens then read that
 * red and acted on it as a recovery failure:
 *
 *   · weekly-review offered *"Cân nhắc tuần deload: giảm 40-50% volume"* — cut
 *     the volume of somebody who is already not training — three lines below
 *     its own ACWR rule saying *"Có thể tăng 10-15% volume"*.
 *   · `suggestLoad` turned an `up` into a `hold`, because
 *     `input.readiness === 'red'`, over the reason *"điểm sẵn sàng hôm nay đang
 *     đỏ"*. Driven through the real function: `red` → hold, `null` → up.
 *
 * Both are the same mistake, and it is not the score's mistake. The score is a
 * correct weighted answer over what could be read. The mistake is a consumer
 * asking a recovery question of a number that measured no recovery.
 *
 * ── why it lives here, beside the parser ──
 *
 * `readiness_explain` already encodes every sub-score the engine measured — it
 * is what the gauge's confidence chip is counted from — so there is nothing new
 * to store and no new column. The parsing is `readinessSubscores`, the one
 * parser, and this sits directly on top of it so that no screen ever matches on
 * the token by hand: this repository has been bitten by a duplicated rule six
 * times, and a second idea of "what counts as recovery" is exactly the shape
 * that goes wrong without a symptom.
 *
 * Absent, empty or unparseable is `false`. A row nobody can read is not
 * evidence that recovery was measured.
 */
export function hasRecoverySignal(stored: string | null | undefined): boolean {
  const subs = readinessSubscores(stored) as Record<string, number | undefined>;
  return RECOVERY_COMPONENTS.some((k) => subs[k] != null);
}
