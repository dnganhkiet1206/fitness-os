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

import { VectorMascot } from '@/components/ascnd/vector-mascot';
import type { MascotMood } from '@/hooks/use-mascot';
import { imageFor } from '@/lib/mascot-images';
import { lottieFor } from '@/lib/mascot-lottie';
import type { MascotDef } from '@/lib/mascots';

/**
 * The companion figure, in priority order:
 *   1. a pre-rendered image (Talking-Tom-style art) + subtle breathing,
 *   2. a registered Lottie animation,
 *   3. the built-in vector figure (fallback).
 *
 * So the app works identically until premium assets are dropped in, and
 * upgrades per-character as each one gets art.
 */

const VECTOR_ASPECT = 350 / 240;

interface Props {
  mascot: MascotDef;
  size?: number;
  mood?: MascotMood;
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

/** Image companion — grounded, breathing gently (no bounce/spin) */
function ImageMascot({
  source,
  aspect,
  size,
  animated,
}: {
  source: number;
  aspect: number;
  size: number;
  animated: boolean;
}) {
  const w = size;
  const h = size * aspect;
  const breath = useSharedValue(0);

  useEffect(() => {
    if (!animated) return;
    // slow, organic breathing: chest rises, body settles a hair
    breath.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    return () => {
      breath.value = 0;
    };
  }, [animated, breath]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -breath.value * (h * 0.008) },
      { scaleY: 1 + breath.value * 0.012 },
      { scaleX: 1 - breath.value * 0.004 },
    ],
  }));

  return (
    <View style={{ width: w, height: h }} pointerEvents="none">
      <Animated.View style={[{ width: w, height: h }, style]}>
        <Image
          source={source}
          style={{ width: w, height: h }}
          contentFit="contain"
          // keep the little contact shadow anchored to the floor
          contentPosition="bottom"
        />
      </Animated.View>
    </View>
  );
}

export function MascotFigure(props: Props) {
  const { mascot, size = 160, mood = 'neutral', animated = true } = props;

  // 1) pre-rendered image
  const img = imageFor(mascot.id, mood);
  if (img) {
    return <ImageMascot source={img.source} aspect={img.aspect} size={size} animated={animated} />;
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
