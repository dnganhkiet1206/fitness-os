import type { MascotMood } from '@/hooks/use-mascot';

/**
 * Lottie asset registry for the companion characters.
 *
 * The premium, animated look (Talking-Tom vibe) comes from designer/AI
 * made Lottie files — not from code-drawn SVG. Drop LottieFiles `.json`
 * exports into `native/assets/mascots/` and register them here.
 *
 * Until a mascot has an entry, the app automatically falls back to the
 * built-in vector figure, so an empty registry changes nothing and never
 * breaks the build (no `require` runs for files that don't exist).
 *
 * Convention (see native/assets/mascots/README.md):
 *   - one looping IDLE per mood is ideal; at minimum a single `idle`
 *     reused for every mood.
 *   - transparent background, front-facing standing character.
 *
 * Example once files are added (uncomment and match your filenames):
 *
 *   koa: {
 *     idle:  require('../../assets/mascots/koa-idle.json'),
 *     happy: require('../../assets/mascots/koa-happy.json'),
 *     tired: require('../../assets/mascots/koa-tired.json'),
 *   },
 */

type MoodSources = Partial<Record<MascotMood, number>> & { idle?: number };

export const MASCOT_LOTTIE: Record<string, MoodSources> = {
  // (empty — add entries as you drop assets in)
};

/** Resolve the best Lottie source for a mascot + mood, or null to fall back */
export function lottieFor(mascotId: string, mood: MascotMood): number | null {
  const m = MASCOT_LOTTIE[mascotId];
  if (!m) return null;
  return m[mood] ?? m.idle ?? null;
}

export const hasLottie = (mascotId: string): boolean => !!MASCOT_LOTTIE[mascotId];
