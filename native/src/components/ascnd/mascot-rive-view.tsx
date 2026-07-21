import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import type { MascotMood } from '@/hooks/use-mascot';
import { RIVE_MOOD, RIVE_SM, type RiveMascotSpec } from '@/lib/mascot-rive';

/**
 * Renders a rigged Rive companion and drives its State Machine from app
 * state. The native module is required lazily so the app never touches it
 * until a `.riv` is actually registered (see mascot-rive.ts).
 *
 * State-machine contract (see KOA_RIG_SPEC.md):
 *   - Number input `mood` (0 neutral / 1 happy / 2 tired / 3 sad)
 *   - Trigger inputs for one-shot actions (celebrate, dumbbellCurl, …)
 */

const VECTOR_ASPECT = 350 / 240;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RiveComp: any = null;
let riveTried = false;
function getRive() {
  if (riveTried) return RiveComp;
  riveTried = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    RiveComp = require('rive-react-native').default;
  } catch {
    RiveComp = null;
  }
  return RiveComp;
}

export function RiveMascot({
  spec,
  size,
  mood,
  animated,
}: {
  spec: RiveMascotSpec;
  size: number;
  mood: MascotMood;
  animated: boolean;
}) {
  const Rive = getRive();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<any>(null);
  const sm = spec.stateMachine ?? RIVE_SM;
  const h = size * (spec.aspect ?? VECTOR_ASPECT);

  // push mood → the `mood` number input whenever it changes
  useEffect(() => {
    const val = RIVE_MOOD[mood] ?? RIVE_MOOD.neutral;
    try {
      ref.current?.setInputState?.(sm, 'mood', val);
    } catch {
      /* input may not exist yet */
    }
  }, [mood, sm]);

  if (!Rive) return null;

  return (
    <View style={{ width: size, height: h }} pointerEvents="none">
      <Rive
        ref={ref}
        resourceName={spec.resourceName}
        url={spec.url}
        artboardName={spec.artboard}
        stateMachineName={sm}
        autoplay={animated}
        style={{ width: size, height: h }}
      />
    </View>
  );
}
