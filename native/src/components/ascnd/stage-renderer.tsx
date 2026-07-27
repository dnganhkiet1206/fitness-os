import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import {
  Dimensions,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { MascotBuddy } from '@/components/ascnd/mascot-buddy';
import stageCfg from '@/config/stage/stage.json';
import stageThemes from '@/config/stage/stage-theme.json';
import { DEFAULT_ACTIVE_ASSETS } from '@/config/stage/stage-assets';
import { GROUND_LINE, resolveLayout, type Placement } from '@/lib/stage-layout';
import { triggerMascotAction, useMascotEmotion } from '@/hooks/use-mascot-emotion';
import type { MascotMood } from '@/hooks/use-mascot';
import type { MascotDef } from '@/lib/mascots';

/**
 * The mascot Stage — a code-drawn gym room. A themeable back wall, a stylised
 * dumbbell rack / rolled mat / exercise ball / plant / window set the scene, a
 * glowing neon ring frames the buddy, and a round glowing podium puts it centre
 * stage. Three floating cards overlay the level + XP (top-left), the streak and
 * the daily-quest count (top-right). All SVG + Reanimated, so new skins are
 * data (stage-theme.json) and layout is stage.json.
 */

interface StageTheme {
  bg: [string, string, string];
  aura: string;
  spot: string;
  platform: string;
  rim: string;
}
const STAGE = stageCfg as unknown as {
  canvas: { height: number };
  hero: { x: number; bottom: number; width: number };
  podium: { cy: number; rx: number; ry: number; depth: number };
  ring: { cy: number; r: number };
  aura: { cy: number; rx: number; ry: number };
  spotlight: { topW: number; bottomW: number; top: number; bottom: number };
  particles: { count: number; minSize: number; maxSize: number };
};
const THEMES = stageThemes as unknown as { default: string; themes: Record<string, StageTheme> };
const H = STAGE.canvas.height;

interface Props {
  mascot: MascotDef;
  themeKey?: string;
  equippedOutfits?: Set<string>;
  mood?: MascotMood;
  level?: number;
  accent?: string;
  energy?: number;
  celebrateSignal?: number;
  flexSignal?: number;
  /** XP into the current level + the level size (top-left card) */
  xp?: number;
  xpMax?: number;
  /** streak days (top-right card) */
  streak?: number;
  /** daily-quest progress (top-right card) */
  questCount?: number;
  questTotal?: number;
  /** localized card labels */
  streakLabel?: string;
  questLabel?: string;
  /** px height of the floating header — the top cards clear it */
  topInset?: number;
  /** false pauses the buddy and the stage's own loops (screen not focused) */
  animated?: boolean;
}

export function StageRenderer({
  mascot,
  themeKey,
  equippedOutfits,
  mood = 'neutral',
  level = 1,
  accent,
  energy = 0.5,
  celebrateSignal = 0,
  flexSignal = 0,
  animated = true,
}: Props) {
  const theme = THEMES.themes[themeKey ?? THEMES.default] ?? THEMES.themes[THEMES.default];
  const acc = accent ?? theme.aura;
  const e = Math.max(0, Math.min(1, energy));
  const emotion = useMascotEmotion();
  const [sw, setSw] = useState(Dimensions.get('window').width - 32);
  const onLayout = (ev: LayoutChangeEvent) => setSw(ev.nativeEvent.layout.width);

  const nod = useSharedValue(0);
  const settle = useSharedValue(1);
  const droop = useSharedValue(0);
  const zzz = useSharedValue(0);
  const aura = useSharedValue(0);
  const tired = mood === 'tired';
  const levelScale = Math.min(1 + (level - 1) * 0.012, 1.1);

  useEffect(() => {
    if (!animated) {
      cancelAnimation(aura);
      return;
    }
    aura.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [aura, animated]);
  useEffect(() => {
    droop.value = withSpring(tired ? 8 : 0, { stiffness: 120, damping: 15 });
    zzz.value = tired
      ? withRepeat(withTiming(1, { duration: 2800, easing: Easing.out(Easing.quad) }), -1)
      : 0;
  }, [tired, droop, zzz]);

  const acknowledge = () => {
    nod.value = withSequence(
      withTiming(6, { duration: 200, easing: Easing.out(Easing.quad) }),
      withSpring(0, { stiffness: 160, damping: 14 }),
    );
    settle.value = withSequence(withTiming(1.03, { duration: 180 }), withSpring(1, { stiffness: 180, damping: 14 }));
  };
  useEffect(() => {
    if (celebrateSignal) acknowledge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrateSignal]);
  useEffect(() => {
    if (flexSignal) acknowledge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flexSignal]);

  // Every poke bumps a counter the buddy watches, so the character itself
  // reacts (cheek pop + eyes front) on top of the stage's nod.
  const [pokes, setPokes] = useState(0);
  const poke = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    triggerMascotAction('wave');
    acknowledge();
    setPokes((n) => n + 1);
  };

  const charStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 420 },
      { rotateX: `${nod.value + droop.value}deg` },
      { scale: settle.value * levelScale },
    ],
  }));
  const auraStyle = useAnimatedStyle(() => ({
    opacity: (0.3 + aura.value * 0.28) * (0.6 + e * 0.4),
    transform: [{ scale: 1 + aura.value * 0.06 }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.7 + aura.value * 0.3,
  }));
  const zzzStyle = useAnimatedStyle(() => ({
    opacity: zzz.value < 0.15 ? zzz.value * 4 : Math.max(0, 1 - (zzz.value - 0.15) / 0.85) * 0.7,
    transform: [{ translateY: -zzz.value * 22 }],
  }));

  const sp = STAGE.spotlight;
  const pf = STAGE.podium;
  const au = STAGE.aura;
  const rg = STAGE.ring;
  const size = Math.round(STAGE.hero.width * sw);

  // ── round podium geometry ──
  const cx = 0.5 * sw;
  const cy = pf.cy * H;
  const rx = pf.rx * sw;
  const ry = pf.ry * H;
  const depth = pf.depth * H;
  const sidePath =
    `M ${cx - rx} ${cy} L ${cx - rx} ${cy + depth} ` +
    `A ${rx} ${ry} 0 0 0 ${cx + rx} ${cy + depth} L ${cx + rx} ${cy} ` +
    `A ${rx} ${ry} 0 0 1 ${cx - rx} ${cy} Z`;

  return (
    <View style={styles.scene} onLayout={onLayout}>
      {/* ── back wall + spotlight ── */}
      <Svg width={sw} height={H} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="sky" cx="50%" cy="32%" r="85%">
            <Stop offset="0%" stopColor={theme.bg[0]} />
            <Stop offset="58%" stopColor={theme.bg[1]} />
            <Stop offset="100%" stopColor={theme.bg[2]} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={sw} height={H} fill="url(#sky)" />
        <Path
          d={`M ${sw * (0.5 - sp.topW / 2)} ${sp.top * H} L ${sw * (0.5 + sp.topW / 2)} ${sp.top * H} L ${sw * (0.5 + sp.bottomW / 2)} ${sp.bottom * H} L ${sw * (0.5 - sp.bottomW / 2)} ${sp.bottom * H} Z`}
          fill={theme.spot}
          opacity={0.05 + e * 0.05}
        />
      </Svg>

      {/* ── stylised gym room props ── */}
      <RoomBackdrop sw={sw} theme={theme} />

      {/* ── vignette: darkens the four corners so the buddy is the focal point ── */}
      <Svg width={sw} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="vig" cx="50%" cy="42%" r="72%">
            <Stop offset="55%" stopColor="#05060c" stopOpacity={0} />
            <Stop offset="100%" stopColor="#05060c" stopOpacity={0.5} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={sw} height={H} fill="url(#vig)" />
      </Svg>

      {/* ── glowing neon ring behind the buddy ── */}
      <Animated.View style={[StyleSheet.absoluteFill, ringStyle]} pointerEvents="none">
        <Svg width={sw} height={H}>
          <Circle cx={cx} cy={rg.cy * H} r={rg.r * H} fill="none" stroke={acc} strokeWidth={16} opacity={0.14} />
          <Circle cx={cx} cy={rg.cy * H} r={rg.r * H} fill="none" stroke={acc} strokeWidth={5} opacity={0.5} />
          <Circle cx={cx} cy={rg.cy * H} r={rg.r * H} fill="none" stroke="#eaf0ff" strokeWidth={1.6} opacity={0.85} />
        </Svg>
      </Animated.View>

      {/* ── pulsing aura ── */}
      <Animated.View style={[StyleSheet.absoluteFill, auraStyle]} pointerEvents="none">
        <Svg width={sw} height={H}>
          <Defs>
            <RadialGradient id="aura" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={acc} stopOpacity={0.45} />
              <Stop offset="55%" stopColor={acc} stopOpacity={0.14} />
              <Stop offset="100%" stopColor={acc} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={cx} cy={au.cy * H} rx={sw * au.rx} ry={au.ry * H} fill="url(#aura)" />
        </Svg>
      </Animated.View>

      {/* ── round podium ── */}
      <Svg width={sw} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="floorpool" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={theme.rim} stopOpacity={0.4} />
            <Stop offset="100%" stopColor={theme.rim} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={cx} cy={cy + depth * 0.5} rx={rx * 1.12} ry={ry * 2.3} fill="url(#floorpool)" opacity={0.5 + e * 0.35} />
        <Path d={sidePath} fill={theme.platform} />
        <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={theme.platform} />
        <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={theme.spot} opacity={0.08} />
        <Ellipse cx={cx} cy={cy} rx={rx * 0.8} ry={ry * 0.8} fill="none" stroke={theme.rim} strokeWidth={1.5} opacity={0.4} />
        {/* glowing rim (blurred base + crisp line) */}
        <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={theme.rim} strokeWidth={7} opacity={0.26} />
        <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={theme.rim} strokeWidth={2.5} opacity={0.9} />
      </Svg>

      {/* ── rising particles ── */}
      {Array.from({ length: STAGE.particles.count }).map((_, i) => (
        <Particle key={i} sw={sw} color={theme.spot} energy={e} idx={i} animated={animated} />
      ))}

      {/* ── the buddy ── */}
      <View
        style={{ position: 'absolute', left: STAGE.hero.x * sw - size / 2, bottom: STAGE.hero.bottom * H, width: size, alignItems: 'center' }}
        pointerEvents="box-none">
        {tired && (
          <Animated.View style={[styles.zzz, zzzStyle]} pointerEvents="none">
            <Text style={styles.zzzBig}>z</Text>
            <Text style={styles.zzzMid}>z</Text>
            <Text style={styles.zzzSmall}>z</Text>
          </Animated.View>
        )}
        <Pressable onPress={poke} hitSlop={12}>
          <Animated.View style={charStyle}>
            <MascotBuddy mascot={mascot} emotion={emotion} size={size} mood={mood} level={level} accent={acc} equippedOutfits={equippedOutfits} pokeSignal={pokes} animated={animated} />
          </Animated.View>
        </Pressable>
      </View>

      {/* ── edge fades: the hero dissolves into the page on all four sides and
             up into the floating header (clean, edge-less) ── */}
      <Svg width={sw} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="fadeV" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={PAGE} stopOpacity={0.66} />
            <Stop offset="0.1" stopColor={PAGE} stopOpacity={0.24} />
            <Stop offset="0.19" stopColor={PAGE} stopOpacity={0} />
            <Stop offset="0.74" stopColor={PAGE} stopOpacity={0} />
            <Stop offset="0.9" stopColor={PAGE} stopOpacity={0.74} />
            <Stop offset="1" stopColor={PAGE} stopOpacity={1} />
          </LinearGradient>
          <LinearGradient id="fadeH" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={PAGE} stopOpacity={0.95} />
            <Stop offset="0.09" stopColor={PAGE} stopOpacity={0} />
            <Stop offset="0.91" stopColor={PAGE} stopOpacity={0} />
            <Stop offset="1" stopColor={PAGE} stopOpacity={0.95} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={sw} height={H} fill="url(#fadeH)" />
        <Rect x={0} y={0} width={sw} height={H} fill="url(#fadeV)" />
      </Svg>

    </View>
  );
}

// ─── The gym room, drawn from the Layout Engine's placements. The engine
//     (src/lib/stage-layout.ts) owns WHERE each asset goes (zone, occupancy,
//     priority, exclusive group); each art fn below only knows HOW to draw
//     itself around an anchor. A Shop unlock registers an asset and it appears
//     here automatically — no layout edits. Governed by
//     HERO_STAGE_LAYOUT_SPEC.md (v2.0). ──
function RoomBackdrop({ sw, theme }: { sw: number; theme: StageTheme }) {
  const frame = '#3a4165';
  const ground = GROUND_LINE * H;
  const placements = resolveLayout(DEFAULT_ACTIVE_ASSETS);
  return (
    <Svg width={sw} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="win" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#ffd9a8" />
          <Stop offset="45%" stopColor="#e79a78" />
          <Stop offset="100%" stopColor="#5b5286" />
        </LinearGradient>
        <RadialGradient id="ball" cx="38%" cy="30%" r="80%">
          <Stop offset="0%" stopColor="#8fa9ff" />
          <Stop offset="60%" stopColor="#4a5fb0" />
          <Stop offset="100%" stopColor="#2b3570" />
        </RadialGradient>
      </Defs>

      {/* floor band + ground line */}
      <Rect x={0} y={ground} width={sw} height={H - ground} fill="#0b0d16" opacity={0.5} />
      <Line x1={0} y1={ground} x2={sw} y2={ground} stroke={theme.rim} strokeWidth={1} opacity={0.12} />

      {placements.map((p) => (
        <StageAssetArt key={p.id} p={p} sw={sw} frame={frame} />
      ))}
    </Svg>
  );
}

/** Draw one placed asset, anchored at the engine-computed (cx, cy) + scale. */
function StageAssetArt({ p, sw, frame }: { p: Placement; sw: number; frame: string }) {
  const ax = p.cx * sw;
  const baseY = p.cy * H; // standing baseline (feet of the prop)
  const s = p.scale;

  switch (p.id) {
    case 'dumbbell_rack': {
      const rackW = 0.2 * sw * s;
      const rackH = 0.22 * H * s;
      const top = baseY - rackH;
      const left = ax - rackW / 2;
      const right = ax + rackW / 2;
      const tierYs = [top + 0.42 * rackH, top + 0.74 * rackH];
      const cols = [-0.28, 0, 0.28].map((f) => ax + f * rackW);
      return (
        <G opacity={0.66}>
          <Path
            d={`M ${left + 0.06 * rackW} ${baseY} L ${left + 0.16 * rackW} ${top} L ${right - 0.16 * rackW} ${top} L ${right - 0.06 * rackW} ${baseY}`}
            fill="none"
            stroke={frame}
            strokeWidth={4}
            strokeLinejoin="round"
          />
          {tierYs.map((ty, r) =>
            cols.map((cxp, c) => (
              <G key={`${r}-${c}`}>
                <Rect x={cxp - 9} y={ty - 3} width={18} height={6} rx={3} fill="#566089" />
                <Circle cx={cxp - 10} cy={ty} r={5} fill={frame} />
                <Circle cx={cxp + 10} cy={ty} r={5} fill={frame} />
              </G>
            )),
          )}
        </G>
      );
    }
    case 'bench': {
      const bw = 0.2 * sw * s;
      const bh = 0.09 * H * s;
      const top = baseY - bh;
      return (
        <G opacity={0.66}>
          <Rect x={ax - bw / 2} y={top} width={bw} height={0.028 * H * s} rx={5} fill="#4a5175" />
          <Line x1={ax - bw / 2 + 6} y1={top + 0.03 * H * s} x2={ax - bw / 2 + 6} y2={baseY} stroke={frame} strokeWidth={4} />
          <Line x1={ax + bw / 2 - 6} y1={top + 0.03 * H * s} x2={ax + bw / 2 - 6} y2={baseY} stroke={frame} strokeWidth={4} />
        </G>
      );
    }
    case 'medicine_ball': {
      const r = 0.06 * H * s;
      const cy = baseY - r;
      return (
        <G opacity={0.8}>
          <Circle cx={ax} cy={cy} r={r} fill="url(#ball)" />
          <Ellipse cx={ax - r * 0.35} cy={cy - r * 0.4} rx={r * 0.28} ry={r * 0.22} fill="#d7e0ff" opacity={0.3} />
        </G>
      );
    }
    case 'plant': {
      const potHW = 0.045 * sw * s;
      const potH = 0.09 * H * s;
      const potBot = baseY;
      const potTop = potBot - potH;
      const leafH = 0.15 * H * s;
      return (
        <G opacity={0.82}>
          {[
            [-0.5, 0.62],
            [-0.2, 0.82],
            [0.08, 0.85],
            [0.36, 0.66],
          ].map(([dx, hf], i) => {
            const lh = hf * leafH;
            return (
              <Ellipse
                key={i}
                cx={ax + dx * potHW}
                cy={potTop - lh}
                rx={0.3 * potHW}
                ry={lh}
                fill={i % 2 === 0 ? '#3f7d5a' : '#4c9169'}
              />
            );
          })}
          <Path d={`M ${ax - potHW} ${potTop} L ${ax + potHW} ${potTop} L ${ax + potHW * 0.8} ${potBot} L ${ax - potHW * 0.8} ${potBot} Z`} fill="#8a8397" />
          <Rect x={ax - potHW * 1.1} y={potTop - 0.012 * H * s} width={potHW * 2.2} height={0.014 * H * s} rx={3} fill="#9a93a8" />
        </G>
      );
    }
    case 'yoga_mat': {
      const w = 0.14 * sw * s;
      const h = 0.045 * H * s;
      const top = baseY - h;
      return (
        <G opacity={0.7}>
          <Rect x={ax - w / 2} y={top} width={w} height={h} rx={h / 2} fill="#6a5aa8" />
          <Ellipse cx={ax - w / 2} cy={top + h / 2} rx={0.019 * sw * s} ry={h / 2} fill="#7d6ac2" />
          <Ellipse cx={ax - w / 2} cy={top + h / 2} rx={0.009 * sw * s} ry={h / 4} fill="#4b3f7a" />
        </G>
      );
    }
    case 'window': {
      if (!p.rect) return null;
      const wx = p.rect.x * sw;
      const wy = p.rect.y * H;
      const wW = p.rect.w * sw;
      const wH = p.rect.h * H;
      return (
        <G opacity={0.5}>
          <Rect x={wx} y={wy} width={wW} height={wH} rx={10} fill="url(#win)" />
          <Rect x={wx} y={wy} width={wW} height={wH} rx={10} fill="none" stroke="#0b0d16" strokeWidth={4} />
          <Line x1={wx + wW / 2} y1={wy} x2={wx + wW / 2} y2={wy + wH} stroke="#0b0d16" strokeWidth={3} />
          <Line x1={wx} y1={wy + wH / 2} x2={wx + wW} y2={wy + wH / 2} stroke="#0b0d16" strokeWidth={3} />
        </G>
      );
    }
    default:
      return null;
  }
}

// ─── a single rising light mote ────────────────────────────────────────
function Particle({ sw, color, energy, idx, animated }: { sw: number; color: string; energy: number; idx: number; animated: boolean }) {
  const t = useSharedValue(0);
  const x = ((idx * 61) % 100) / 100;
  const size = 3 + ((idx * 37) % 5);
  const dur = 5200 + ((idx * 53) % 3200);
  const delay = (idx * 400) % 4000;
  const drift = (idx % 2 === 0 ? 1 : -1) * (6 + (idx % 4) * 3);
  useEffect(() => {
    if (!animated) {
      cancelAnimation(t);
      return;
    }
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: dur, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(t);
  }, [t, dur, delay, animated]);
  const style = useAnimatedStyle(() => {
    const p = t.value;
    const op = p < 0.12 ? (p / 0.12) * 0.7 : p > 0.85 ? ((1 - p) / 0.15) * 0.7 : 0.7;
    return { opacity: op * (0.5 + energy * 0.5), transform: [{ translateY: -p * H * 0.72 }, { translateX: Math.sin(p * Math.PI * 2) * drift }] };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', bottom: H * 0.2, left: x * (sw - 12) + 6, width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]}
    />
  );
}

const CARD = 'rgba(15,18,32,0.78)';
const BORDER = 'rgba(255,255,255,0.10)';
const PAGE = '#070708'; // app background — the hero fades into it at the bottom
const styles = StyleSheet.create({
  // Full-bleed, frameless hero: no border, no rounded corners — every edge
  // dissolves into the page (see the four-side fade overlay), and the top
  // blends up under the floating header.
  scene: {
    height: H,
    overflow: 'hidden',
    backgroundColor: PAGE,
  },

  lvCard: { position: 'absolute', left: 12, top: 12, minWidth: 148, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  lvTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  lvNum: { fontSize: 16, fontWeight: '800', color: '#fff' },
  xpTrack: { height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 8, overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 4 },
  xpText: { fontSize: 10, fontWeight: '700', color: '#c3cad9', marginTop: 5, textAlign: 'right', fontVariant: ['tabular-nums'] },

  rightCol: { position: 'absolute', right: 12, top: 12, alignItems: 'flex-end', gap: 8 },
  miniCard: { minWidth: 92, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9 },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniNum: { fontSize: 20, fontWeight: '800', color: '#fff', fontVariant: ['tabular-nums'] },
  miniSub: { fontSize: 10, fontWeight: '700', color: '#aeb6c8', marginTop: 2 },
  questCard: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8 },
  questNum: { fontSize: 15, fontWeight: '800', color: '#fff', fontVariant: ['tabular-nums'] },

  zzz: { position: 'absolute', bottom: '100%', right: -6, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  zzzBig: { fontSize: 19, fontWeight: '800', color: '#dfe6f5', fontStyle: 'italic' },
  zzzMid: { fontSize: 14, fontWeight: '800', color: '#b7c2d6', fontStyle: 'italic', marginBottom: 8 },
  zzzSmall: { fontSize: 10, fontWeight: '800', color: '#8b97ad', fontStyle: 'italic', marginBottom: 16 },
});
