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
 * The figure is built the way a sculptor would, not by stacking blobs:
 * ears, head, cheeks, waist and body are ONE continuous Bézier outline
 * (`SHAPES.silhouette`). Detail layers then sit on top and overlap, so no
 * seam is ever visible and nothing reads like a sticker.
 *
 * Draw order: shadow → silhouette → belly → outfit → arms → inner ears →
 * face patch → eyes/pupils/highlights/brows → nose → mouth → blush.
 */

export interface KoaPose {
  /** whole-figure tilt, in degrees */
  tilt?: number;
  armL?: number;
  armR?: number;
}

export const POSES: Record<
  string,
  KoaPose & { expression: Expression; mouth: MouthKind }
> = {
  idle: { tilt: 0, armL: 0, armR: 0, expression: 'happy', mouth: 'open' },
  wave: { tilt: -5, armL: 6, armR: -118, expression: 'confident', mouth: 'smile' },
  celebrate: { tilt: 2, armL: -96, armR: -92, expression: 'excited', mouth: 'open' },
  sleepy: { tilt: 6, armL: 12, armR: 10, expression: 'tired', mouth: 'flat' },
  sad: { tilt: 4, armL: 8, armR: 6, expression: 'sad', mouth: 'sad' },
  lifting: { tilt: -2, armL: -60, armR: -64, expression: 'confident', mouth: 'flat' },
  stretch: { tilt: -9, armL: -134, armR: 12, expression: 'eyesClosed', mouth: 'smile' },
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
  const p = { tilt: 0, armL: 0, armR: 0, ...pose };
  const height = size * (300 / 292);

  return (
    <Svg width={size} height={height} viewBox={KOA_VIEWBOX}>
      {!hideShadow && <Path d={SHAPES.shadow} fill={PALETTE.shade} opacity={0.4} />}

      <G rotation={p.tilt} originX={PIVOTS.body.x} originY={PIVOTS.body.y}>
        {/* legs sit under the body so the join is hidden */}
        <Path d={SHAPES.legL} fill={PALETTE.body} />
        <Path d={SHAPES.legR} fill={PALETTE.body} />

        {/* one continuous form: ears + head + cheeks + waist + body */}
        <Path d={SHAPES.silhouette} fill={PALETTE.body} />
        <Path d={SHAPES.belly} fill={PALETTE.light} />
        {outfit}

        <G rotation={p.armL} originX={PIVOTS.armL.x} originY={PIVOTS.armL.y}>
          <Path d={SHAPES.armL} fill={PALETTE.body} />
        </G>
        <G rotation={p.armR} originX={PIVOTS.armR.x} originY={PIVOTS.armR.y}>
          <Path d={SHAPES.armR} fill={PALETTE.body} />
        </G>

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
