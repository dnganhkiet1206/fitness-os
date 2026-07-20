import type { MascotMood } from '@/hooks/use-mascot';

/**
 * Pre-rendered character images (the premium, Talking-Tom-style look).
 *
 * These are studio/AI-rendered PNGs with the background removed. When a
 * mascot has an entry here it renders the image (with a subtle breathing
 * animation) instead of the code-drawn vector figure. Missing entries
 * fall back to the vector figure, so a partial roster still works.
 *
 * `aspect` = image height / width, so the figure box matches the art and
 * the feet sit on the floor. Optional per-mood variants fall back to
 * `idle`.
 *
 * To add more: drop `<id>.png` (bg removed) in native/assets/mascots/,
 * register it here with its aspect. Mascot ids: koa, blaze, swift, titan,
 * drago, nova.
 */

export interface MascotImageSet {
  idle: number;
  happy?: number;
  tired?: number;
  /** height / width of the source art */
  aspect: number;
}

export const MASCOT_IMAGES: Record<string, MascotImageSet> = {
  koa: {
    idle: require('../../assets/mascots/koa.png'),
    aspect: 719 / 560,
  },
};

export function imageFor(
  mascotId: string,
  mood: MascotMood,
): { source: number; aspect: number } | null {
  const set = MASCOT_IMAGES[mascotId];
  if (!set) return null;
  const source = (mood === 'happy' && set.happy) || (mood === 'tired' && set.tired) || set.idle;
  return { source, aspect: set.aspect };
}

export const hasImage = (mascotId: string): boolean => !!MASCOT_IMAGES[mascotId];
