import { Image } from 'expo-image';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { RiveMascot } from '@/components/ascnd/mascot-rive-view';
import { VectorMascot } from '@/components/ascnd/vector-mascot';
import { useMascotEmotion } from '@/hooks/use-mascot-emotion';
import type { MascotMood } from '@/hooks/use-mascot';
import { imageFor } from '@/lib/mascot-images';
import type { MascotEmotion } from '@/lib/mascot-emotion';
import { lottieFor } from '@/lib/mascot-lottie';
import { riveFor } from '@/lib/mascot-rive';
import type { MascotDef } from '@/lib/mascots';

/**
 * The companion figure, in priority order:
 *   1. a rigged Rive character (fully animated — bones/mesh/IK/SM),
 *   2. a pre-rendered image (Talking-Tom-style art) + subtle breathing,
 *   3. a registered Lottie animation,
 *   4. the built-in vector figure (fallback).
 *
 * So the app works identically until premium assets are dropped in, and
 * upgrades per-character as each one gets art.
 */

const VECTOR_ASPECT = 350 / 240;

interface Props {
  mascot: MascotDef;
  size?: number;
  mood?: MascotMood;
  /** Explicit emotion override. When omitted, the Emotion Engine drives it. */
  emotion?: MascotEmotion;
  level?: number;
  equippedOutfits?: Set<string>;
  animated?: boolean;
}

// Native Lottie module is required lazily, only when a source exists, so a
// JS-only pull (before the dev build is rebuilt) never touches it.
let LottieView: React.ComponentType<Record<string, unknown>> | null = null;
let lottieTried = false;
function getLottie() {
  if (lottieTried) return LottieView;
  lottieTried = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    LottieView = require('lottie-react-native').default;
  } catch {
    LottieView = null;
  }
  return LottieView;
}

const SLOW = new Set<MascotEmotion>(['sad', 'tired', 'sleep']);

/**
 * Image companion — always breathing, with per-emotion micro-motion:
 * celebrate bounces/squashes, curl pulses with effort, wave sways, and the
 * low-energy emotions (sad/tired/sleep) breathe slowly and sit a hair lower.
 */
function ImageMascot({
  source,
  aspect,
  size,
  animated,
  emotion,
}: {
  source: number;
  aspect: number;
  size: number;
  animated: boolean;
  emotion: MascotEmotion;
}) {
  const w = size;
  const h = size * aspect;
  const breath = useSharedValue(0);
  const act = useSharedValue(0);

  // Base breathing loop — slower for low-energy emotions, livelier for happy.
  useEffect(() => {
    if (!animated) {
      breath.value = 0;
      return;
    }
    const slow = SLOW.has(emotion);
    const up = slow ? 2800 : emotion === 'happy' ? 1500 : 2200;
    const down = slow ? 3200 : emotion === 'happy' ? 1700 : 2600;
    breath.value = withRepeat(
      withSequence(
        withTiming(1, { duration: up, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: down, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    return () => {
      breath.value = 0;
    };
  }, [animated, emotion, breath]);

  // Action emphasis layered on top of the breathing.
  useEffect(() => {
    act.value = 0;
    if (!animated) return;
    if (emotion === 'celebrate') {
      act.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 280, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 360, easing: Easing.in(Easing.quad) }),
        ),
        4,
        false,
      );
    } else if (emotion === 'curl') {
      act.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 700, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      );
    } else if (emotion === 'wave') {
      act.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 260, easing: Easing.inOut(Easing.sin) }),
          withTiming(-1, { duration: 520, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 260, easing: Easing.inOut(Easing.sin) }),
        ),
        2,
        false,
      );
    }
  }, [animated, emotion, act]);

  const style = useAnimatedStyle(() => {
    const slump = SLOW.has(emotion) ? h * 0.01 : 0;
    let translateY = -breath.value * (h * 0.008) + slump;
    let scaleY = 1 + breath.value * 0.012;
    let scaleX = 1 - breath.value * 0.004;
    let rotate = 0;
    if (emotion === 'celebrate') {
      translateY += -act.value * (h * 0.05);
      scaleY += act.value * 0.04;
      scaleX -= act.value * 0.02;
    } else if (emotion === 'curl') {
      scaleY -= act.value * 0.03;
      translateY += act.value * (h * 0.012);
    } else if (emotion === 'wave') {
      rotate = act.value * 4;
    }
    return {
      transform: [{ translateY }, { rotate: `${rotate}deg` }, { scaleY }, { scaleX }],
    };
  });

  return (
    <View style={{ width: w, height: h }} pointerEvents="none">
      <Animated.View style={[{ width: w, height: h }, style]}>
        <Image
          source={source}
          style={{ width: w, height: h }}
          contentFit="contain"
          contentPosition="bottom"
        />
      </Animated.View>
    </View>
  );
}

export function MascotFigure(props: Props) {
  const { mascot, size = 160, mood = 'neutral', animated = true, emotion: emotionProp } = props;

  // The Emotion Engine drives the image companion; an explicit `emotion` prop
  // (e.g. the unlock celebration) overrides it. Hook runs unconditionally.
  const engineEmotion = useMascotEmotion();
  const emotion = emotionProp ?? engineEmotion;

  // 1) rigged Rive character
  const rive = riveFor(mascot.id);
  if (rive) {
    return <RiveMascot spec={rive} size={size} mood={mood} animated={animated} />;
  }

  // 2) pre-rendered image
  const img = imageFor(mascot.id, emotion);
  if (img) {
    return (
      <ImageMascot
        source={img.source}
        aspect={img.aspect}
        size={size}
        animated={animated}
        emotion={emotion}
      />
    );
  }

  // 2) Lottie
  const source = lottieFor(mascot.id, mood);
  const Lottie = source != null ? getLottie() : null;
  if (source != null && Lottie) {
    const h = size * VECTOR_ASPECT;
    return (
      <View style={{ width: size, height: h }} pointerEvents="none">
        <Lottie source={source} autoPlay={animated} loop={animated} resizeMode="contain" style={{ width: size, height: h }} />
      </View>
    );
  }

  // 3) vector fallback
  return <VectorMascot {...props} />;
}
