import { Image, type ImageStyle, type StyleProp } from 'react-native';

import { muscleArtFor, type MuscleArtKey } from '@/lib/muscle-group';

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
 * The lookup from a stored group name lives in `@/lib/muscle-group`, away from
 * React Native, so it can be run against the real data in a check rather than
 * reviewed by reading. `ART` is typed by its key union, so a diagram with no
 * file fails to build.
 */

const ART: Record<MuscleArtKey, number> = {
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
