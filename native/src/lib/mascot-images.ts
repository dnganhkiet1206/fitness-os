import type { MascotMood } from '@/hooks/use-mascot';

/**
 * Pre-rendered character images (the premium, Talking-Tom-style look).
 *
 * AI-rendered art with the background matted out. When a mascot has an entry
 * here it renders the image (with per-emotion micro-motion) instead of the
 * code-drawn vector figure. Missing entries fall back to `idle`, so a partial
 * roster / missing emotion still works.
 *
 * Each pose stores its own `aspect` (height / width of the art) so the figure
 * box matches the drawing and the feet sit on the floor.
 *
 * To add more: drop `<id>-<emotion>.webp` (bg removed) in
 * native/assets/mascots/ and register it here with its aspect. Mascot ids:
 * koa, blaze, swift, titan, drago, nova.
 */

export interface PoseArt {
  source: number;
  /** height / width of the source art */
  aspect: number;
}

export interface MascotImageSet {
  idle: PoseArt;
  happy?: PoseArt;
  /** mood 'tired' maps here */
  tired?: PoseArt;
  sad?: PoseArt;
  sleep?: PoseArt;
  celebrate?: PoseArt;
  curl?: PoseArt;
  wave?: PoseArt;
  /** outfit overlays (full-body variants for v1) */
  hat?: PoseArt;
  coat?: PoseArt;
}

/** Every state the figure can be asked to show (superset of MascotMood). */
export type MascotEmotion =
  | MascotMood
  | 'idle'
  | 'sad'
  | 'sleep'
  | 'celebrate'
  | 'curl'
  | 'wave'
  | 'hat'
  | 'coat';

const art = (source: number, aspect: number): PoseArt => ({ source, aspect });

export const MASCOT_IMAGES: Record<string, MascotImageSet> = {
  koa: {
    idle: art(require('../../assets/mascots/koa.png'), 859 / 640),
    happy: art(require('../../assets/mascots/koa-happy.webp'), 1.325),
    sad: art(require('../../assets/mascots/koa-sad.webp'), 1.318),
    tired: art(require('../../assets/mascots/koa-sad.webp'), 1.318),
    sleep: art(require('../../assets/mascots/koa-sleep.webp'), 1.431),
    celebrate: art(require('../../assets/mascots/koa-celebrate.webp'), 1.375),
    curl: art(require('../../assets/mascots/koa-curl.webp'), 1.333),
    wave: art(require('../../assets/mascots/koa-wave.webp'), 1.331),
    hat: art(require('../../assets/mascots/koa-hat.webp'), 1.524),
    coat: art(require('../../assets/mascots/koa-coat.webp'), 1.367),
  },
};

/** Art for a mascot in a given emotion, falling back to idle. */
export function imageFor(
  mascotId: string,
  emotion: MascotEmotion = 'idle',
): { source: number; aspect: number } | null {
  const set = MASCOT_IMAGES[mascotId];
  if (!set) return null;
  const key = emotion === 'neutral' ? 'idle' : emotion;
  const pose = (set as unknown as Record<string, PoseArt | undefined>)[key] ?? set.idle;
  return { source: pose.source, aspect: pose.aspect };
}

export const hasImage = (mascotId: string): boolean => !!MASCOT_IMAGES[mascotId];
