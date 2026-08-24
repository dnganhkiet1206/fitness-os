import { useId } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '@/constants/ascnd';

/**
 * The colour behind Today, taken from how recovered you are.
 *
 * ── why the background is allowed to say something ──
 *
 * The reference this follows puts the day's state in the whole surface: a warm
 * sky behind strain, a green one behind recovery. Reading it as decoration
 * misses the point — it is the one thing on the screen you take in before you
 * have read anything, and spending it on a fixed pastel would be spending the
 * first half-second on nothing.
 *
 * So it is the readiness colour, and it is the same three the ring itself uses.
 * The background and the number cannot disagree, because they are one value.
 *
 * ── why it is barely there ──
 *
 * This app is dark, and the reference is not. Translating a pastel wash
 * literally would mean a bright field behind white text, so what carries over
 * is the IDEA — the day has a colour — at the strength a dark screen can hold.
 * `AURA_ALPHA` is where that is decided, and the ceiling is set by the text
 * that sits on top of it rather than by taste: `constants/ascnd.ts` records the
 * contrast work behind these colours, and a wash that eats a ratio it measured
 * would be a regression it cannot see.
 *
 * ── why SVG and not a gradient library ──
 *
 * `expo-linear-gradient` is not in this project, and adding it means a native
 * rebuild for one wash. `react-native-svg` is already here and already draws
 * every gradient in the app; `assistant-aura.tsx` does exactly this.
 */

/**
 * The strongest the wash gets, at its centre.
 *
 * 0.13. Above about 0.18 the amber state starts lifting the page behind the
 * muted body text enough to matter, and muted text on this background is the
 * pairing `constants/ascnd.ts` says was already the tightest in the palette.
 */
const AURA_ALPHA = 0.13;

/** How far down the screen the wash reaches before it is gone. */
const REACH = 0.52;

const TINT: Record<string, string> = {
  green: colors.readinessGreen,
  yellow: colors.readinessYellow,
  red: colors.readinessRed,
};

export function ReadinessAura({
  status,
  tint: override,
}: {
  status: 'green' | 'yellow' | 'red' | null;
  /**
   * A colour that is not a readiness state.
   *
   * Today's hero is a deck now, and the wash follows whichever card you swiped
   * to — so the activity page paints its own colour rather than the readiness
   * one. Passing a colour is how a page that is not ABOUT readiness says so;
   * without it the background would keep asserting a readiness state under a
   * card that is measuring something else, which is the same class of lie the
   * `useId` note below is about.
   */
  tint?: string;
}) {
  const { width, height } = useWindowDimensions();
  /*
    Ids in SVG are document-global on native rather than local to the `<Svg>`
    that declares them, so two of these mounted at once would both draw whichever
    was registered last. `status-scrim.tsx` records that this "has caught the app
    three times; `useId` is the rule" — and here the consequence would be a
    specific lie: a screen showing one person's readiness colour under another
    screen's number.
  */
  const uid = useId();
  const gid = `readinessAura-${uid}`;

  const tint = override ?? (status ? TINT[status] : null);
  /* No reading, no colour. A default wash would be the screen asserting a state
     before anything has been measured. */
  if (!tint) return null;

  const h = height * REACH;

  return (
    <View style={styles.fill} pointerEvents="none">
      <Svg width={width} height={h}>
        <Defs>
          {/*
            The shape being filled and the gradient's frame are the same box,
            and the first version got that wrong in a way that drew NOTHING.

            It filled an ellipse centred on `cy={0}` with `ry={h}`, so the
            shape's bounding box ran from −h to +h — twice the visible height,
            half of it above the screen. A gradient in objectBoundingBox units
            measures against that box, so `cy="0%"` put the bright centre at the
            TOP of it, off-screen, and the radius ran out at exactly y = 0.
            Everything anybody could see was past the last stop.

            Measured on the shipped build before the fix: the page's red channel
            was within one count of its blue at every height, on an AMBER day.
            It compiled, it mounted, the gradient was in the document, and it
            painted nothing.

            A rect over exactly the visible band fixes it because the box is now
            the thing you are looking at. The corners are not a problem the way
            an earlier note here feared: the last stop is fully transparent, so
            where the circle does not reach there is nothing to see.
          */}
          <RadialGradient id={gid} cx="50%" cy="0%" r="100%">
            <Stop offset="0" stopColor={tint} stopOpacity={AURA_ALPHA} />
            <Stop offset="0.55" stopColor={tint} stopOpacity={AURA_ALPHA * 0.42} />
            <Stop offset="1" stopColor={tint} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={h} fill={`url(#${gid})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Behind everything, and out of the way of every touch. `zIndex` is not set:
     being first in the tree is what puts it at the back, and a z-index here
     would be a second answer to a question already answered. */
  fill: { position: 'absolute', top: 0, left: 0, right: 0 },
});
