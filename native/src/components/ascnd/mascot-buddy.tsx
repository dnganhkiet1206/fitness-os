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
}

export function MascotBuddy({
  mascot,
  emotion,
  size = 200,
  mood = 'neutral',
  level = 1,
  equippedOutfits,
  animated = true,
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
    />
  );
}
