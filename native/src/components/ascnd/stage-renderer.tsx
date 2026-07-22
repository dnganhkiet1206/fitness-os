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
const STAGE = stageCfg as unknown as {
  canvas: { height: number };
  aura: { cy: number; rx: number; ry: number };
  ring: { cy: number; r: number };
  spotlight: { topW: number; bottomW: number; top: number; bottom: number };
  platform: { cy: number; rx: number; ry: number; depth: number };
  mascot: { x: number; w: number; bottom: number };
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
  const pf = STAGE.platform;
  const au = STAGE.aura;
  const rg = STAGE.ring;
  const size = Math.round(STAGE.mascot.w * sw);

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
        style={{ position: 'absolute', left: STAGE.mascot.x * sw - size / 2, bottom: STAGE.mascot.bottom * H, width: size, alignItems: 'center' }}
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

      {/* ── level card (top-left) ── */}
      {xp != null && xpMax ? (
        <View style={styles.lvCard} pointerEvents="none">
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
      <View style={styles.rightCol} pointerEvents="none">
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

// ─── stylised gym room silhouettes (subtle backdrop) ───────────────────
function RoomBackdrop({ sw, theme }: { sw: number; theme: StageTheme }) {
  const frame = '#3a4165';
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

      {/* floor band */}
      <Rect x={0} y={0.58 * H} width={sw} height={0.42 * H} fill="#0b0d16" opacity={0.5} />
      <Line x1={0} y1={0.58 * H} x2={sw} y2={0.58 * H} stroke={theme.rim} strokeWidth={1} opacity={0.12} />

      {/* window (top-right, inset from the edge) */}
      <G opacity={0.55}>
        <Rect x={0.67 * sw} y={0.08 * H} width={0.23 * sw} height={0.26 * H} rx={10} fill="url(#win)" />
        <Rect x={0.67 * sw} y={0.08 * H} width={0.23 * sw} height={0.26 * H} rx={10} fill="none" stroke="#0b0d16" strokeWidth={4} />
        <Line x1={0.785 * sw} y1={0.08 * H} x2={0.785 * sw} y2={0.34 * H} stroke="#0b0d16" strokeWidth={3} />
        <Line x1={0.67 * sw} y1={0.21 * H} x2={0.9 * sw} y2={0.21 * H} stroke="#0b0d16" strokeWidth={3} />
      </G>

      {/* dumbbell rack (left, inset) */}
      <G opacity={0.68}>
        <Path
          d={`M ${0.08 * sw} ${0.6 * H} L ${0.11 * sw} ${0.4 * H} L ${0.28 * sw} ${0.4 * H} L ${0.26 * sw} ${0.6 * H}`}
          fill="none"
          stroke={frame}
          strokeWidth={4}
          strokeLinejoin="round"
        />
        <Line x1={0.098 * sw} y1={0.49 * H} x2={0.272 * sw} y2={0.49 * H} stroke={frame} strokeWidth={4} />
        {[0.46, 0.565].map((ty, r) =>
          [0.13, 0.18, 0.23].map((tx, c) => (
            <G key={`${r}-${c}`}>
              <Rect x={tx * sw - 9} y={ty * H - 3} width={18} height={6} rx={3} fill="#566089" />
              <Circle cx={tx * sw - 10} cy={ty * H} r={5} fill={frame} />
              <Circle cx={tx * sw + 10} cy={ty * H} r={5} fill={frame} />
            </G>
          )),
        )}
      </G>

      {/* rolled yoga mat (bottom-left, inset) */}
      <G opacity={0.7}>
        <Rect x={0.08 * sw} y={0.67 * H} width={0.14 * sw} height={0.048 * H} rx={0.024 * H} fill="#6a5aa8" />
        <Ellipse cx={0.085 * sw} cy={0.694 * H} rx={0.019 * sw} ry={0.024 * H} fill="#7d6ac2" />
        <Ellipse cx={0.085 * sw} cy={0.694 * H} rx={0.009 * sw} ry={0.011 * H} fill="#4b3f7a" />
      </G>

      {/* exercise ball (right, inset) */}
      <Circle cx={0.79 * sw} cy={0.6 * H} r={0.07 * H} fill="url(#ball)" opacity={0.8} />
      <Ellipse cx={0.76 * sw} cy={0.575 * H} rx={0.02 * sw} ry={0.018 * H} fill="#d7e0ff" opacity={0.35} />

      {/* potted plant (right, inset off the edge) */}
      <G opacity={0.8}>
        {[
          [-0.028, 0.05],
          [-0.012, 0.062],
          [0.004, 0.064],
          [0.02, 0.055],
        ].map(([dx, h], i) => (
          <Ellipse
            key={i}
            cx={0.88 * sw + dx * sw}
            cy={0.57 * H - h * H}
            rx={0.014 * sw}
            ry={h * H}
            fill={i % 2 === 0 ? '#3f7d5a' : '#4c9169'}
          />
        ))}
        <Path d={`M ${0.84 * sw} ${0.59 * H} L ${0.92 * sw} ${0.59 * H} L ${0.905 * sw} ${0.67 * H} L ${0.855 * sw} ${0.67 * H} Z`} fill="#8a8397" />
        <Rect x={0.833 * sw} y={0.575 * H} width={0.094 * sw} height={0.022 * H} rx={3} fill="#9a93a8" />
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
const styles = StyleSheet.create({
  scene: { height: H, borderRadius: 22, overflow: 'hidden', backgroundColor: '#0b0d13', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)' },

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
