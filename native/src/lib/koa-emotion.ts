import type { MascotEmotion } from '@/lib/mascot-emotion';
import type { KoaExpression, KoaPose, Worn } from '@/components/ascnd/koa/koa-flags';

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
  /** outfit the emotion implies on top of what the user has equipped */
  outfit?: Worn;
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
  curl: { expression: 'strain', pose: 'lifting' },
  // A greeting turns to face you. NOT `stretching`: that pose is a side
  // bend — the export tilts it 6° and shifts it 8px left — so using it to
  // say hello made the character lean every time the room opened.
  wave: { expression: 'happy', pose: 'turn34' },
  // 3/4 turn, hip-pivot leg cycle, out of breath — the sheet's finished pose
  run: { expression: 'happytired', pose: 'running' },
  hat: { expression: 'happy', pose: 'idle', outfit: { head: 'santa' } },
  coat: { expression: 'happy', pose: 'idle' },
};

export function koaStateFor(emotion: MascotEmotion): KoaState {
  return STATES[emotion] ?? STATES.idle;
}
