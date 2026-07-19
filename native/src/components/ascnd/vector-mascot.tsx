import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { ClipPath, Defs, Ellipse, G, Path, Rect } from 'react-native-svg';

import type { MascotMood } from '@/hooks/use-mascot';
import type { MascotDef } from '@/lib/mascots';

/**
 * Workout Companion — a calm, standing, athletic character. Fully
 * code-drawn, flat illustration with layered shadow (a clipped darker
 * copy offset down-right) and a whisper of highlight; depth comes from
 * colour, not 3D. Muted palette, brand cyan only as a small accent.
 *
 * Each species has its own silhouette (shoulder width, stance, leg
 * length, posture lean) so the roster reads even at small sizes. Motion
 * is deliberately quiet: a slow breath and an occasional blink — no
 * bounce, spin or dance.
 */

const RIG_W = 240;
const RIG_H = 350;
const FOOT_Y = 330;
const ACCENT = '#31c9d6';

interface Personality {
  bin: number; // breath-in duration
  bout: number; // breath-out duration
  blink: number; // base ms between blinks
  sway: number; // weight-shift amplitude (px)
  swayDur: number; // weight-shift period
}

interface Art {
  body: string;
  dark: string;
  light: string;
  variant: 'koala' | 'lion' | 'fox' | 'gorilla' | 'dragon' | 'unicorn';
  tank: string;
  short: string;
  // silhouette params
  sh: number; // shoulder width
  st: number; // stance (feet apart)
  leg: number; // leg length
  lean: number; // posture hip shift
  tilt: number; // head tilt (deg)
  // motion personality — each companion moves differently
  p: Personality;
  ear?: string;
  mane?: string;
  muz?: string;
  face?: string;
  spike?: string;
}

const MASCOT_ART: Record<string, Art> = {
  // Koa — calm, slow, deep breathing, rare blinks, barely sways
  koa: { body: '#9fb0b2', dark: '#7f9295', light: '#b7c4c6', ear: '#b39a9c', variant: 'koala', tank: '#e5e8ec', short: '#3d4450', sh: 96, st: 26, leg: 104, lean: 6, tilt: 4, p: { bin: 2600, bout: 3000, blink: 3400, sway: 0.6, swayDur: 5200 } },
  // Blaze — confident, still, few but firm movements
  blaze: { body: '#cfa566', dark: '#b08a48', light: '#e0c088', mane: '#b3823f', variant: 'lion', tank: '#586170', short: '#3a4048', sh: 118, st: 34, leg: 104, lean: -5, tilt: -3, p: { bin: 2400, bout: 2600, blink: 3000, sway: 0.4, swayDur: 5000 } },
  // Swift — agile, shifts weight often, frequent blinks
  swift: { body: '#cf8355', dark: '#b06537', light: '#e2a074', muz: '#e7ddcf', variant: 'fox', tank: '#e5e8ec', short: '#3d4450', sh: 92, st: 24, leg: 120, lean: 9, tilt: 6, p: { bin: 1900, bout: 2000, blink: 1900, sway: 1.4, swayDur: 3200 } },
  // Titan — rock steady, almost no sway, slow
  titan: { body: '#727b87', dark: '#565e69', light: '#8b93a0', face: '#949cab', variant: 'gorilla', tank: '#586170', short: '#3a4048', sh: 132, st: 46, leg: 92, lean: 0, tilt: 0, p: { bin: 2600, bout: 2800, blink: 3600, sway: 0.25, swayDur: 6000 } },
  // Drago — energetic, quicker breath, ready to move
  drago: { body: '#71ab7d', dark: '#548a61', light: '#93c39d', spike: '#d7cfa0', variant: 'dragon', tank: '#e5e8ec', short: '#3d4450', sh: 104, st: 30, leg: 112, lean: -6, tilt: -4, p: { bin: 1700, bout: 1800, blink: 2400, sway: 1.0, swayDur: 3600 } },
  // Nova — soft, gentle, relaxed
  nova: { body: '#d9d2e4', dark: '#bcb0d1', light: '#ece7f3', mane: '#a98fce', variant: 'unicorn', tank: '#e5e8ec', short: '#3d4450', sh: 90, st: 24, leg: 118, lean: 8, tilt: 5, p: { bin: 2400, bout: 2800, blink: 3000, sway: 0.9, swayDur: 4600 } },
};

function clamp(v: number) {
  return Math.max(0, Math.min(255, v));
}
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amt);
  const g = clamp(((n >> 8) & 255) + amt);
  const b = clamp((n & 255) + amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
function capsule(x1: number, y1: number, w1: number, x2: number, y2: number, w2: number) {
  const a = w1 / 2;
  const b = w2 / 2;
  return `M${x1 - a} ${y1} L${x2 - b} ${y2} Q${x2} ${y2 + b} ${x2 + b} ${y2} L${x1 + a} ${y1} Q${x1} ${y1 - a} ${x1 - a} ${y1} Z`;
}

interface Props {
  mascot: MascotDef;
  /** Rendered width in px (height ≈ width × 1.46) */
  size?: number;
  mood?: MascotMood;
  level?: number;
  equippedOutfits?: Set<string>;
  /** Turn off the breath/blink timers (static grids/pickers) */
  animated?: boolean;
}

const EMPTY = new Set<string>();
let idSeq = 0;

/** Flat part = base + clipped darker copy (offset down-right) + faint highlight */
function Part({ pid, d, base, dark, light }: { pid: string; d: string; base: string; dark: string; light?: string }) {
  return (
    <>
      <Defs>
        <ClipPath id={pid}>
          <Path d={d} />
        </ClipPath>
      </Defs>
      <Path d={d} fill={base} />
      <G clipPath={`url(#${pid})`}>
        <G x={10} y={9}>
          <Path d={d} fill={dark} />
        </G>
        {light ? (
          <G x={-9} y={-10} opacity={0.5}>
            <Path d={d} fill={light} />
          </G>
        ) : null}
      </G>
    </>
  );
}

export function VectorMascot({
  mascot,
  size = 160,
  mood = 'neutral',
  level = 1,
  equippedOutfits = EMPTY,
  animated = true,
}: Props) {
  const a = MASCOT_ART[mascot.id] ?? MASCOT_ART.koa;
  const tired = mood === 'tired';
  const pfx = useMemo(() => `vm${idSeq++}`, []);

  // Geometry (feet on a common baseline; head rides up with leg length)
  const hipY = FOOT_Y - a.leg;
  const shoulderY = hipY - 72;
  const shCx = 120 - a.lean * 0.5;
  const hipCx = 120 + a.lean;
  const half = a.sh / 2;
  const wHalf = a.sh * 0.32;
  const shL = shCx - half;
  const shR = shCx + half;
  const wLx = hipCx - wHalf;
  const wRx = hipCx + wHalf;
  const footL = 120 - a.st / 2;
  const footR = 120 + a.st / 2;
  const headCy = shoulderY - 52; // head drawn at local cy=86 → translate down by (headCy-86)
  const headTy = headCy - 86;
  const armW = Math.min(30 + Math.max(0, level - 1) * 0.4, 36);

  const scale = size / RIG_W;
  const outH = size * (RIG_H / RIG_W);
  const showEyes = !equippedOutfits.has('sunglasses');
  const eyeScreenY = (88 + headTy) * scale;

  // ── quiet motion, tuned per companion: breath + blink + weight-shift ──
  const breath = useSharedValue(0);
  const sway = useSharedValue(0.5);
  const lid = useSharedValue(tired ? 0.4 : 0);

  useEffect(() => {
    if (!animated) return;
    const bin = tired ? a.p.bin * 1.3 : a.p.bin;
    const bout = tired ? a.p.bout * 1.3 : a.p.bout;
    breath.value = withRepeat(
      withSequence(withTiming(1, { duration: bin }), withTiming(0, { duration: bout })),
      -1,
    );
    // slow weight shift — the "it's alive" cue; nearly frozen when tired
    sway.value = withRepeat(
      withSequence(
        withTiming(1, { duration: a.p.swayDur, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: a.p.swayDur, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [animated, tired, a.p.bin, a.p.bout, a.p.swayDur, breath, sway]);

  useEffect(() => {
    const rest = tired ? 0.4 : 0;
    lid.value = withTiming(rest, { duration: 300 });
    if (!animated) return;
    let alive = true;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        if (!alive) return;
        lid.value = withSequence(
          withTiming(1, { duration: tired ? 150 : 80 }),
          withTiming(rest, { duration: tired ? 260 : 120 }),
        );
        loop();
      }, (tired ? a.p.blink * 0.7 : a.p.blink) + Math.random() * a.p.blink);
    };
    loop();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [animated, tired, a.p.blink, lid]);

  const swayAmp = tired ? a.p.sway * 0.25 : a.p.sway;
  const breathStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (sway.value - 0.5) * 2 * swayAmp * scale },
      { translateY: -breath.value * 1.5 * scale },
      { scaleY: 1 + breath.value * 0.012 },
    ],
  }));
  const lidStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: lid.value }] }));

  const ids = useRef(0);
  const id = () => `${pfx}_${ids.current++}`;

  const legL = capsule(hipCx - 14, hipY + 8, 30, footL, FOOT_Y - 6, 20);
  const legR = capsule(hipCx + 14, hipY + 8, 30, footR, FOOT_Y - 6, 20);
  const armLd = capsule(shL + 7, shoulderY + 8, armW, shL - 2 - (a.lean > 0 ? 4 : 0), hipY + 2, 23);
  const armRd = capsule(shR - 7, shoulderY + 8, armW, shR + 2 + (a.lean < 0 ? 4 : 0), hipY + 2, 23);
  const tankPath =
    `M${shL} ${shoulderY + 2} ` +
    `C${shL - 5} ${shoulderY + 28} ${wLx - 6} ${hipY - 18} ${wLx} ${hipY + 4} ` +
    `Q${hipCx} ${hipY + 14} ${wRx} ${hipY + 4} ` +
    `C${shR + 6} ${hipY - 18} ${shR + 5} ${shoulderY + 28} ${shR} ${shoulderY + 2} ` +
    `Q${shCx + 18} ${shoulderY - 10} ${shCx + 10} ${shoulderY - 2} ` +
    `Q${shCx} ${shoulderY + 6} ${shCx - 10} ${shoulderY - 2} ` +
    `Q${shCx - 18} ${shoulderY - 10} ${shL} ${shoulderY + 2} Z`;
  const shorts =
    `M${wLx - 6} ${hipY - 4} Q${hipCx} ${hipY + 8} ${wRx + 6} ${hipY - 4} ` +
    `L${footR - 2} ${hipY + 42} Q${footR - 12} ${hipY + 48} ${footR - 22} ${hipY + 42} ` +
    `L${hipCx + 2} ${hipY + 24} L${hipCx - 2} ${hipY + 24} ` +
    `L${footL + 22} ${hipY + 42} Q${footL + 12} ${hipY + 48} ${footL + 2} ${hipY + 42} Z`;

  return (
    <View style={{ width: size, height: outH }} pointerEvents="none">
      <Animated.View style={breathStyle}>
        <Svg width={size} height={outH} viewBox={`0 0 ${RIG_W} ${RIG_H}`}>
          <Ellipse cx={120} cy={FOOT_Y + 4} rx={a.sh * 0.6} ry={10} fill="#000" opacity={0.32} />

          {a.variant === 'fox' && (
            <Part pid={id()} d={capsule(shR + 2, shoulderY + 70, 16, shR + 34, hipY + 44, 9)} base={a.body} dark={a.dark} light={a.light} />
          )}
          {a.variant === 'dragon' && (
            <Part pid={id()} d={capsule(shR - 4, shoulderY + 80, 14, shR + 26, hipY + 50, 8)} base={a.body} dark={a.dark} light={a.light} />
          )}

          <Part pid={id()} d={legL} base={a.body} dark={a.dark} light={a.light} />
          <Part pid={id()} d={legR} base={a.body} dark={a.dark} light={a.light} />

          <Part pid={id()} d={`M${footL - 14} ${FOOT_Y - 6} q-4 14 2 18 q16 6 30 2 q3-5 1-13 q-16 3-33-7 Z`} base="#2c313a" dark="#20242b" light="#3a404a" />
          <Part pid={id()} d={`M${footR - 16} ${FOOT_Y - 6} q-3 14 3 18 q16 6 30 0 q2-6 0-14 q-17 5-33-4 Z`} base="#2c313a" dark="#20242b" light="#3a404a" />
          <Path d={`M${footL - 14} ${FOOT_Y + 11} q17 8 34 3`} stroke="#eceef1" strokeWidth={4} fill="none" strokeLinecap="round" />
          <Path d={`M${footR - 13} ${FOOT_Y + 9} q15 8 32 0`} stroke="#eceef1" strokeWidth={4} fill="none" strokeLinecap="round" />

          <Part pid={id()} d={shorts} base={a.short} dark={shade(a.short, -14)} light={shade(a.short, 18)} />
          <Path d={`M${hipCx} ${hipY + 2} v22`} stroke={shade(a.short, -14)} strokeWidth={2} opacity={0.6} />

          <Part pid={id()} d={armLd} base={a.body} dark={a.dark} light={a.light} />
          <Part pid={id()} d={armRd} base={a.body} dark={a.dark} light={a.light} />
          <Rect x={shL - 8} y={hipY - 8} width={18} height={7} rx={3.5} fill={ACCENT} opacity={0.9} />

          {/* neck */}
          <Part pid={id()} d={`M${shCx - 14} ${shoulderY - 16} q14 8 28 0 l-2 18 q-12 6 -24 0 Z`} base={a.body} dark={a.dark} light={a.light} />

          {/* tank top + seams + hem-line logo */}
          <Part pid={id()} d={tankPath} base={a.tank} dark={shade(a.tank, -16)} light={shade(a.tank, 18)} />
          <Path d={`M${shL + 2} ${shoulderY + 24} C${shL - 2} ${shoulderY + 40} ${wLx} ${hipY - 24} ${wLx + 3} ${hipY}`} stroke={shade(a.tank, -20)} strokeWidth={1.5} fill="none" opacity={0.7} />
          <Path d={`M${shR - 2} ${shoulderY + 24} C${shR + 2} ${shoulderY + 40} ${wRx} ${hipY - 24} ${wRx - 3} ${hipY}`} stroke={shade(a.tank, -20)} strokeWidth={1.5} fill="none" opacity={0.7} />
          <Path d={`M${shCx - 10} ${shoulderY - 3} q10 7 20 0`} stroke={shade(a.tank, -22)} strokeWidth={2} fill="none" />
          {/* ribbed collar + armhole ribs — activewear detail */}
          <Path d={`M${shCx - 12} ${shoulderY - 5} q12 9 24 0`} stroke={shade(a.tank, 26)} strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.8} />
          <Path d={`M${shL + 1} ${shoulderY + 4} q9 4 12 16`} stroke={shade(a.tank, -24)} strokeWidth={2.4} fill="none" strokeLinecap="round" opacity={0.75} />
          <Path d={`M${shR - 1} ${shoulderY + 4} q-9 4 -12 16`} stroke={shade(a.tank, -24)} strokeWidth={2.4} fill="none" strokeLinecap="round" opacity={0.75} />
          {/* small chest logo */}
          <Path d={`M${shCx - 4} ${shoulderY + 34} l4-5 l4 5`} stroke={ACCENT} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />

          {equippedOutfits.has('medal') && (
            <G>
              <Path d={`M${shCx - 12} ${shoulderY + 6} L${shCx} ${shoulderY + 30} L${shCx + 12} ${shoulderY + 6}`} stroke="#c85466" strokeWidth={5} fill="none" />
              <Ellipse cx={shCx} cy={shoulderY + 36} rx={9} ry={9} fill="#e0b23a" />
            </G>
          )}
          {equippedOutfits.has('belt') && (
            <Rect x={wLx - 4} y={hipY - 2} width={wRx - wLx + 8} height={9} rx={3} fill="#5a4634" />
          )}

          {/* ambient contact shadows: subtle depth where forms meet */}
          <Ellipse cx={120} cy={shoulderY - 2} rx={26} ry={7} fill="#000" opacity={0.12} />
          <Ellipse cx={shL + 4} cy={shoulderY + 34} rx={9} ry={16} fill="#000" opacity={0.08} />
          <Ellipse cx={shR - 4} cy={shoulderY + 34} rx={9} ry={16} fill="#000" opacity={0.08} />
          <Ellipse cx={hipCx} cy={hipY + 34} rx={5} ry={18} fill="#000" opacity={0.16} />

          {/* head group: vertical ride + small tilt */}
          <G y={headTy}>
            <G rotation={a.tilt} originX={120} originY={86}>
              {headBehind(a)}
              <Part pid={id()} d="M120 86 m-52 0 a52 50 0 1 0 104 0 a52 50 0 1 0 -104 0" base={a.body} dark={a.dark} light={a.light} />
              {faceExtra(a)}
              {showEyes && (
                <>
                  <Ellipse cx={100} cy={88} rx={7} ry={tired ? 1.5 : 8.5} fill="#33343a" />
                  <Ellipse cx={140} cy={88} rx={7} ry={tired ? 1.5 : 8.5} fill="#33343a" />
                  {!tired && <Ellipse cx={97.5} cy={85} rx={2} ry={2} fill="#fff" opacity={0.9} />}
                  {!tired && <Ellipse cx={137.5} cy={85} rx={2} ry={2} fill="#fff" opacity={0.9} />}
                </>
              )}
              {tired ? (
                <>
                  <Path d="M93 74 l18 2" stroke={a.dark} strokeWidth={3.5} strokeLinecap="round" />
                  <Path d="M147 74 l-18 2" stroke={a.dark} strokeWidth={3.5} strokeLinecap="round" />
                  <Path d="M156 74 q6 9 0 13 q-6-4 0-13" fill={ACCENT} opacity={0.7} />
                </>
              ) : (
                <>
                  <Path d="M91 74 q9-4 18 0" stroke={a.dark} strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.45} />
                  <Path d="M131 74 q9-4 18 0" stroke={a.dark} strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.45} />
                </>
              )}
              {nose(a)}
              <Path
                d={
                  mood === 'happy'
                    ? 'M105 107 q15 13 30 0'
                    : tired
                      ? 'M107 110 q13 5 26 0'
                      : 'M107 105 q13 8 26 0'
                }
                stroke="#4b4b52"
                strokeWidth={mood === 'happy' ? 4 : 3.5}
                fill="none"
                strokeLinecap="round"
              />
              {headFront(a)}
              {equippedOutfits.has('headband') && (
                <Rect x={70} y={54} width={100} height={12} rx={6} fill="#c85466" />
              )}
              {equippedOutfits.has('cap') && (
                <Path d="M70 60 A50 40 0 0 1 170 60 L170 66 L70 66 Z" fill="#3a6db0" />
              )}
              {equippedOutfits.has('sunglasses') && (
                <G>
                  <Rect x={84} y={80} width={30} height={16} rx={7} fill="#101318" />
                  <Rect x={126} y={80} width={30} height={16} rx={7} fill="#101318" />
                  <Path d="M114 87 h12" stroke="#101318" strokeWidth={3} />
                </G>
              )}
            </G>
          </G>
        </Svg>
      </Animated.View>

      {/* Blink lids — body-coloured, drop over the eyes */}
      {showEyes && (
        <>
          {[100, 140].map((ex) => (
            <Animated.View
              key={ex}
              style={[
                {
                  position: 'absolute',
                  left: (ex - 9) * scale,
                  top: eyeScreenY - 11 * scale,
                  width: 18 * scale,
                  height: 20 * scale,
                  borderRadius: 8 * scale,
                  backgroundColor: a.body,
                },
                lidStyle,
              ]}
            />
          ))}
        </>
      )}
    </View>
  );
}

// ── species features (head local coords: centre 120,86, rx52 ry50) ─────
function headBehind(a: Art) {
  switch (a.variant) {
    case 'koala':
      return (
        <>
          <Ellipse cx={76} cy={58} rx={24} ry={24} fill={a.body} />
          <Ellipse cx={164} cy={58} rx={24} ry={24} fill={a.body} />
          <Ellipse cx={76} cy={58} rx={13} ry={13} fill={a.ear} />
          <Ellipse cx={164} cy={58} rx={13} ry={13} fill={a.ear} />
        </>
      );
    case 'lion': {
      const petals = [];
      petals.push(<Ellipse key="m" cx={120} cy={86} rx={60} ry={60} fill={a.mane} />);
      for (let i = 0; i < 13; i++) {
        const t = (i / 13) * Math.PI * 2;
        petals.push(
          <Ellipse key={i} cx={120 + Math.cos(t) * 60} cy={86 + Math.sin(t) * 56} rx={15} ry={15} fill={a.mane} />,
        );
      }
      petals.push(<Ellipse key="c" cx={120} cy={86} rx={49} ry={49} fill={shade(a.mane!, 26)} />);
      return <>{petals}</>;
    }
    case 'fox':
      return (
        <>
          <Path d="M76 50 L88 4 L118 44 Z" fill={a.body} />
          <Path d="M164 50 L152 4 L122 44 Z" fill={a.body} />
          <Path d="M86 44 L92 18 L108 42 Z" fill={a.dark} />
          <Path d="M154 44 L148 18 L132 42 Z" fill={a.dark} />
        </>
      );
    case 'gorilla':
      return (
        <>
          <Ellipse cx={70} cy={86} rx={14} ry={14} fill={a.body} />
          <Ellipse cx={170} cy={86} rx={14} ry={14} fill={a.body} />
        </>
      );
    case 'dragon':
      return (
        <>
          <Path d="M96 44 L102 16 L112 40 Z" fill={a.spike} />
          <Path d="M120 38 L126 12 L134 38 Z" fill={a.spike} />
        </>
      );
    case 'unicorn':
      return (
        <>
          <Path d="M112 42 L120 4 L128 42 Z" fill="#e9d18a" />
          <Path d="M74 52 L82 22 L100 46 Z" fill={a.body} />
          <Path d="M166 52 L158 22 L140 46 Z" fill={a.body} />
        </>
      );
  }
}
function faceExtra(a: Art) {
  if (a.variant === 'gorilla') return <Ellipse cx={120} cy={96} rx={33} ry={29} fill={a.face} opacity={0.6} />;
  if (a.variant === 'fox') return <Ellipse cx={120} cy={104} rx={25} ry={19} fill={a.muz} />;
  if (a.variant === 'lion') return <Ellipse cx={120} cy={104} rx={23} ry={17} fill={a.light} opacity={0.7} />;
  return null;
}
function headFront(a: Art) {
  if (a.variant === 'unicorn') return <Path d="M142 58 q22 16 16 48 q12-32 -6-52 Z" fill={a.mane} />;
  return null;
}
function nose(a: Art) {
  switch (a.variant) {
    case 'koala':
      return (
        <>
          <Ellipse cx={120} cy={98} rx={10} ry={12} fill="#43434b" />
          <Ellipse cx={116} cy={93} rx={2.6} ry={3.4} fill="#fff" opacity={0.2} />
        </>
      );
    case 'gorilla':
      return (
        <>
          <Ellipse cx={113} cy={99} rx={3.6} ry={5} fill="#33383f" />
          <Ellipse cx={127} cy={99} rx={3.6} ry={5} fill="#33383f" />
        </>
      );
    case 'dragon':
      return (
        <>
          <Ellipse cx={113} cy={96} rx={2.6} ry={3.6} fill="#2c4a34" />
          <Ellipse cx={127} cy={96} rx={2.6} ry={3.6} fill="#2c4a34" />
        </>
      );
    default:
      return <Path d="M114 96 q6 5 12 0 q-6 7 -12 0" fill="#43434b" />;
  }
}
