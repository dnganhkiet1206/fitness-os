import { View } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, Path, Rect, Stop, G } from 'react-native-svg';

import { MascotFigure } from '@/components/ascnd/mascot-figure';
import { C } from '@/components/ascnd/studio/palette';
import { Wardrobe, WARDROBE_H, WARDROBE_W } from '@/components/ascnd/studio/wardrobe';
import type { MascotDef } from '@/lib/mascots';

/**
 * The band above the shop's grid: Koa, and the wardrobe it changes in.
 *
 * The reference puts the character and the cabinet in one lit room and the
 * items underneath, and that split is the reason it works — the top half says
 * *this is you*, the bottom half is a catalogue. A grid on its own is a
 * catalogue twice.
 *
 * It is not the Mascot Room. That scene is a 390 × 844 artboard with a lamp, a
 * window, weather and insects in it, and none of that belongs behind a shop; it
 * would also drag four animated canvases into a screen that scrolls. This is a
 * still backdrop, one gradient and three shapes, with the figure drawn over it.
 *
 * ── placing the figure ──
 *
 * Same discipline as the stage: the character stands on `MARK`, and both the
 * rug and the figure are placed from that one number rather than from two that
 * have to agree. `tools/koa-studio/stage.mjs` exists because a preview that
 * restated the mark drew Koa standing in front of its own podium.
 */

const W = 360;
const H = 196;

/** where the character's feet go, in the band's own units */
const MARK = { x: 104, y: 168 };
/** the figure's drawn width here — smaller than the stage's, it is a thumbnail */
const HERO_W = 108;

/** the cabinet, scaled to sit under the band's ceiling */
const CAB_S = 158 / WARDROBE_H;
const CAB_X = W - WARDROBE_W * CAB_S - 22;
const CAB_Y = H - WARDROBE_H * CAB_S - 12;

export function WardrobeScene({
  mascot,
  size,
  level,
  equipped,
  animated = true,
}: {
  mascot: MascotDef;
  /** the band's rendered width in px */
  size: number;
  level?: number;
  equipped?: Set<string>;
  animated?: boolean;
}) {
  const k = size / W;
  const height = H * k;
  const figure = Math.round(HERO_W * k);

  return (
    <View style={{ width: size, height, borderRadius: 18, overflow: 'hidden' }}>
      <Svg width={size} height={height} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <LinearGradient id="shopWall" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.bgTop} />
            <Stop offset="1" stopColor={C.bgBottom} />
          </LinearGradient>
          {/* the one warm thing, coming from where the room's lamp would be */}
          <LinearGradient id="shopPool" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.highlight} stopOpacity={0.11} />
            <Stop offset="1" stopColor={C.highlight} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        <Rect x={0} y={0} width={W} height={H} fill="url(#shopWall)" />
        {/* the floor, as a band rather than a perspective plane — this is a
            thumbnail and a vanishing point at 196 units tall reads as a mistake */}
        <Rect x={0} y={150} width={W} height={H - 150} fill={C.lit} opacity={0.55} />
        <Path d={`M 0 150 H ${W}`} stroke={C.soft} strokeWidth={0.8} opacity={0.18} fill="none" />
        <Path d={`M ${MARK.x - 96} 0 L ${MARK.x - 40} 0 L ${MARK.x + 74} 150 L ${MARK.x - 88} 150 Z`} fill="url(#shopPool)" />

        {/* the rug the character stands on, which is what stops it floating */}
        <Ellipse cx={MARK.x} cy={MARK.y + 6} rx={70} ry={15} fill={C.accent} opacity={0.22} />
        <Ellipse cx={MARK.x} cy={MARK.y + 6} rx={70} ry={15} fill="none" stroke={C.soft} strokeWidth={1} opacity={0.25} />
        <Ellipse cx={MARK.x} cy={MARK.y + 4} rx={26} ry={5.5} fill={C.shadow} opacity={0.28} />

        <G transform={`translate(${CAB_X} ${CAB_Y}) scale(${CAB_S})`}>
          <Wardrobe />
        </G>
      </Svg>

      {/* The figure, over the backdrop and placed from `MARK`. Frozen: this
          band sits above a scrolling grid, and a 120fps character behind a list
          is exactly the budget the room spent three fixes getting back. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: MARK.x * k - figure / 2,
          top: MARK.y * k - figure * 1.25,
          width: figure,
        }}>
        <MascotFigure
          mascot={mascot}
          size={figure}
          level={level}
          equippedOutfits={equipped}
          animated={animated}
        />
      </View>
    </View>
  );
}
