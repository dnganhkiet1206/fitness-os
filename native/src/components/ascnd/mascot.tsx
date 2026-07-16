import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useMascot } from '@/hooks/use-mascot';

/**
 * Floating fitness companion — "2.5D": the emoji artwork is animated in
 * real 3D space (perspective + rotateX/rotateY), with squash & stretch,
 * a ground shadow that reacts to hover height and a character-colored
 * aura. All transforms run on the UI thread via Reanimated. The shell is
 * ready for real Lottie/GLB characters later.
 */
export function Mascot() {
  const { enabled, mascot, message } = useMascot();
  const [bubbleVisible, setBubbleVisible] = useState(true);

  const hover = useSharedValue(0); // 0..1 (0 = ground, 1 = top of float)
  const entrance = useSharedValue(0); // 0..1
  const tiltY = useSharedValue(0); // deg — slow look-around
  const nod = useSharedValue(0); // deg rotateX
  const spin = useSharedValue(0); // deg rotateY for flips
  const squashX = useSharedValue(1);
  const squashY = useSharedValue(1);
  const bubble = useSharedValue(0);

  // Idle life: float loop + slow look-around sway
  useEffect(() => {
    entrance.value = withDelay(350, withSpring(1, { stiffness: 200, damping: 13 }));
    hover.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1700, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    tiltY.value = withRepeat(
      withSequence(
        withTiming(9, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
        withTiming(-9, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
  }, [entrance, hover, tiltY]);

  // Random quirks so it feels alive, not looping: a hop, a nod, or a flip
  useEffect(() => {
    let alive = true;
    const doQuirk = () => {
      if (!alive) return;
      const roll = Math.random();
      if (roll < 0.45) {
        // hop with squash & stretch
        squashY.value = withSequence(
          withTiming(0.82, { duration: 110 }),
          withSpring(1.12, { stiffness: 400, damping: 9 }),
          withSpring(1, { stiffness: 260, damping: 14 }),
        );
        squashX.value = withSequence(
          withTiming(1.14, { duration: 110 }),
          withSpring(0.92, { stiffness: 400, damping: 9 }),
          withSpring(1, { stiffness: 260, damping: 14 }),
        );
      } else if (roll < 0.8) {
        // curious double-nod (rotateX in perspective)
        nod.value = withSequence(
          withTiming(14, { duration: 140 }),
          withTiming(-6, { duration: 160 }),
          withTiming(10, { duration: 140 }),
          withTiming(0, { duration: 180 }),
        );
      } else {
        // full 3D flip
        spin.value = withSequence(
          withTiming(360, { duration: 650, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: 0 }),
        );
      }
      schedule();
    };
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(doQuirk, 6000 + Math.random() * 8000);
    };
    schedule();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [squashX, squashY, nod, spin]);

  useEffect(() => {
    bubble.value = withSpring(bubbleVisible && message ? 1 : 0, { stiffness: 260, damping: 20 });
  }, [bubbleVisible, message, bubble]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 320 },
      { translateY: interpolate(hover.value, [0, 1], [0, -7]) },
      { rotateY: `${tiltY.value + spin.value}deg` },
      { rotateX: `${nod.value}deg` },
      { scale: entrance.value },
      { scaleX: squashX.value },
      { scaleY: squashY.value },
    ],
  }));

  // Ground shadow: shrinks and fades as the character floats up — the
  // classic depth cue that sells "hovering above a surface"
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(hover.value, [0, 1], [0.45, 0.18]) * entrance.value,
    transform: [{ scaleX: interpolate(hover.value, [0, 1], [1, 0.72]) }],
  }));

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: bubble.value,
    transform: [{ scale: 0.9 + bubble.value * 0.1 }, { translateY: (1 - bubble.value) * 8 }],
  }));

  if (!enabled) return null;

  const poke = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Excited jump: anticipation squash → stretch up → land with a flip
    squashY.value = withSequence(
      withTiming(0.78, { duration: 90 }),
      withSpring(1.18, { stiffness: 420, damping: 8 }),
      withSpring(1, { stiffness: 260, damping: 13 }),
    );
    squashX.value = withSequence(
      withTiming(1.18, { duration: 90 }),
      withSpring(0.88, { stiffness: 420, damping: 8 }),
      withSpring(1, { stiffness: 260, damping: 13 }),
    );
    spin.value = withSequence(
      withDelay(80, withTiming(360, { duration: 560, easing: Easing.out(Easing.cubic) })),
      withTiming(0, { duration: 0 }),
    );
    setBubbleVisible(true);
  };

  return (
    <View style={styles.row} pointerEvents="box-none">
      <Pressable onPress={poke} hitSlop={8}>
        <View style={styles.stage}>
          {/* Character-colored aura */}
          <View style={[styles.aura, { backgroundColor: mascot.accent }]} />
          {/* Ground shadow */}
          <Animated.View style={[styles.groundShadow, shadowStyle]} />
          <Animated.View style={[styles.body, { shadowColor: mascot.accent }, bodyStyle]}>
            <Text style={styles.emoji}>{mascot.emoji}</Text>
          </Animated.View>
        </View>
      </Pressable>

      {message && (
        <Animated.View
          style={[styles.bubble, bubbleStyle]}
          pointerEvents={bubbleVisible ? 'auto' : 'none'}>
          <Text style={styles.bubbleText}>{message}</Text>
          <Pressable hitSlop={10} onPress={() => setBubbleVisible(false)} style={styles.bubbleClose}>
            <Icon icon={X} size={11} color={colors.mutedForeground} />
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stage: {
    width: 74,
    height: 80,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  aura: {
    position: 'absolute',
    top: 6,
    width: 58,
    height: 58,
    borderRadius: 29,
    opacity: 0.16,
    transform: [{ scale: 1.25 }],
  },
  groundShadow: {
    position: 'absolute',
    bottom: 2,
    width: 44,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#000',
  },
  body: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  emoji: {
    fontSize: 44,
  },
  bubble: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderBottomLeftRadius: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bubbleText: {
    ...type.footnote,
    color: colors.foreground,
    flex: 1,
    lineHeight: 18,
  },
  bubbleClose: {
    padding: 2,
  },
  bubbleCloseText: {
    fontSize: 11,
    color: colors.mutedForeground,
  },
});
