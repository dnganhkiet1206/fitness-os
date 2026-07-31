import { Defs, G, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { ClosetGlow, Curtain, Mirror, Stool } from '@/components/ascnd/shop/fittings';
import {
  CLOSET,
  CLOSET_SCALE,
  MIRROR,
  SHOP_FLOOR,
  SHOP_H,
  SHOP_W,
  STAGE_DX,
  STOOL_X,
} from '@/components/ascnd/shop/shop-plan';
import { FloorLight } from '@/components/ascnd/studio/floor';
import { C, STAGE_MARK, STUDIO_SKINS } from '@/components/ascnd/studio/palette';
import { Platform, StageGlow } from '@/components/ascnd/studio/platform';
import { Spotlight } from '@/components/ascnd/studio/spotlight';
import { Wardrobe } from '@/components/ascnd/studio/wardrobe';

/**
 * The fitting room — one room, drawn once, 390 × 476.
 *
 * ── what this replaced, and why, twice ──
 *
 * It started as the Mascot Room with a dressing annex built onto its right
 * edge. Every seam was papered over one at a time: the annex imported the
 * horizon so the floor line matched, filled its ground with the studio's own
 * two paints over the same band, ran its skirting back across the join. It
 * still read as two pictures, because the thing giving it away was never the
 * seam — the left half was a gym and the right half was a wardrobe, and no
 * amount of matched floor makes one room out of two subjects.
 *
 * The replacement was one room about one subject, and it was 750 wide. That was
 * the second mistake and a subtler one: the shop's band is the shape of the
 * Mascot Room's stage, which is portrait, and **a portrait band can only show a
 * whole room that is portrait too**. "Toàn cảnh" of a 750-wide room would have
 * been two fifths of a room. See `shop-plan.ts` for the arithmetic; what it
 * lands on is that the room has to be 390 across — the Mascot Room's own width.
 * The same room shape, refurnished.
 *
 * What came over from the Mascot Room is what was asked for and nothing more —
 * the podium, the lamp above it, and Koa standing on it. Not copies: `Platform`,
 * `Spotlight` and `FloorLight` are those components drawing from that
 * `STAGE_MARK`, so the podium here and the podium there cannot drift apart.
 *
 * ── the order things are drawn in ──
 *
 * Back to front, and the vignette is not last. It goes over the wall and
 * everything standing against it, and *under* every light — the same rule the
 * studio follows, and the reason the lamp reads as a light rather than as a
 * pale shape on a dim wall. Anything that emits goes after it; anything merely
 * lit goes before. The wardrobe's own glow is the clearest case: painted before
 * the vignette it is a warm patch that has been darkened; painted after it, the
 * cabinet is lit.
 *
 * ── the stage is on the left ──
 *
 * Not because the left is better, but because a 274-wide podium centred in a
 * 390-wide room leaves the character standing at x 126–264 with the wardrobe
 * unavoidably behind him. Pushed left he stands at 81–219, the wardrobe starts
 * at 236, and the camera gets two genuinely separate things to point at rather
 * than two crops of the same pile.
 *
 * ── the drape is the whole wall ──
 *
 * It costs no horizontal budget, because every other prop stands in front of
 * it, and that is the only reason a wardrobe, a mirror and a stool fit in a
 * room this narrow beside a podium 274 units across. It is also the prop that
 * makes this a changing room rather than a stage with furniture near it.
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
        {/* The studio's floor recipe. Those stops are the answer to a measured
            problem — the ground has to read about nine units *under* the wall
            it meets, and built from `secondary` it went the other way — so they
            are reused rather than re-derived. */}
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
        {/* One room, one light, one vignette — radial, the way the studio has
            it. The 750-wide version needed a shaped horizontal ramp because it
            had two lit ends with dark between them; this room has a single
            centre and the corners fall away from it. */}
        <RadialGradient id="shopVig" cx="50%" cy="50%" r="82%">
          <Stop offset="0" stopColor={C.bgTop} stopOpacity={0.02} />
          <Stop offset="0.5" stopColor={C.bgTop} stopOpacity={0.34} />
          <Stop offset="1" stopColor={C.edge} stopOpacity={1} />
        </RadialGradient>
      </Defs>

      {/* ── the shell ── */}
      <Rect x={0} y={0} width={SHOP_W} height={SHOP_H} fill="url(#shopWall)" />
      <Rect x={0} y={SHOP_FLOOR} width={SHOP_W} height={SHOP_H - SHOP_FLOOR} fill="url(#shopFloor)" />
      <Rect x={0} y={SHOP_FLOOR} width={SHOP_W} height={SHOP_H - SHOP_FLOOR} fill="url(#shopFloorTint)" />

      {/* ── what stands against it ── */}
      <Curtain />
      <G transform={`translate(${CLOSET.x} ${CLOSET.y}) scale(${CLOSET_SCALE})`}>
        <Wardrobe />
      </G>
      <Mirror {...MIRROR} />
      <Stool x={STOOL_X} y={SHOP_FLOOR} />

      {/* ── the room falls away, and then the lights are put back on ── */}
      <Rect x={0} y={0} width={SHOP_W} height={SHOP_H} fill="url(#shopVig)" />

      <ClosetGlow x={CLOSET.x} y={CLOSET.y} scale={CLOSET_SCALE} />

      {/* The whole stage — lamp, beam, floor pool, podium — on one translate.
          Every one of these four components is the Mascot Room's, drawing from
          the Mascot Room's `STAGE_MARK`; the shop wants the stage further left
          and moving the mark would have moved the room next door with it. One
          group transform, and the two rooms still share the geometry. */}
      <G transform={`translate(${STAGE_DX} 0)`}>
        <Spotlight />
        <FloorLight glow={s.glow} energy={energy} />
        <Platform glow={s.glow} energy={energy} />
        <StageGlow glow={s.glow} energy={energy} />
      </G>
    </G>
  );
}

/** re-exported so `shop-scene.tsx` has one import for the room and its size */
export { SHOP_H, SHOP_W, STAGE_MARK };
