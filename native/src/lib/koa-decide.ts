import type { MascotEmotion } from '@/lib/mascot-emotion';
import type { KoaEvent } from '@/lib/koa-event';

/**
 * What Koa does about something that just happened — one function, no state.
 *
 * ── why this exists as one place ──
 *
 * The decisions were real but scattered. Whether to speak lived in
 * `mascot-message`, whether to perform lived in `mascot-budget`, which face to
 * wear lived in `koa-emotion`, and each was reached from a different hook at a
 * different moment. Three good rules that never met, so nothing could answer
 * the only question that matters — *given what just happened, what should the
 * character do* — and nothing could be tuned without opening three files.
 *
 * This takes an event and a context and returns the whole reaction at once.
 * It touches no store, no clock and no query, which is what lets
 * `tools/koa-decide.mjs` play a week through it and read the answers.
 *
 * ── intensity is the thing that was missing ──
 *
 * Emotions here were categorical: `celebrate` or not. So drinking a glass of
 * water and finishing a hundred-day streak produced the same performance, and
 * the only way to make the big one feel bigger was to invent a second animation
 * for it. Intensity is one number instead: it scales how far the figure travels,
 * how long it stays and whether it says anything at all, from the same handful
 * of movements. A range of feeling out of a small set of parts — the same trick
 * the expressions use.
 *
 * ── and silence is a decision, not an absence ──
 *
 * `shouldReact: false` is returned deliberately and often. The character that
 * reacts to everything is the character nobody looks at; the rationing that
 * enforces it lives in `mascot-budget`, and the *judgement* — this was too
 * small to be worth a moment — lives here.
 */

export interface KoaContext {
  /** local hour, 0–23 */
  hour: number;
  /** consecutive days, 0 when the run is over */
  streak: number;
  /** how many of the five are done today */
  doneToday: number;
  /** today has nothing in it yet */
  emptyToday: boolean;
  /** the person is on a screen where a reaction can be seen */
  visible: boolean;
  /** reduce motion is on — reactions still happen, they just do not travel */
  reduced?: boolean;
}

export interface KoaDecision {
  shouldReact: boolean;
  emotion: MascotEmotion;
  /** 0..1 — scales travel, hold and whether there are words */
  intensity: number;
  /** what the figure looks at while it reacts */
  gaze: 'user' | 'event' | 'away';
  /** how long the reaction holds, ms */
  hold: number;
  /** which line to say, or null for a reaction with no words */
  say: KoaLine | null;
  /** why this came out the way it did — for the debug screen, not for users */
  because: string;
}

/**
 * Dialogue is chosen as an *intent*, never as a string.
 *
 * The engine picks what Koa means; the screen picks the words in the person's
 * language. Returning text from here would put English in a decision table and
 * make every future language a change to the logic.
 */
export type KoaLine =
  | 'praise_small'
  | 'praise_big'
  | 'proud_record'
  | 'welcome_back'
  | 'streak_saved'
  | 'streak_risk'
  | 'day_complete';

/** Below this, a moment is not worth interrupting anybody for. */
export const QUIET_BELOW = 0.25;
/** At or above this, the reaction gets words as well as a face. */
export const SPEAK_ABOVE = 0.6;

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

export function decide(event: KoaEvent, ctx: KoaContext): KoaDecision {
  const m = clamp01(event.magnitude);

  /* Nothing is performed to an empty room. This is not the rationing — that is
     `mascot-budget` — it is the simpler fact that a reaction nobody is looking
     at is not a reaction, and spending one would be worse than skipping it. */
  const quiet = (because: string): KoaDecision => ({
    shouldReact: false,
    emotion: 'idle',
    intensity: 0,
    gaze: 'away',
    hold: 0,
    say: null,
    because,
  });

  if (!ctx.visible) return quiet('không ai đang nhìn');

  switch (event.kind) {
    /* ── the five daily boxes ──
       Small by design and small on purpose: these happen every day, and a
       character that throws a party for a glass of water has nothing left for
       the day somebody comes back after a fortnight. */
    case 'quest_done': {
      if (m < QUIET_BELOW) return quiet('việc thường ngày, quá nhỏ để cắt ngang');
      return {
        shouldReact: true,
        emotion: questEmotion(event.quest),
        intensity: 0.3 + m * 0.3,
        gaze: 'event',
        hold: 900 + m * 400,
        say: null,
        because: `việc hằng ngày (${event.quest ?? '?'}), độ lớn ${m.toFixed(2)}`,
      };
    }

    /* All five in one day is the only *daily* thing that is genuinely rare. */
    case 'day_complete':
      return {
        shouldReact: true,
        emotion: 'celebrate',
        intensity: clamp01(0.7 + m * 0.3),
        gaze: 'user',
        hold: 1600,
        say: 'day_complete',
        because: 'xong cả năm việc trong ngày',
      };

    case 'personal_record':
      return {
        shouldReact: true,
        emotion: 'proud',
        intensity: clamp01(0.75 + m * 0.25),
        /* Look at the number first, then at the person — a companion that
           notices *what happened* reads differently from one that only ever
           looks at you and smiles. */
        gaze: 'event',
        hold: 2000,
        say: 'proud_record',
        because: 'kỷ lục cá nhân',
      };

    case 'award_earned':
    case 'level_up':
      return {
        shouldReact: true,
        emotion: m >= 0.7 ? 'celebrate' : 'proud',
        intensity: clamp01(0.5 + m * 0.5),
        gaze: 'user',
        hold: 1400 + m * 600,
        say: m >= SPEAK_ABOVE ? 'praise_big' : 'praise_small',
        because: `huy hiệu/cấp độ, độ lớn ${m.toFixed(2)}`,
      };

    /* ── the two that are about the person, not the score ── */
    case 'comeback':
      return {
        shouldReact: true,
        /* Not `celebrate`. Somebody returning after two weeks does not need
           confetti about the fortnight they missed; they need to be met. */
        emotion: 'happy',
        intensity: clamp01(0.5 + m * 0.4),
        gaze: 'user',
        hold: 1800,
        say: 'welcome_back',
        because: `quay lại sau ${event.days ?? '?'} ngày`,
      };

    case 'streak_saved':
      return {
        shouldReact: true,
        emotion: 'rested',
        intensity: 0.45,
        gaze: 'user',
        hold: 1400,
        say: 'streak_saved',
        because: 'bảo hiểm chuỗi đã bù một ngày lỡ',
      };

    case 'streak_at_risk': {
      /* The one reaction that is not a reward, and the only one gated on the
         person's own clock rather than on a magnitude. Below three days there
         is nothing at stake worth a worried face — see `RISK_MIN_STREAK`. */
      if (ctx.streak < 3) return quiet('chuỗi còn quá ngắn để đáng lo');
      if (!ctx.emptyToday) return quiet('hôm nay đã có ghi rồi');
      return {
        shouldReact: true,
        emotion: 'worry',
        intensity: clamp01(0.4 + streakWeight(ctx.streak) * 0.4),
        gaze: 'user',
        hold: 2000,
        say: 'streak_risk',
        because: `chuỗi ${ctx.streak} ngày chưa được nuôi, và trời đã muộn`,
      };
    }

    case 'koa_greeted':
      return {
        shouldReact: true,
        emotion: ctx.hour >= 22 || ctx.hour < 6 ? 'sleep' : 'wave',
        intensity: 0.35,
        gaze: 'user',
        hold: 1200,
        say: null,
        because: 'người dùng chủ động mở/chạm Koa',
      };
  }
}

/** The face for each of the five — the same map the card peek uses. */
function questEmotion(q: KoaEvent['quest']): MascotEmotion {
  switch (q) {
    case 'workout':
      return 'proud';
    case 'sleep':
      return 'rested';
    case 'steps':
      return 'happy';
    case 'meal':
      return 'celebrate';
    default:
      return 'idle';
  }
}

/** 0..1 from a streak length, on the same log curve as `streakMagnitude`. */
const streakWeight = (days: number) =>
  clamp01(Math.log10(Math.max(days, 1)) / Math.log10(365));

/**
 * Which string key each intent reads.
 *
 * The engine never returns text. This table is the only place the two meet, and
 * it lives beside the intents rather than inside a screen so that adding a
 * language is a change to `native-strings.ts` and nothing else.
 */
export const KOA_LINE_KEY: Record<KoaLine, string> = {
  praise_small: 'nKoaPraiseSmall',
  praise_big: 'nKoaPraiseBig',
  proud_record: 'nKoaProudRecord',
  welcome_back: 'nKoaWelcomeBack',
  streak_saved: 'nKoaStreakSaved',
  streak_risk: 'nKoaStreakRisk',
  day_complete: 'nKoaDayComplete',
};

/**
 * How long a reaction stays live for the purposes of outranking a new one.
 *
 * Roughly the length of the longest reaction, so "still on stage" and "still
 * being watched" are the same window.
 */
export const LIVE_MS = 2600;

/**
 * Does a new reaction get to interrupt the one already playing?
 *
 * ── why the loser is dropped and not queued ──
 *
 * Events arrive together far more often than they arrive alone: finishing a
 * workout can grant a medal, cross a level and complete the day inside the same
 * second. A queue turns that into four reactions back to back, which is the
 * spam the whole engine exists to prevent — and the fourth one lands long after
 * the person has stopped connecting it to anything they did.
 *
 * So a bigger moment replaces a smaller one, a smaller one is discarded, and
 * Koa reacts to *the biggest thing that happened*, once. Equal intensity keeps
 * the incumbent: the one already on screen has the better claim.
 */
export function outranks(
  live: { intensity: number; at: number } | null,
  next: number,
  now: number,
): boolean {
  if (!live) return true;
  if (now - live.at >= LIVE_MS) return true;
  return next > live.intensity;
}
