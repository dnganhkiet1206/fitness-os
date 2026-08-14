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
  // still standing, still hoping — the streak has hours left, not none
  worry: { expression: 'plead', pose: 'idle' },
  /* Two faces that exist for the peek over a card.

     The peek shows the top 58 points of the figure and nothing else, so the
     only thing that can tell one achievement from another up there is the
     face — a dumbbell in the hand would be four inches below the crop. These
     are the sheet's own expressions on the standing pose, because a pose that
     shifts the head sideways (`running`, `turn34`) puts the face off-centre in
     a window that is all face. */
  proud: { expression: 'confident', pose: 'idle' },
  /* The beanie is not decoration, it is the only thing that reads.
     `happytired` carries its meaning in a wink, and the wink is on a nine
     second cycle — over a one second peek it is almost never showing, so
     against `idle` the two faces came out identical (rendered side by side in
     `tools/koa-studio/peek.mjs`, which is how this was caught). A cosy hat says
     "slept" in a still frame, in a crop that is nothing but head.

     It is a shop item worn without being bought, which the birthday `hat`
     already does; for a second on a card that is a costume, not a giveaway. */
  rested: { expression: 'happytired', pose: 'idle', outfit: { head: 'beanie' } },
  hat: { expression: 'happy', pose: 'idle', outfit: { head: 'santa' } },
  coat: { expression: 'happy', pose: 'idle' },
};

export function koaStateFor(emotion: MascotEmotion): KoaState {
  return STATES[emotion] ?? STATES.idle;
}
