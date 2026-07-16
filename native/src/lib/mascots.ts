import type { AppLang } from './i18n';

/**
 * Mascot catalog. Characters unlock through real usage (workout / meal
 * counts) — the foundation for a future paid tier: `pro` characters are
 * visible but locked ("coming soon") until purchases ship.
 *
 * Rendering uses Apple's emoji glyphs — at large sizes they are shaded,
 * dimensional artwork, which keeps this test phase asset-free. Swapping
 * in real 3D models (Lottie/GLB) later only touches the Mascot view.
 */

export interface MascotDef {
  id: string;
  emoji: string;
  name: string;
  /** Aura/glow color that sells the character's depth */
  accent: string;
  /** Personality line shown in the picker */
  tagline: Record<AppLang, string>;
  /** Unlock requirement; undefined = free */
  unlock?: {
    kind: 'workouts' | 'meals';
    count: number;
    label: Record<AppLang, string>;
  };
  /** Future paid characters — always locked for now */
  pro?: boolean;
}

export const MASCOTS: MascotDef[] = [
  {
    id: 'koa',
    accent: '#8fb3a4',
    emoji: '🐨',
    name: 'Koa',
    tagline: {
      vi: 'Bạn đồng hành chăm chỉ, hơi buồn ngủ',
      en: 'Your diligent, slightly sleepy companion',
    },
  },
  {
    id: 'blaze',
    accent: '#e6a23d',
    emoji: '🦁',
    name: 'Blaze',
    tagline: {
      vi: 'Máu lửa — không bỏ lỡ buổi tập nào',
      en: 'Fiery — never misses a session',
    },
    unlock: {
      kind: 'workouts',
      count: 10,
      label: { vi: 'Ghi 10 buổi tập', en: 'Log 10 workouts' },
    },
  },
  {
    id: 'swift',
    accent: '#e0763d',
    emoji: '🦊',
    name: 'Swift',
    tagline: {
      vi: 'Tinh ranh về dinh dưỡng',
      en: 'Sharp about nutrition',
    },
    unlock: {
      kind: 'meals',
      count: 25,
      label: { vi: 'Ghi 25 bữa ăn', en: 'Log 25 meals' },
    },
  },
  {
    id: 'titan',
    accent: '#7d8ba1',
    emoji: '🦍',
    name: 'Titan',
    tagline: {
      vi: 'Sức mạnh thuần khiết',
      en: 'Pure strength',
    },
    unlock: {
      kind: 'workouts',
      count: 30,
      label: { vi: 'Ghi 30 buổi tập', en: 'Log 30 workouts' },
    },
  },
  {
    id: 'drago',
    accent: '#5fb56f',
    emoji: '🐉',
    name: 'Drago',
    tagline: {
      vi: 'Huyền thoại — sắp ra mắt',
      en: 'Legendary — coming soon',
    },
    pro: true,
  },
  {
    id: 'nova',
    accent: '#b07de0',
    emoji: '🦄',
    name: 'Nova',
    tagline: {
      vi: 'Hiếm có — sắp ra mắt',
      en: 'Rare — coming soon',
    },
    pro: true,
  },
];

export const DEFAULT_MASCOT_ID = 'koa';

export function getMascot(id: string): MascotDef {
  return MASCOTS.find((m) => m.id === id) ?? MASCOTS[0];
}

export function isUnlocked(m: MascotDef, stats: { workouts: number; meals: number }): boolean {
  if (m.pro) return false; // paid tier not live yet
  if (!m.unlock) return true;
  return stats[m.unlock.kind] >= m.unlock.count;
}
