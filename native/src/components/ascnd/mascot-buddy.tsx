import { MascotFigure } from '@/components/ascnd/mascot-figure';
import type { MascotMood } from '@/hooks/use-mascot';
import type { MascotEmotion } from '@/lib/mascot-emotion';
import type { MascotDef } from '@/lib/mascots';

/**
 * The buddy on the Stage.
 *
 * There is one renderer now: the code-drawn figure. Koa is drawn from its
 * SVG spec sheet (`components/ascnd/koa/`), every other companion falls back
 * to the built-in vector figure — see `MascotFigure` for the order.
 *
 * The 3D path (react-three-fiber over expo-gl, a rigged GLB) was removed:
 * the character direction is the flat vector sheet, and the stage is being
 * rebuilt around it.
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
}

export function MascotBuddy({
  mascot,
  emotion,
  size = 200,
  mood = 'neutral',
  level = 1,
  equippedOutfits,
}: MascotBuddyProps) {
  return (
    <MascotFigure
      mascot={mascot}
      size={size}
      mood={mood}
      emotion={emotion}
      level={level}
      equippedOutfits={equippedOutfits}
    />
  );
}
