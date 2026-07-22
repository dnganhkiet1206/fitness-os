import { Component, lazy, type ReactNode, Suspense } from 'react';

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
 */
const Mascot3D = lazy(() => import('@/components/ascnd/mascot-3d'));

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

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
      <Suspense fallback={fallback}>
        <Mascot3D emotion={emotion} size={size} accent={accent} />
      </Suspense>
    </Boundary>
  );
}
