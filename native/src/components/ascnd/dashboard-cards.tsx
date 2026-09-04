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
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { HelpButton, HelpNudge, useHelpTopic } from '@/components/ascnd/help-button';
import { NutritionExplainer } from '@/components/ascnd/nutrition-explainer';
import { ProgressBar } from '@/components/ascnd/progress-bar';
/* Danh sách nhập của nhánh giao diện sáng (`macroBar` thay `MACRO_BAR`, bỏ
   `glass`), cộng `PaletteKey` mà rãnh vòng tròn cần. */
import { MACRO_TINT, macroBar, radius, spacing } from '@/constants/ascnd';
import { alpha, makeStyles, type PaletteKey } from '@/constants/theme';
import { useSleepRamp, usePalette } from '@/hooks/use-palette';
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

  const ringGradient: [string, string] = overBudget
    ? [c.metricRose, c.readinessRed]
    : inBand
      ? ['#ffc53d', c.metricOrange]
      : ['#eaf1fb', '#b9dcf0'];
  const ringIconColor = overBudget
    ? c.readinessRed
    : inBand
      ? c.metricOrange
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
  /* Màu giải ra ở ĐÂY, nơi có `c` — bảng ở `ascnd.ts` chỉ giữ khoá. */
  const macros = [
    { label: 'Protein', ...protein, icon: Beef, color: c[MACRO_TINT.protein], bar: macroBar(c, 'protein') },
    { label: 'Carbs', ...carbs, icon: Wheat, color: c[MACRO_TINT.carbs], bar: macroBar(c, 'carbs') },
    { label: 'Fat', ...fat, icon: Milk, color: c[MACRO_TINT.fat], bar: macroBar(c, 'fat') },
    ...(fiber
      ? [{ label: 'Fiber', ...fiber, icon: Salad, color: c[MACRO_TINT.fiber], bar: macroBar(c, 'fiber') }]
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
      <HelpButton
        label={vi ? 'Giải thích mục tiêu calo' : 'Explain the calorie target'}
        onPress={help.openHelp}
        style={styles.nutriHelp}
      />

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
              style={[styles.macroTile, { flexBasis: macros.length === 4 ? '47%' : 0 }]}>
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
              <ProgressBar pct={pct} color={m.bar[0]} height={4} style={styles.macroBarTrack} delay={320} />
            </View>
          );
        })}
      </View>
    </GlassCard>
  );

  const withHelp = (
    <>
      {card}
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
      <PressScale
        accessibilityRole="button"
        onPress={() => {
          Haptics.selectionAsync();
          setShowLeft((v) => !v);
        }}>
        {card}
      </PressScale>
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
  return (
    <PressScale
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}>
      {/*
        This used the children-as-function form to dim the `GlassCard` inside,
        which was the only way to reach the pressed state from a child. The
        press now animates the pressable itself and the card comes with it, so
        the function — and the second style — are no longer carrying anything.
      */}
      <GlassCard style={styles.compactCard}>
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
        {footer}
      </GlassCard>
    </PressScale>
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
 * Nền chip là `rgba(14,165,233,0.10)` — đúng nền của icon giọt nước ở hàng
 * trên. Đo trên mặt thẻ thật (`glass.bg` phủ trên `colors.background`, ra
 * rgb(22,22,23)), một mình nó chỉ hơn nền thẻ **1,14:1** — gần như vô hình,
 * đúng cái bẫy đã nuốt mấy ô macro và ô sinh trắc trong phiên này. Nên VIỀN mới
 * là thứ vẽ ra hình nút: `rgba(59,166,255,0.28)` đạt **1,64:1**. Chữ
 * `metricBlue` trên nền chip là **6,10:1**, thừa sàn 4,5:1.
 */
function WaterQuickAdd({ unit, canUndo }: { unit: VolumeUnit; canUndo: boolean }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const vl = volumeLabel(unit);
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
      <View style={styles.quickRow}>
        {waterQuickAmounts(unit).map((amount) => (
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
            <Text style={styles.quickText}>
              +{amount}
              {/* Đơn vị nhỏ hơn số, CÙNG màu chứ không mờ đi. Bản mờ
                  `rgba(59,166,255,0.65)` chỉ đạt 3,40:1 trên nền chip — dưới
                  sàn 4,5:1 của chữ nhỏ. Thu nhỏ thì thứ bậc vẫn còn mà độ
                  tương phản không mất gì (vẫn 6,10:1).
                  Lồng trong cùng một `Text` chứ không phải hai `Text` cạnh
                  nhau: chữ lồng tự nằm trên một đường chân, không cần
                  `alignItems: 'baseline'` — thứ đã kéo lệch ô cân nặng trong
                  phiên này. */}
              <Text style={styles.quickUnit}> {vl}</Text>
            </Text>
          </PressScale>
        ))}
        {/*
          Dấu trừ đứng CUỐI hàng, không phải đầu.

          Màn `/water` đặt nó trước, và ở đó nó đúng: hàng ấy có nhãn "THÊM
          NHANH" phía trên nên không nút nào phải tự giới thiệu. Ở đây hàng
          không có nhãn, nên nút đầu tiên là thứ nói cho biết hàng này để làm
          gì — và mở đầu bằng một ô xám mờ (trạng thái mặc định của nó vào buổi
          sáng, khi chưa uống gì) là mở đầu bằng đường lùi.

          Ba chip là lý do hàng này tồn tại; dấu trừ là ngoại lệ. Đọc từ trái
          sang thì gặp việc thường làm trước, việc hiếm sau.
        */}
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={i18n.a11yRemove}
          disabled={!undoable}
          style={[styles.quickUndo, !undoable && styles.quickOff]}
          onPress={() => {
            Haptics.selectionAsync();
            undo.mutate({ onError: (e: Error) => toast.fail(e) });
          }}>
          <Icon icon={Minus} size={16} color={c.mutedForeground} strokeWidth={2.5} />
        </PressScale>
      </View>
    </View>
  );
}

export function WaterWidget({ ml, targetMl, labels }: { ml: number; targetMl: number; labels: { title: string } }) {
  const c = usePalette();
  const styles = stylesFor(c);
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
  sideSlash: { fontSize: 13, color: c.border },
  sidePct: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  sideMono: { fontFamily: 'Menlo', color: c.foreground, fontVariant: ['tabular-nums'] },
  sideMonoStrong: { fontSize: 14, fontFamily: 'Menlo', fontWeight: '700', color: c.foreground, fontVariant: ['tabular-nums'] },
  sideBarFill: { height: '100%', borderRadius: 2, backgroundColor: c.metricOrange },
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
  macroBarTrack: { height: 4, borderRadius: 2, backgroundColor: alpha(c.secondary, 0.4), overflow: 'hidden' },
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
  quickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  quickUndo: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: m.inset.border,
    backgroundColor: m.inset.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickOff: { opacity: 0.35 },
  quickBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: alpha(c.metricBlue, 0.28),
    backgroundColor: 'rgba(14,165,233,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickText: {
    fontSize: 15,
    fontWeight: '700',
    color: c.metricBlue,
    fontVariant: ['tabular-nums'],
  },
  quickUnit: { fontSize: 11, fontWeight: '600', color: c.metricBlue },
}));
