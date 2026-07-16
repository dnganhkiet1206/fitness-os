import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useMascot } from '@/hooks/use-mascot';

/**
 * Floating fitness companion. Idles with a gentle hover, taps bounce it
 * (with haptics) and re-open its speech bubble. Rendering is emoji-based
 * for the test phase — the animation/bubble shell is ready for real 3D
 * (Lottie/GLB) characters later.
 */
export function Mascot() {
  const { enabled, mascot, message } = useMascot();
  const [bubbleVisible, setBubbleVisible] = useState(true);

  const float = useSharedValue(0);
  const scale = useSharedValue(0);
  const wiggle = useSharedValue(0);
  const bubble = useSharedValue(0);

  useEffect(() => {
    // Entrance, then a slow breathing hover
    scale.value = withDelay(400, withSpring(1, { stiffness: 220, damping: 14 }));
    float.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [scale, float]);

  useEffect(() => {
    bubble.value = withSpring(bubbleVisible && message ? 1 : 0, { stiffness: 260, damping: 20 });
  }, [bubbleVisible, message, bubble]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: float.value },
      { scale: scale.value },
      { rotate: `${wiggle.value}deg` },
    ],
  }));

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: bubble.value,
    transform: [{ scale: 0.9 + bubble.value * 0.1 }, { translateY: (1 - bubble.value) * 8 }],
  }));

  if (!enabled) return null;

  const poke = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withSpring(1.18, { stiffness: 500, damping: 12 }),
      withSpring(1, { stiffness: 300, damping: 16 }),
    );
    wiggle.value = withSequence(
      withTiming(-8, { duration: 70 }),
      withTiming(8, { duration: 100 }),
      withTiming(0, { duration: 90 }),
    );
    setBubbleVisible(true);
  };

  return (
    <View style={styles.row} pointerEvents="box-none">
      <Pressable onPress={poke} hitSlop={8}>
        <Animated.View style={[styles.body, bodyStyle]}>
          <Text style={styles.emoji}>{mascot.emoji}</Text>
        </Animated.View>
      </Pressable>

      {message && (
        <Animated.View style={[styles.bubble, bubbleStyle]} pointerEvents={bubbleVisible ? 'auto' : 'none'}>
          <Text style={styles.bubbleText}>{message}</Text>
          <Pressable hitSlop={10} onPress={() => setBubbleVisible(false)} style={styles.bubbleClose}>
            <Text style={styles.bubbleCloseText}>✕</Text>
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
  body: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  emoji: {
    fontSize: 38,
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
