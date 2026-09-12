import { nav } from '@/lib/nav';
import * as Haptics from 'expo-haptics';
import { Beef, Droplets, Flame, Footprints, Milk, Minus, Moon, Salad, Star, Sunrise, Target, Wheat, type LucideIcon } from 'lucide-react-native';
import { useEffect, useId, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { HelpButton, HelpNudge, useHelpTopic } from '@/components/ascnd/help-button';
import { NutritionExplainer } from '@/components/ascnd/nutrition-explainer';
import { ProgressBar } from '@/components/ascnd/progress-bar';
/* Danh sách nhập của nhánh giao diện sáng (`macroBar` thay `MACRO_BAR`, bỏ
   `glass`), cộng `PaletteKey` mà rãnh vòng tròn cần. */
import { MACRO_BAR, MACRO_TINT, macroBar, radius, spacing } from '@/constants/ascnd';
import { alpha, graphicOf, makeStyles, type PaletteKey } from '@/constants/theme';
import { useMaterial, useSleepRamp, usePalette } from '@/hooks/use-palette';
import { duration } from '@/constants/motion';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useVolumeUnit } from '@/hooks/use-volume-unit';
import { useAddWater, useRemoveLastWater, useTodayWaterLogs } from '@/hooks/use-water';
import { toast } from '@/lib/toast';
import { displayVolume, volumeLabel, volumeToMl, type VolumeUnit } from '@/lib/units';
import { waterQuickAmounts } from '@/lib/water-presets';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
/*
  Rãnh vòng tròn đọc từ BẢNG MÀU, không viết cứng.

  Nó là `'#17171c'` viết thẳng ở đây, và hai chuyện hỏng cùng lúc: nó đo được
  1,13:1 so với nền nên gần như vô hình, và nó không đổi theo bản sáng — một
  vòng tròn viền đen trên nền kem. Người dùng khoanh đúng phần rãnh của hai
  vòng ở đầu màn Hôm nay khi đang dựng giao diện sáng.

  `PaletteKey` chứ không phải một chuỗi: gõ sai tên token thì `tsc` đỏ ngay,
  còn một chuỗi sai chỉ cho ra `undefined` rồi vẽ ra không màu.
*/
const TRACK = 'ringTrack' satisfies PaletteKey;

/**
 * How far past a target still counts as hitting it.
 *
 * A share of the target rather than a flat number, so it scales with the
 * person: 10% is 220 kcal on a 2,200 target, or 7g on a 70g fat target. That is
 * the resolution food logging is honest to anyway — the label on a packet and
 * the size of a portion are both rougher than a tenth — so a day inside this
 * band is not a day that went differently, and colouring it as one teaches
 * people to distrust the colour.
 *
 * One constant for the calorie ring and for all four macro tiles. They are the
 * same judgement about the same data, and two numbers that mean the same thing
 * are two numbers that will disagree eventually.
 */
const SURPLUS_ALLOWANCE = 0.1;

/** The web's card micro-title: 12px semibold uppercase, wide tracking */
export function MicroTitle({ children }: { children: React.ReactNode }) {
  const c = usePalette();
  const styles = stylesFor(c);
  return <Text style={styles.microTitle}>{children}</Text>;
}

/**
 * 100pt progress ring with icon + mono value in the middle (web pattern).
 *
 * ── going past 100% ──
 *
 * `over` is how far the value went past the target, as a percentage of it, and
 * it is drawn the way Apple's Move ring draws it: a second lap **on the same
 * stroke**, from twelve o'clock, overlapping the ring already there.
 *
 * The first version put it on a smaller concentric radius instead. That is
 * legible, and it is a different idea — it reads as a second, separate
 * measurement rather than as one measurement that kept going. Overlapping is
 * what says "round again".
 *
 * Which raises the problem the shadow solves: laid directly over a ring of the
 * same colour, the lap is invisible. So dark arcs are drawn a few degrees
 * *longer* than the lap and underneath it, and what shows past the coloured
 * cap is a shadow cast onto the ring below. It is the only depth cue available
 * — `react-native-svg` declares the filter primitives but leaves them
 * unimplemented on native, so `feDropShadow` renders nothing.
 *
 * Two of them, at different lengths and opacities, because one is a hard-edged
 * dark crescent: a real shadow has no outline. The longer, fainter arc puts a
 * step of falloff past the darker one, which at this size is the difference
 * between a shadow and a mark. Short, as well — the lap is what should be
 * noticed, and a shadow big enough to see on its own is a shadow that has
 * become part of the drawing.
 *
 * The lap uses the ring's own gradient, not a colour of its own. It is the
 * same measurement continuing, and the ring's colour already carries a
 * meaning that a second colour on the same stroke would be read as part of.
 */
function SmallRing({
  pct,
  gradId: gradPrefix,
  gradient: [c0, c1],
  icon,
  iconColor,
  value,
  unit,
  over = 0,
  glow,
  size = 100,
}: {
  pct: number;
  gradId: string;
  gradient: [string, string];
  icon: LucideIcon;
  iconColor: string;
  value: string;
  unit?: string;
  /** percent past the target, 0 for none — drawn as an overlapping second lap */
  over?: number;
  /**
   * Colour of the halo cast around the arc, or none.
   *
   * There is no filter to do this with: `react-native-svg` declares the filter
   * primitives and leaves them unimplemented on native, so `feGaussianBlur` and
   * `feDropShadow` both render nothing. What a blur would have produced is
   * approximated the same way the over-lap's shadow is — extra copies of the
   * arc underneath the real one, wider and fainter the further out they go.
   * Two steps is enough to stop it looking like a second ring drawn round the
   * first; one is a hard-edged outline, which is the opposite of a glow.
   */
  glow?: string;
  /**
   * Outer box, in points. Everything inside is drawn in a fixed 100×100
   * viewBox, so this scales the whole thing — band, glow ramp, overshoot lap —
   * without touching a single coordinate.
   *
   * It is a prop rather than a bigger constant because `SleepCard` draws the
   * same ring and was not asked to change. The number in the middle keeps its
   * own size on purpose: a larger ring with the same numeral gives the figure
   * room, whereas scaling the text with the ring just makes the card louder.
   */
  size?: number;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  // Thick, in the Move-ring proportion: the stroke is most of the difference
  // between the outer edge and the hole, so the ring reads as a band of colour
  // rather than as a line drawn round a circle.
  const R = 37;
  const W = 12;
  const CIRC = 2 * Math.PI * R;

  /**
   * The gradient's id, made unique per mounted ring.
   *
   * `gradId` used to be the id itself, which meant two rings built from the
   * same caller shared one `<Defs>` entry — and an SVG id is document-global,
   * so the *first* definition wins and every later ring silently paints in the
   * first one's colours. That is invisible until the two rings are meant to
   * differ, at which point the wrong one looks merely wrong rather than broken.
   * The caller's string stays as a readable prefix; `useId` makes it unique.
   */
  const uid = useId();
  const gradId = `${gradPrefix}-${uid.replace(/:/g, '')}`;

  /**
   * How far each shadow arc leads the lap's cap, as a fraction of a turn, with
   * the opacity that goes with it. ~3° and ~6° — small enough to sit under the
   * cap rather than trail behind it as a visible tail.
   */
  const SHADOWS = [
    { lead: 0.017, opacity: 0.16 },
    { lead: 0.008, opacity: 0.3 },
  ] as const;

  const progress = useSharedValue(0);
  const overProgress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      200,
      withTiming(Math.min(pct, 100) / 100, { duration: 1200, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
    );
  }, [pct, progress]);
  useEffect(() => {
    // Starts after the main ring has had a moment, so the two are read in
    // order: the day filled up, and then it went round again.
    overProgress.value = withDelay(
      700,
      withTiming(Math.min(over, 100) / 100, { duration: 1000, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
    );
  }, [over, overProgress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRC - progress.value * CIRC,
  }));
  const overAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRC - overProgress.value * CIRC,
  }));
  const shadowFar = useAnimatedProps(() => ({
    strokeDashoffset: CIRC - Math.min(overProgress.value + SHADOWS[0].lead, 1) * CIRC,
  }));
  const shadowNear = useAnimatedProps(() => ({
    strokeDashoffset: CIRC - Math.min(overProgress.value + SHADOWS[1].lead, 1) * CIRC,
  }));

  const lapped = over > 0;

  return (
    <View style={[styles.smallRingWrap, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={c0} />
            <Stop offset="100%" stopColor={c1} />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r={R} fill="none" stroke={c[TRACK]} strokeWidth={W} />
        {glow
          ? // Widest and faintest first. `W + 10` puts the outer edge at 48 in a
            // 100 box — the halo has to stay inside the viewBox or it is not a
            // falloff, it is a cut.
            //
            // Four steps, not two. Two produced a pair of visible concentric
            // bands with their own edges: a glow's whole character is that it
            // has no edge, and at these opacities each additional step costs
            // nothing but buys another rung of the ramp. The alphas fall off
            // faster than the widths grow, which is roughly what a blur does.
            //
            // The alphas came down by about a third from where they started:
            // a halo that is bright enough to notice *as a halo* has stopped
            // being the edge of the ring and become a second ring.
            [
              { w: W + 10, o: 0.035 },
              { w: W + 7.5, o: 0.05 },
              { w: W + 5, o: 0.07 },
              { w: W + 2.5, o: 0.095 },
            ].map((g) => (
              <AnimatedCircle
                key={g.w}
                cx="50" cy="50" r={R}
                fill="none"
                stroke={glow}
                strokeOpacity={g.o}
                strokeWidth={g.w}
                strokeLinecap="round"
                strokeDasharray={`${CIRC}`}
                animatedProps={animatedProps}
                transform="rotate(-90 50 50)"
              />
            ))
          : null}
        <AnimatedCircle
          cx="50" cy="50" r={R}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={W}
          strokeLinecap="round"
          strokeDasharray={`${CIRC}`}
          animatedProps={animatedProps}
          transform="rotate(-90 50 50)"
        />
        {lapped ? (
          <>
            {/* Two arcs a few degrees ahead of the lap, fainter the further
                they reach; what shows past the coloured cap is the shadow it
                casts on the ring below. Longest and faintest first. */}
            <AnimatedCircle
              cx="50" cy="50" r={R}
              fill="none"
              stroke={`rgba(0,0,0,${SHADOWS[0].opacity})`}
              strokeWidth={W}
              strokeLinecap="round"
              strokeDasharray={`${CIRC}`}
              animatedProps={shadowFar}
              transform="rotate(-90 50 50)"
            />
            <AnimatedCircle
              cx="50" cy="50" r={R}
              fill="none"
              stroke={`rgba(0,0,0,${SHADOWS[1].opacity})`}
              strokeWidth={W}
              strokeLinecap="round"
              strokeDasharray={`${CIRC}`}
              animatedProps={shadowNear}
              transform="rotate(-90 50 50)"
            />
            <AnimatedCircle
              cx="50" cy="50" r={R}
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth={W}
              strokeLinecap="round"
              strokeDasharray={`${CIRC}`}
              animatedProps={overAnimatedProps}
              transform="rotate(-90 50 50)"
            />
          </>
        ) : null}
      </Svg>
      <View style={styles.smallRingCenter} pointerEvents="none">
        <Icon icon={icon} size={16} color={iconColor} />
        <Text style={styles.smallRingValue}>{value}</Text>
        {unit ? <Text style={styles.smallRingUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

// ─── Nutrition card (web NutritionCard) ────────────────────────────────

interface NutritionCardProps {
  kcal: number;
  calorieTarget: number;
  protein: { current: number; target: number };
  carbs: { current: number; target: number };
  fat: { current: number; target: number };
  /**
   * Optional — the card predates it and callers that have no fibre to show
   * still get the three tiles they always did.
   */
  fiber?: { current: number; target: number };
  /**
   * Whether tapping the card swaps the macro tiles to "still to eat".
   *
   * Off by default, and deliberately: on the dashboard this card already sits
   * inside a `Pressable` that opens the Nutrition tab, and a tap target inside
   * a tap target means the outer one never fires. The dashboard's job is to get
   * you *to* the numbers; the toggle belongs where the numbers already are.
   */
  interactive?: boolean;
}

/**
 * A macro tile's two numbers, and which of them is the headline.
 *
 * Each side is a figure with the word for it underneath: `92/150g` over
 * `eaten`, and — tapped — `58g` over `left`. Nobody plans the rest of the day
 * out of "92", they plan it out of "58 to go", and nobody checks whether they
 * hit their protein out of "58 to go" either. One tile, one number at a time,
 * and the tap decides which question it is answering.
 *
 * The caption names the headline rather than carrying a second figure. It once
 * read `58g left` under the eaten number, which left the tap with nothing to
 * reveal — both numbers were already on the tile and flipping it only changed
 * which one was set in 18pt. The exception is a macro past its target, where
 * the caption reports the surplus rather than naming anything: see below.
 *
 * The word also travels *down* with its number rather than up beside it. A
 * headline reading `58g left` mixes 18pt and 12pt on one line, which is a
 * sentence that happens to start with a number; `58g` above `left` is a number
 * with a label, and the figure is easier to find at exactly the moment the tile
 * exists to show it.
 *
 * Both lines are present in both states, so the tile's height never changes and
 * nothing below it reflows when you tap.
 *
 * ── both readings are always mounted ──
 *
 * The obvious build is one `<Text>` whose content changes on tap. Then the
 * number can only cut, because there is nothing to cross-fade *to* — and a tile
 * that hard-cuts between two similar numbers looks like a glitch rather than a
 * change of mind. So each line renders twice, one copy in flow (which is what
 * gives the row its height) and one absolutely on top of it, and `swap` moves
 * between them.
 *
 * ── how it moves ──
 *
 * Everything travels the same way: up. The outgoing number lifts out of the top
 * of the tile while the incoming one rises into its place from below, which is
 * an odometer rather than a dissolve, and it is the difference between a value
 * that *changed* and two values that happened to overlap. It shrinks very
 * slightly on the way out and settles back to full size on the way in, so the
 * arriving number reads as the one in front.
 *
 * The fades are phased rather than mirrored: the outgoing copy is gone by 55%
 * and the incoming one does not start until 45%, leaving a moment where the
 * tile is nearly empty. Mirrored fades put both numbers at half opacity on top
 * of each other, which reads as a smear.
 *
 * ── and they do not all move at once ──
 *
 * Each tile is `index * 55ms` behind the one before it. Four tiles flipping on
 * the same frame is a screen redrawing; four tiles flipping in sequence is one
 * gesture travelling across the card. The whole run is under a quarter second
 * so it never feels like waiting.
 */
function MacroSwap({
  showLeft,
  index,
  current,
  target,
  color,
  i18n,
}: {
  showLeft: boolean;
  index: number;
  current: number;
  target: number;
  /** the macro's own colour — what a surplus inside the allowance is drawn in */
  color: string;
  i18n: ReturnType<typeof useI18n>;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const eatenNow = Math.round(current);
  const left = Math.round(target - current);
  const over = left < 0;

  /**
   * What is left, as a phrase: `58g left`, `0g done`, `+12g over`.
   *
   * A surplus is the one case where "left" is not a thing that is left, so it
   * is printed as what it is, in the red this card already uses for eating past
   * a target. Fibre and protein surpluses are not failures, but a per-macro
   * exception is a rule nobody can predict from the outside; the tile states
   * the fact and the colour stays consistent across the card.
   */
  const leftWord = over ? i18n.dcMacroOver : left === 0 ? i18n.dcMacroDone : i18n.dcMacroLeft;
  const leftNum = `${over ? '+' : ''}${Math.abs(left)}`;

  /**
   * A surplus is red only once it is past the allowance.
   *
   * Every gram over used to be, and four macros are four chances to go a little
   * over, so an ordinary day lit up in warnings. Red that appears on an ordinary
   * day is red nobody reads on the day it matters. Inside the allowance the
   * figure takes the macro's own colour instead: still visibly not the muted
   * grey of "eaten", still plainly a surplus, and not an alarm.
   *
   * The same `SURPLUS_ALLOWANCE` the calorie ring uses, on purpose — a card that
   * calls 105% of calories fine and 102% of carbs a problem is a card arguing
   * with itself.
   */
  const overHard = current > target * (1 + SURPLUS_ALLOWANCE);
  const overStyle = { color: overHard ? c.readinessRed : color };

  const swap = useSharedValue(showLeft ? 1 : 0);
  useEffect(() => {
    swap.value = withDelay(
      index * 55,
      withTiming(showLeft ? 1 : 0, { duration: duration.swap, easing: Easing.bezier(0.22, 1, 0.36, 1) }),
    );
  }, [showLeft, index, swap]);

  /**
   * Four styles rather than two shared between four views.
   *
   * Reanimated ties an animated style to the component it is applied to;
   * handing one result to two components is not something it promises to keep
   * working, and the failure would be one line silently not animating. The
   * clamping is written out inside each worklet for the same reason a helper
   * would need its own `'worklet'` directive — a worklet may only call other
   * worklets, and one small expression is not worth getting that wrong.
   */
  const headOut = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(Math.max(swap.value / 0.55, 0), 1),
    transform: [{ translateY: -12 * swap.value }, { scale: 1 - 0.04 * swap.value }],
  }));
  const headIn = useAnimatedStyle(() => ({
    opacity: Math.min(Math.max((swap.value - 0.45) / 0.55, 0), 1),
    transform: [{ translateY: 12 * (1 - swap.value) }, { scale: 0.96 + 0.04 * swap.value }],
  }));
  const noteOut = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(Math.max(swap.value / 0.55, 0), 1),
    transform: [{ translateY: -8 * swap.value }],
  }));
  const noteIn = useAnimatedStyle(() => ({
    opacity: Math.min(Math.max((swap.value - 0.45) / 0.55, 0), 1),
    transform: [{ translateY: 8 * (1 - swap.value) }],
  }));

  return (
    <View style={styles.macroLines}>
      <View>
        <Animated.Text style={[styles.macroValue, headOut]}>
          {eatenNow}
          <Text style={styles.macroTarget}>/{target}g</Text>
        </Animated.Text>
        <Animated.Text
          style={[styles.macroValue, styles.macroSwapAbs, over && overStyle, headIn]}>
          {leftNum}
          <Text style={[styles.macroTarget, over && overStyle]}>g</Text>
        </Animated.Text>
      </View>

      <View>
        {/*
          The label for the headline above it, not a second figure.

          This said `58g left` — the remainder, spelled out under the eaten
          figure — which meant the tap had nothing to reveal: both numbers were
          already on the tile and flipping it only changed which one was set in
          18pt. Naming the headline instead makes the two sides symmetric,
          `92/150g` over `eaten` and `58g` over `left`, and gives the tap
          something to be for.
        */}
        {/*
          Under the target this names the headline — "eaten". Past it, the
          caption gives up the label and reports the surplus instead.

          `378/250g` contains the fact that a hundred and twenty-eight grams
          went over and makes you do the subtraction to get it, which is the one
          piece of arithmetic this tile exists to save.

          It read `eaten · +128g over goal`, keeping the label in front. That
          fits in English and does not fit in Vietnamese: `đã ăn · +128g vượt
          mục tiêu` wraps to a second line, the tile grows, and the progress
          bars across a row stop lining up — a layout that is correct in the
          language it was written in and broken in the one the app is used in.
          Cutting the label is the right thing anyway. "Eaten" is inferable from
          the `378/250g` directly above it, and the surplus is not inferable
          from anything.

          Only when over: a macro that is under has its remainder one tap away
          and nothing surprising to report.
        */}
        <Animated.Text style={[styles.macroNote, over && overStyle, noteOut]}>
          {over ? `${leftNum}g ${leftWord}` : i18n.dcMacroEaten}
        </Animated.Text>
        {/*
          The word only, sitting where the caption always sits.

          Flipped, the tile leads with the bare figure and names it
          underneath — `58g` over `left` — rather than carrying the word up
          into the headline as `58g left`. Two lines of one size each is a
          number with a label; one line mixing 18pt and 12pt is a sentence
          that happens to start with a number, and it made the figure harder
          to find at exactly the moment the tile exists to show it.

          Same size and colour as the caption on the other side of the swap,
          so the line does not appear to change weight as it crosses over.
        */}
        <Animated.Text
          style={[styles.macroNote, styles.macroSwapAbs, over && overStyle, noteIn]}>
          {leftWord}
        </Animated.Text>
      </View>
    </View>
  );
}

export function NutritionCard({
  kcal,
  calorieTarget,
  protein,
  carbs,
  fat,
  fiber,
  interactive = false,
}: NutritionCardProps) {
  const c = usePalette();
  const m = useMaterial();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  const help = useHelpTopic('nutrition');
  const calPct = Math.min((kcal / (calorieTarget || 1)) * 100, 100);
  /** the same share, uncapped — the ring stops at a turn, this does not */
  const pctOfTarget = Math.round((kcal / (calorieTarget || 1)) * 100);

  /**
   * How far today sits from the target, signed.
   *
   * Positive is a surplus (eaten past the target), negative a deficit.
   *
   * It used to feed a second text line under "remaining", which meant the card
   * printed the same figure twice all day — *còn lại 500* over *thâm hụt −500*.
   * There is one line now and this decides which of the three things it says;
   * see the note at the render. The ring still reads `delta` on its own, to
   * choose its colour and to draw the overshoot lap.
   */
  const delta = kcal - calorieTarget;
  const over = delta > 0;
  // Landing exactly on the target is neither, and printing "deficit −0" for it
  // is the sort of thing a user reads as a bug.
  const onTarget = delta === 0;

  /**
   * The ring's three states, which are not the same question as the text above.
   *
   *  - **under** the target — still filling up. White. Nothing has been
   *    achieved yet and nothing is wrong either, so it must not be the good
   *    band's amber (that would congratulate a half-eaten day) nor red. It was
   *    `#4a4a52 → #6b6b6b`, which said all of that correctly and said it in
   *    the colour of a disabled control — the ring is the biggest thing on the
   *    card and for most of the day it read as switched off. White is bright
   *    without carrying a verdict: it is the only value on the card that is not
   *    already spoken for by a meaning, so it reads as "in progress" rather
   *    than as good or bad. Neon white rather than paper white: it ramps into a
   *    cool `#b9dcf0` and carries a glow, because a flat white band on a flat
   *    dark card is a sticker. A real tube is white in the middle and cool at
   *    its edges, and that cool cast is most of what makes white read as lit
   *    rather than as painted.
   *
   *    It is not pure `#ffffff` any more. A 12pt band of maximum white is the
   *    brightest thing the screen can produce, sitting on the darkest — that is
   *    not a lit ring, it is a light source, and the numbers inside it have to
   *    compete with it to be read. `#eaf1fb` is a stop down: still the
   *    brightest thing on the card, no longer the brightest thing available.
   *  - **on target, or over by no more than the allowance** — the good band.
   *    This keeps the card's existing amber/orange gradient.
   *  - **past the allowance** — red. Genuinely over, and it should look it.
   *
   * The allowance is `SURPLUS_ALLOWANCE`, shared with the macro tiles below.
   */
  const overBudget = delta > calorieTarget * SURPLUS_ALLOWANCE;
  const inBand = !overBudget && kcal >= calorieTarget;

  /**
   * The overshoot lap: how far past the target the day went, as a share of the
   * target. Capped at a full extra lap — eating double is as far as the ring
   * can say, and the surplus line prints the real figure anyway.
   */
  const overPct = calorieTarget > 0 ? Math.min((Math.max(delta, 0) / calorieTarget) * 100, 100) : 0;

  /*
    ── ba trạng thái, và hai trong ba từng là mã màu của bản TỐI ──

    Ảnh chụp iOS: vòng calo ở màn Dinh dưỡng ra màu XANH NHẠT, trên một vòng mà
    calo phải là màu ẤM. Nguyên nhân là cặp cuối — `['#eaf1fb', '#b9dcf0']`.

    Ở bản tối đó là một vòng gần TRẮNG, nghĩa "chưa có gì để nói, vẫn đang đi",
    và chú thích ngay dưới nói rõ nó là vòng duy nhất được phát sáng. Trên giấy
    thì cùng hai mã màu ấy đo được **1,07:1** so với mặt thẻ trắng — không phải
    kín đáo mà là không có — và phần nhìn thấy được lại nhuốm xanh, tức nó nói
    sai cả về độ đậm lẫn về nghĩa.

    Bản sáng vì thế đi theo một dải ẤM DẦN, và cả ba chặng đều là token:

        dưới mức    beige  → orange    "đang đi"
        trong dải   orange → rose      "đúng nhịp"
        vượt        rose   → đỏ        "quá tay"

    Mỗi chặng BẮT ĐẦU ở chỗ chặng trước kết thúc, nên ba trạng thái là một dải
    nóng dần liên tục chứ không phải ba màu rời. `metricRose` ở đây là một điểm
    dừng của dải, không phải một nhãn — nó không va vào vai "protein" của cùng
    token, vì chỗ ấy nhãn mới mang nghĩa. Bản TỐI
    giữ nguyên văn cả ba cặp cũ, kể cả mã amber `#ffc53d` vốn không phải token:
    nó là một quyết định của bản tối, và bản tối đã ship.
  */
  /* Cung vòng và icon trong vòng là HÌNH, nên chúng đọc vai đồ hoạ của cam.
     Ở bản tối hai vai bằng nhau nên nhánh `m.lit` không đổi một điểm ảnh nào. */
  const ringGradient: [string, string] = overBudget
    ? [c.metricRose, c.readinessRed]
    : inBand
      ? m.lit
        ? ['#ffc53d', c.metricOrange]
        : [c.metricOrangeGraphic, c.metricRose]
      : m.lit
        ? ['#eaf1fb', '#b9dcf0']
        : [c.metricBeige, c.metricOrangeGraphic];
  const ringIconColor = overBudget
    ? c.readinessRed
    : inBand
      ? c.metricOrangeGraphic
      : c.foreground;

  /**
   * Only the white ring glows. Amber and red are already saturated enough to
   * carry themselves off a dark card; a halo on them would read as bloom rather
   * than as neon, and it would put light around the two states that mean
   * something rather than the one that means "still going".
   */
  const ringGlow = !overBudget && !inBand ? '#9fd8f5' : undefined;

  // the delta line follows the same three states, so the card speaks once
  const deltaColor = overBudget
    ? c.readinessRed
    : inBand
      ? c.metricOrange
      : c.foreground;

  /**
   * Which reading the tiles are showing.
   *
   * Just the boolean — each tile owns the shared value it animates on, because
   * they no longer move together. State drives the animation rather than the
   * other way round, so a re-render for any other reason (a fresh log landing,
   * the language changing) cannot leave a tile fading one way while the card
   * believes the other.
   */
  const [showLeft, setShowLeft] = useState(false);

  /*
    Bốn icon lấy thẳng từ `lucide`, không phải bốn hình tự vẽ.

    ── vì sao bộ tự vẽ bị xoá ──

    `macro-icons.tsx` mở đầu bằng "the set has no drumstick, no wheat ear and no
    avocado". Câu đó SAI: lucide có `drumstick`, `wheat`, `beef`, `egg`, `nut`,
    `leafy-green`, `salad`, `sprout`. Cả tệp — bốn hình tay, một công cụ xem
    trước, một bộ luật giữ chúng khỏi lệch nhau — dựng trên một tiền đề chưa ai
    kiểm.

    Hậu quả không chỉ là công sức thừa. Hai lần vẽ tay đều đọc sai ở kích thước
    thật: lần đầu ra một cái chìa khoá và một củ lạc có lỗ, lần sau ra một bầu
    dục vô nghĩa và một cây thông. Bốn hình do người vẽ icon chuyên nghiệp làm
    thì không cần vòng thứ ba.

    ── vì sao ĐÚNG bốn cái này ──

    Chọn theo hai điều kiện, và cả hai đều kiểm bằng mắt ở 14 điểm mật độ 3x —
    kích thước và mật độ chúng thật sự được dùng:

      thịt   khối gọn có MỘT CHẤM   — và trùng `quick-stats.tsx`, nơi protein đã
                                      là `Beef`; app thôi có hai glyph cho một
                                      khái niệm
      lúa    dải CHÉO có vân        — hình duy nhất nằm nghiêng
      sữa    chai ĐỨNG, cạnh thẳng  — hình duy nhất là hình chữ nhật
      xà lách bát RỘNG, đáy bằng    — hình duy nhất nằm ngang

    `Droplet` đúng nghĩa hơn cho chất béo — một giọt dầu. Nhưng màn dinh dưỡng
    có luôn thẻ Nước, và nước dùng `Droplets`: một giọt nằm cách hai giọt vài
    trăm điểm là đúng cái bẫy tác giả bộ cũ đã ghi lại. Chai sữa không đụng ai.

    ── một chỗ chồng màu đã biết ──

    Chất béo giờ mang `metricBlue`, và thẻ Nước ở cuối tệp này cũng vẽ icon bằng
    đúng `#3ba6ff`. Hai thứ cùng nằm trên màn dinh dưỡng.

    Để nguyên vì đây là màu được yêu cầu, và vì hai chỗ đó khác hình (chai đứng
    so với hai giọt) lẫn khác ngữ cảnh (một ô macro trong thẻ dinh dưỡng so với
    một hàng riêng phía dưới). Nếu đọc ra vẫn lẫn thì `metricCyan` là một từ.

    Bốn bóng khác nhau, nên chúng phân biệt được cả khi nhỏ tới mức chỉ còn bóng.
  */
  /*
    Màu giải ra ở ĐÂY, nơi có `c` — bảng ở `ascnd.ts` chỉ giữ khoá.

    ── và mỗi ô macro cần HAI màu, không một ──

    `color` chỉ đi vào `<Glyph>` (một icon) và `barGraphic` chỉ đi vào
    `<ProgressBar>` (một thanh): cả hai là HÌNH, nên cả hai đọc vai đồ hoạ.

    `bar[0]` thì KHÔNG: nó còn đi vào `MacroSwap`, và ở trạng thái vượt ngưỡng
    `overStyle` tô nó lên `macroValue`/`macroTarget`/`macroNote` — tức CHỮ. Nên
    nó ở lại vai chữ. Cùng lý do `MACRO_TINT` và `MACRO_BAR` không tự đổi khoá:
    `food-cards.tsx` in chữ "C" bằng `c[MACRO_TINT.carbs]`, nên một bảng đổi
    khoá sẽ kéo cả chữ ấy theo.

    `graphicOf` trả về chính token khi token đó không có vai đồ hoạ riêng, nên
    ba macro kia không đổi một điểm ảnh nào.
  */
  /*
    Mỗi ô mang MÀU CỦA CHẤT NÓ ĐO — và chỉ trên giấy.

    Chú thích ở `macroTile` ghi lại một phép đo kết luận "cái NỀN không bao giờ
    vẽ được ô này, chỉ cái VIỀN vẽ được". Phép đo ấy đúng, và nó đo trên mặt thẻ
    `#0e0e11`: bản TỐI. Ở đó thẻ và mọi nền ứng viên đều gần như đen, nên chênh
    lệch không có chỗ tồn tại — nâng alpha từ 0.2 lên 0.9 chỉ đi từ 1.015 tới
    1.077.

    Trên giấy thì ràng buộc ấy KHÔNG có. Mặt thẻ là `#ffffff`, nên một lớp tô
    10% có cả một dải để sống trong đó.

    Đo trước khi chọn, chữ phụ `#6b6559` trên nền ô:

        nền hiện tại (secondary #efeae1)   4,83:1
        tô 10%  protein 4,96 · carbs 5,18 · fat 5,04 · fiber 5,05

    Nên 0.10: cả bốn ĐỌC RÕ HƠN nền trung tính đang dùng, không phải đổi rõ lấy
    màu. 0.12 đưa protein xuống 4,80 — dưới mức hôm nay — nên đó là trần.

    Bản tối nhận `null` và rơi về `m.inset.bg` như cũ, không đổi một điểm ảnh.
  */
  const TILE_TINT = 0.1;
  const tileBg = (k: PaletteKey) => (m.lit ? null : alpha(graphicOf(c, k), TILE_TINT));

  const macros = [
    { label: 'Protein', ...protein, icon: Beef, color: graphicOf(c, MACRO_TINT.protein), bar: macroBar(c, 'protein'), barGraphic: graphicOf(c, MACRO_BAR.protein.from), bg: tileBg(MACRO_TINT.protein) },
    { label: 'Carbs', ...carbs, icon: Wheat, color: graphicOf(c, MACRO_TINT.carbs), bar: macroBar(c, 'carbs'), barGraphic: graphicOf(c, MACRO_BAR.carbs.from), bg: tileBg(MACRO_TINT.carbs) },
    { label: 'Fat', ...fat, icon: Milk, color: graphicOf(c, MACRO_TINT.fat), bar: macroBar(c, 'fat'), barGraphic: graphicOf(c, MACRO_BAR.fat.from), bg: tileBg(MACRO_TINT.fat) },
    ...(fiber
      ? [{ label: 'Fiber', ...fiber, icon: Salad, color: graphicOf(c, MACRO_TINT.fiber), bar: macroBar(c, 'fiber'), barGraphic: graphicOf(c, MACRO_BAR.fiber.from), bg: tileBg(MACRO_TINT.fiber) }]
      : []),
  ];

  const card = (
    <GlassCard style={styles.stackCard}>
      <MicroTitle>{i18n.dcNutritionTitle}</MicroTitle>
      {/* Out of the flow, in the corner — the same placement `readiness-gauge`
          uses, and for the same reason: a `?` added as a flow child pushes
          everything under it down and changes the card's height. Absolute
          costs the card nothing. `spacing.card` rather than `spacing.md`
          because that is this card's own padding, so the glyph lines up with
          the content edge instead of floating inside it. */}

      <View style={styles.ringRow}>
        <SmallRing
          /* The hero of this card and the one number people open the tab for.
             124 rather than 100 — the sleep card keeps the smaller one. */
          size={124}
          pct={calPct}
          gradId="nutri-cal"
          gradient={ringGradient}
          icon={Flame}
          iconColor={ringIconColor}
          glow={ringGlow}
          value={kcal.toLocaleString()}
          unit="kcal"
          over={overPct}
        />
        {/*
          Text only. This column used to end with a percentage and a progress
          bar, and both were the ring again in a second form — a bar that fills
          as the ring fills, in the ring's own colour, right beside it. The
          numbers that are not in the ring (target, remaining, surplus) stayed.
        */}
        <View style={styles.ringSide}>
          {/*
            The target, and beside it how much of it the day has actually
            covered.

            Uncapped, unlike the ring: the ring can only draw one turn plus a
            lap, and this is the number that keeps counting — 111% says
            something a full ring cannot. It takes the ring's colour, so the
            two never disagree about whether the day is fine.
          */}
          <View style={styles.sideTargetRow}>
            <Text style={styles.sideLine}>
              {i18n.dcNutritionTarget}: <Text style={styles.sideMono}>{calorieTarget.toLocaleString()}</Text> kcal
            </Text>
            {/* A separator, so the row is two facts rather than one run-on
                phrase: the target, then how much of it today covered. Without
                it "2,200 kcal 70% goal" is read once as a single number and
                then again, properly, on the second look. */}
            <Text style={styles.sideSlash}>/</Text>
            {/*
              The word "goal" is now the target glyph.

              It was the longest thing on the busiest line and it was the least
              informative: the number beside it is a percentage of *something*,
              and on a card headed NUTRITION with a target on the same line
              there is only one thing it can be a percentage of. The icon says
              it in a tenth of the width, and it takes the same colour as the
              number so the pair still reads as one fact.

              13pt, matching `sidePct`'s size rather than the 16 an icon
              usually gets here — it is punctuation for the number, not a thing
              of its own to look at.
            */}
            <Text style={[styles.sidePct, { color: deltaColor }]}>{pctOfTarget}%</Text>
            <Icon icon={Target} size={13} color={deltaColor} />
          </View>
          {/*
            ── one line, not two ──

            This used to be a "remaining" line with a signed "deficit / surplus"
            line under it, and for the whole of a normal day they printed the
            same number twice: *Còn lại 500* directly above *Thâm hụt −500*. The
            second line existed because the first clamps at zero and therefore
            goes quiet exactly when the day gets interesting — but the answer to
            that is for the one line to keep counting, not for a second line to
            shadow it all day for the sake of one case.

            So the slot says what is true of the moment. Under the target it is
            what is left; past it, the same slot turns into the surplus and
            takes the delta colour with it, which is also the point at which the
            ring and the percentage above have already turned. Landing exactly
            on it is its own sentence, because "còn lại 0" is a technically
            correct thing to say to somebody who has just hit their target
            precisely, and it reads as a failure.
          */}
          {onTarget ? (
            <Text style={[styles.sideLine, { color: deltaColor }]}>{i18n.dcNutritionOnTarget}</Text>
          ) : over ? (
            <Text style={[styles.sideLine, { color: deltaColor }]}>
              {i18n.dcNutritionSurplus}:{' '}
              <Text style={styles.sideMono}>+{delta.toLocaleString()}</Text> kcal
            </Text>
          ) : (
            <Text style={styles.sideLine}>
              {i18n.dcNutritionRemaining}:{' '}
              <Text style={styles.sideMono}>{(calorieTarget - kcal).toLocaleString()}</Text> kcal
            </Text>
          )}
        </View>
      </View>

      {/**
        * Four tiles are a 2 × 2; three are one row of three.
        *
        * The first attempt was `flexWrap` with a fixed `flexBasis`, which let
        * the three that fit sit on the first row and dropped fibre onto a
        * second one on its own, full width. Four tiles in two sizes is not a
        * grid, it is three tiles and an afterthought — so the basis is chosen
        * from how many there are rather than from how many happen to fit.
        *
        * 47 % and not 50: two tiles plus the gap between them have to add up to
        * less than the row, and `flexGrow` opens them back out to fill it.
        */}
      <View style={styles.macroGrid}>
        {macros.map((m, i) => {
          const pct = Math.min((m.current / (m.target || 1)) * 100, 100);
          const Glyph = m.icon;
          return (
            <View
              key={m.label}
              style={[
                styles.macroTile,
                { flexBasis: macros.length === 4 ? '47%' : 0 },
                m.bg ? { backgroundColor: m.bg } : null,
              ]}>
              <View style={styles.macroHead}>
                {/* Màu riêng của từng macro. Không truyền màu nền vào nữa: bộ
                    cũ vẽ vết khoét bằng chính màu nền, thứ chỉ đúng khi phía sau
                    đúng bằng màu đó — mà trang dinh dưỡng giờ có gradient. */}
                <Glyph size={14} color={m.color} strokeWidth={2} />
                <Text style={styles.macroLabel}>{m.label}</Text>
              </View>
              <MacroSwap
                showLeft={showLeft}
                index={i}
                current={m.current}
                target={m.target}
                // the bar's colour, not the icon's: protein's icon is the card's
                // pale `primary` while its bar is amber, and amber is the one a
                // reader would name if asked what colour protein is here
                color={m.bar[0]}
                i18n={i18n}
              />
              {/* The bar does not switch with the number: filled-so-far and
                  left-to-go are the same bar read from opposite ends, and
                  flipping it would only make the tile look like it had changed
                  measurement. */}
              <ProgressBar pct={pct} color={m.barGraphic} height={4} style={styles.macroBarTrack} delay={320} />
            </View>
          );
        })}
      </View>
    </GlassCard>
  );

  /*
    Nút `?` là ANH EM của mặt thẻ, không nằm trong nó.

    Nó từng nằm trong `card`, và `card` được bọc bởi một `PressScale` ở nhánh
    `interactive` bên dưới — tức một nút trong một nút. Trên iOS, React Native
    đặt `accessible` bằng true cho mọi `Pressable` (`Pressable.js:252`), và một
    phần tử trợ năng "groups its children into a single selectable component",
    nên VoiceOver không với tới được nút `?`.

    `tools/a11y-swallow.mjs` KHÔNG thấy chỗ này: lồng nhau đi qua một BIẾN
    (`<PressScale>{card}</PressScale>`), không phải qua JSX lồng chữ. Bộ chạy
    web tìm ra nó — `<button>` trong `<button>`, hai lần mỗi lần dựng tab Dinh
    dưỡng. Đó là lý do luật ấy nay đi theo một tầng biến.

    Vị trí không đổi: nút vẫn `position: 'absolute'` với đúng `top`/`right` cũ,
    chỉ là mốc của nó nay là vỏ bọc thay vì mặt thẻ — và vỏ bọc ôm đúng mặt
    thẻ, nên toạ độ ra cùng một điểm.
  */
  const helpBtn = (
    <HelpButton
      label={vi ? 'Giải thích mục tiêu calo' : 'Explain the calorie target'}
      onPress={help.openHelp}
      style={styles.nutriHelp}
    />
  );

  const withHelp = (
    <>
      <View>
        {card}
        {helpBtn}
      </View>
      {help.nudge ? (
        <HelpNudge
          text={vi
            ? 'Tập xong mà số calo không tăng lên? Bấm vào đây.'
            : 'Trained today and the calories did not go up? Tap here.'}
          onPress={help.openHelp}
          onDismiss={help.dismissNudge}
        />
      ) : null}
      <NutritionExplainer visible={help.open} onClose={help.close} />
    </>
  );

  if (!interactive) return withHelp;

  return (
    <>
      <View>
        <PressScale
          accessibilityRole="button"
          onPress={() => {
            Haptics.selectionAsync();
            setShowLeft((v) => !v);
          }}>
          {card}
        </PressScale>
        {helpBtn}
      </View>
      {help.nudge ? (
        <HelpNudge
          text={vi
            ? 'Tập xong mà số calo không tăng lên? Bấm vào đây.'
            : 'Trained today and the calories did not go up? Tap here.'}
          onPress={help.openHelp}
          onDismiss={help.dismissNudge}
        />
      ) : null}
      <NutritionExplainer visible={help.open} onClose={help.close} />
    </>
  );
}

// ─── Sleep card (web SleepCard) ────────────────────────────────────────

interface SleepCardProps {
  totalMin: number;
  targetHours: number;
  quality?: number | null;
  bedtime?: string | null;
  waketime?: string | null;
  stages?: { deep: number; rem: number; light: number } | null;
}

export function SleepCard({ totalMin, targetHours, quality, bedtime, waketime, stages }: SleepCardProps) {
  const c = usePalette();
  const sleep = useSleepRamp();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  const pct = Math.min((totalMin / (targetHours * 60 || 1)) * 100, 100);

  const fmt = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : null;

  const stageTotal = stages ? stages.deep + stages.rem + stages.light : 0;
  const stageDefs = stages && stageTotal > 0
    ? [
        /* Một sắc tím, ba mật độ — xem `sleepRamps`. Trước đây ba giá trị này
           là ba quyết định rời: hai token chỉ số và một mã màu viết thẳng, và
           ở bản sáng mã màu ấy làm giấc ngủ NÔNG thành dải đậm nhất (10,30:1)
           trong khi ngủ SÂU chỉ 4,96 — mã hoá ngược. */
        { label: 'Deep', min: stages.deep, color: sleep.deep },
        { label: 'REM', min: stages.rem, color: sleep.rem },
        { label: 'Light', min: stages.light, color: sleep.light },
      ]
    : [];

  return (
    <GlassCard style={styles.stackCard}>
      <MicroTitle>{i18n.dcSleepTitle}</MicroTitle>

      <View style={styles.ringRow}>
        <SmallRing
          pct={pct}
          gradId="sleep-ring"
          gradient={['#b45cff', '#22e3ff']}
          icon={Moon}
          iconColor={c.metricPurple}
          value={`${hours}h${String(mins).padStart(2, '0')}m`}
        />
        {/*
          Text only. This column used to end with a percentage and a progress
          bar, and both were the ring again in a second form — a bar that fills
          as the ring fills, in the ring's own colour, right beside it. The
          numbers that are not in the ring (target, remaining, surplus) stayed.
        */}
        <View style={styles.ringSide}>
          <Text style={styles.sideLine}>
            {i18n.dcSleepTarget}: <Text style={styles.sideMono}>{targetHours}h</Text>
          </Text>
          {quality != null && (
            <View style={styles.qualityRow}>
              <Icon icon={Star} size={12} />
              <Text style={styles.sideLine}>{i18n.dcSleepQuality}:</Text>
              <Text style={styles.sideMonoStrong}>{quality}/10</Text>
            </View>
          )}
          {bedtime && waketime && (
            <View style={styles.timesRow}>
              <Icon icon={Moon} size={12} />
              <Text style={styles.timeText}>{fmt(bedtime)}</Text>
              <Text style={styles.timeArrow}>→</Text>
              <Icon icon={Sunrise} size={12} />
              <Text style={styles.timeText}>{fmt(waketime)}</Text>
            </View>
          )}
        </View>
      </View>

      {stageDefs.length > 0 && (
        <View style={styles.stagesWrap}>
          <View style={styles.stagesBar}>
            {stageDefs.map((s) => (
              <View key={s.label} style={{ flex: s.min, backgroundColor: s.color }} />
            ))}
          </View>
          <View style={styles.stagesLegend}>
            {stageDefs.map((s) => (
              <View key={s.label} style={styles.stageLegendItem}>
                <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                <Text style={styles.stageLegendText}>
                  {s.label} · {Math.floor(s.min / 60)}h{s.min % 60}m
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </GlassCard>
  );
}

// ─── Water / Steps compact widgets (web WaterWidget / StepsWidget) ─────

/**
 * The compact widgets' badge, with the day's progress drawn round it.
 *
 * These cards carried the figure twice already — the value line ("1.4 / 2.5 L")
 * and the percentage on the right — and neither of them is a *shape*. The big
 * cards get a ring you can read at arm's length without reading a number; the
 * water card got a rounded square with a droplet in it, which is decoration
 * where the ring should be.
 *
 * So the badge becomes the ring: same 40pt footprint, same icon in the middle,
 * with the track and the arc drawn round it. Nothing else on the row moves, and
 * the percentage stays — the ring answers "roughly how far", the number answers
 * "exactly how far", and a glance wants the first one.
 *
 * The stroke is 4 at 40pt, where the nutrition ring is 12 at 100. Proportionally
 * thinner on purpose: this ring circles an icon rather than enclosing a value,
 * and a Move-ring band at this size would close up the hole and swallow it.
 */
function MiniRing({
  pct,
  icon,
  color,
  gradient,
  bg,
}: {
  pct: number;
  icon: LucideIcon;
  color: string;
  gradient: [string, string];
  bg: string;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const SIZE = 40;
  const W = 4;
  const R = (SIZE - W) / 2;
  const CIRC = 2 * Math.PI * R;

  const uid = useId();
  const gradId = `mini-${uid.replace(/:/g, '')}`;

  const progress = useSharedValue(0);
  /*
    Lần vẽ đầu tiên và những lần sau KHÔNG cùng một chuyển động.

    Lần đầu là một màn chào: chờ 200ms cho thẻ yên vị rồi quét 1100ms từ 0 lên
    mức của ngày. Đẹp, và không ai đang chờ nó.

    Từ khi thẻ có nút thêm nhanh thì mọi lần sau đều là PHẢN HỒI cho một cú bấm.
    Giữ nguyên 200+1100 nghĩa là bấm xong phải đợi một giây ba mới thấy vòng
    nhúc nhích — con số bên cạnh đã nhảy ngay (ghi lạc quan), nên vòng tròn hoá
    ra là thứ chậm nhất trên thẻ và cú bấm đọc ra thành "chưa ăn".
  */
  const greeted = useRef(false);
  useEffect(() => {
    const to = withTiming(Math.min(pct, 100) / 100, {
      duration: greeted.current ? duration.swap : 1100,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
    progress.value = greeted.current ? to : withDelay(200, to);
    greeted.current = true;
  }, [pct, progress]);
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRC - progress.value * CIRC,
  }));

  return (
    <View style={styles.miniRing}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Defs>
          <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={gradient[0]} />
            <Stop offset="100%" stopColor={gradient[1]} />
          </LinearGradient>
        </Defs>
        {/* The tinted disc the icon used to sit on, now inside the ring */}
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R - W / 2} fill={bg} />
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={c[TRACK]} strokeWidth={W} />
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={W}
          strokeLinecap="round"
          strokeDasharray={`${CIRC}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <View style={styles.miniRingCenter} pointerEvents="none">
        <Icon icon={icon} size={18} color={color} />
      </View>
    </View>
  );
}

function CompactWidget({
  icon,
  iconColor,
  iconBg,
  label,
  valueText,
  pct,
  onPress,
  ring,
  footer,
}: {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  label: string;
  valueText: string;
  pct: number;
  onPress: () => void;
  /**
   * Draw the badge as a progress ring in these two colours instead of a plain
   * tile. Opt-in rather than automatic: the steps widget shares this component
   * and has not been asked for one.
   */
  ring?: [string, string];
  /**
   * Thêm một hàng dưới hàng chính, bên trong cùng thẻ.
   *
   * Là `ReactNode` chứ không phải một cờ `quickAdd`: `CompactWidget` không có
   * việc gì phải biết nước là gì, và bước chân đang đi là thẻ Bước chân sẽ
   * không phải mọc thêm một nhánh `if` mà nó không dùng.
   */
  footer?: React.ReactNode;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const row = (
    <View style={styles.compactRow}>
      {ring ? (
        <MiniRing pct={pct} icon={icon} color={iconColor} gradient={ring} bg={iconBg} />
      ) : (
        <View style={[styles.compactIcon, { backgroundColor: iconBg }]}>
          <Icon icon={icon} size={20} color={iconColor} />
        </View>
      )}
      <View style={styles.compactInfo}>
        <Text style={styles.compactLabel}>{label}</Text>
        <Text style={styles.compactValue}>{valueText}</Text>
      </View>
      <Text style={styles.compactPct}>{pct}%</Text>
    </View>
  );

  const press = () => {
    Haptics.selectionAsync();
    onPress();
  };

  /*
    Không có footer: cả thẻ là MỘT nút, y như trước — kể cả phần đệm quanh hàng.

    This used the children-as-function form to dim the `GlassCard` inside,
    which was the only way to reach the pressed state from a child. The press
    now animates the pressable itself and the card comes with it, so the
    function — and the second style — are no longer carrying anything.
  */
  if (!footer) {
    return (
      <PressScale onPress={press}>
        <GlassCard style={styles.compactCard}>{row}</GlassCard>
      </PressScale>
    );
  }

  /*
    ── có footer: mặt thẻ và hàng nút là ANH EM, không lồng nhau ──

    Footer từng nằm TRONG `PressScale` của cả thẻ, nên mọi cú chạm lên một chip
    thêm nước cũng rơi vào thẻ và mở `/water`. Chủ dự án báo đúng chuyện đó:
    "nhấn nút trừ hay nút thêm nhanh thì tự động mở thẻ, rất phiền".

    Đây là lỗi mà tệp này ĐÃ gặp một lần và đã ghi cách chữa, ở nút `?` của thẻ
    Dinh dưỡng: *"Nút `?` là ANH EM của mặt thẻ, không nằm trong nó."* Lý do ở
    đó là VoiceOver — iOS đặt `accessible` true cho mọi `Pressable`, và một
    phần tử trợ năng "groups its children into a single selectable component",
    nên nút con không với tới được. Cùng một cấu trúc sai, hai triệu chứng.

    Nên thẻ nay là `GlassCard` bọc HAI anh em: mặt thẻ bấm được, và footer
    không bấm được cùng nó. Mở `/water` giờ chỉ xảy ra khi chạm vào MẶT THẺ —
    đúng như yêu cầu "mở thẻ khi nhấn ở vùng khác ngoài mấy cái nút".

    Cái giá: cú bấm nay co lại HÀNG chứ không co cả thẻ. Đó là điều đúng — hàng
    nút bên dưới không nên nhúc nhích khi người ta bấm vào mặt thẻ.
  */
  return (
    <GlassCard style={styles.compactCard}>
      <PressScale onPress={press}>{row}</PressScale>
      {footer}
    </GlassCard>
  );
}

/**
 * Ghi một cốc nước mà không phải rời thẻ.
 *
 * ── vì sao hàng này đáng chỗ ──
 *
 * Uống nước là việc lặp lại nhiều lần nhất trong ngày và nhẹ nhất về nội dung:
 * không có món, không có khẩu phần, không có gì để chọn — chỉ một con số trong
 * ba con số. Trước hàng này, ghi một cốc là: chạm thẻ → chờ màn `/water` đẩy
 * vào → bấm 250 → vuốt quay lại. Bốn thao tác và hai lần chuyển màn cho một
 * việc mà nội dung của nó vừa trong một nút.
 *
 * Nay là một chạm. Màn `/water` vẫn ở đó cho phần còn lại — biểu đồ tuần, danh
 * sách từng lần, lượng lẻ không nằm trong ba mức — và hàng chính vẫn mở nó.
 *
 * ── vì sao có dấu trừ ──
 *
 * Bấm nhanh thì bấm nhầm. Trước đây không có nút thêm ở đây thì cũng không có
 * gì để bấm nhầm; giờ có. Chỗ sửa mà lại nằm ở màn khác nghĩa là lỗi được phát
 * hiện ở đây và chỉ chữa được ở kia.
 *
 * Nó bật/tắt theo `ml > 0`: tổng của ngày là tổng của các lần ghi, nên "tổng >
 * 0" và "có ít nhất một lần ghi" là cùng một câu, và câu ấy đã có sẵn trên thẻ.
 *
 * ── vì sao vẫn phải gọi `useTodayWaterLogs` ──
 *
 * Không phải để bật cái nút. Là vì nếu không có nó thì mọi nút ở đây bấm xong
 * KHÔNG có gì xảy ra cho tới khi server trả lời.
 *
 * `patchWater` trong `use-water.ts` mở đầu bằng `if (prevLogs)`: nó suy ra tổng
 * MỚI bằng cách cộng lại danh sách đã vá, chứ không cộng thêm delta vào tổng
 * cũ — cố ý, để tổng và danh sách không bao giờ kể hai câu chuyện khác nhau về
 * cùng một cú bấm, kể cả khi hai cú bấm chồng lên nhau. Nhưng danh sách ấy chỉ
 * được tải bởi màn `/water`. Ở Dashboard và Dinh dưỡng chỉ có `today_water`,
 * nên `prevLogs` là `undefined` và nhánh vá lạc quan không chạy chút nào.
 *
 * Trước hàng này điều đó không hại ai: không có chỗ nào ghi nước từ hai màn kia
 * cả. Playwright bắt được ngay ở lần đo đầu — POST đi đúng `amount_ml: 250`, mà
 * thẻ vẫn đứng nguyên "1750 / 2500 ml" suốt 1,5 giây, không nhích một khung
 * hình nào.
 *
 * Cách sửa rẻ hơn là cho `patchWater` cộng delta khi thiếu danh sách. Tôi không
 * chọn nó: nó bỏ đúng cái bảo đảm mà đoạn code kia được viết ra để giữ. Tải
 * danh sách thì cả thêm lẫn bỏ đều đi qua đường đã được chứng minh — và nó hâm
 * nóng sẵn cache cho màn `/water` mà hàng chính mở ra.
 *
 * ── vì sao chip xanh mà dấu trừ thì không ──
 *
 * Ba chip là hành động của thẻ; dấu trừ là đường lùi. Cùng màu thì bốn nút
 * thành một dãy đồng hạng và mắt phải đọc chữ mới biết cái nào làm gì.
 *
 * (Những con số đo cụ thể của lớp wash — màu gốc, ba mức alpha, tương phản
 * chữ ở cả hai theme — nay nằm ở `CHIP_HEAD`/`CHIP_TAIL` bên dưới, dựng lại từ
 * bản mẫu. Đoạn này chỉ giữ lại LÝ DO, thứ không đổi theo màu.)
 */
/**
 * Nền chip đậm dần theo lượng nước — và cái ghim nó không phải con số.
 *
 * Bản cũ tô cả ba chip một alpha, và ghi đơn vị BÊN TRONG mỗi chip ở 11pt.
 * Đo ra thì đậm dần bị chặn bởi đúng chữ ấy: 11pt là chữ nhỏ, sàn 4,5:1 — và
 * trên giấy chip đã ở
 * **4,52:1**, sát sàn, nên nhích một nấc là tụt xuống dưới.
 *
 * Con số thì không bị: `quickText` là 17pt/700, tức chữ lớn theo WCAG (≥14pt
 * bold), sàn 3:1. Nên đơn vị chuyển lên hàng nhãn — nói MỘT lần cho cả hàng —
 * và ba chip được tự do đậm dần. Bảng tương phản của dải hiện tại nằm ở
 * `CHIP_TAIL`; kể từ khi chữ đổi sang `metricBlueInk` thì cả ba mức đều qua
 * luôn sàn 4,5:1 của chữ NHỎ, nên ràng buộc kể trên không còn bó nữa.
 *
 * Đưa đơn vị lên nhãn còn sửa một chuyện khác: `waterQuickAmounts` trả hai bộ
 * số rời nhau — `ml: [250,500,750]` và `oz: [8,12,16]` — nên một chip chỉ ghi
 * "+8" mà không có đơn vị là vô nghĩa với người dùng oz. Nhãn mang đơn vị thì
 * cả hai hệ đều đọc được.
 */
/*
  Màu wash lấy từ TOKEN, không phải một mã chép tay.

  Bản trước gõ cứng `#0ea5e9`. Giải mã điểm ảnh bản mẫu ra thì màu nền của viên
  không phải màu ấy: tỉ lệ hụt của ba kênh so với trắng đo được 1 : 0,455 :
  0,015, tức một màu gần như KHÔNG hụt kênh lam. `#0ea5e9` cho 1 : 0,373 :
  0,091 — hụt lam gấp sáu lần, nên nó ngả lục lam. Màu khớp là `#3ba6ff`
  (1 : 0,454 : 0,000), và đó chính là `metricBlue` của bản TỐI, nay tách thành
  vai riêng `metricBlueWash` để cả hai theme cùng gọi tên nó.

  Dựng lại từ token rồi so với ảnh mẫu, lệch ≤3 mỗi kênh — bảng ở `palette.ts`.
*/
/*
  Ba MỐC cho mỗi viên, khớp từ bản mẫu dọc theo trục gradient.

  Bản trước chỉ có hai mốc và chạy tuyến tính, nên nửa trái của viên đã ngả
  xanh trong khi bản mẫu ở đó gần như còn trắng. Đo lại cho tử tế: với một
  `linearGradient` chéo, tham số tại điểm (u,v) là t = (u+v)/2, nên mọi điểm
  bên trong viên đều dùng được. Gom theo t, bỏ nét chữ, mỗi mốc vài trăm điểm:

      t      +250    +500    +750
      0,20   0,052   0,092   0,101
      0,35   0,052   0,102   0,124
      0,50   0,059   0,156   0,173
      0,65   0,068   0,157   0,249
      0,80   0,121   0,229   0,352

  Không tuyến tính chút nào: phẳng tới quãng giữa rồi mới dựng lên. Khớp từng
  đoạn rồi ngoại suy về hai đầu:

      viên    đầu     giữa(0,5)   đuôi
      +250   0,050     0,059     0,173
      +500   0,083     0,156     0,288
      +750   0,073     0,173     0,397

  `CHIP_EASE` là mốc giữa viết theo phần trăm quãng đầu→đuôi. +500 và +750 cho
  0,32 và 0,30; +250 cho 0,07. Lấy 0,30 chứ không lấy trung bình ba: quãng của
  +250 chỉ rộng 0,12 alpha nên sai số đo ±0,01 đã là ±0,08 trên tỉ số ấy — con
  số của nó không đủ tin. Hai viên kia có tín hiệu gấp đôi và trùng nhau.

  Đầu 0,083 của +500 cũng được nắn xuống 0,06 cho ba viên tăng đều: bản mẫu vẽ
  +500 hơi loang chứ không phải một thang sạch, và một dãy không tăng đều thì
  người dùng đọc ra là lỗi chứ không đọc ra là bản mẫu.

  Tương phản mực tại ĐUÔI, chỗ nền đậm nhất:

      viên    giấy    tối
      +250    9,93    5,79
      +500    8,85    4,53
      +750    7,96    3,51

  Giấy qua cả sàn 4,5:1 của chữ nhỏ; tối qua sàn 3:1 của chữ lớn.
*/
const CHIP_HEAD = [0.05, 0.06, 0.07];
const CHIP_TAIL = [0.17, 0.29, 0.4];
const CHIP_EASE = 0.3;

/**
 * Ba mốc của một viên, dùng chung cho cả ruột lẫn nét.
 *
 * `bump` là lượng cộng thêm cho NÉT (0 khi vẽ ruột). Viết một lần ở đây thay vì
 * hai lần trong JSX, vì hai chỗ ấy phải luôn cùng hình dạng đường cong — lệch
 * nhau một mốc là nét rời khỏi ruột ở giữa viên.
 *
 * Trả về MẢNG chứ không phải `<>…</>`: `LinearGradient` của react-native-svg
 * đọc `children` để dựng danh sách mốc, và một Fragment thì nó không mở ra.
 */
function stops(wash: string, i: number, bump: number) {
  const head = CHIP_HEAD[i] ?? CHIP_HEAD[0];
  const tail = CHIP_TAIL[i] ?? CHIP_TAIL[0];
  const mid = head + CHIP_EASE * (tail - head);
  return [
    <Stop key="a" offset="0" stopColor={wash} stopOpacity={head + bump} />,
    <Stop key="b" offset="0.5" stopColor={wash} stopOpacity={mid + bump} />,
    <Stop key="c" offset="1" stopColor={wash} stopOpacity={tail + bump} />,
  ];
}
const CHIP_EDGE = 0.11;

function WaterQuickAdd({ unit, canUndo }: { unit: VolumeUnit; canUndo: boolean }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const vl = volumeLabel(unit);
  /* `useId` chứ không phải một chuỗi cố định: thẻ Nước dựng ở CẢ Hôm nay lẫn
     Dinh dưỡng, hai tab cùng nằm trong cây, nên hai hàng chip cùng tồn tại. Id
     gradient trùng nhau thì cái sau đè cái trước — `readiness-aura` đã trả giá
     cho đúng bài học này. */
  const gid = useId();
  const add = useAddWater();
  const undo = useRemoveLastWater();
  /* Kết quả cố ý không dùng ở đây. Gọi nó là để `today_water_logs` NẰM trong
     cache — xem ghi chú trên; xoá dòng này thì mọi nút dưới đây bấm xong không
     có gì xảy ra cho tới khi server trả lời. */
  useTodayWaterLogs();
  const undoable = canUndo && !undo.isPending;

  return (
    <View style={styles.quickWrap}>
      <View style={styles.quickSep} />
      {/* Hàng này nay CÓ nhãn, và điều đó đổi chỗ đứng của dấu trừ — xem ghi
          chú ở nút ấy. Nhãn mang luôn đơn vị cho cả ba chip. */}
      <Text style={styles.quickLabel}>{`${i18n.nQuickAdd}  ·  ${vl}`}</Text>
      <View style={styles.quickRow}>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={i18n.a11yRemove}
          disabled={!undoable}
          style={[styles.quickUndo, !undoable && styles.quickOff]}
          onPress={() => {
            Haptics.selectionAsync();
            undo.mutate({ onError: (e: Error) => toast.fail(e) });
          }}>
          {/*
            18 và màu CHỮ ĐẦY, đo trên bản mẫu: nét ngang rộng 56 trên nút rộng
            232 (24%) và dày 9 trên nút cao 217 (4,1%). Quy về nút 44: rộng
            10,6 và dày 1,8. Lucide vẽ `M5 12h14` trong khung 24, tức nét rộng
            58% cỡ icon — size 18 cho 10,5 (size 16 chỉ cho 9,3), và
            `strokeWidth` 2,5 quy ra 1,88.

            Màu thì đây là chỗ tôi BỎ một lập luận cũ của chính mình. Chú thích
            phía trên viết "dấu trừ là đường lùi" nên nó mang `mutedForeground`.
            Bản mẫu đo ra #0d0d11 — gần như đen, tức hạng CHỮ ĐẦY. Chủ dự án đã
            hai lần nói màu chưa giống, nên mẫu thắng. Vai "đường lùi" vẫn còn,
            chỉ là nó do NỀN nhạt và góc vuông nói, không do chữ nhạt nữa.
          */}
          <Icon icon={Minus} size={18} color={c.foreground} strokeWidth={2.5} />
        </PressScale>
        {waterQuickAmounts(unit).map((amount, i) => (
          <PressScale
            key={amount}
            accessibilityRole="button"
            /* Nhãn hiện ra là "+250 ml" — đọc lên thành "cộng hai trăm năm mươi
               ml", không nói đây là nước hay bấm vào thì xảy ra gì. `a11yAddWater`
               là câu đã có sẵn cho đúng nút này ở màn `/water`. */
            accessibilityLabel={i18n.a11yAddWater.replace('{x}', String(amount)).replace('{unit}', vl)}
            style={styles.quickBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              add.mutate(volumeToMl(amount, unit), { onError: (e: Error) => toast.fail(e) });
            }}>
            {/* Gradient CHÉO, không phải ngang, và không phải một màu phẳng.

                Bản trước chạy `x2=1 y2=0` — ngang thuần. Đo lại bản mẫu ở hai
                độ cao thì nó không ngang: viên +750 ở 85% bề ngang đọc #cee7fc
                gần đỉnh nhưng #bde1fe gần đáy, tức lớp wash còn sâu thêm theo
                chiều XUỐNG. `y2=1` bắt lấy đúng chỗ đó.

                Viên bo tròn cắt hình bằng `overflow: hidden` của chính nó, nên
                `Rect` ở đây là hình vuông đơn giản. */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <Svg width="100%" height="100%">
                <Defs>
                  <LinearGradient id={`${gid}-${amount}`} x1="0" y1="0" x2="1" y2="1">
                    {stops(c.metricBlueWash, i, 0)}
                  </LinearGradient>
                  <LinearGradient id={`${gid}-${amount}-e`} x1="0" y1="0" x2="1" y2="1">
                    {stops(c.metricBlueWash, i, CHIP_EDGE)}
                  </LinearGradient>
                </Defs>
                {/* `overflow: hidden` của viên cắt mất nửa NGOÀI của nét, nên
                    `strokeWidth` 1 hiện ra dày 0,5 và nằm trọn trong mép —
                    không có nửa nét nào thò ra ngoài góc bo.

                    0,5 chứ không phải 1: bản mẫu có nét dày 2 trên nút cao 217,
                    tức 0,92% chiều cao. Nút 44 thì 0,92% là 0,4. Bản trước để
                    `strokeWidth` 2 (hiện ra 1) — đúng gấp đôi, và đó là lý do
                    viên vẫn đọc thành một vòng kẻ chứ không thành một mép kính.

                    `rx` phải khớp `radius.md` của viên, nếu không nét trượt
                    khỏi góc. */}
                <Rect
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  rx={radius.md}
                  fill={`url(#${gid}-${amount})`}
                  stroke={`url(#${gid}-${amount}-e)`}
                  strokeWidth={1}
                />
              </Svg>
            </View>
            <Text style={styles.quickText}>+ {amount}</Text>
          </PressScale>
        ))}
      </View>
    </View>
  );
}

export function WaterWidget({ ml, targetMl, labels }: { ml: number; targetMl: number; labels: { title: string } }) {
  const c = usePalette();
  const { unit } = useVolumeUnit();
  const pct = Math.min(100, Math.round((ml / (targetMl || 1)) * 100));
  /*
    Nước dùng cùng token với `MACRO_BAR.fat`, và sự trùng đó là CÓ THẬT chứ không
    phải tình cờ: chất béo mang `metricBlue` theo yêu cầu, còn nước vốn đã là
    xanh dương. Hai thứ nằm trên cùng một màn.

    Để nguyên vì đây là màu được yêu cầu, và vì hai chỗ khác hình (chai đứng so
    với hai giọt) lẫn khác ngữ cảnh. Nhưng viết bằng TOKEN chứ không phải mã chép
    lại — nếu một ngày phải tách hai màu ra thì chỗ sửa là bảng màu, không phải
    đi tìm `#3ba6ff` rải rác khắp nơi.
  */
  return (
    <CompactWidget
      icon={Droplets}
      iconColor={c.metricBlue}
      iconBg="rgba(14,165,233,0.1)"
      ring={[c.metricBlue, c.metricCyan]}
      label={labels.title}
      valueText={`${displayVolume(ml, unit)} / ${displayVolume(targetMl, unit)} ${volumeLabel(unit)}`}
      pct={pct}
      onPress={() => nav.push('/water')}
      footer={<WaterQuickAdd unit={unit} canUndo={ml > 0} />}
    />
  );
}

export function StepsWidget({ steps, target, labels }: { steps: number; target: number; labels: { title: string } }) {
  const pct = Math.min(100, Math.round((steps / (target || 1)) * 100));
  return (
    <CompactWidget
      icon={Footprints}
      iconColor="#2bf5a8"
      iconBg="rgba(34,197,94,0.1)"
      label={labels.title}
      valueText={`${steps.toLocaleString()} / ${target.toLocaleString()}`}
      pct={pct}
      onPress={() => nav.push('/steps')}
    />
  );
}

const stylesFor = makeStyles((c, m) => ({
  microTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    color: c.mutedForeground,
  },
  nutriHelp: { position: 'absolute', top: spacing.card, right: spacing.card, zIndex: 2 },
  stackCard: { gap: spacing.stack },

  // small ring
  smallRingWrap: { width: 100, height: 100 },
  smallRingCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 1 },
  smallRingValue: { fontSize: 16, fontFamily: 'Menlo', fontWeight: '700', color: c.foreground, fontVariant: ['tabular-nums'] },
  smallRingUnit: { fontSize: 11, color: c.mutedForeground },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  ringSide: { flex: 1, gap: 6 },
  // 14, not 12. These three lines are the card's whole read-out beside the
  // ring — the target, what is left, and how far past it the day has gone —
  // and at 12 they were caption-sized next to a 16pt number in the ring.
  sideLine: { fontSize: 14, color: c.mutedForeground },
  // `gap: 6` rather than `spacing.sm` — the slash needs to sit closer to both
  // sides than the two facts sat from each other, or it reads as a third item.
  //
  // Centred, not baseline-aligned: an icon has no baseline to align to, and
  // `alignItems: 'baseline'` on a row containing one drops it to the bottom of
  // the row. The two texts are 14 and 13pt, close enough that centring them
  // costs nothing visible.
  sideTargetRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  /*
    Màu CHỮ, không phải màu viền.

    Nó từng là `c.border`: trên giấy #dcd5c8 trên mặt thẻ trắng đo được
    **1,46:1**, bản tối #2b2b31 trên #0e0e11 ra **1,37:1**. Sàn chữ nhỏ là
    4,5:1 — hụt gấp ba.

    Không cổng nào bắt được, và lý do đáng ghi lại vì nó là một lỗ hổng chứ
    không phải một lần xui: `text-color.mjs` chỉ kiểm tra một style chữ CÓ khai
    báo màu; `same-color.mjs` chỉ bắt chữ TRÙNG KHÍT nền nó nằm trên. Một mã
    màu hợp lệ, khác nền, mà không đọc được thì lọt qua cả hai.

    Cũng không viện được diện "chữ trang trí" của WCAG: chú thích ngay chỗ dựng
    nó nói dấu này có tải nghĩa — không có nó thì "2.200 kcal 70%" bị đọc một
    lần thành một con số rồi mới đọc lại cho đúng.

    `mutedForeground` cho 5,78:1 trên giấy và 5,02:1 trong phòng tối, và nó
    đúng bằng màu của `sideLine` ngay bên trái — dấu phân cách thuộc về vế
    trầm hơn trong hai vế nó ngăn ra, chứ không thuộc về con số phần trăm.
  */
  sideSlash: { fontSize: 13, color: c.mutedForeground },
  sidePct: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  sideMono: { fontFamily: 'Menlo', color: c.foreground, fontVariant: ['tabular-nums'] },
  sideMonoStrong: { fontSize: 14, fontFamily: 'Menlo', fontWeight: '700', color: c.foreground, fontVariant: ['tabular-nums'] },
  sideBarFill: { height: '100%', borderRadius: 2, backgroundColor: c.metricOrangeGraphic },
  qualityRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  timesRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  timeText: { fontSize: 12, fontFamily: 'Menlo', color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  timeArrow: { fontSize: 12, color: c.mutedForeground },

  // macros
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 4 },
  // the icon sits on the label's line, not above it — a tile whose label is two
  // lines tall is a tile a size bigger than the one beside it
  macroHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  macroTile: {
    // `flexBasis` comes from the call site: 47% when there are four, 0 when
    // there are three. See `NutritionCard`.
    flexGrow: 1,
    gap: 8,
    /*
      ── cái NỀN không bao giờ vẽ được ô này, chỉ cái VIỀN vẽ được ──

      Ô macro trước đây có nền `rgba(24,24,27,0.2)` và viền `rgba(43,43,49,0.2)`
      — thiết kế ĐÃ có ý cho mỗi ô một cái vỏ, nhưng hai con số 0.2 làm cái vỏ
      biến mất. Người dùng báo bốn ô "lọt thỏm vào thẻ chính".

      Cách sửa hiển nhiên là nâng alpha. Đo thì nó chết: nền ô so với mặt thẻ
      #0e0e11 ra 1.015 ở alpha 0.2 và chỉ tới 1.077 ở alpha 0.9 — mắt không
      phân biệt được. Thử hướng ngược lại, nền TỐI hơn thẻ, cũng chỉ 1.045.
      Thẻ và mọi nền ứng viên đều gần như đen; chênh lệch không có chỗ để tồn
      tại.

      Viền thì khác: cùng phép đo cho 1.048 ở mức hiện tại và 1.46 ở trắng 14%.
      Nên thứ phải nâng là viền, không phải nền.

      `glass.bg` + `glass.border` là cặp "tấm kính" app đã dùng cho mọi khối
      nổi trên nền tối — không phải màu tôi bịa, và nó giữ ô macro cùng ngôn
      ngữ với `toolRow`, `tipsCard`, `group` của danh sách thực phẩm.
    */
    backgroundColor: m.inset.bg,
    borderRadius: radius.sm,
    padding: spacing.sm + 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: m.inset.border,
  },
  macroLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, color: c.mutedForeground },
  macroValue: { fontSize: 18, fontFamily: 'Menlo', fontWeight: '700', color: c.foreground, fontVariant: ['tabular-nums'] },
  macroTarget: { fontSize: 12, fontWeight: '400', color: c.mutedForeground },
  // the second reading, stacked on the first — `left: 0, right: 0` so it wraps
  // and aligns exactly like the text underneath it rather than shrink-wrapping
  macroSwapAbs: { position: 'absolute', left: 0, right: 0, top: 0 },
  // headline and caption read as one block, so they sit closer to each other
  // than the tile's own `gap` puts the bar below them
  macroLines: { gap: 2 },
  macroNote: { fontSize: 11, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  /* `m.inset.track`, không phải `alpha(c.secondary, 0.4)`: ở bản sáng
     `c.secondary` ĐÚNG BẰNG nền ô, nên biểu thức cũ vẽ ra một rãnh vô hình.
     Bản tối nhận lại đúng biểu thức ấy qua trường mới — xem `Inset.track`. */
  macroBarTrack: { height: 4, borderRadius: 2, backgroundColor: m.inset.track, overflow: 'hidden' },
  macroBarFill: { height: '100%', borderRadius: 2 },

  // sleep stages
  stagesWrap: { gap: spacing.sm + 4 },
  stagesBar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: alpha(c.secondary, 0.3) },
  stagesLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  stageLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  stageLegendText: { fontSize: 11, color: c.mutedForeground },

  // compact widgets
  /* `gap` chỉ sinh khoảng cách GIỮA các con. Thẻ Bước chân chỉ có một con
     (không có footer) nên nó không nhận thêm một pixel nào từ dòng này. */
  compactCard: { padding: spacing.md, gap: spacing.sm + 4 },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  compactIcon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  miniRing: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  miniRingCenter: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactInfo: { flex: 1, minWidth: 0, gap: 2 },
  compactLabel: { fontSize: 12, color: c.mutedForeground },
  compactValue: { fontSize: 14, fontWeight: '600', color: c.foreground, fontVariant: ['tabular-nums'] },
  compactPct: { fontSize: 18, fontWeight: '700', color: c.foreground, fontVariant: ['tabular-nums'] },

  // hàng thêm nhanh của thẻ Nước
  quickWrap: { gap: spacing.sm + 4 },
  /* Chỉ tràn ra hết bề rộng thẻ, không chỉ phần trong padding: đường kẻ là để
     tách hai VÙNG của thẻ, và một đường ngắn hơn thẻ đọc ra thành đồ trang trí
     nằm giữa chứ không phải một ranh giới. */
  quickSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.border,
    marginHorizontal: -spacing.md,
  },
  /*
    Khe HẸP, vì tỉ lệ viên mới là thứ phải đúng.

    Bề ngang trong thẻ đo được 336 (mép 33..368 trên ảnh dựng 402pt). Hàng là
    ô-trừ + 3 viên + 3 khe, và bản mẫu ràng hai tỉ lệ cùng lúc: ô trừ VUÔNG và
    cao đúng bằng viên, viên rộng gấp 2,1 lần chiều cao. Giải ra:

        h + 3·(2,1h) + 3·khe = 336   →   7,3h = 336 − 3·khe

    Nhưng chiều cao đã bị SÀN CHẠM 44 ghim lại, nên khe không còn được chọn tự
    do — nó chỉ còn chia phần bề ngang còn lại cho ba viên. Và đo kỹ lại bản mẫu
    thì nó ràng hai thứ KHÔNG cùng thoả được:

        tỉ lệ viên  = 491/217 = 2,26
        khe/chiều cao = 40/217 = 0,184  (ở h = 44 là 8,1)

    Muốn cả hai thì cần 44 + 3·(2,26·44) + 3·8,1 = 370 > 336. Thiếu 34pt. Nên
    phải chọn hi sinh cái nào, và đây là bảng sai số:

        khe   viên rộng   tỉ lệ   sai tỉ lệ   sai khe   tổng
         4       93,3     2,12      6,2%       50,6%   56,8%
         6       91,3     2,08      8,0%       25,9%   33,9%
         8       89,3     2,03     10,2%        1,2%   11,4%

    Khe 8 — `spacing.sm` — sai ÍT NHẤT, và cách biệt lớn. Bản trước tôi chọn
    khe 4 để ép tỉ lệ viên lên 2,11, lúc ấy còn tưởng tỉ lệ mẫu là 2,1; đo ra
    2,26 thì mới thấy khe 4 mua được 4% tỉ lệ mà trả bằng một nửa khoảng thở
    của cả hàng. Nhịp của hàng là thứ mắt đọc trước.
  */
  quickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  quickUndo: {
    /* VUÔNG và cùng chiều cao với ba viên — đo trên bản mẫu: ô trừ rộng đúng
       bằng chiều cao viên (205/205), còn viên thì rộng gấp ~2,1 lần chiều cao.
       Vẫn là hộp bo góc chứ không phải viên thuốc: nó không cùng hạng.

       44 chứ không phải 52: xem phép giải ở `quickRow`. 52 làm viên chỉ còn tỉ
       lệ 1,67 — ảnh dựng đo ra 87×52 — tức MẬP hơn hẳn bản mẫu (2,26), và đó
       là chỗ chủ dự án nói hình dạng chưa giống. 44 cũng đúng bằng sàn chạm,
       nên đây là đáy: không bóp thấp hơn được nữa.

       Bản mẫu đo ra ô trừ 232×217, tức RỘNG hơn cao 7%. Bỏ 7 phần trăm ấy để
       giữ ô vuông: 3pt trên một nút 44, đổi lại ba viên rộng thêm 1pt mỗi cái
       — và hình vuông là thứ nói "nó không cùng hạng với ba viên kia". */
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.recessBorder,
    /*
      Màu LÙI VỀ SAU, và nó là token riêng chứ không phải màu trang.

      Ô này từng lấy `m.inset.bg` (trên giấy là `secondary` #efeae1 — kem đậm,
      dựng ra thành một vệt be), rồi `c.background` #f7f4ef. Cái sau đúng độ
      sáng nhưng sai NHIỆT: r−b = +8 trong khi bản mẫu đo được #f7f9fa, r−b =
      −3. Kề ba viên xanh lạnh thì 11 điểm lệch ở kênh lam là thứ nhìn ra ngay.

      `recessBg` giữ nguyên vai ấy cho cả hai theme mà không phải cài cờ: giấy
      nhận màu lạnh đo từ mẫu, phòng tối vẫn nhận #070708 sẫm hơn mặt thẻ. Lý
      do đầy đủ nằm ở `palette.ts`.
    */
    backgroundColor: c.recessBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickOff: { opacity: 0.35 },
  /* Nhãn của cả hàng — và nó mang ĐƠN VỊ, nên chip không phải mang. */
  quickLabel: {
    /* 11 và CHỮ ĐẦY, đo trên bản mẫu: chữ hoa cao 38 trên nút cao 217 (17,5%),
       quy về nút 44 là 7,7 — tức cỡ ~10,9. Nhãn cách đỉnh nút 41/217, quy ra
       8,3, đúng `spacing.sm` mà hàng này đã dùng.

       Màu là chỗ thứ hai tôi bỏ mặc định của app để theo mẫu: nhãn mục ở đây
       vốn luôn `mutedForeground`, còn mẫu đo ra #20262d — hạng CHỮ ĐẦY. Nếu
       sau này thấy nó tranh chỗ với con số thì đây là dòng cần lùi lại. */
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: c.foreground,
  },
  quickBtn: {
    /* `flex: 1` nên bề rộng tự chia — chỉ chiều cao và khe là số gõ tay, và cả
       hai giải ra ở `quickRow` từ số đo bản mẫu. 44 và khe 8 cho viên 89 rộng,
       tỉ lệ 2,03 — xem bảng sai số ở đó để biết vì sao không ép lên 2,26. */
    flex: 1,
    height: 44,
    /*
      Viên thuốc, KHÔNG viền.

      Bản trước giữ viền `alpha(c.metricBlue, 0.28)` vì chú thích cũ nói "VIỀN
      mới là thứ vẽ ra hình nút" — nhưng phép đo sau câu ấy là trên THẺ TỐI, nơi
      nền chip chỉ hơn mặt thẻ 1,14:1. Trên giấy, và với một gradient chạy tới
      0,30, hình nút tự hiện ra. Giữ viền lại thì bốn nút đọc thành ô nhập liệu
      chứ không thành kính — đó đúng là chỗ chủ dự án nói "nhìn xấu".

      `overflow: hidden` để bo tròn cắt luôn tấm gradient bên trong.
    */
    /*
      HỘP BO GÓC, không phải viên thuốc — và đây là chỗ sai hình dạng lớn nhất.

      Bản trước là `radius.full`, tức hai đầu nửa hình tròn. Bản mẫu KHÔNG thế.
      Đo bán kính bằng cách cắt ngang nút ở nhiều độ cao rồi giải ngược độ lùi
      của mép về bán kính cung tròn:

          cách đỉnh   lùi mỗi bên   bán kính suy ra
             4 px        50,0            73,5
             8 px        41,5            74,5
            14 px        31,5            74,5
            18 px        26,5            74,5
            26 px        18,5            74,5
            40 px         9,0            74,5

      Sáu lát cho cùng một con số, nên đó là cung tròn thật chứ không phải hiệu
      ứng nén ảnh: r ≈ 74,5 trên nút cao 217, tức r/h = 0,343. Viên thuốc thì
      r/h phải là 0,5 — ở lát 18 px nó lùi 48,6 chứ không phải 26,5, gần gấp
      đôi. Hai hình khác hẳn nhau.

      Nút cao 44 nên r = 0,343 × 44 = 15,1, và `radius.md` (16) cho 0,364 —
      lệch 2%. `radius.sm` (12) cho 0,27, hụt hẳn.

      Ô trừ đo ra CÙNG bán kính 74,5, nên nó cũng là `radius.md`: hai hạng khác
      nhau nhưng cùng một họ góc, đúng như bản mẫu.
    */
    borderRadius: radius.md,
    overflow: 'hidden',
    /*
      Viền KÍNH, không phải viền xanh.

      Bản trước bỏ viền hẳn, và ở bản TỐI viên thuốc mất luôn mép trái: đầu nhạt
      của gradient là 0,02 trên một mặt thẻ gần đen, tức không có gì để nhìn.
      Đó đúng là điều chú thích cũ đã đo — "VIỀN mới là thứ vẽ ra hình nút" —
      và nó vẫn đúng CHO BẢN TỐI.

      Nhưng viền phải là mép kính của app (`m.inset.border`: trắng 12% ở bản
      tối, mực 8% trên giấy), không phải `alpha(metricBlue, 0.28)`. Một đường
      XANH quanh lớp wash đọc ra thành ô nhập liệu; một mép trung tính đọc ra
      thành cạnh của một tấm kính. Bản mẫu có mép ấy.

      Một dòng, hai theme, không cờ nào — nên `hình dạng cây theo theme` không
      phải biết tới chỗ này.
    */
    borderWidth: StyleSheet.hairlineWidth,
    /*
      Mép kính này chỉ còn ở BẢN TỐI, và đó là chỗ sửa sau khi đặt ảnh dựng
      cạnh bản mẫu.

      Nay viên đã có nét riêng vẽ bằng SVG, đi theo chính lớp wash (`CHIP_EDGE`).
      Giữ thêm vòng trung tính này nữa thành HAI mép chồng nhau, và trên giấy nó
      hiện ra thành một vòng xám cứng — bốn nút đọc ra thành ô nhập liệu, đúng
      cái vẻ mà chủ dự án gọi là "không giống hình".

      Đo cho thấy nét SVG một mình là đủ trên giấy: nét/ruột ra 1,11:1, còn bản
      mẫu đo được 1,09:1 ở viên nhạt nhất và 1,17:1 ở viên đậm nhất. Cùng một
      hạng.

      Trên bản TỐI thì không đủ: đầu wash chỉ 0,13 alpha, nét SVG so mặt thẻ ra
      1,19:1 trong khi mép kính cũ đạt 1,37:1 — và mép trái biến mất chính là
      lỗi chủ dự án đã báo trước đây ("nút chưa có viền"). Nên bản tối giữ.

      `transparent` chứ không phải `borderWidth: 0`: bề rộng giữ nguyên thì hộp
      không đổi kích thước giữa hai theme, `hình dạng cây theo theme` không phải
      biết tới chỗ này, và không có cú nhảy layout nào khi đổi theme.
    */
    borderColor: m.lit ? m.inset.border : 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickText: {
    /* 19/600, và khoảng trắng sau dấu cộng — bản mẫu đọc thành "cộng, hai trăm
       năm mươi", không thành một mã. 19pt là chữ lớn theo WCAG kể cả khi bỏ nét
       đậm đi (>=18pt thường, >=14pt đậm) nên sàn là 3:1, thứ cho phép đuôi
       gradient đậm tới 0,36. Con số đo từ bản mẫu: thân chữ chiếm ~27% chiều
       cao viên. Viên cao 44 nên thân chữ ~12, tức cỡ ~17.

       17 thì phải 700 chứ không 600. Ở 19 điều đó không quan trọng — 19 đã qua
       ngưỡng "chữ lớn" kiểu ≥18pt THƯỜNG nên sàn 3:1 chắc bất kể nét. Ở 17 thì
       chữ chỉ lớn nhờ nhánh "≥14pt ĐẬM", mà 600 là semibold chứ chưa phải bold.
       700 gỡ chỗ mập mờ ấy, và bản mẫu vốn cũng in số đậm.

       MÀU thì cố ý lệch bản mẫu. Mẫu dùng một sắc chàm sẫm (#1c4e80, độ sáng
       71); `metricBlue` #0673be sáng hơn một bậc (97). Nhưng metricBlue là màu
       app ĐÃ dùng cho nước ở mọi chỗ khác, còn bảng màu không có token chàm sẫm
       nào — nhập một cái vào đây là thêm màu vào hệ thống để khớp một bản vẽ,
       chứ không phải sửa lỗi. Độ tương phản đã thừa sàn (bảng ở CHIP_TAIL). */
    fontSize: 17,
    fontWeight: '700',
    /* Chàm sẫm, không phải `metricBlue`. Đo trên bản mẫu ba lần ra #043a6f ·
       #053763 · #103c67; `metricBlueInk` trên giấy là #073a68. Xem `palette.ts`
       để biết vì sao xanh dương phải tách làm hai vai. Bản TỐI không đổi: ở đó
       `metricBlueInk` vẫn đúng bằng `metricBlue`. */
    color: c.metricBlueInk,
    fontVariant: ['tabular-nums'],
  },
}));
