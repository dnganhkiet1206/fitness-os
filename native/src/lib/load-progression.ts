import { goalRpeTarget } from '@/lib/goal-training';
import { DEFAULT_RPE } from '@/lib/prescription';
import { hasRecoverySignal } from '@/lib/readiness-i18n';
import type { Confidence, Situation } from '@/lib/user-state';

/**
 * Whether a workout is asking for the right amount, judged by what the person
 * said it felt like.
 *
 * ── the two halves the app already had, never introduced ──
 *
 * A saved workout records the effort it *asks for*: `rpe` per exercise,
 * defaulting to `DEFAULT_RPE`, summarised by `effortRange` in
 * `lib/prescription.ts`. And a logged session records the effort the person
 * *reported*: `session_rpe`, on a 6–10 scale, on the sheet they fill in
 * afterwards.
 *
 * Both have been stored for a long time. Nothing has ever compared them. So the
 * app could show you that Monday's workout asked for a 7 and that you called it
 * a 9, on two different screens, and draw no conclusion from it — while
 * `prescription.ts`, the file named for this, is pure formatting.
 *
 * ── what this is, and what it deliberately is not ──
 *
 * This is RPE autoregulation, which is the ordinary method: instead of fixing a
 * load as a percentage of a maximum, you set a target effort and let the load
 * follow how the person actually feels. The evidence supports it as at least
 * equal to percentage-based prescription for strength, and the scale it uses is
 * the standard one — RPE 7 ≈ three reps in reserve, 8 ≈ two, 9 ≈ one, 10 ≈ none.
 *
 * It is **a suggestion and never a change.** Nothing here writes to a template.
 * The output is a sentence a person can act on or ignore, for the same reason
 * the rest of this app stopped scoring people with their streak: motivation that
 * survives is autonomous, and an app that silently rewrites somebody's training
 * because it has an opinion about their Tuesday is not supporting autonomy, it
 * is taking it.
 *
 * ── the guardrails are the work ──
 *
 * A single session is never evidence. Self-reported RPE is noisier the newer
 * somebody is, and a hard day has a hundred causes that are not the programme —
 * a bad night, a long shift, a heavy meal an hour before. Everything below
 * exists to stop one Tuesday from moving anybody's training.
 */

/** What to do about the load, or that there is nothing to say. */
export type LoadAdvice = 'up' | 'hold' | 'down' | 'unknown';

export interface LoadSuggestion {
  advice: LoadAdvice;
  confidence: Confidence;
  /**
   * Suggested change as a fraction of the current load — `0.05` is "about five
   * per cent more". Zero for `hold` and `unknown`.
   *
   * A **fraction**, never kilograms. The same lesson `DROP_FRACTION` cost:
   * an absolute step is strict for somebody pressing 30 kg and meaningless for
   * somebody squatting 140.
   */
  step: number;
  /**
   * The effort this verdict was measured against, after the fallbacks below.
   *
   * ── returned rather than re-derived ──
   *
   * The one screen that shows this advice also names the number in its sentence
   * — *"your recent sessions felt easier than N"*. It had `N` as its own local
   * value, so the sentence and the verdict were two readings of the same thing
   * and only one of them applied `goalRpeTarget`. A screen that recomputed the
   * fallback would be a second copy of this file's rule, drifting the first time
   * either moved.
   *
   * So the engine says what it aimed at, and the sentence quotes it.
   */
  target: number;
  /** why, for the debug screen and for the sentence a screen chooses */
  because: string;
}

/**
 * The fewest sessions of the same workout that can move anything.
 *
 * Three. Two can be one good week and one bad one, and the whole failure this
 * is built against — reacting to a single hard Tuesday — is only one session
 * away from that.
 */
export const MIN_SESSIONS = 3;

/**
 * How far the average reported effort has to sit from the target.
 *
 * A whole point on the scale. The RPE scale is self-reported in integers and
 * people are not consistent to a half point; anything tighter would be reading
 * noise. One point is also a meaningful difference in the scale's own terms —
 * roughly one rep in reserve.
 */
export const RPE_MARGIN = 1;

/** The most this will ever suggest moving a load at once. */
export const MAX_STEP = 0.1;

/** The step for a load that is clearly too light, or clearly too heavy. */
export const STEP = 0.05;

export interface LoadInput {
  /**
   * Reported `session_rpe` for recent sessions of the same workout, newest
   * first. Nulls are dropped — a session where nobody answered is not a zero.
   */
  reported: (number | null | undefined)[];
  /**
   * The effort the workout asks for.
   *
   * When the workout says nothing, the fallback comes from the person's **goal**
   * rather than a flat constant — see `lib/goal-training.ts`. Somebody training
   * for strength and somebody training to hold steady should not both be
   * measured against 7 by default; that was the shape of `goal` reaching the
   * nutrition half of the app and nothing else.
   *
   * A workout that *does* state its effort keeps it. The person who wrote the
   * workout knows more about it than a goal label does.
   */
  target?: number | null;
  /** `profiles.goal`, used only for the fallback above. */
  goal?: string | null;
  /** How the person is doing overall — `lib/user-state.ts`. */
  situation?: Situation;
  /** How sure the app is about that. */
  situationConfidence?: Confidence;
  /** Today's readiness status, when it has been computed. */
  readiness?: 'green' | 'yellow' | 'red' | null;
  /**
   * `daily_logs.readiness_explain` for the same day — the token the engine
   * wrote, passed through untouched. The red gate below is a recovery
   * question and the status alone cannot answer it; `hasRecoverySignal` reads
   * this. Absent means "nothing here says recovery was measured", which is
   * what an unread row honestly is.
   */
  readinessExplain?: string | null;
}

const NOTHING: Omit<LoadSuggestion, 'target'> = {
  advice: 'unknown',
  confidence: 'none',
  step: 0,
  because: 'chưa đủ dữ liệu để nói gì',
};

export function suggestLoad(input: LoadInput): LoadSuggestion {
  const target = Number(input.target) || goalRpeTarget(input.goal) || DEFAULT_RPE;
  const said = input.reported
    .map((r) => Number(r))
    .filter((r) => Number.isFinite(r) && r > 0);

  /* ── 1. not enough sessions is not a light programme ── */
  if (said.length < MIN_SESSIONS) {
    return {
      ...NOTHING,
      target,
      because: `mới ${said.length} buổi có ghi mức gắng sức, cần ${MIN_SESSIONS}`,
    };
  }

  const mean = said.reduce((n, r) => n + r, 0) / said.length;
  const gap = mean - target;
  const confidence: Confidence =
    said.length >= MIN_SESSIONS * 2 ? 'high' : said.length > MIN_SESSIONS ? 'medium' : 'low';

  /*
    ── 2. too hard outranks everything, and is never blocked ──

    Ordered first on purpose. Every gate below can stop the app suggesting
    *more*; none of them may stop it suggesting *less*. A person reporting 9s
    against a target of 7 is telling the app something, and the one reading
    under which it would be right to stay quiet does not exist.
  */
  if (gap >= RPE_MARGIN) {
    return {
      advice: 'down',
      confidence,
      target,
      step: -Math.min(STEP * Math.round(gap), MAX_STEP),
      because: `trung bình ${mean.toFixed(1)} so với mức đặt ${target} qua ${said.length} buổi`,
    };
  }

  /*
    ── 3. and the gates on suggesting more ──

    These are the only advice in the app that can contribute to somebody getting
    hurt, so each one is a situation where "add load" is the wrong sentence
    however light the sessions felt:

      · **overreaching** — training already running well ahead of what this body
        is used to. Feeling fine is not evidence against a load spike; it is
        often what a load spike feels like on the way in.
      · **returning** — first sessions back after a real absence. They are
        *supposed* to feel easy, and the easiness is the programme working.
      · **readiness red** — the app's own reading of this morning says recover.
        Two parts of one app telling somebody opposite things on the same screen
        is worse than either being silent.

    `hold` rather than `unknown`: the app does know what it thinks, and saying
    "steady for now, here is why" is information. `unknown` is for when there is
    nothing to say at all.
  */
  if (gap <= -RPE_MARGIN) {
    const known = input.situationConfidence != null && input.situationConfidence !== 'none';
    if (known && input.situation === 'overreaching') {
      return {
        advice: 'hold',
        confidence,
        target,
        step: 0,
        because: 'nhẹ hơn mức đặt, nhưng tải đang chạy trước xa thói quen — giữ nguyên',
      };
    }
    if (known && input.situation === 'returning') {
      return {
        advice: 'hold',
        confidence,
        target,
        step: 0,
        because: 'nhẹ hơn mức đặt, nhưng đây là những buổi đầu quay lại — nhẹ là đúng ý đồ',
      };
    }
    /*
      ── the red has to be a red about recovery ──

      This was `if (input.readiness === 'red')`, and the comment above it says
      what the branch is for: *"the app's own reading of this morning says
      recover"*. A readiness score does not have to be a reading of recovery to
      be red. Training load is a full dimension of it, and a load-only score is
      low for exactly one reason — the person has not been training.

      Driven through this function, with the score a real account produces from
      a heavy 28-day base and one small session in the last week
      (`45 / red / acwr 0.01 / explain "load:45"`):

          readiness 'red', explain "load:45"   → hold, step 0
          readiness null                       → up,   step 0.1

      So the hold fired on somebody whose only measured problem was training too
      little, and the thing it withheld was the suggestion to train more.

      `hasRecoverySignal` is the shared rule over the engine's own token — sleep,
      HRV or resting heart rate. A red backed by any of those still holds,
      exactly as before; the mathematics above and below is untouched.
    */
    if (input.readiness === 'red' && hasRecoverySignal(input.readinessExplain)) {
      return {
        advice: 'hold',
        confidence,
        target,
        step: 0,
        because: 'nhẹ hơn mức đặt, nhưng điểm sẵn sàng hôm nay đang đỏ',
      };
    }
    return {
      advice: 'up',
      confidence,
      target,
      step: Math.min(STEP * Math.round(-gap), MAX_STEP),
      because: `trung bình ${mean.toFixed(1)} so với mức đặt ${target} qua ${said.length} buổi`,
    };
  }

  return {
    advice: 'hold',
    confidence,
    target,
    step: 0,
    because: `trung bình ${mean.toFixed(1)}, đúng quanh mức đặt ${target}`,
  };
}
