import type { SharedValue } from 'react-native-reanimated';

import { MascotFigure } from '@/components/ascnd/mascot-figure';
import type { MascotMood } from '@/hooks/use-mascot';
import type { MascotEmotion } from '@/lib/mascot-emotion';
import type { MascotDef } from '@/lib/mascots';

/**
 * The buddy on the Stage.
 *
 * There is one renderer: the code-drawn figure. Koa comes from the design
 * export (`components/ascnd/koa/`); every other companion falls back to the
 * built-in vector figure.
 */
export interface MascotBuddyProps {
  mascot: MascotDef;
  emotion: MascotEmotion;
  size?: number;
  mood?: MascotMood;
  level?: number;
  /** kept for call-site compatibility; the vector figure has no accent light */
  accent?: string;
  equippedOutfits?: Set<string>;
  /** false pauses the figure — the room passes screen focus down */
  animated?: boolean;
  /**
   * Pause the figure's clock in place without changing the drawing — the room
   * passes its scroll shared value down so the character holds its frame while
   * the page scrolls rather than re-rasterising every frame. See `KoaFigure`.
   */
  hold?: SharedValue<boolean>;
  /**
   * The room's insect clock, when the buddy is standing in the room.
   *
   * It is the Stage's rather than the figure's because the insects run off the
   * same one: on two clocks Koa would be looking at where a butterfly used to
   * be within about a minute. See `koa-gaze.ts`.
   */
  gaze?: SharedValue<number>;
}

export function MascotBuddy({
  mascot,
  emotion,
  size = 200,
  mood = 'neutral',
  level = 1,
  equippedOutfits,
  animated = true,
  hold,
  gaze,
}: MascotBuddyProps) {
  return (
    <MascotFigure
      mascot={mascot}
      size={size}
      mood={mood}
      emotion={emotion}
      level={level}
      equippedOutfits={equippedOutfits}
      animated={animated}
      hold={hold}
      gaze={gaze}
    />
  );
}
