import type { MascotEmotion } from '@/lib/mascot-emotion';
import type { KoaExpression, KoaPose } from '@/components/ascnd/koa/koa-parts';

/**
 * Emotion Engine → the spec sheet's own vocabulary.
 *
 * The engine speaks in app states (`curl` while a workout is being logged,
 * `sleep` late at night); the sheet speaks in eight expressions and five
 * poses. This is the one place the two meet, so adding a pose later means
 * touching a single table.
 */

export interface KoaState {
  expression: KoaExpression;
  pose: KoaPose;
  /** outfit ids the emotion implies on top of what the user has equipped */
  outfit?: string;
}

const STATES: Record<MascotEmotion, KoaState> = {
  idle: { expression: 'happy', pose: 'idle' },
  // a good day earns the wide, eyes-shut grin
  happy: { expression: 'grin', pose: 'idle' },
  sad: { expression: 'sad', pose: 'idle' },
  // worn out — Koa sits down and breathes heavily
  tired: { expression: 'tired', pose: 'relaxing' },
  sleep: { expression: 'tired', pose: 'relaxing' },
  celebrate: { expression: 'delighted', pose: 'idle' },
  // logging a workout — curling alongside the user, and sure of itself
  curl: { expression: 'confident', pose: 'lifting' },
  // the overhead reach doubles as a wave
  wave: { expression: 'happy', pose: 'stretching' },
  // 3/4 turn, hip-pivot leg cycle, out of breath — the sheet's finished pose
  run: { expression: 'happytired', pose: 'running' },
  hat: { expression: 'happy', pose: 'idle', outfit: 'cap' },
  coat: { expression: 'happy', pose: 'idle' },
};

export function koaStateFor(emotion: MascotEmotion): KoaState {
  return STATES[emotion] ?? STATES.idle;
}
