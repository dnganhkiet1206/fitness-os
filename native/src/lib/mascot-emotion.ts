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

/** Everything the figure can be asked to show (image keys in mascot-images). */
export type MascotEmotion =
  | 'idle'
  | 'happy'
  | 'sad'
  | 'tired'
  | 'sleep'
  | 'celebrate'
  | 'curl'
  | 'wave';

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
  /** local hour 0-23 */
  hour: number;
  /** user is on the workout-logging flow right now */
  onWorkoutScreen: boolean;
}

/**
 * Held emotion derived purely from current state (no one-shots).
 * Priority: workout flow → late-night sleep → mood.
 */
export function baseEmotion(i: EmotionInput): MascotEmotion {
  // Actively logging a workout → doing curls alongside the user.
  if (i.onWorkoutScreen) return 'curl';
  // Late night with nothing going on → asleep.
  if (i.hour >= 22 || i.hour < 6) return 'sleep';
  // Otherwise mirror the day.
  if (i.mood === 'happy') return 'happy';
  if (i.mood === 'tired') return i.streak === 0 ? 'sad' : 'tired';
  return 'idle';
}

/** Resolve what to render: an active one-shot wins over the held emotion. */
export function resolveEmotion(base: MascotEmotion, action: MascotAction | null): MascotEmotion {
  return action ?? base;
}
