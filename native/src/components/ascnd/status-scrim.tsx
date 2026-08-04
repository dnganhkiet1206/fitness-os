import { BlurView } from 'expo-blur';
import { useId } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * The backdrop the phone's own status bar sits on.
 *
 * ── what it is for ──
 *
 * A tab page scrolls all the way to the top edge, which is the right layout —
 * the content reads as one continuous surface rather than as a page in a frame.
 * It is also how a weight of "57.4 kg" ends up sliding through the battery
 * icon, and for that second neither number can be read: the phone's chrome and
 * the app's content are the same size, the same weight and both white.
 *
 * ── the standard it is held to ──
 *
 * Nobody should be able to tell it is here. Apple Fitness, the App Store,
 * Apple Music, Cal AI and Hevy all have one, and on a still screen none of them
 * shows anything at all: no bar, no panel, no line you can point at. You only
 * ever see it working, when something passes underneath.
 *
 * That is a stricter goal than "the clock is legible", and it rules out the
 * obvious way of getting there. A pane of frosted glass across the top is
 * legible and is also *visible* — it reads as an overlay laid on the app rather
 * than as part of it, and once you have seen it you cannot unsee it. This
 * version therefore spends nothing it does not have to: a partial blur, a wash
 * of black at twelve percent, and a hairline at five percent white. Every one
 * of those numbers is low enough to be deniable on its own; together they are
 * enough.
 *
 * ── the four layers ──
 *
 * 1. a real `UIVisualEffectView`, blurring the content behind it — not itself
 * 2. a long, very light black gradient, for the depth a flat blur has none of
 * 3. a hairline where the blur stops, so the boundary is stated rather than
 *    discovered
 * 4. the page's own header, which is nothing to do with this file and is
 *    listed because the order is the point: this sits under everything
 *
 * ── what was here before ──
 *
 * `GlassView` — iOS 26 liquid glass, tinted 55% dark. It is a beautiful
 * material and it is the wrong one: `UIGlassEffect` is a *lens*, and it comes
 * with a bright specular rim on every edge that no prop turns off, so the strip
 * announced itself twice over. The rim went first, by hanging the glass outside
 * a clip. The grey stayed, because a 55% tint is grey no matter where you put
 * its edges. What is left of that pass is the lesson: the failure mode here is
 * not too little effect, it is too much.
 */

/**
 * Blur is iOS-only on purpose.
 *
 * On Android `BlurView` needs `blurMethod` plus a `BlurTargetView` wrapped
 * around the content being blurred, with its ref handed back — a change to
 * every page, not to this file. Left at the default it renders "a view with a
 * semi-transparent background", which is precisely the grey rectangle this
 * component exists to not be, so Android and web get the gradient alone.
 *
 * Stated plainly because it is a real gap: on Android the status bar is washed,
 * not separated, and content passing under it is dimmed rather than softened.
 */
const NATIVE_BLUR = Platform.OS === 'ios';

/**
 * How hard the blur is, out of 100.
 *
 * `expo-blur` implements this by holding a `UIViewPropertyAnimator` at
 * `fractionComplete`, which scales the blur radius *and* the material's own
 * tint together — so a low number is not a weak frost, it is a fraction of one.
 * Twenty-two is enough to break up a digit sliding under the clock and not
 * enough to notice on a still screen.
 *
 * Fifty is the default and is far too much; the numbers people reach for when
 * they want the effect to be obvious — 60, 80, 100 — are what make a backdrop
 * read as an overlay.
 */
const INTENSITY = 22;

/**
 * `systemUltraThinMaterialDark`, not `dark`.
 *
 * `dark` is `UIBlurEffect.Style.dark`, a heavy grey vibrancy from before iOS
 * 13. The system materials are what UIKit's own bars are made of, and the ultra
 * thin one is the lightest of them — it carries almost no colour of its own,
 * which is the whole requirement. Pinned to the Dark variant rather than the
 * adaptive one because this app is dark-only (`userInterfaceStyle: "dark"` in
 * app.json); the adaptive material would go pale if the OS ever handed it a
 * light trait.
 */
const TINT = 'systemUltraThinMaterialDark' as const;

/**
 * How far the gradient runs, in points.
 *
 * Long, and much longer than the blur. A short gradient is a band with a soft
 * edge — the eye still finds where it ends, and finding where it ends is the
 * one thing that must not happen. Over ninety points, a twelve percent fall has
 * nowhere to concentrate, and there is no row of pixels anywhere in it that
 * differs from its neighbour by enough to see.
 *
 * It is measured from the inset rather than fixed, so it stays proportionate on
 * a phone with a small one, and floored so it cannot get short.
 */
const fadeHeight = (top: number) => Math.max(88, top + 34);

export function StatusScrim() {
  const insets = useSafeAreaInsets();
  /*
    Ids in SVG are document-global on native, not local to the `<Svg>` that
    declares them — two scrims mounted at once (a pushed page sitting over the
    tab underneath it) would otherwise both draw whichever gradient was
    registered last. This has caught the app three times; `useId` is the rule.
  */
  const gid = `statusScrim-${useId()}`;

  // Nothing to sit behind on a device with no inset at the top.
  if (insets.top <= 0) return null;

  return (
    <View style={[styles.strip, { height: fadeHeight(insets.top) }]} pointerEvents="none">
      {/*
        Layer 1 — the blur, and only as tall as the status bar.

        Blurring further down would soften the large title where it sits at
        rest, which is not content passing behind anything; it is just the page,
        and the page is meant to be sharp.
      */}
      {NATIVE_BLUR ? (
        <BlurView intensity={INTENSITY} tint={TINT} style={[styles.blur, { height: insets.top }]} />
      ) : null}

      {/*
        Layer 2 — the gradient, over the blur and past it.

        Black only. Grey and white were both tried in the version before this
        one and both are visible as themselves: a grey wash reads as a panel, a
        white one as haze. Black at twelve percent reads as the content being
        further away, which is the only honest description of what a backdrop
        is for.

        Four stops with the slope growing a step at a time, because a ramp that
        is held flat and then released has a kink, and the eye finds a kink as
        easily as it finds the half-way point of a straight ramp. No span here
        carries more than half of the total fall.
      */}
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000" stopOpacity="0.12" />
            <Stop offset="0.42" stopColor="#000" stopOpacity="0.09" />
            <Stop offset="0.7" stopColor="#000" stopOpacity="0.05" />
            <Stop offset="1" stopColor="#000" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gid})`} />
      </Svg>

      {/*
        Layer 3 — the hairline, exactly where the blur stops.

        The blur has to end somewhere, and an unmarked end is a smudge: a soft
        boundary the eye keeps trying to focus on. A stated one at five percent
        white is below the threshold of being seen as a line and above the
        threshold of settling the edge — the same trick UIKit's own bars use.

        Only where there is a blur to end. On Android it would be a line drawn
        under nothing at all.
      */}
      {NATIVE_BLUR ? <View style={[styles.hairline, { top: insets.top }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /*
    Above the scroll view and outside it — inside, it would scroll away with
    the content it exists to sit behind. `pointerEvents="none"` so the top of
    the page is still touchable through it, and `zIndex` below the floating
    header's 20 so a chevron drawn over a hero stays crisp.
  */
  strip: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  blur: { position: 'absolute', top: 0, left: 0, right: 0 },
  hairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
});
