import Svg, { G, Path } from 'react-native-svg';

import {
  KOA_VIEWBOX,
  PALETTE,
  PIVOTS,
  SHAPES,
  eyeShapes,
  mouthShapes,
  type Expression,
  type MouthKind,
} from './koa-parts';

/**
 * Koa — the code-drawn flat-vector mascot.
 *
 * Layer order follows the construction manual, bottom to top:
 *   24 shadow → 22/23 legs → 18 body → 19 belly → outfit → 20/21 arms
 *   → 02/03 ears → 01 head → 04/05 inner ears → 06 face patch
 *   → 07–12 eyes/pupils/brows → 13 nose → 14/15 mouth → 16/17 blush
 *
 * Layers deliberately overlap (the head covers 10–20% of each ear, the
 * face patch clips the eyes, the nose sits over the patch, the mouth over
 * the nose) so nothing reads like a sticker pasted on.
 *
 * Every limb rotates around a real joint pivot, so poses and expressions
 * are data — no new artwork is ever required.
 */

export interface KoaPose {
  /** head tilt at the neck pivot */
  tilt?: number;
  armL?: number;
  armR?: number;
  legL?: number;
  legR?: number;
  earL?: number;
  earR?: number;
}

export const POSES: Record<
  string,
  KoaPose & { expression: Expression; mouth: MouthKind }
> = {
  idle: { tilt: 0, armL: 0, armR: 0, expression: 'happy', mouth: 'open' },
  wave: { tilt: -7, armR: -122, expression: 'confident', mouth: 'smile' },
  celebrate: { tilt: 3, armL: -98, armR: -94, expression: 'excited', mouth: 'open' },
  sleepy: { tilt: 7, armL: 14, armR: 10, expression: 'tired', mouth: 'flat' },
  sad: { tilt: 5, armL: 10, armR: 8, expression: 'sad', mouth: 'sad' },
  lifting: { tilt: -3, armL: -62, armR: -66, expression: 'confident', mouth: 'flat' },
  stretch: { tilt: -11, armL: -138, armR: 14, expression: 'eyesClosed', mouth: 'smile' },
};

interface Props {
  size?: number;
  expression?: Expression;
  mouth?: MouthKind;
  pose?: KoaPose;
  /** shop outfit layers, drawn over the belly and under the arms */
  outfit?: React.ReactNode;
  hideShadow?: boolean;
}

export function KoaFigure({
  size = 160,
  expression = 'happy',
  mouth = 'open',
  pose,
  outfit,
  hideShadow,
}: Props) {
  const p = { tilt: 0, armL: 0, armR: 0, legL: 0, legR: 0, earL: 0, earR: 0, ...pose };
  const height = size * (300 / 240);

  return (
    <Svg width={size} height={height} viewBox={KOA_VIEWBOX}>
      {!hideShadow && <Path d={SHAPES.shadow} fill={PALETTE.shade} opacity={0.4} />}

      <G rotation={p.tilt} originX={PIVOTS.head.x} originY={PIVOTS.head.y}>
        {/* legs */}
        <G rotation={p.legL} originX={PIVOTS.legL.x} originY={PIVOTS.legL.y}>
          <Path d={SHAPES.legL} fill={PALETTE.body} />
        </G>
        <G rotation={p.legR} originX={PIVOTS.legR.x} originY={PIVOTS.legR.y}>
          <Path d={SHAPES.legR} fill={PALETTE.body} />
        </G>

        {/* torso */}
        <Path d={SHAPES.body} fill={PALETTE.body} />
        <Path d={SHAPES.belly} fill={PALETTE.light} />
        {outfit}

        {/* arms */}
        <G rotation={p.armL} originX={PIVOTS.armL.x} originY={PIVOTS.armL.y}>
          <Path d={SHAPES.armL} fill={PALETTE.body} />
        </G>
        <G rotation={p.armR} originX={PIVOTS.armR.x} originY={PIVOTS.armR.y}>
          <Path d={SHAPES.armR} fill={PALETTE.body} />
        </G>

        {/* ears sit behind the head so the skull clips them */}
        <G rotation={p.earL} originX={PIVOTS.earL.x} originY={PIVOTS.earL.y}>
          <Path d={SHAPES.earL} fill={PALETTE.body} />
        </G>
        <G rotation={p.earR} originX={PIVOTS.earR.x} originY={PIVOTS.earR.y}>
          <Path d={SHAPES.earR} fill={PALETTE.body} />
        </G>

        <Path d={SHAPES.head} fill={PALETTE.body} />
        <Path d={SHAPES.headLight} fill={PALETTE.white} opacity={0.13} />

        <Path d={SHAPES.earLInner} fill={PALETTE.light} />
        <Path d={SHAPES.earRInner} fill={PALETTE.light} />
        <Path d={SHAPES.facePatch} fill={PALETTE.light} />

        {eyeShapes(expression).map((s, i) => (
          <Path key={`e${i}`} d={s.d} fill={s.fill} opacity={s.opacity} />
        ))}

        <Path d={SHAPES.nose} fill={PALETTE.dark} />
        <Path d={SHAPES.noseShine} fill={PALETTE.white} opacity={0.2} />

        {mouthShapes(mouth).map((s, i) => (
          <Path key={`m${i}`} d={s.d} fill={s.fill} opacity={s.opacity} />
        ))}

        <Path d={SHAPES.blushL} fill={PALETTE.blush} />
        <Path d={SHAPES.blushR} fill={PALETTE.blush} />
      </G>
    </Svg>
  );
}
