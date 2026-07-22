import * as Haptics from 'expo-haptics';
import { Flame, Star, Target } from 'lucide-react-native';
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
type Range = [number, number];
const STAGE = stageCfg as unknown as {
  canvas: { height: number };
  hero: { x: number; bottom: number; width: number };
  podium: { cy: number; rx: number; ry: number; depth: number };
  ring: { cy: number; r: number };
  aura: { cy: number; rx: number; ry: number };
  spotlight: { topW: number; bottomW: number; top: number; bottom: number };
  particles: { count: number; minSize: number; maxSize: number };
  zones: {
    leftEquipment: { x: Range; y: Range };
    rightDecoration: { x: Range; y: Range };
    background: { groundLine: number; window: { x: Range; y: Range } };
    floorProp: { yMin: number };
  };
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
  xp,
  xpMax,
  streak = 0,
  questCount,
  questTotal,
  streakLabel = 'Day streak',
  questLabel = 'Quests',
  topInset = 0,
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
    aura.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [aura]);
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

  const poke = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    triggerMascotAction('wave');
    acknowledge();
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

  const xpPct = xp != null && xpMax ? Math.max(4, Math.min(100, (xp / xpMax) * 100)) : 0;

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
        <Particle key={i} sw={sw} color={theme.spot} energy={e} idx={i} />
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
            <MascotBuddy mascot={mascot} emotion={emotion} size={size} mood={mood} level={level} accent={acc} equippedOutfits={equippedOutfits} />
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

      {/* ── level card (top-left) ── */}
      {xp != null && xpMax ? (
        <View style={[styles.lvCard, { top: topInset + 4 }]} pointerEvents="none">
          <View style={styles.lvTop}>
            <Star size={17} color="#ffcf3a" fill="#ffcf3a" />
            <Text style={styles.lvNum}>Lv. {level}</Text>
          </View>
          <View style={styles.xpTrack}>
            <View style={[styles.xpFill, { width: `${xpPct}%`, backgroundColor: acc }]} />
          </View>
          <Text style={styles.xpText}>
            {xp} / {xpMax} XP
          </Text>
        </View>
      ) : null}

      {/* ── streak + quest cards (top-right) ── */}
      <View style={[styles.rightCol, { top: topInset + 4 }]} pointerEvents="none">
        <View style={styles.miniCard}>
          <View style={styles.miniRow}>
            <Flame size={17} color="#ff7a3c" fill="#ff7a3c" />
            <Text style={styles.miniNum}>{streak}</Text>
          </View>
          <Text style={styles.miniSub}>{streakLabel}</Text>
        </View>
        {questCount != null && questTotal != null ? (
          <View style={[styles.miniCard, styles.questCard]}>
            <Target size={16} color={acc} />
            <View>
              <Text style={styles.miniSub}>{questLabel}</Text>
              <Text style={styles.questNum}>
                {questCount} / {questTotal}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ─── stylised gym room silhouettes, positioned strictly inside the zones
//     defined by HERO_STAGE_LAYOUT_SPEC.md. Every asset derives its geometry
//     from its zone, so a Shop swap only changes the art, never the layout. ──
function RoomBackdrop({ sw, theme }: { sw: number; theme: StageTheme }) {
  const frame = '#3a4165';
  const Z = STAGE.zones;

  // Background — ground line + window
  const ground = Z.background.groundLine * H;
  const win = Z.background.window;
  const wx = win.x[0] * sw;
  const wy = win.y[0] * H;
  const wW = (win.x[1] - win.x[0]) * sw;
  const wH = (win.y[1] - win.y[0]) * H;

  // Left equipment zone — one dumbbell rack that fills the zone
  const le = Z.leftEquipment;
  const lx0 = le.x[0] * sw;
  const lx1 = le.x[1] * sw;
  const ly0 = le.y[0] * H;
  const ly1 = le.y[1] * H;
  const lW = lx1 - lx0;
  const lH = ly1 - ly0;
  const rackTop = ly0 + 0.05 * lH;
  const tierYs = [ly0 + 0.38 * lH, ly0 + 0.66 * lH];
  const rackCols = [0.26, 0.5, 0.74].map((f) => lx0 + f * lW);

  // Right decoration zone — medicine ball (left) + potted plant (right)
  const rd = Z.rightDecoration;
  const rx0 = rd.x[0] * sw;
  const rx1 = rd.x[1] * sw;
  const ry0 = rd.y[0] * H;
  const ry1 = rd.y[1] * H;
  const rW = rx1 - rx0;
  const rH = ry1 - ry0;
  const ballCx = rx0 + 0.3 * rW;
  const ballCy = ry1 - 0.42 * rH;
  const ballR = 0.36 * rW;
  const plantCx = rx0 + 0.76 * rW;
  const potBot = ry1 - 0.04 * rH;
  const potTop = potBot - 0.2 * rH;
  const potHW = 0.14 * rW;

  // Floor prop zone (y >= yMin) — a rolled yoga mat on the left
  const fpY = Math.max(Z.floorProp.yMin + 0.03, 0.66) * H;

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

      {/* BACKGROUND ZONE — window (kept dim, never brighter than the hero) */}
      <G opacity={0.5}>
        <Rect x={wx} y={wy} width={wW} height={wH} rx={10} fill="url(#win)" />
        <Rect x={wx} y={wy} width={wW} height={wH} rx={10} fill="none" stroke="#0b0d16" strokeWidth={4} />
        <Line x1={wx + wW / 2} y1={wy} x2={wx + wW / 2} y2={wy + wH} stroke="#0b0d16" strokeWidth={3} />
        <Line x1={wx} y1={wy + wH / 2} x2={wx + wW} y2={wy + wH / 2} stroke="#0b0d16" strokeWidth={3} />
      </G>

      {/* LEFT EQUIPMENT ZONE — dumbbell rack */}
      <G opacity={0.66}>
        <Path
          d={`M ${lx0 + 0.06 * lW} ${ly1} L ${lx0 + 0.16 * lW} ${rackTop} L ${lx1 - 0.06 * lW} ${rackTop} L ${lx1 - 0.02 * lW} ${ly1}`}
          fill="none"
          stroke={frame}
          strokeWidth={4}
          strokeLinejoin="round"
        />
        {tierYs.map((ty, r) =>
          rackCols.map((cxp, c) => (
            <G key={`${r}-${c}`}>
              <Rect x={cxp - 9} y={ty - 3} width={18} height={6} rx={3} fill="#566089" />
              <Circle cx={cxp - 10} cy={ty} r={5} fill={frame} />
              <Circle cx={cxp + 10} cy={ty} r={5} fill={frame} />
            </G>
          )),
        )}
      </G>

      {/* RIGHT DECORATION ZONE — medicine ball + potted plant (secondary) */}
      <Circle cx={ballCx} cy={ballCy} r={ballR} fill="url(#ball)" opacity={0.78} />
      <Ellipse cx={ballCx - ballR * 0.35} cy={ballCy - ballR * 0.4} rx={ballR * 0.28} ry={ballR * 0.22} fill="#d7e0ff" opacity={0.3} />
      <G opacity={0.8}>
        {[
          [-0.5, 0.62],
          [-0.2, 0.78],
          [0.08, 0.8],
          [0.36, 0.68],
        ].map(([dx, hf], i) => {
          const lh = hf * (potTop - ry0) * 0.9;
          return (
            <Ellipse
              key={i}
              cx={plantCx + dx * potHW}
              cy={potTop - lh}
              rx={0.28 * potHW}
              ry={lh}
              fill={i % 2 === 0 ? '#3f7d5a' : '#4c9169'}
            />
          );
        })}
        <Path d={`M ${plantCx - potHW} ${potTop} L ${plantCx + potHW} ${potTop} L ${plantCx + potHW * 0.8} ${potBot} L ${plantCx - potHW * 0.8} ${potBot} Z`} fill="#8a8397" />
        <Rect x={plantCx - potHW * 1.1} y={potTop - 0.02 * rH} width={potHW * 2.2} height={0.024 * rH} rx={3} fill="#9a93a8" />
      </G>

      {/* FLOOR PROP ZONE — rolled yoga mat */}
      <G opacity={0.7}>
        <Rect x={0.08 * sw} y={fpY} width={0.14 * sw} height={0.045 * H} rx={0.022 * H} fill="#6a5aa8" />
        <Ellipse cx={0.085 * sw} cy={fpY + 0.0225 * H} rx={0.019 * sw} ry={0.023 * H} fill="#7d6ac2" />
        <Ellipse cx={0.085 * sw} cy={fpY + 0.0225 * H} rx={0.009 * sw} ry={0.011 * H} fill="#4b3f7a" />
      </G>
    </Svg>
  );
}

// ─── a single rising light mote ────────────────────────────────────────
function Particle({ sw, color, energy, idx }: { sw: number; color: string; energy: number; idx: number }) {
  const t = useSharedValue(0);
  const x = ((idx * 61) % 100) / 100;
  const size = 3 + ((idx * 37) % 5);
  const dur = 5200 + ((idx * 53) % 3200);
  const delay = (idx * 400) % 4000;
  const drift = (idx % 2 === 0 ? 1 : -1) * (6 + (idx % 4) * 3);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: dur, easing: Easing.linear }), -1, false));
  }, [t, dur, delay]);
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
