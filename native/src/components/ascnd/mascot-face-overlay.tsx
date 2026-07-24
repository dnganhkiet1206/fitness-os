/**
 * MascotFaceOverlay — a 2D expression face (Talking-Tom style) layered over the
 * 3D koala at the fixed camera. The model has no facial rig, so eyebrows, a
 * mouth and eyelids (blink / squint / sleep) carry the emotion. Positions come
 * from FACE (mascot-face.ts) so they calibrate to the model without code edits.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { FACE } from '@/config/mascot-face';
import type { MascotEmotion } from '@/lib/mascot-emotion';

type MouthShape = 'smile' | 'bigSmile' | 'neutral' | 'frown' | 'open' | 'oh';
interface FaceState {
  lid: number; // top-lid closure 0..1
  browRaise: number; // − = up
  browRot: number; // + = inner-down (angry), − = inner-up (sad)
  mouth: MouthShape;
}

function faceFor(e: MascotEmotion): FaceState {
  switch (e) {
    case 'happy':
      return { lid: 0.06, browRaise: -0.15, browRot: -0.04, mouth: 'bigSmile' };
    case 'celebrate':
      return { lid: 0, browRaise: -0.25, browRot: -0.05, mouth: 'open' };
    case 'wave':
      return { lid: 0.04, browRaise: -0.1, browRot: -0.03, mouth: 'smile' };
    case 'curl':
      return { lid: 0.12, browRaise: 0.05, browRot: 0.14, mouth: 'oh' }; // determined effort
    case 'sad':
      return { lid: 0.22, browRaise: -0.02, browRot: -0.26, mouth: 'frown' };
    case 'tired':
      return { lid: 0.46, browRaise: 0.1, browRot: 0.04, mouth: 'neutral' };
    case 'sleep':
      return { lid: 0.95, browRaise: 0.02, browRot: 0, mouth: 'neutral' };
    default:
      return { lid: 0, browRaise: 0, browRot: 0, mouth: 'smile' }; // idle
  }
}

// mouth path inside a 0..w × 0..h box
function mouthPath(shape: MouthShape, w: number, h: number): { d: string; fill: string } {
  const mid = w / 2;
  switch (shape) {
    case 'bigSmile':
      return { d: `M ${w * 0.08} ${h * 0.25} Q ${mid} ${h * 1.15} ${w * 0.92} ${h * 0.25}`, fill: 'none' };
    case 'smile':
      return { d: `M ${w * 0.14} ${h * 0.35} Q ${mid} ${h * 0.95} ${w * 0.86} ${h * 0.35}`, fill: 'none' };
    case 'neutral':
      return { d: `M ${w * 0.2} ${h * 0.55} Q ${mid} ${h * 0.68} ${w * 0.8} ${h * 0.55}`, fill: 'none' };
    case 'frown':
      return { d: `M ${w * 0.18} ${h * 0.75} Q ${mid} ${h * 0.15} ${w * 0.82} ${h * 0.75}`, fill: 'none' };
    case 'open':
      return { d: `M ${w * 0.2} ${h * 0.2} Q ${mid} ${h * 1.25} ${w * 0.8} ${h * 0.2} Q ${mid} ${h * 0.55} ${w * 0.2} ${h * 0.2} Z`, fill: '#5a2b30' };
    case 'oh':
      return { d: `M ${mid} ${h * 0.1} Q ${w * 0.82} ${h * 0.5} ${mid} ${h * 0.95} Q ${w * 0.18} ${h * 0.5} ${mid} ${h * 0.1} Z`, fill: '#5a2b30' };
  }
}

export function MascotFaceOverlay({ emotion, size }: { emotion: MascotEmotion; size: number }) {
  const W = size;
  const Hc = size * 1.25;
  const st = faceFor(emotion);

  // eased expression channels
  const lid = useSharedValue(st.lid);
  const browRaise = useSharedValue(st.browRaise);
  const browRot = useSharedValue(st.browRot);
  const blink = useSharedValue(0);

  useEffect(() => {
    const dur = 260;
    lid.value = withTiming(st.lid, { duration: dur, easing: Easing.inOut(Easing.quad) });
    browRaise.value = withTiming(st.browRaise, { duration: dur, easing: Easing.inOut(Easing.quad) });
    browRot.value = withTiming(st.browRot, { duration: dur, easing: Easing.inOut(Easing.quad) });
  }, [st.lid, st.browRaise, st.browRot, lid, browRaise, browRot]);

  useEffect(() => {
    // occasional blink (skip when the eyes are already held closed, e.g. sleep)
    blink.value = withRepeat(
      withSequence(
        withDelay(2600, withTiming(1, { duration: 70, easing: Easing.in(Easing.quad) })),
        withTiming(0, { duration: 110, easing: Easing.out(Easing.quad) }),
      ),
      -1,
    );
  }, [blink]);

  const browLen = FACE.browLen * W;
  const browGap = FACE.browGap * Hc;
  const mouthW = FACE.mouth.w * W;
  const mouthH = FACE.mouth.h * Hc;
  const mp = mouthPath(st.mouth, mouthW, mouthH);

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: W, height: Hc }}>
      {/* eyelids */}
      {[FACE.left, FACE.right].map((eye, i) => (
        <Lid key={i} eye={eye} W={W} Hc={Hc} lid={lid} blink={blink} />
      ))}
      {/* eyebrows (rounded dark bars; inner end up = sad, down = angry) */}
      {[FACE.left, FACE.right].map((eye, i) => (
        <Brow key={`b${i}`} eye={eye} side={i === 0 ? -1 : 1} W={W} Hc={Hc} browLen={browLen} browGap={browGap} browRaise={browRaise} browRot={browRot} />
      ))}
      {/* mouth */}
      <View style={{ position: 'absolute', left: FACE.mouth.x * W - mouthW / 2, top: FACE.mouth.y * Hc - mouthH / 2, width: mouthW, height: mouthH }}>
        <Svg width={mouthW} height={mouthH}>
          <Path d={mp.d} stroke={FACE.ink} strokeWidth={Math.max(2, mouthH * 0.16)} strokeLinecap="round" fill={mp.fill} />
        </Svg>
      </View>
    </View>
  );
}

function Lid({
  eye,
  W,
  Hc,
  lid,
  blink,
}: {
  eye: { x: number; y: number; w: number; h: number };
  W: number;
  Hc: number;
  lid: { value: number };
  blink: { value: number };
}) {
  const eyeW = eye.w * W;
  const eyeH = eye.h * Hc;
  const style = useAnimatedStyle(() => {
    const c = Math.max(lid.value, blink.value); // 0 open → 1 closed
    return { transform: [{ translateY: (c - 1) * eyeH }] };
  });
  return (
    <View
      style={{
        position: 'absolute',
        left: eye.x * W - eyeW / 2,
        top: eye.y * Hc - eyeH / 2,
        width: eyeW,
        height: eyeH,
        borderRadius: eyeW / 2,
        overflow: 'hidden',
      }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: '110%',
            backgroundColor: FACE.fur,
            borderBottomLeftRadius: eyeW * 0.55,
            borderBottomRightRadius: eyeW * 0.55,
          },
          style,
        ]}
      />
    </View>
  );
}

function Brow({
  eye,
  side,
  W,
  Hc,
  browLen,
  browGap,
  browRaise,
  browRot,
}: {
  eye: { x: number; y: number };
  side: number; // −1 left eye, +1 right eye
  W: number;
  Hc: number;
  browLen: number;
  browGap: number;
  browRaise: { value: number };
  browRot: { value: number };
}) {
  const thick = Math.max(3, browLen * 0.16);
  const style = useAnimatedStyle(() => {
    // inner-down (angry) for +browRot; mirror per side
    const rot = browRot.value * side * -1;
    return {
      transform: [{ translateY: browRaise.value * Hc * 0.25 }, { rotate: `${rot}rad` }],
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: eye.x * W - browLen / 2,
          top: eye.y * Hc - browGap,
          width: browLen,
          height: thick,
          borderRadius: thick,
          backgroundColor: FACE.ink,
        },
        style,
      ]}
    />
  );
}
