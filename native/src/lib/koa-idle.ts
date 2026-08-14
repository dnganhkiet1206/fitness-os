import type { MascotEmotion } from '@/lib/mascot-emotion';

/**
 * How much Koa moves while nothing is happening — and why that is almost none.
 *
 * ── the contradiction this exists to remove ──
 *
 * The character's **face** has been state-driven for a while: `baseEmotion`
 * reads the day and returns one of fifteen emotions, and the figure draws it.
 * The character's **body**, on the home screen, was not. The widget floated on
 * a permanent loop, swayed ±9° on a permanent loop, and fired a random quirk —
 * a hop, a double-nod, or **a full 360° flip** — every six to fourteen seconds,
 * for ever, gated on nothing but "is the tab focused" and "is the mood tired".
 *
 * So the two halves of one character disagreed. At eleven at night, with the
 * day logged, Koa wore the `sleep` face and did a backflip every ten seconds.
 * A `proud` face and an `idle` face produced identical movement. Whatever the
 * app had worked out about the person, the body was doing the same restless
 * dance it does at six in the morning on an empty day.
 *
 * ── and permanent motion is not presence, it is wallpaper ──
 *
 * Something that moves without being touched is read by the eye as an
 * advertisement, and stops being read at all within a couple of days — the
 * mechanism behind banner blindness, and the reason the peek is rationed to
 * three a day (`lib/mascot-budget.ts`). A character that is always performing
 * has nothing left for the moment it needs to say something, because the moment
 * looks exactly like every other second.
 *
 * The figure itself is not still: `KoaFigure` runs thirty-six loops of its own
 * — breathing, blinking, the weight shifting from one foot to the other. That
 * is the life. What this removes is the *second* layer of motion bolted on top
 * of it, which carried no information at all.
 *
 * ── so: two kinds of movement, and no third ──
 *
 *   1. **A breath**, whose depth and pace come from the state. Asleep is a
 *      slow shallow rise; worried is quick and shallow; pleased is deeper and
 *      easier; flat-out tired does not float at all, it slumps.
 *   2. **A notice** — one movement, when the state actually changes, sized by
 *      how big the change was. This is the whole of the character's
 *      spontaneity, and it is not spontaneous: every one of them means
 *      something happened.
 *
 * There is no timer. A movement on a timer is a movement that means nothing,
 * and it is the only kind this file deletes.
 */

export type PresenceLevel = 'asleep' | 'withdrawn' | 'watchful' | 'calm' | 'bright';

export interface PresenceMotion {
  level: PresenceLevel;
  /** peak travel of the breath, points — 0 means the figure does not rise */
  floatPt: number;
  /** one full breath, ms — slower reads as calmer */
  breathMs: number;
  /** forward slump held while the state lasts, degrees */
  droopDeg: number;
}

/**
 * How awake each emotion is, 0..1.
 *
 * This is the only ordering in the file and everything else is derived from
 * it, which is what stops a sixteenth emotion from needing a sixteenth rule.
 * It is arousal, not happiness: `worry` sits above `idle` because a worried
 * character is *more* awake, not less, and `sad` sits at the bottom with
 * `tired` because both are the body giving up rather than feeling something.
 */
export const AROUSAL: Record<MascotEmotion, number> = {
  sleep: 0,
  sad: 0.12,
  tired: 0.18,
  coat: 0.3,
  idle: 0.35,
  rested: 0.45,
  worry: 0.55,
  happy: 0.6,
  curl: 0.65,
  hat: 0.7,
  /* Surprise, not sorrow — the load-failure face. Awake, because something
     just went wrong and the character is looking straight at it. */
  oops: 0.7,
  run: 0.75,
  proud: 0.75,
  wave: 0.85,
  celebrate: 0.95,
};

/** The default, for an emotion added to the union and not ranked here. */
const DEFAULT_AROUSAL = 0.35;

export const arousalOf = (e: MascotEmotion): number => AROUSAL[e] ?? DEFAULT_AROUSAL;

/**
 * The ambient motion for a state.
 *
 * `waiting` is the one thing outside the emotion that changes it: coins earned
 * and not yet collected, or a sentence on screen that has not been read. It
 * does not add movement — it only stops the character from settling all the way
 * down, which is the difference between "nothing to do" and "there is something
 * here for you" without either of them being a performance.
 */
export function presenceMotion(emotion: MascotEmotion, waiting = false): PresenceMotion {
  switch (emotion) {
    /* Asleep. A slow shallow rise and a forward tilt — the only movement is
       breathing, which is the point: this state's whole message is that the
       character has stopped for the night, and a sleeping figure that hovers
       and swings is a figure that is not asleep. */
    case 'sleep':
      return { level: 'asleep', floatPt: 2, breathMs: 5200, droopDeg: 8 };

    /* Flat. No travel at all, and a real slump. The stillness is the signal,
       and it is the one state where less motion than the baseline is *more*
       information. */
    case 'sad':
    case 'tired':
      return { level: 'withdrawn', floatPt: 0, breathMs: 4600, droopDeg: 10 };

    /* The evening a streak could still be saved. Quick and shallow — held
       still, watching, not slumped and not celebrating. A worried character
       that bobs cheerfully is a character nobody believes. */
    case 'worry':
      return { level: 'watchful', floatPt: 1.5, breathMs: 2100, droopDeg: 0 };

    default: {
      const a = arousalOf(emotion);
      /* Everything above `idle` shares one shape scaled by arousal, rather
         than each pleased emotion getting a hand-typed number that drifts from
         its neighbours. */
      if (a > arousalOf('idle')) {
        return {
          level: 'bright',
          floatPt: 3 + a * 4,
          breathMs: 3400 - a * 900,
          droopDeg: 0,
        };
      }
      return {
        level: 'calm',
        /* An ordinary day is most days, and this is what it looks like: a
           four-point rise over the better part of four seconds. Barely a
           movement, and deliberately so — `waiting` lifts it by a point, which
           is the entire difference between "nothing here" and "something is
           waiting for you". */
        floatPt: waiting ? 5 : 4,
        breathMs: waiting ? 3200 : 3800,
        droopDeg: 0,
      };
    }
  }
}

/**
 * How big a movement a change of state deserves, 0..1.
 *
 * ── why it is a difference and not a table ──
 *
 * The size of a reaction is the size of the change, which is one rule for
 * every pair of states including the ones nobody thought about. Waking from
 * `sleep` to `celebrate` is the largest movement the character makes; drifting
 * from `idle` to `rested` is a small settle; and a reaction landing on the
 * figure (`holdEmotion` swaps the emotion for its hold) produces a perk sized
 * by the reaction, for free, without this file knowing reactions exist.
 *
 * ── and the first reading is not a change ──
 *
 * `from === null` returns 0. On first mount there is no previous state to have
 * moved away from, and the entrance animation is already playing — a notice on
 * top of it would be the character reacting to having been born. This is the
 * same absence-is-not-a-decision rule the level counter and the record engine
 * are both built on, and it is the one that keeps being got wrong.
 */
export function noticeAmplitude(from: MascotEmotion | null, to: MascotEmotion): number {
  if (from === null || from === to) return 0;
  const d = Math.abs(arousalOf(to) - arousalOf(from));
  /* Below this the two states are neighbours and the move would be a twitch
     nobody could attribute to anything. Silence is the better answer. */
  return d < 0.12 ? 0 : Math.min(d, 1);
}
