import { Image, type ImageStyle, type StyleProp } from 'react-native';

/**
 * The muscle-group diagrams, and how a stored group name finds one.
 *
 * ── why images and not drawings ──
 *
 * There was a hand-drawn SVG set here first. It went through five passes, each
 * checked by rendering it and looking, and each pass fixed something real — a
 * torso shaped like a cupcake, deltoids that read as ears, an arm that read as
 * a boot. It still was not good, and the honest verdict was the user's: the
 * drawings were bad. Anatomy at icon size is a specialist's job.
 *
 * These are cut from a single reference sheet and compressed: ten files, 66 KB
 * for the set, against 1.5 MB for the sheet. `tools/crop-sheet.mjs` does it, and
 * the exact geometry is recorded there so a redrawn sheet can be cut the same
 * way without re-deriving the grid.
 *
 * The trade is real and worth stating: a raster cannot be tinted, so these stay
 * red-on-white while the rest of the app is purple and silver. That was the
 * user's call and it is defensible — this is the one place in the app that is a
 * *diagram* rather than a surface, and a diagram that matches the furniture
 * stops reading as one.
 *
 * ── why the lookup is so forgiving ──
 *
 * `exercises.muscle_group` is free text, and two screens write it. The builder
 * (`workout-builder.tsx:30`) stores English — "Chest", "Quads". The library
 * (`exercises.tsx:25`) stores whatever `useI18n()` returned, so a Vietnamese
 * user's exercises are filed under "Ngực" and "Chân trước". The same library
 * therefore holds both spellings of the same group, and anything matching on one
 * of them would silently show art for half a shelf.
 *
 * That is a real defect in the data model rather than something this file
 * invents a workaround for — but it is the data that exists, so the lookup
 * takes both, case-folded and accent-tolerant.
 */

const ART = {
  chest: require('../../../assets/muscle/chest.webp'),
  back: require('../../../assets/muscle/back.webp'),
  shoulders: require('../../../assets/muscle/shoulders.webp'),
  biceps: require('../../../assets/muscle/biceps.webp'),
  triceps: require('../../../assets/muscle/triceps.webp'),
  legs: require('../../../assets/muscle/legs.webp'),
  glutes: require('../../../assets/muscle/glutes.webp'),
  calves: require('../../../assets/muscle/calves.webp'),
  abs: require('../../../assets/muscle/abs.webp'),
  cardio: require('../../../assets/muscle/cardio.webp'),
} as const;

export type MuscleArtKey = keyof typeof ART;

/**
 * Every spelling of every group that the two writers can produce, folded to a
 * key. Written out rather than derived from `useI18n()` so that a change to a
 * label does not silently orphan art for exercises already filed under the old
 * one — the old spelling stays in this table and keeps working.
 */
const ALIASES: Record<string, MuscleArtKey> = {
  // English, as `workout-builder.tsx` writes it
  chest: 'chest',
  back: 'back',
  shoulders: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  quads: 'legs',
  hamstrings: 'legs',
  legs: 'legs',
  calves: 'calves',
  glutes: 'glutes',
  abs: 'abs',
  core: 'abs',
  'full body': 'cardio',
  fullbody: 'cardio',
  cardio: 'cardio',
  // Vietnamese, as `exercises.tsx` writes it via `useI18n()`
  nguc: 'chest',
  lung: 'back',
  vai: 'shoulders',
  'tay truoc': 'biceps',
  'tay sau': 'triceps',
  'chan truoc': 'legs',
  'chan sau': 'legs',
  chan: 'legs',
  'bap chan': 'calves',
  mong: 'glutes',
  bung: 'abs',
  'toan than': 'cardio',
  'tim mach': 'cardio',
};

/** lower-case, strip Vietnamese diacritics, squeeze spaces */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Which diagram belongs to a stored group name, or none.
 *
 * `null` rather than a fallback picture. A group with no art gets no art; giving
 * every unknown string the running figure would quietly file "Forearms" under
 * cardio and there would be nothing on screen to say so.
 */
export function muscleArtFor(group: string | null | undefined): MuscleArtKey | null {
  if (!group) return null;
  return ALIASES[fold(group)] ?? null;
}

export function MuscleArt({
  group,
  size = 56,
  style,
}: {
  /** the stored `muscle_group`, in whichever language it was written */
  group: string;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  const key = muscleArtFor(group);
  if (!key) return null;
  return (
    <Image
      source={ART[key]}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      // The diagram is the label's picture, not a second label — a screen
      // reader reading "chest diagram" after "Chest" says it twice.
      accessible={false}
    />
  );
}
