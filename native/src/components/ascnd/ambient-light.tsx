import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useMaterial } from '@/hooks/use-palette';

/**
 * Three lamps in a dark room, seen through frosted glass.
 *
 * The page background is one flat fill, and a flat fill is the one thing a
 * real surface never is. This is the light in the room it sits in.
 *
 * ── why several, and why different colours ──
 *
 * A single white source can only make the page *lighter* somewhere. Sources at
 * different colour temperatures make it lighter somewhere and a different
 * colour somewhere else, and that second thing is what actually
 * reads as depth: a surface tells you where the light is by how its colour
 * shifts across it, not just by how bright it is.
 *
 * It also fixes something a white light could not. This palette is cool
 * throughout — the background leans blue by a level, and the brand silver
 * (#a8afbd) leans blue by twenty-one. A white or cool light agrees with all of
 * it, and everything agreeing is exactly why the page reads flat. The key
 * light disagrees on purpose.
 *
 *   key     warm 3000K, above the top-left    → #1a1715, R−B +4
 *   fill    cool bounce, low and to the right → #0c0e11, R−B −4
 *   ambient neutral, the middle of the screen → lifts, does not tint
 *   corners                                   → #070708
 *
 * Eight levels of colour temperature across the page, and about nineteen of
 * brightness. Nobody will name either colour. They will notice the page has a
 * near side and a far side.
 *
 * ── the ambient one is in the middle, and it is neutral ──
 *
 * The key and the fill are placed off opposite corners, which is what gives
 * the page its near side and far side — and it leaves the centre almost
 * untouched. Worked out against the falloff, the middle of the screen was
 * getting about half a percent from the two of them combined: the brightest
 * part of the page was its edges, and the part everybody actually looks at was
 * the darkest thing on it.
 *
 * So a third pool sits in the centre. Neutral white on purpose: the key is
 * warm and the fill is cool, and a third colour in between them would be a
 * third opinion about what temperature the room is. Its job is to lift, not to
 * tint — content sits in the light instead of on top of a hole.
 *
 * ── the fill is a fill ──
 *
 * Half the key's strength, because a fill light that matches the key cancels
 * it: warm plus cool in equal measure is grey, and grey is what this started
 * as. They are also placed far apart — the key spills from above the top edge,
 * the fill from off the bottom right — so they meet along a thin diagonal
 * rather than sitting on top of each other.
 *
 * The fill is what keeps the bottom of a long page from being dead flat black.
 * That is the only job it has, which is why it is dim enough to be deniable.
 *
 * ── the falloff ──
 *
 * Five stops each, steep at first and then flattening into a long tail. Two
 * stops is a linear ramp, and a linear ramp *ends*: there is a radius where it
 * reaches zero and the eye finds that ring immediately. It is the dim tail
 * nobody can see that keeps the bright part from having an outline. Both radii
 * run past the screen edge for the same reason — a pool whose rim is on screen
 * is a shape someone drew, not a light.
 *
 * ── it is dimmer than it looks written down ──
 *
 * 7.5%, 3.5% and 4.5%. The brightest point on the page lands around #1a1715
 * and the centre around #131314, against #070708 in the corners — which sounds
 * like nothing, and is roughly the difference between a room with a lamp on
 * and a room without one. Turning any of them up is how this gets cheap: past
 * about 10% a pool stops being light in the room and becomes a blob on the
 * page.
 *
 * ── on cost ──
 *
 * Three `Rect`s in one `<Svg>`, and every prop on them is a constant.
 * `react-native-svg` re-rasterises an `<Svg>` when a child prop changes;
 * nothing here ever changes, so it is drawn once per page mount and composited
 * from then on. It sits outside the scroll view, so it does not move — light
 * that scrolled with the content would give away that it is a drawing.
 */

/** warm key, ~3000K — a lamp just past the top-left corner */
const KEY = { color: '#ffd9b3', peak: 0.075, cx: 0.28, cy: -0.05, rx: 1, ry: 0.55 };

/** cool bounce, low and right — half the key, and never on top of it */
const FILL = { color: '#9fc4ff', peak: 0.035, cx: 0.95, cy: 0.72, rx: 0.85, ry: 0.5 };

/**
 * Neutral ambient, centred where content sits.
 *
 * Placed low enough (0.45) and narrow enough vertically that its own falloff
 * has run out before it reaches the key's — the two never stack into a bright
 * spot. The brightest point anywhere on the page stays around 7%.
 */
const CENTRE = { color: '#ffffff', peak: 0.045, cx: 0.5, cy: 0.45, rx: 0.9, ry: 0.45 };

/** shared falloff: steep, then a long tail that never quite lands */
const CURVE = [
  { at: 0, of: 1 },
  { at: 0.25, of: 0.6 },
  { at: 0.5, of: 0.28 },
  { at: 0.75, of: 0.1 },
  { at: 1, of: 0 },
] as const;

type Source = typeof KEY;

function Pool({ id, s }: { id: string; s: Source }) {
  return (
    <RadialGradient id={id} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} gradientUnits="objectBoundingBox">
      {CURVE.map((p) => (
        <Stop key={p.at} offset={p.at} stopColor={s.color} stopOpacity={s.peak * p.of} />
      ))}
    </RadialGradient>
  );
}

export function AmbientLight() {
  /*
    ── giàn đèn này là ẩn dụ của một CĂN PHÒNG TỐI ──

    Ba vũng sáng ấm đổ từ ngoài góc trên-trái là thứ làm mọi mặt thẻ của bản tối
    bắt được cùng một nguồn sáng — `glass-card.tsx` viết ra đúng hướng ấy và
    dựng mặt gradient theo nó.

    Trên giấy thì không có phòng tối nào để thắp. Một vũng trắng 4,5% và một
    vũng be 7,5% trên nền #f7f4ef gần như không đo được, nhưng chúng vẫn là ba
    lớp `<Svg>` phủ kín màn hình được lấy mẫu lại mỗi khung hình cuộn — tức chi
    phí có thật cho một hiệu ứng không nhìn thấy.

    `m.lit` đã là đúng câu hỏi: chất liệu này có bắt sáng không. Bản sáng dựng
    ra rỗng, cùng cách `GlassCard` bỏ mặt gradient của nó.
  */
  const m = useMaterial();
  if (!m.lit) return null;
  return (
    <View style={styles.light} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <Pool id="lightKey" s={KEY} />
          <Pool id="lightFill" s={FILL} />
          <Pool id="lightCentre" s={CENTRE} />
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#lightKey)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#lightFill)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#lightCentre)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  light: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // The full page. Each pool's own falloff decides where its light ends —
    // clipping the layer early would put back the edge the tail removes.
    bottom: 0,
  },
});
