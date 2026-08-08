import * as Haptics from 'expo-haptics';
import { Minus, Plus } from 'lucide-react-native';
import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { PressScale } from '@/components/ascnd/press-scale';
import { Icon } from '@/components/ascnd/icon';
import { colors, glass, radius, spacing, type } from '@/constants/ascnd';
import { duration } from '@/constants/motion';
import type { useI18n } from '@/hooks/use-app-settings';
import { restLabel } from '@/lib/prescription';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The rest between sets.
 *
 * ── why it comes forward ──
 *
 * It was a bar pinned above the list, which is the polite version and the
 * wrong one. Rest is not a status: it is the part of a workout where you are
 * not doing anything and are waiting to be told to start again, and for that
 * ninety seconds the app has one job. A strip along the bottom of a list of
 * sets asks you to find it; a card in the middle of a dimmed screen is legible
 * from a bench two metres away, which is where the phone actually is.
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
 * ── and it is quiet ──
 *
 * The first version was loud: a 220pt ring in neon blue with a stacked halo
 * behind it, a 46pt clock, and the room blacked out to 86% behind all of it. It
 * looked like an alarm. Rest is the opposite of an alarm — it is the part of a
 * workout where nothing is happening and nothing needs to.
 *
 * So everything came down at once, because no single one of those was the
 * problem. The ring is 150 and silver instead of 220 and neon; the halo is
 * gone, because a glow is a thing asking to be looked at; the clock is 34; and
 * the room dims rather than going dark, so the sets you are working through
 * stay visible behind it. What is left is a clock on a card, which is all this
 * ever needed to be.
 *
 * The one thing kept at full strength is the *legibility* of the number. That
 * is the job, and it survives the rest of it being turned down — tabular
 * figures at 34pt on a plain dark card read from across a gym perfectly well.
 * It was never the size that made the old one shout.
 */

const SIZE = 150;
const R = 63;
const W = 8;
const CIRC = 2 * Math.PI * R;

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

  /*
    The way it arrives.

    It was `ZoomIn.springify()`, which starts the card at nothing and overshoots
    on the way in. On a small card that reads as a flourish; on something that
    fills the screen it lunges at you, and the verdict on it was the right one.

    So it settles instead of springing: 96% to full over a fifth of a second on
    an ease-out, with the fade doing most of the work. Four percent is enough
    for the eye to register that something came forward and not enough to be a
    movement in its own right — which is what you want from a panel that appears
    fifteen times in a workout. No bounce anywhere in it: a spring is a thing
    arriving, and this is a thing that was already there.
  */
  const scale = useSharedValue(0.96);
  useEffect(() => {
    if (left === null) {
      // Reset while it is off screen, so the next rest starts from 96 again
      // rather than opening already at full size.
      scale.value = 0.96;
      return;
    }
    scale.value = withTiming(1, { duration: duration.appear, easing: Easing.out(Easing.cubic) });
    // Only the appearing and disappearing matters here, not every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left === null, scale]);
  const card = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const bump = (delta: number) => {
    Haptics.selectionAsync();
    onAdjust(delta);
  };

  return (
    <Modal visible={left !== null} transparent animationType="none" statusBarTranslucent onRequestClose={onSkip}>
      <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={styles.backdrop}>
        {/* Tapping the dark ends the rest — the set you are about to do is a
            better authority on whether you are ready than the clock is, and
            reaching for a small button to say so is friction in the one place
            this screen should have none. */}
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel={i18n.nRdSkip} onPress={onSkip} />

        <Animated.View entering={FadeIn.duration(200)} style={[styles.card, card]}>
          <Text style={styles.label}>{i18n.nRdResting}</Text>

          <View style={styles.ringWrap}>
            <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#1c1c21" strokeWidth={W} />

              {/*
                One ring, in the app's own silver.

                It was a blue-to-silver gradient with three glow layers behind
                it. Neon is what this app signals *with* — a limit approached,
                a number out of range — and rest is none of those things. A
                plain stroke in the brand colour says the same amount about how
                much time is left and does not ask for anything.
              */}
              <AnimatedCircle
                animatedProps={ring}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={colors.primary}
                strokeWidth={W}
                strokeLinecap="round"
                strokeDasharray={CIRC}
                // Twelve o'clock, and clockwise. A ring that starts at three is
                // a chart; a ring that starts at twelve is a clock.
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              />
            </Svg>

            <View style={styles.clockWrap} pointerEvents="none">
              <Text style={styles.clock}>{restLabel(left ?? 0)}</Text>
              <Text style={styles.total}>/ {restLabel(total)}</Text>
            </View>
          </View>

          <View style={styles.controls}>
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={`${i18n.nRdResting} −15`}
              onPress={() => bump(-15)}
              style={styles.round}>
              <Icon icon={Minus} size={20} color={colors.foreground} strokeWidth={2.5} />
            </PressScale>

            <PressScale
              accessibilityRole="button"
              accessibilityLabel={i18n.nRdSkip}
              onPress={onSkip}
              style={styles.skip}>
              <Text style={styles.skipText}>{i18n.nRdSkip}</Text>
            </PressScale>

            <PressScale
              accessibilityRole="button"
              accessibilityLabel={`${i18n.nRdResting} +15`}
              onPress={() => bump(15)}
              style={styles.round}>
              <Icon icon={Plus} size={20} color={colors.foreground} strokeWidth={2.5} />
            </PressScale>
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
    /* 0.55, from 0.86 by way of 0.68. The room dims; it does not go out. What
       is behind this is the list of sets you are working through, and keeping
       it faintly readable is what makes the countdown feel like a moment inside
       the workout rather than a screen you were sent to. */
    backgroundColor: 'rgba(7,7,8,0.55)',
  },
  card: {
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 26,
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
  /* Tabular, so the whole thing does not shuffle sideways every time a 1 goes
     past. 34pt reads across a gym; the old 46 was not more legible, only
     louder. */
  clock: { fontSize: 34, fontWeight: '700', color: colors.foreground, fontVariant: ['tabular-nums'] },
  total: { ...type.footnote, color: colors.mutedForeground, fontVariant: ['tabular-nums'], marginTop: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
  },
  /* Outlined, not filled. A solid silver bar next to a silver ring made two
     bright things competing in a card whose whole point is that nothing in it
     is urgent — and skipping a rest is not the main action here, waiting is. */
  skip: {
    height: 48,
    minWidth: 104,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
  },
  skipText: { ...type.footnote, color: colors.foreground, fontWeight: '600' },
});
