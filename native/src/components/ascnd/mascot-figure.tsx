import { View } from 'react-native';

import { VectorMascot } from '@/components/ascnd/vector-mascot';
import type { MascotMood } from '@/hooks/use-mascot';
import { lottieFor } from '@/lib/mascot-lottie';
import type { MascotDef } from '@/lib/mascots';

/**
 * The companion figure. If a Lottie asset is registered for this mascot
 * (see `mascot-lottie.ts`) it plays that — the premium animated look.
 * Otherwise it renders the built-in vector figure unchanged, so the app
 * works identically until real assets are dropped in.
 *
 * The native Lottie module is required lazily and only when a source
 * actually exists, so a JS-only pull (before the dev build is rebuilt)
 * never touches it and never crashes.
 */

// Vector figure aspect (RIG_H / RIG_W) — keep the Lottie box the same so
// swapping in an asset doesn't shift layout.
const ASPECT = 350 / 240;

interface Props {
  mascot: MascotDef;
  size?: number;
  mood?: MascotMood;
  level?: number;
  equippedOutfits?: Set<string>;
  animated?: boolean;
}

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

export function MascotFigure(props: Props) {
  const { mascot, size = 160, mood = 'neutral', animated = true } = props;
  const source = lottieFor(mascot.id, mood);
  const Lottie = source != null ? getLottie() : null;

  if (source != null && Lottie) {
    const h = size * ASPECT;
    return (
      <View style={{ width: size, height: h }} pointerEvents="none">
        <Lottie
          source={source}
          autoPlay={animated}
          loop={animated}
          resizeMode="contain"
          style={{ width: size, height: h }}
        />
      </View>
    );
  }

  return <VectorMascot {...props} />;
}
