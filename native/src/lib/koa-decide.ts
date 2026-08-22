import { streakInDanger, type MascotEmotion } from '@/lib/mascot-emotion';
import type { KoaEvent } from '@/lib/koa-event';
import type { MascotMood } from '@/hooks/use-mascot';
import type { UserState } from '@/lib/user-state';

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
  /**
   * The day's mood, computed by `moodFrom` from cache.
   *
   * Here rather than in the companion component because this interface *is* the
   * companion layer's view of the day, and because the alternative was a second
   * place that reads the same two cache entries. `decide` does not read it; the
   * character's face does.
   */
  mood: MascotMood;
  /** consecutive days, 0 when the run is over */
  streak: number;
  /**
   * What kind of stretch this person is in — `lib/user-state.ts`.
   *
   * ── what this replaced ──
   *
   * A field called `doneToday`, typed `number`, documented as "how many of the
   * five are done today". It was **hard-coded to 0** at its only real caller,
   * with a note admitting `decide` never read it and that it was kept because
   * the debug screen printed it. So the debug screen printed `xong 0/5` at
   * somebody who had finished four — a diagnostic tool stating a number that
   * was never once true.
   *
   * The context did need more than the hour and the streak. It needed something
   * the app can actually compute, and something worth deciding on: the
   * difference between a person who missed Tuesday, a person who has managed one
   * day in a fortnight, and a person who has been here five days and has no
   * baseline at all. The streak reads all three as the same number.
   *
   * Optional, and every branch that reads it must survive its absence: a screen
   * that never fetched the streak has no state, and `settling_in` at confidence
   * `none` is the honest value for that — the same value a brand-new account
   * gets, for the same reason.
   */
  state?: UserState;
  /** today has nothing in it yet */
  emptyToday: boolean;
  /** the person is on a screen where a reaction can be seen */
  visible: boolean;
  /** the hour this person is actually late by — `lib/user-rhythm.ts` */
  riskHour?: number;
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
/**
 * Where generic praise stops being small and starts being big.
 *
 * ── the comment here used to claim more than the constant does ──
 *
 * It read *"at or above this, the reaction gets words as well as a face"*, and
 * that was never true of the code. It is used in exactly one place — the
 * `award_earned` / `level_up` branch, to pick between `praise_small` and
 * `praise_big` — while `streak_saved` speaks at 0.45 and `comeback` speaks from
 * 0.5. Those are not violations of a rule; they are the answer to a different
 * question.
 *
 * The distinction the engine actually draws is `QUIET_BELOW`: is this worth
 * interrupting anybody for. Above that line, whether there are words depends on
 * whether the moment is *about the person* — coming back, a run saved, a record
 * — or merely about a number going up, and a number going up gets a face until
 * it is big enough to be worth a sentence. That judgement is per branch, which
 * is why it is written in each branch.
 *
 * Left as a threshold on praise, with the claim removed. A constant that says
 * it governs the whole engine, and governs one branch, is the kind of thing a
 * later reader builds on.
 */
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
         person's own clock rather than on a magnitude. The test is
         `streakInDanger` — the same function the held face uses, because this
         had already drifted into a second opinion that skipped the hour. */
      /* `ctx` whole, not a spread that re-assigns one field to itself — that
         spelling is what hid the missing `riskHour` for as long as it did. */
      if (!streakInDanger(ctx)) {
        return quiet(
          ctx.streak < 3
            ? 'chuỗi còn quá ngắn để đáng lo'
            : !ctx.emptyToday
              ? 'hôm nay đã có ghi rồi'
              : 'chưa tới giờ mà người này thường ghi',
        );
      }
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

    /* ── the one moment the person starts ── */
    case 'koa_greeted': {
      /* Night first: a character that bounces awake at three in the morning
         because you touched it is a character with no state at all. */
      if (ctx.hour >= 22 || ctx.hour < 6) {
        return {
          shouldReact: true,
          emotion: 'sleep',
          intensity: 0.3,
          gaze: 'user',
          hold: 1200,
          say: null,
          because: 'người dùng chạm Koa lúc đêm',
        };
      }

      /*
        ── and this is where the state layer earns its place ──

        A greeting is the one interaction the person initiates, which makes it
        the only place a companion can respond to *them* rather than to a score.
        It used to be a constant: the same wave, at the same intensity, for the
        person on a two-hundred-day run and the person opening the app for the
        first time since a fortnight ago.

        Two situations change the answer, and both are read from
        `lib/user-state.ts` rather than guessed here:

          · **returning.** They were away and they came back. That is the most
            fragile moment in the whole product, and the reaction to it is
            warmth — `welcome_back`, the line written for exactly this and
            reachable until now only from an automatic comeback event they had
            to be lucky to see. Nothing about the days missed: the magnitude
            curve already flattens past a fortnight so that a longer absence
            cannot read as a bigger occasion, which would be congratulating
            somebody for having been away.
          · **overreaching.** Load running well ahead of what their body is
            used to. Koa acknowledges them and stays quiet: a cheerful bounce at
            somebody in a load spike is the one greeting in this list that could
            push a person toward an injury, and silence is the only honest
            alternative to a medical claim the app is in no position to make.

            The emotion is `idle` and that is a correction to my own first
            draft, which used `rested`. `rested` is not a mood in this app — it
            carries `outfit: { head: 'beanie' }`, added so that a one-second
            *peek* crop of nothing but a face could still say "slept". Used as a
            greeting it would have put a woolly hat on the character every time
            somebody in a load spike tapped it, which is a costume change
            dressed up as a reaction.

        `slipping` is deliberately **not** in this list. Somebody below their
        own baseline is having a hard fortnight, and a character that changes
        its face about it is a character commenting on it. The right response to
        a hard fortnight is an ordinary greeting — which is what they get.

        And nothing is read at all without confidence: at `none` this falls
        through to the plain wave, so a five-day-old account is greeted exactly
        as a stranger should be.
      */
      const st = ctx.state;
      const known = st != null && st.confidence !== 'none';

      if (known && st.situation === 'returning') {
        return {
          shouldReact: true,
          emotion: 'happy',
          intensity: 0.55,
          gaze: 'user',
          hold: 1800,
          say: 'welcome_back',
          because: `chạm Koa sau khi quay lại — ${st.because}`,
        };
      }

      if (known && st.situation === 'overreaching') {
        return {
          shouldReact: true,
          emotion: 'idle',
          intensity: 0.3,
          gaze: 'user',
          hold: 1400,
          say: null,
          because: `chạm Koa khi đang quá tải — ${st.because}`,
        };
      }

      return {
        shouldReact: true,
        emotion: 'wave',
        intensity: 0.35,
        gaze: 'user',
        hold: 1200,
        say: null,
        because: 'người dùng chủ động mở/chạm Koa',
      };
    }
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
