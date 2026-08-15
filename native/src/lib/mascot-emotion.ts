import type { MascotMood } from '@/hooks/use-mascot';

/**
 * The mascot Emotion Engine (pure logic).
 *
 * Maps real app state/events → an emotion the renderer draws. Held emotions
 * come from the day's state (`baseEmotion`); short actions (`celebrate`,
 * `wave`, `curl`) play once and auto-return to the held emotion. Every
 * emotion falls back to `idle` art when a pose isn't registered, so the
 * engine works incrementally as art lands.
 */

/** One-shot actions that play briefly then return to the held emotion. */
export type MascotAction = 'celebrate' | 'wave' | 'curl';

/** Everything the figure can be asked to show (mapped in `koa-emotion.ts`). */
export type MascotEmotion =
  | 'idle'
  | 'happy'
  | 'sad'
  | 'tired'
  | 'sleep'
  | 'celebrate'
  | 'curl'
  | 'wave'
  /** a streak still alive, still unfed, and the evening running out */
  | 'worry'
  /** the hard thing, done — a smirk rather than a cheer */
  | 'proud'
  /** content and sleepy, the morning after a night that was logged */
  | 'rested'
  /** something did not load — surprise, not sorrow: it is not the user's fault */
  | 'oops'
  /** out for a run — only the spec-sheet Koa has art for it so far */
  | 'run'
  | 'hat'
  | 'coat';

/** Evening, not all day — see `baseEmotion`. */
export const RISK_HOUR = 18;
/** The first streak the app itself calls an achievement (`streak_3`). */
export const RISK_MIN_STREAK = 3;

/**
 * Is this person's streak actually in danger right now?
 *
 * ── why one function and not two ──
 *
 * There were two. `baseEmotion` decided it for the held face, `koa-decide`
 * decided it again for the event, and they had **already drifted**: the event
 * version never checked the hour, so a simulated risk event would worry at nine
 * in the morning while the real face waited until evening. Nothing was broken
 * yet — the event branch is only reachable from the debug screen — which is
 * precisely the state `streakFrom` was in before its two copies disagreed for
 * real.
 *
 * Three conditions, and each is a decision worth keeping:
 *
 *   · the run is long enough to be worth something (`RISK_MIN_STREAK` — the
 *     first medal, so Koa only pleads for a streak the app has already called
 *     an achievement);
 *   · today is genuinely empty, not merely unread;
 *   · and their own evening is running out — `riskHour` is the person's clock
 *     from `lib/user-rhythm.ts`, floored at `RISK_HOUR`.
 */
/**
 * ── and "their evening" is a window on the circle, not `hour >= riskHour` ──
 *
 * `riskHour` comes from `lateHour`, which now answers on the 24-hour circle:
 * somebody who logs at 01:00 gets a risk hour near 02:00, not the stranger's
 * default. Under a plain `hour >= riskHour` that would read as *"in danger from
 * 02:00 until midnight"* — twenty-two hours of pleading, which is the same bug
 * moved one file along rather than fixed.
 *
 * So it is a window that starts at their risk hour and runs to the end of their
 * day, measured forwards from that hour. `RISK_SPAN` is what remains of a day
 * once the late hour has arrived — long enough to still be asking at bedtime,
 * short enough that it closes before the next one opens.
 */
export const RISK_SPAN = 6;

export function streakInDanger(i: {
  streak: number;
  emptyToday: boolean;
  hour: number;
  riskHour?: number;
}): boolean {
  const from = i.riskHour ?? RISK_HOUR;
  const since = ((((i.hour - from) % 24) + 24) % 24);
  return i.emptyToday && i.streak >= RISK_MIN_STREAK && since < RISK_SPAN;
}

/** How long each one-shot action holds before returning to the base emotion. */
export const ACTION_MS: Record<MascotAction, number> = {
  celebrate: 2600,
  wave: 1700,
  curl: 2200,
};

export interface EmotionInput {
  /** happy | neutral | tired — mirrors the day's logged activity */
  mood: MascotMood;
  /** consecutive-day streak (0 = lapsed / fresh) */
  streak: number;
  /** the streak is alive but today has nothing in it yet */
  streakAtRisk?: boolean;
  /**
   * The hour this person is actually late by, from their own logging clock.
   *
   * Defaults to `RISK_HOUR` — which is a number somebody typed, and is wrong
   * for anybody whose day is not the imagined one. See `lib/user-rhythm.ts`.
   */
  riskHour?: number;
  /** local hour 0-23 */
  hour: number;
  /** user is on the workout-logging flow right now */
  onWorkoutScreen: boolean;
  /** today is the user's birthday (from profile DOB) → party hat */
  isBirthday?: boolean;
  /** cold outside (needs a weather source) → puffer coat */
  cold?: boolean;
}

/**
 * Held emotion derived purely from current state (no one-shots).
 * Priority: workout flow → birthday hat → late-night sleep → cold coat → mood.
 */
export function baseEmotion(i: EmotionInput): MascotEmotion {
  // Actively logging a workout → doing curls alongside the user.
  if (i.onWorkoutScreen) return 'curl';
  // Birthday takes over the day — party hat on.
  if (i.isBirthday) return 'hat';
  // Late night with nothing going on → asleep.
  if (i.hour >= 22 || i.hour < 6) return 'sleep';
  /*
    ── the evening a streak could be lost ──

    This is the one state the character had no face for, and it is the state
    that matters most. `sad` is the streak already gone — mourning. What an
    unfed evening needs is Koa *asking*, while there is still time to answer.

    Two limits keep it from becoming nagging, which is the failure mode of this
    exact mechanic — Duolingo's guilt-tripping owl became a meme for a reason:

      · **not before the hour this person is actually late.** A worried face at
        nine in the morning is not information, it is a mood. `RISK_HOUR` is the
        floor; somebody whose own logging clock says nine in the evening gets
        left alone until then (`lib/user-rhythm.ts`).
      · **not under `RISK_MIN_STREAK` days.** Koa only pleads for a run the app
        has already told you was worth something — three days is the first
        medal. Pleading over a one-day streak every single evening teaches
        people to ignore the face.
  */
  if (
    streakInDanger({
      streak: i.streak,
      emptyToday: i.streakAtRisk === true,
      hour: i.hour,
      riskHour: i.riskHour,
    })
  ) {
    return 'worry';
  }
  // Chilly out → bundled up in the coat.
  if (i.cold) return 'coat';
  // Otherwise mirror the day.
  if (i.mood === 'happy') return 'happy';
  if (i.mood === 'tired') return i.streak === 0 ? 'sad' : 'tired';
  return 'idle';
}

/** Resolve what to render: an active one-shot wins over the held emotion. */
export function resolveEmotion(base: MascotEmotion, action: MascotEmotion | null): MascotEmotion {
  return action ?? base;
}

/**
 * The one-shot channel: an emotion held for a while, over the top of whatever
 * the engine would otherwise be showing.
 *
 * ── why this lives here rather than in the hook ──
 *
 * It was module state inside `hooks/use-mascot-emotion.tsx`, and that closed a
 * runtime import cycle:
 *
 *     use-mascot.tsx → lib/koa-stage.ts → hooks/use-mascot-emotion.tsx
 *                    → use-mascot.tsx
 *
 * All three edges were **value** imports, so the cycle was real rather than a
 * type-level artefact. It survived only because every use sits inside a
 * function body: by the time anything calls, all three modules have finished
 * loading. One call at module scope anywhere in that triangle — a constant
 * derived from a helper, a store initialised eagerly — and the app fails at
 * startup with an undefined binding, on the slowest device first, in a stack
 * that names none of the three files.
 *
 * `koa-stage.ts` only ever wanted `holdEmotion`. Moving the channel into this
 * file — which already owns `MascotEmotion`, `MascotAction` and `ACTION_MS`,
 * and whose own only import is type-only — cuts the edge at its source. The
 * hook keeps the React surface and re-exports what screens already import, so
 * nothing else moves.
 */
let active: { action: MascotEmotion; expires: number } | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function hold(emotion: MascotEmotion, ms: number) {
  active = { action: emotion, expires: Date.now() + ms };
  emit();
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    active = null;
    timer = null;
    emit();
  }, ms);
}

/** Hold any emotion for a given time — the channel Koa's reactions arrive on. */
export function holdEmotion(emotion: MascotEmotion, ms: number) {
  hold(emotion, ms);
}

/** Play a one-shot action (celebrate on a PR, wave on open, curl on a lift). */
export function triggerMascotAction(action: MascotAction) {
  hold(action, ACTION_MS[action]);
}

export function subscribeEmotion(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export const getHeldEmotion = () => active;

// ── DEV emotion override — lets a dev force any emotion to test the animation
//    without recreating real conditions (streak / time of day / screen). Only
//    honoured in __DEV__. `null` = back to the real Emotion Engine. ──
let devOverride: MascotEmotion | null = null;
export function setDevEmotion(e: MascotEmotion | null) {
  devOverride = e;
  emit();
}
export const getDevOverride = () => devOverride;
/** Emotions worth cycling through when testing the mascot animation. */
export const DEV_EMOTIONS: MascotEmotion[] = [
  'idle',
  'happy',
  'sad',
  'tired',
  'sleep',
  'celebrate',
  'curl',
  'wave',
  'run',
];
