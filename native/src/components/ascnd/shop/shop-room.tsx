import { Defs, Ellipse, G, LinearGradient, Rect, RadialGradient, Stop } from 'react-native-svg';

import { Curtain, Mirror, Puck, PuckDefs, Rug, Stool, WallRail } from '@/components/ascnd/shop/fittings';
import {
  BAY,
  CLOSET,
  CURTAIN,
  MIRROR,
  PUCK_Y,
  PUCKS,
  RUG,
  SHOP_FLOOR,
  SHOP_H,
  SHOP_W,
  STOOL_X,
  WALL_RAIL,
} from '@/components/ascnd/shop/shop-plan';
import { C, STAGE_MARK, STUDIO_SKINS } from '@/components/ascnd/studio/palette';
import { FloorLight } from '@/components/ascnd/studio/floor';
import { Platform, StageGlow } from '@/components/ascnd/studio/platform';
import { Spotlight } from '@/components/ascnd/studio/spotlight';
import { Wardrobe } from '@/components/ascnd/studio/wardrobe';

/**
 * The fitting room — one room, drawn once.
 *
 * ── what this replaced, and why ──
 *
 * The shop's scene used to be the Mascot Room with a dressing annex built onto
 * its right-hand edge. Every seam was papered over one at a time: the annex
 * imported `HORIZON` so the floor line matched, it reused `url(#studioFloor)`
 * so the ground was the same paint, it ran its skirting back across the join.
 * It still read as two pictures, because the thing giving it away was never the
 * seam. It was that the left half was a gym — poster, neon sign, city window,
 * equipment shelf, yoga ball — and the right half was a wardrobe, and no
 * amount of matched floor makes one room out of two subjects.
 *
 * So the room was rebuilt around a single subject: a place you try clothes on.
 * One wall gradient across all 750 units, one floor, one vignette that knows
 * both lit areas. What came over from the Mascot Room is what the user asked
 * for and nothing more — the podium, the lamp above it, and Koa standing on it.
 * Not copies: `Platform`, `Spotlight` and `FloorLight` are the same components
 * drawing from the same `STAGE_MARK`, so the podium here and the podium there
 * cannot drift apart.
 *
 * ── the order things are drawn in ──
 *
 * Back to front, and the vignette is not last. It goes over the wall and
 * everything standing against it, and *under* the two light sources — the same
 * rule the studio follows, and the reason the lamp reads as a light rather than
 * as a pale shape on a dim wall. Anything that emits goes after it; anything
 * that is merely lit goes before.
 *
 * ── two lights, not one ──
 *
 * The lamp hangs over the podium at x 195. The wardrobe is three hundred units
 * down the wall from it, which is most of a room away, so the fitting bay has
 * its own pair of pucks. A single centred vignette would have been wrong here
 * for the same reason a single light is: this room has two places worth looking
 * at and the dark belongs *between* them, not at both ends of an evenly lit
 * wall. `shopVigX` is shaped to that — heavy at both edges, heavy again in the
 * gap at the middle, open over each bay.
 */

export function ShopRoom({ skin = 'default', energy = 0.5 }: { skin?: string; energy?: number }) {
  const s = STUDIO_SKINS[skin] ?? STUDIO_SKINS.default;
  return (
    <G>
      <Defs>
        <LinearGradient id="shopWall" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={s.wall[0]} />
          <Stop offset="1" stopColor={s.wall[1]} />
        </LinearGradient>
        {/* The studio's floor recipe, widened. Those stops are the answer to a
            measured problem — the ground has to read about nine units *under*
            the wall it meets, and built from `secondary` it went the other way
            — so they are reused rather than re-derived. */}
        <LinearGradient id="shopFloor" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.edge} stopOpacity={0.75} />
          <Stop offset="0.45" stopColor={C.edge} stopOpacity={0.5} />
          <Stop offset="1" stopColor={C.edge} stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id="shopFloorTint" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.accent} stopOpacity={0.14} />
          <Stop offset="0.12" stopColor={C.accent} stopOpacity={0.06} />
          <Stop offset="0.24" stopColor={C.accent} stopOpacity={0} />
        </LinearGradient>
        {/* the dark is at the two ends and in the gap between the bays */}
        <LinearGradient id="shopVigX" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={C.edge} stopOpacity={0.95} />
          <Stop offset="0.07" stopColor={C.edge} stopOpacity={0.28} />
          <Stop offset="0.27" stopColor={C.edge} stopOpacity={0.06} />
          <Stop offset="0.5" stopColor={C.edge} stopOpacity={0.44} />
          <Stop offset="0.72" stopColor={C.edge} stopOpacity={0.12} />
          <Stop offset="0.94" stopColor={C.edge} stopOpacity={0.34} />
          <Stop offset="1" stopColor={C.edge} stopOpacity={0.92} />
        </LinearGradient>
        <LinearGradient id="shopVigY" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.edge} stopOpacity={0.6} />
          <Stop offset="0.26" stopColor={C.edge} stopOpacity={0.04} />
          <Stop offset="0.82" stopColor={C.edge} stopOpacity={0.04} />
          <Stop offset="1" stopColor={C.edge} stopOpacity={0.38} />
        </LinearGradient>
        {/* the corner where the wall turns — one soft edge is enough to stop
            the room being a flat backdrop with things in front of it */}
        <RadialGradient id="shopCorner" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={C.edge} stopOpacity={0.3} />
          <Stop offset="1" stopColor={C.edge} stopOpacity={0} />
        </RadialGradient>
      </Defs>

      {/* ── the shell ── */}
      <Rect x={0} y={0} width={SHOP_W} height={SHOP_H} fill="url(#shopWall)" />
      <Rect x={0} y={SHOP_FLOOR} width={SHOP_W} height={SHOP_H - SHOP_FLOOR} fill="url(#shopFloor)" />
      <Rect x={0} y={SHOP_FLOOR} width={SHOP_W} height={SHOP_H - SHOP_FLOOR} fill="url(#shopFloorTint)" />
      {/* one unbroken skirting the length of the room — the line that says
          "one room" more plainly than anything else in here */}
      <Rect x={0} y={SHOP_FLOOR - 5} width={SHOP_W} height={5} fill={C.primary} opacity={0.85} />
      <Rect
        x={0}
        y={SHOP_FLOOR - 5.8}
        width={SHOP_W}
        height={0.9}
        fill={C.highlight}
        opacity={0.09}
      />

      {/* ── the stage bay ── */}
      <Curtain />

      {/* ── the fitting bay ── */}
      <PuckDefs />
      <WallRail {...WALL_RAIL} />
      <G transform={`translate(${CLOSET.x} ${CLOSET.y})`}>
        <Wardrobe />
      </G>
      <Mirror {...MIRROR} />
      <Stool x={STOOL_X} y={SHOP_FLOOR} />

      {/* ── the room falls away, and then the lights are put back on ── */}
      <Rect x={0} y={0} width={SHOP_W} height={SHOP_H} fill="url(#shopVigX)" />
      <Rect x={0} y={0} width={SHOP_W} height={SHOP_H} fill="url(#shopVigY)" />
      <Ellipse cx={CURTAIN.x1 + 6} cy={SHOP_H / 2} rx={70} ry={SHOP_H * 0.6} fill="url(#shopCorner)" />

      {/* the wash reaches thirty units past the wardrobe's crown, so the light
          lands *on* it rather than stopping in the air above it */}
      {PUCKS.map((x) => (
        <Puck key={x} x={x} reach={CLOSET.y - PUCK_Y + 30} />
      ))}
      <Spotlight />
      <FloorLight glow={s.glow} energy={energy} />

      {/* the rug goes over the floor light, because it is a thing lying on the
          floor and the pool is on the floor under it */}
      <Rug {...RUG} />

      <Platform glow={s.glow} energy={energy} />
      <StageGlow glow={s.glow} energy={energy} />
    </G>
  );
}

/** re-exported so `shop-scene.tsx` has one import for the room and its size */
export { SHOP_H, SHOP_W, STAGE_MARK, BAY };
