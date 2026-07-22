import { Component, lazy, type ReactNode, Suspense, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MascotFigure } from '@/components/ascnd/mascot-figure';
import type { MascotMood } from '@/hooks/use-mascot';
import type { MascotEmotion } from '@/lib/mascot-emotion';
import type { MascotDef } from '@/lib/mascots';

/**
 * The buddy on the Stage. Loads the 3D renderer LAZILY so nothing from
 * react-three-fiber / expo-gl is evaluated until it actually renders — if the
 * native GL module is missing (dev client not rebuilt) or the model/context
 * fails, the error boundary + Suspense fall back to the 2D image figure and the
 * Stage never goes blank or crashes.
 *
 * Two distinct fall-back paths, made visually distinct in __DEV__ so a single
 * device screenshot tells us WHICH one happened:
 *   1. Canvas throws          -> Boundary  -> 2D + RED "3D ERROR" banner
 *   2. Suspense never resolves -> loading  -> 2D + YELLOW "3D LOADING…" banner
 */
const Mascot3D = lazy(() => import('@/components/ascnd/mascot-3d'));

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    // Also surface in the Metro terminal.
    // eslint-disable-next-line no-console
    console.error('[Mascot3D] fell back to 2D:', error?.stack ?? error?.message ?? error);
  }
  render() {
    if (this.state.error) {
      return (
        <View style={styles.wrap}>
          {this.props.fallback}
          {__DEV__ && (
            <View style={[styles.banner, styles.bannerErr]} pointerEvents="none">
              <Text style={styles.errTitle}>3D ERROR — chụp gửi Claude</Text>
              <Text style={styles.err} numberOfLines={12}>
                {String(this.state.error?.message ?? this.state.error)}
              </Text>
            </View>
          )}
        </View>
      );
    }
    return this.props.children;
  }
}

/**
 * Suspense fallback that, in dev, shows a YELLOW badge AFTER a short grace
 * period — so a momentary load flash stays clean, but a *stuck* load (model
 * never resolves) is unmistakable and distinct from the red error case.
 */
function LoadingFallback({ fallback }: { fallback: ReactNode }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 1500);
    return () => clearTimeout(id);
  }, []);
  return (
    <View style={styles.wrap}>
      {fallback}
      {__DEV__ && slow && (
        <View style={[styles.banner, styles.bannerLoad]} pointerEvents="none">
          <Text style={styles.loadTitle}>3D LOADING… (kẹt → chụp gửi Claude)</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  banner: {
    position: 'absolute',
    top: '50%',
    alignSelf: 'center',
    width: 280,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  bannerErr: { backgroundColor: 'rgba(30,0,0,0.94)', borderColor: '#ff6060' },
  bannerLoad: { backgroundColor: 'rgba(30,24,0,0.94)', borderColor: '#ffcf4d' },
  errTitle: { fontSize: 12, fontWeight: '800', color: '#ffb0b0', marginBottom: 4 },
  err: { fontSize: 11, lineHeight: 15, color: '#ffd6d6' },
  loadTitle: { fontSize: 12, fontWeight: '800', color: '#ffe08a', textAlign: 'center' },
});

export interface MascotBuddyProps {
  mascot: MascotDef;
  emotion: MascotEmotion;
  size?: number;
  mood?: MascotMood;
  level?: number;
  accent?: string;
  equippedOutfits?: Set<string>;
}

export function MascotBuddy({
  mascot,
  emotion,
  size = 200,
  mood = 'neutral',
  level = 1,
  accent,
  equippedOutfits,
}: MascotBuddyProps) {
  const fallback = (
    <MascotFigure mascot={mascot} size={size} mood={mood} emotion={emotion} level={level} equippedOutfits={equippedOutfits} />
  );
  return (
    <Boundary fallback={fallback}>
      <Suspense fallback={<LoadingFallback fallback={fallback} />}>
        <Mascot3D emotion={emotion} size={size} accent={accent} />
      </Suspense>
    </Boundary>
  );
}
