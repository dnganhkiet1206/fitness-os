import { Text } from 'react-native-svg';

import { C } from '@/components/ascnd/studio/palette';
import { CX } from '@/components/ascnd/studio/spotlight';

/**
 * The companion's name, set into the podium's front face.
 *
 * It used to be the screen's header title, floating over the top of the room.
 * Down here in the room's own colour it reads as something the stage was
 * built with rather than a label laid over it — which is the point, so
 * **keep it in `glow`**: that is the same colour as the podium's ring, and a
 * skin changes both together.
 *
 * The halo is a wide stroke at low opacity under a sharp fill, the same two
 * passes the neon sign uses. No filter, no blur — the brief rules those out
 * and this is still just two `<Text>` elements.
 *
 * `Y` sits on the front face, which at the centre runs from the ring at 443
 * to the bottom arc at about 467. Letters at 12 with the baseline at 461
 * clear both. Move the podium and this has to move with it.
 */
const Y = 461;
const SIZE = 12;

export function StageLabel({ label, glow = C.highlight }: { label: string; glow?: string }) {
  const text = label.toUpperCase();
  return (
    <>
      <Text
        x={CX}
        y={Y}
        fill="none"
        stroke={glow}
        strokeWidth={3}
        opacity={0.16}
        fontSize={SIZE}
        fontWeight="800"
        letterSpacing={4}
        textAnchor="middle">
        {text}
      </Text>
      <Text
        x={CX}
        y={Y}
        fill={glow}
        opacity={0.9}
        fontSize={SIZE}
        fontWeight="800"
        letterSpacing={4}
        textAnchor="middle">
        {text}
      </Text>
    </>
  );
}
