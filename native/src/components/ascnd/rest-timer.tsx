import * as Haptics from 'expo-haptics';
import { Minus, Plus } from 'lucide-react-native';
import { useEffect, useId } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ZoomIn,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { Icon } from '@/components/ascnd/icon';
import { colors, glass, radius, spacing, type } from '@/constants/ascnd';
import type { useI18n } from '@/hooks/use-app-settings';
import { restLabel } from '@/lib/prescription';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The rest between sets, as the only thing on the screen.
 *
 * ── why it takes over ──
 *
 * It was a bar pinned above the list, which is the polite version and the
 * wrong one. Rest is not a status: it is the part of a workout where you are
 * not doing anything and are waiting to be told to start again, and for that
 * ninety seconds the app has exactly one job. A strip along the bottom of a
 * list of sets asks you to find it; a ring in the middle of a dimmed screen is
 * legible from a bench two metres away, which is where the phone actually is.
 *
 * It closes itself when the time is up, so the workout is never more than one
 * countdown away from the list — nothing here has to be dismissed to get on.
 *
 * ── the ring drains, it does not fill ──
 *
 * A progress ring that fills says "this much is done". This one is a clock
 * running out: full when the rest starts, gone when it ends, so the amount of
 * colour left *is* the amount of time left and there is nothing to convert.
 *
 * ── the halo is stacked, not blurred ──
 *
 * `react-native-svg` leaves the filter primitives unimplemented on native —
 * `feGaussianBlur` renders nothing at all — so the glow is three wider, fainter
 * copies of the ring underneath it. The alphas fall off faster than the widths
 * grow, which is roughly what a blur does, and each step is faint enough not to
 * read as a ring of its own.
 */

const SIZE = 220;
const R = 92;
const W = 10;
const CIRC = 2 * Math.PI * R;

/** Widest and faintest first, so each is drawn under the one inside it. */
const HALO = [
  { grow: 14, o: 0.05 },
  { grow: 9, o: 0.08 },
  { grow: 4, o: 0.12 },
];

export function RestTimer({
  left,
  total,
  i18n,
  onAdjust,
  onSkip,
}: {
  /** seconds remaining, or null when no rest is running */
  left: number | null;
  /** what the rest started at — the ring is the ratio of the two */
  total: number;
  i18n: ReturnType<typeof useI18n>;
  onAdjust: (delta: number) => void;
  onSkip: () => void;
}) {
  /*
    Ids in SVG are document-global on native rather than local to the `<Svg>`
    that declares them. This has caught the app three times; `useId` is the rule
    even where only one of these can be on screen at once.
  */
  const gid = `restRing-${useId()}`;

  const progress = useSharedValue(1);
  useEffect(() => {
    if (left === null || total <= 0) return;
    /*
      One second of linear travel per tick, rather than a jump per second.

      The clock underneath this is integer seconds and always will be — it is
      what the number reads. Animating each step across the whole second it
      represents makes the ring continuous without the ring and the number ever
      disagreeing: they arrive at each new value together.
    */
    progress.value = withTiming(Math.max(0, Math.min(1, left / total)), {
      duration: 1000,
      easing: Easing.linear,
    });
  }, [left, total, progress]);

  const ring = useAnimatedProps(() => ({
    strokeDashoffset: CIRC * (1 - progress.value),
  }));

  const bump = (delta: number) => {
    Haptics.selectionAsync();
    onAdjust(delta);
  };

  return (
    <Modal visible={left !== null} transparent animationType="none" statusBarTranslucent onRequestClose={onSkip}>
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={styles.backdrop}>
        {/* Tapping the dark ends the rest — the set you are about to do is a
            better authority on whether you are ready than the clock is, and
            reaching for a small button to say so is friction in the one place
            this screen should have none. */}
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel={i18n.nRdSkip} onPress={onSkip} />

        <Animated.View entering={ZoomIn.springify().stiffness(220).damping(22)} style={styles.card}>
          <Text style={styles.label}>{i18n.nRdResting}</Text>

          <View style={styles.ringWrap}>
            <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              <Defs>
                <LinearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor={colors.metricBlue} />
                  <Stop offset="100%" stopColor={colors.primary} />
                </LinearGradient>
              </Defs>

              <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#17171c" strokeWidth={W} />

              {HALO.map((h) => (
                <AnimatedCircle
                  key={h.grow}
                  animatedProps={ring}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  fill="none"
                  stroke={colors.metricBlue}
                  strokeOpacity={h.o}
                  strokeWidth={W + h.grow}
                  strokeLinecap="round"
                  strokeDasharray={CIRC}
                  // Twelve o'clock, and clockwise. A ring that starts at three
                  // is a chart; a ring that starts at twelve is a clock, and
                  // this is a clock.
                  transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                />
              ))}

              <AnimatedCircle
                animatedProps={ring}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={`url(#${gid})`}
                strokeWidth={W}
                strokeLinecap="round"
                strokeDasharray={CIRC}
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              />
            </Svg>

            <View style={styles.clockWrap} pointerEvents="none">
              <Text style={styles.clock}>{restLabel(left ?? 0)}</Text>
              <Text style={styles.total}>/ {restLabel(total)}</Text>
            </View>
          </View>

          <View style={styles.controls}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${i18n.nRdResting} −15`}
              onPress={() => bump(-15)}
              style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
              <Icon icon={Minus} size={20} color={colors.foreground} strokeWidth={2.5} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={i18n.nRdSkip}
              onPress={onSkip}
              style={({ pressed }) => [styles.skip, pressed && styles.pressed]}>
              <Text style={styles.skipText}>{i18n.nRdSkip}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${i18n.nRdResting} +15`}
              onPress={() => bump(15)}
              style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
              <Icon icon={Plus} size={20} color={colors.foreground} strokeWidth={2.5} />
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(7,7,8,0.86)',
  },
  card: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: 32,
    backgroundColor: 'rgba(18,18,22,0.96)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  label: {
    ...type.footnote,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  ringWrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  clockWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  /* 46pt and tabular. The point of this screen is a number read at arm's
     length, and tabular figures stop the whole thing shuffling sideways every
     time a 1 goes past. */
  clock: { fontSize: 46, fontWeight: '700', color: colors.foreground, fontVariant: ['tabular-nums'] },
  total: { ...type.footnote, color: colors.mutedForeground, fontVariant: ['tabular-nums'], marginTop: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  round: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
  },
  skip: {
    height: 56,
    minWidth: 120,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  skipText: { ...type.body, color: colors.primaryForeground, fontWeight: '700' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.94 }] },
});
