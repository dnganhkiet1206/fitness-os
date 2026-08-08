import type { Bilingual } from './assistant-suggestions';

/**
 * What a metric's last two weeks actually say.
 *
 * ── why this is a sentence and not just a chart ──
 *
 * Tapping a tile used to leave the page for `/biometrics` or `/sleep-insights`.
 * Keeping the analysis here is what makes the assistant a place you *read*
 * rather than a menu you pass through — but a chart on its own would only move
 * the data dump, not fix it. Fourteen bars tell you the shape of a fortnight;
 * they do not tell you whether it was a good one.
 *
 * So every panel leads with an interpreted line — an average against your own
 * baseline, a direction, a count of days you hit the mark — and the chart sits
 * under it as the evidence for that sentence. Same voice as the hero, same
 * rule underneath it.
 *
 * ── the rule underneath ──
 *
 * **Never state a value that is not there**, and its second half, which this
 * file is the first place in the app to need: *never state a trend that is not
 * there either*. A direction computed from two samples is noise wearing the
 * costume of an insight, and it is the failure mode people notice last and
 * trust most. Below `MIN_TREND` readings the panel says how many days it has
 * and stops.
 *
 * Missing days are missing, not zero. A fortnight with four logged nights is
 * four bars and ten gaps, and the average is over four — an average that
 * divides by fourteen would report a person sleeping two hours a night.
 */

export type MetricKind = 'readiness' | 'sleep' | 'kcal' | 'hr';

/** One day's reading. Days with nothing logged are simply absent. */
export interface Point {
  /** ISO date, `YYYY-MM-DD` */
  date: string;
  value: number;
}

export interface Bar {
  date: string;
  /** 0 when the day has no reading — `missing` is what says which it is */
  value: number;
  missing: boolean;
}

export interface Analysis {
  /** the interpreted line, above the chart */
  headline: Bilingual;
  /** two or three figures under it */
  stats: { key: string; label: Bilingual; value: string }[];
  /** oldest → newest, one entry per day in the window including the gaps */
  bars: Bar[];
  /** the rule drawn across the chart, and what it is */
  baseline: { value: number; label: Bilingual } | null;
  /** the question this panel hands to the coach */
  ask: Bilingual;
}

/** Fewer readings than this and no direction is claimed. */
export const MIN_TREND = 4;

/** How many days each panel covers. */
export const WINDOW_DAYS = 14;

const round = (n: number) => Math.round(n);
const group = (n: number, vi: boolean) => n.toLocaleString(vi ? 'vi-VN' : 'en-US');
const hhmm = (min: number, vi: boolean) => {
  const h = Math.floor(min / 60);
  const m = round(min % 60);
  if (vi) return m === 0 ? `${h} giờ` : `${h} giờ ${m} phút`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

/**
 * The window as bars, gaps included.
 *
 * Built from the dates rather than from the readings, so a fortnight is always
 * fourteen columns wide and a run of missing days is visible as a run of gaps.
 * A chart that silently closes up its gaps shows a tidier fortnight than the
 * one that happened.
 */
export function barsFor(points: Point[], days: number, today: Date): Bar[] {
  const byDate = new Map(points.map((p) => [p.date, p.value]));
  const out: Bar[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const v = byDate.get(iso);
    out.push({ date: iso, value: v ?? 0, missing: v == null });
  }
  return out;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Which way the readings are going.
 *
 * The second half against the first half, rather than last-versus-first: one
 * bad night at either end should not be able to declare a fortnight's
 * direction.
 *
 * ── and the **median** of each half, not the mean ──
 *
 * Halves alone were not enough, and the check caught it: nine flat days at 70
 * and one at 120 moves the newer *mean* to 80 and reports a fortnight
 * "trending up" on the strength of a single day. Dividing by five is exactly
 * what makes one outlier worth a fifth of the verdict.
 *
 * A median does not move at all for that day — it is still 70, and the answer
 * is "flat", which is what the fortnight was. That is the whole reason to
 * prefer it here: this number's job is to describe a habit, and a habit is not
 * a thing one day can change.
 *
 * Returns `null` below `MIN_TREND`, which is the honest answer and the one the
 * panel prints instead of a direction.
 */
export function direction(values: number[]): 'up' | 'down' | 'flat' | null {
  if (values.length < MIN_TREND) return null;
  const half = Math.floor(values.length / 2);
  const older = median(values.slice(0, half));
  const newer = median(values.slice(-half));
  if (older === 0) return 'flat';
  const change = (newer - older) / older;
  if (change > 0.05) return 'up';
  if (change < -0.05) return 'down';
  return 'flat';
}

/** "cần thêm N ngày nữa" — said instead of a trend nobody has earned. */
function needMore(n: number): Bilingual {
  const left = MIN_TREND - n;
  return {
    vi: n === 0
      ? 'Chưa có ngày nào được ghi trong hai tuần qua.'
      : `Mới có ${n} ngày được ghi — thêm ${left} ngày nữa là tôi đọc được xu hướng.`,
    en: n === 0
      ? 'Nothing logged in the last two weeks.'
      : `Only ${n} days logged — ${left} more and I can read a trend.`,
  };
}

export interface AnalysisInput {
  kind: MetricKind;
  points: Point[];
  today: Date;
  /** the day's target, for `kcal`; ignored otherwise */
  kcalTarget?: number;
}

export function analyse({ kind, points, today, kcalTarget = 0 }: AnalysisInput): Analysis {
  const bars = barsFor(points, WINDOW_DAYS, today);
  const values = bars.filter((b) => !b.missing).map((b) => b.value);
  const n = values.length;
  const avg = mean(values);
  const dir = direction(values);

  const trend: Bilingual | null =
    dir === null
      ? null
      : dir === 'up'
        ? { vi: 'đang đi lên', en: 'trending up' }
        : dir === 'down'
          ? { vi: 'đang đi xuống', en: 'trending down' }
          : { vi: 'khá ổn định', en: 'holding steady' };

  if (kind === 'sleep') {
    const target = 420; // the app's own seven-hour mark
    const good = values.filter((v) => v >= target).length;
    return {
      headline: n < MIN_TREND
        ? needMore(n)
        : {
            vi: `Bạn ngủ trung bình ${hhmm(avg, true)} trong ${n} đêm ghi được, ${trend!.vi}.`,
            en: `You averaged ${hhmm(avg, false)} across ${n} logged nights, ${trend!.en}.`,
          },
      stats: n === 0 ? [] : [
        { key: 'avg', label: { vi: 'Trung bình', en: 'Average' }, value: hhmm(avg, true) },
        { key: 'good', label: { vi: 'Đêm đủ 7 giờ', en: 'Nights over 7h' }, value: `${good}/${n}` },
      ],
      bars,
      baseline: { value: target, label: { vi: '7 giờ', en: '7h' } },
      ask: {
        vi: n === 0
          ? 'Tôi chưa ghi giấc ngủ bao giờ. Nên bắt đầu theo dõi thế nào và cần chú ý điều gì?'
          : `Hai tuần qua tôi ngủ trung bình ${hhmm(avg, true)} mỗi đêm, ${good}/${n} đêm đủ 7 giờ. Tôi nên cải thiện thế nào?`,
        en: n === 0
          ? 'I haven’t logged any sleep yet. How should I start tracking it, and what should I watch for?'
          : `Over the last two weeks I averaged ${hhmm(avg, false)} a night, with ${good} of ${n} nights over 7h. How should I improve?`,
      },
    };
  }

  if (kind === 'kcal') {
    const hit = kcalTarget > 0 ? values.filter((v) => v >= kcalTarget * 0.9 && v <= kcalTarget * 1.1).length : 0;
    return {
      headline: n < MIN_TREND
        ? needMore(n)
        : kcalTarget > 0
          ? {
              vi: `Bạn ăn trung bình ${group(round(avg), true)} kcal mỗi ngày, ${hit}/${n} ngày sát mục tiêu ${group(kcalTarget, true)}.`,
              en: `You averaged ${group(round(avg), false)} kcal a day, hitting close to your ${group(kcalTarget, false)} target on ${hit} of ${n} days.`,
            }
          : {
              vi: `Bạn ăn trung bình ${group(round(avg), true)} kcal mỗi ngày, ${trend!.vi}.`,
              en: `You averaged ${group(round(avg), false)} kcal a day, ${trend!.en}.`,
            },
      stats: n === 0 ? [] : [
        { key: 'avg', label: { vi: 'Trung bình', en: 'Average' }, value: `${group(round(avg), true)} kcal` },
        ...(kcalTarget > 0
          ? [{ key: 'hit', label: { vi: 'Ngày sát mục tiêu', en: 'Days on target' }, value: `${hit}/${n}` }]
          : []),
      ],
      bars,
      baseline: kcalTarget > 0
        ? { value: kcalTarget, label: { vi: `${group(kcalTarget, true)} kcal`, en: `${group(kcalTarget, false)} kcal` } }
        : null,
      ask: {
        vi: n === 0
          ? 'Tôi chưa ghi bữa ăn nào. Nên bắt đầu theo dõi calo thế nào cho dễ duy trì?'
          : `Hai tuần qua tôi ăn trung bình ${group(round(avg), true)} kcal mỗi ngày${kcalTarget > 0 ? `, mục tiêu là ${group(kcalTarget, true)} kcal` : ''}. Tôi nên điều chỉnh gì?`,
        en: n === 0
          ? 'I haven’t logged any meals. How should I start tracking calories in a way I’ll keep up?'
          : `Over the last two weeks I averaged ${group(round(avg), false)} kcal a day${kcalTarget > 0 ? `, against a ${group(kcalTarget, false)} target` : ''}. What should I change?`,
      },
    };
  }

  if (kind === 'hr') {
    const lo = n ? Math.min(...values) : 0;
    const hi = n ? Math.max(...values) : 0;
    return {
      headline: n < MIN_TREND
        ? needMore(n)
        : {
            /* A falling resting heart rate is usually the good direction, so the
               word is chosen rather than borrowed from `trend` — "nhịp tim đang
               đi lên" reads as praise and is the opposite. */
            vi: `Nhịp tim nghỉ trung bình ${round(avg)} bpm qua ${n} ngày${dir === 'down' ? ', đang giảm dần' : dir === 'up' ? ', đang nhích lên' : ''}.`,
            en: `Your resting heart rate averaged ${round(avg)} bpm over ${n} days${dir === 'down' ? ', drifting down' : dir === 'up' ? ', creeping up' : ''}.`,
          },
      stats: n === 0 ? [] : [
        { key: 'avg', label: { vi: 'Trung bình', en: 'Average' }, value: `${round(avg)} bpm` },
        { key: 'range', label: { vi: 'Thấp nhất — cao nhất', en: 'Low — high' }, value: `${round(lo)}–${round(hi)}` },
      ],
      bars,
      baseline: n ? { value: avg, label: { vi: 'Trung bình', en: 'Average' } } : null,
      ask: {
        vi: n === 0
          ? 'Tôi chưa có dữ liệu nhịp tim. Nên đo thế nào và con số nào là đáng chú ý?'
          : `Nhịp tim nghỉ của tôi trung bình ${round(avg)} bpm trong ${n} ngày qua, dao động ${round(lo)}–${round(hi)}. Điều đó nói lên gì?`,
        en: n === 0
          ? 'I have no heart-rate data yet. How should I measure it, and what numbers matter?'
          : `My resting heart rate averaged ${round(avg)} bpm over ${n} days, ranging ${round(lo)}–${round(hi)}. What does that tell me?`,
      },
    };
  }

  // readiness
  const best = n ? Math.max(...values) : 0;
  return {
    headline: n < MIN_TREND
      ? needMore(n)
      : {
          vi: `Điểm sẵn sàng trung bình ${round(avg)}/100 qua ${n} ngày, ${trend!.vi}.`,
          en: `Your readiness averaged ${round(avg)}/100 over ${n} days, ${trend!.en}.`,
        },
    stats: n === 0 ? [] : [
      { key: 'avg', label: { vi: 'Trung bình', en: 'Average' }, value: `${round(avg)}/100` },
      { key: 'best', label: { vi: 'Cao nhất', en: 'Best' }, value: `${round(best)}` },
    ],
    bars,
    baseline: n ? { value: avg, label: { vi: 'Trung bình', en: 'Average' } } : null,
    /*
      ── the question may not borrow the trend either ──

      This read `${trend!.vi}` on every branch with a reading, and `trend` is
      null below `MIN_TREND` — so anyone with one, two or three readiness scores
      crashed the panel. The `!` is what hid it: the type said "there is a
      trend" on a path where the code says there is not.

      Caught by `tools/metric-analysis.mjs` on its second case, which is the
      whole reason the fixtures include a two-day series rather than only
      full and empty ones.
    */
    ask: {
      vi: n === 0
        ? 'Tôi chưa có điểm sẵn sàng nào. Điểm này được tính từ đâu và làm sao để có?'
        : trend
          ? `Điểm sẵn sàng của tôi trung bình ${round(avg)}/100 trong ${n} ngày qua và ${trend.vi}. Tôi nên làm gì để cải thiện?`
          : `Tôi mới có ${n} ngày điểm sẵn sàng, trung bình ${round(avg)}/100. Điểm này nói lên gì và tôi nên cải thiện thế nào?`,
      en: n === 0
        ? 'I have no readiness scores yet. What is the score built from and how do I get one?'
        : trend
          ? `My readiness averaged ${round(avg)}/100 over the last ${n} days and is ${trend.en}. What should I do to improve it?`
          : `I only have ${n} days of readiness scores, averaging ${round(avg)}/100. What does that tell me and how do I improve it?`,
    },
  };
}
