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
 * Koa — the flat-vector mascot, drawn entirely in code.
 *
 * Every body part is a separate layer with its own pivot, so expressions
 * (swap eye/mouth layers) and poses (rotate limb layers) never require
 * new artwork. Follows the character sheet: flat palette colours, vector
 * shapes only, no strokes / gradients / filters.
 */

export interface KoaPose {
  /** head tilt in degrees */
  tilt?: number;
  /** horizontal weight shift in px */
  lean?: number;
  /** arm rotation in degrees (negative lifts the arm) */
  armL?: number;
  armR?: number;
  legL?: number;
  legR?: number;
}

export const POSES: Record<string, KoaPose & { expression: Expression; mouth: MouthKind }> = {
  idle: { tilt: -4, lean: 2, armL: 6, armR: -12, expression: 'happy', mouth: 'open' },
  wave: { tilt: -9, lean: 4, armL: 12, armR: -124, expression: 'confident', mouth: 'smile' },
  celebrate: { tilt: 3, lean: -3, armL: -100, armR: -96, expression: 'excited', mouth: 'open' },
  sleepy: { tilt: 8, lean: -4, armL: 18, armR: 14, expression: 'tired', mouth: 'flat' },
  sad: { tilt: 6, lean: -2, armL: 14, armR: 10, expression: 'sad', mouth: 'sad' },
  lifting: { tilt: -3, lean: 3, armL: -58, armR: -64, expression: 'confident', mouth: 'flat' },
  stretch: { tilt: -12, lean: 5, armL: -140, armR: 16, expression: 'eyesClosed', mouth: 'smile' },
};

interface Props {
  size?: number;
  expression?: Expression;
  mouth?: MouthKind;
  pose?: KoaPose;
  /** extra layers drawn over the body (shop outfits) */
  outfit?: React.ReactNode;
  /** hide the ground shadow (e.g. when the scene draws its own) */
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
  const p = { tilt: -4, lean: 2, armL: 6, armR: -12, legL: 0, legR: 0, ...pose };
  const height = size * (300 / 240);

  return (
    <Svg width={size} height={height} viewBox={KOA_VIEWBOX}>
      {!hideShadow && <Path d={SHAPES.shadow} fill={PALETTE.shade} opacity={0.4} />}

      <G x={p.lean}>
        {/* legs */}
        <G rotation={p.legL} originX={PIVOTS.legL.x} originY={PIVOTS.legL.y}>
          <Path d={SHAPES.legL} fill={PALETTE.body} />
          <Path d={SHAPES.legLFoot} fill={PALETTE.light} />
        </G>
        <G rotation={p.legR} originX={PIVOTS.legR.x} originY={PIVOTS.legR.y}>
          <Path d={SHAPES.legR} fill={PALETTE.body} />
          <Path d={SHAPES.legRFoot} fill={PALETTE.light} />
        </G>

        {/* torso */}
        <Path d={SHAPES.body} fill={PALETTE.body} />
        <Path d={SHAPES.bodyShade} fill={PALETTE.shade} opacity={0.24} />
        <Path d={SHAPES.belly} fill={PALETTE.light} />

        {outfit}

        {/* arms */}
        <G rotation={p.armL} originX={PIVOTS.armL.x} originY={PIVOTS.armL.y}>
          <Path d={SHAPES.armL} fill={PALETTE.body} />
          <Path d={SHAPES.armLShade} fill={PALETTE.shade} opacity={0.28} />
        </G>
        <G rotation={p.armR} originX={PIVOTS.armR.x} originY={PIVOTS.armR.y}>
          <Path d={SHAPES.armR} fill={PALETTE.body} />
          <Path d={SHAPES.armRShade} fill={PALETTE.shade} opacity={0.28} />
        </G>
      </G>

      {/* head group */}
      <G rotation={p.tilt} originX={PIVOTS.head.x} originY={PIVOTS.head.y}>
        <Path d={SHAPES.earL} fill={PALETTE.body} />
        <Path d={SHAPES.earLInner} fill={PALETTE.light} />
        <Path d={SHAPES.earR} fill={PALETTE.body} />
        <Path d={SHAPES.earRInner} fill={PALETTE.light} />

        <Path d={SHAPES.head} fill={PALETTE.body} />
        <Path d={SHAPES.headLight} fill={PALETTE.white} opacity={0.14} />
        <Path d={SHAPES.face} fill={PALETTE.light} />

        {eyeShapes(expression).map((s, i) => (
          <Path key={`e${i}`} d={s.d} fill={s.fill} opacity={s.opacity} />
        ))}

        <Path d={SHAPES.nose} fill={PALETTE.dark} />
        <Path d={SHAPES.noseShine} fill={PALETTE.white} opacity={0.22} />

        {mouthShapes(mouth).map((s, i) => (
          <Path key={`m${i}`} d={s.d} fill={s.fill} opacity={s.opacity} />
        ))}

        <Path d={SHAPES.blushL} fill={PALETTE.blush} />
        <Path d={SHAPES.blushR} fill={PALETTE.blush} />
      </G>
    </Svg>
  );
}
