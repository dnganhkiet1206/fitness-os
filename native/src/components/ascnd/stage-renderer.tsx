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
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { MascotBuddy } from '@/components/ascnd/mascot-3d';
import stageCfg from '@/config/stage/stage.json';
import stageThemes from '@/config/stage/stage-theme.json';
import { triggerMascotAction, useMascotEmotion } from '@/hooks/use-mascot-emotion';
import type { MascotMood } from '@/hooks/use-mascot';
import type { MascotDef } from '@/lib/mascots';

/**
 * The mascot Stage — a code-drawn showcase (no room / furniture). A themeable
 * gradient sky, an octagonal glowing podium with a nameplate, a pulsing aura
 * and rising particles put the buddy centre-stage. Floating cards overlay the
 * RPG stats (left) and the level + XP (right). All SVG + Reanimated, so new
 * skins are data (stage-theme.json); layout is stage.json.
 */

export type StageStatKind = 'health' | 'energy' | 'strength' | 'focus';
export interface StageStat {
  kind: StageStatKind;
  label: string;
  value: number;
  max: number;
  color: string;
}

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
  spotlight: { topW: number; bottomW: number; top: number; bottom: number };
  platform: { cy: number; rx: number; ry: number };
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
  /** nameplate text (buddy name) */
  name?: string;
  /** XP into the current level + the level size, for the top-right card */
  xp?: number;
  xpMax?: number;
  /** RPG stat bars (left panel) */
  stats?: StageStat[];
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
  name,
  xp,
  xpMax,
  stats,
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
  const zzzStyle = useAnimatedStyle(() => ({
    opacity: zzz.value < 0.15 ? zzz.value * 4 : Math.max(0, 1 - (zzz.value - 0.15) / 0.85) * 0.7,
    transform: [{ translateY: -zzz.value * 22 }],
  }));

  const sp = STAGE.spotlight;
  const pf = STAGE.platform;
  const au = STAGE.aura;
  const size = Math.round(STAGE.mascot.w * sw);

  // ── octagon podium geometry ──
  const cx = 0.5 * sw;
  const cy = pf.cy * H;
  const orx = 0.3 * sw;
  const ory = 0.062 * H;
  const depth = 0.11 * H;
  const ang = (i: number) => (Math.PI / 180) * (22.5 + 45 * i);
  const pts = Array.from({ length: 8 }, (_, i) => [cx + orx * Math.cos(ang(i)), cy + ory * Math.sin(ang(i))] as const);
  const topFace = `M ${pts.map((p) => `${p[0]} ${p[1]}`).join(' L ')} Z`;
  const front = [3, 2, 1, 0].map((i) => pts[i]); // left → right along the front rim
  const rimPath = `M ${front.map((p) => `${p[0]} ${p[1]}`).join(' L ')}`;
  const sidePath =
    `${rimPath} ` +
    `L ${front[3][0]} ${front[3][1] + depth} ` +
    `L ${front[2][0]} ${front[2][1] + depth} ` +
    `L ${front[1][0]} ${front[1][1] + depth} ` +
    `L ${front[0][0]} ${front[0][1] + depth} Z`;
  const plateY = (front[1][1] + front[2][1]) / 2 + depth * 0.52;

  return (
    <View style={styles.scene} onLayout={onLayout}>
      {/* ── backdrop: radial sky + spotlight ── */}
      <Svg width={sw} height={H} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="sky" cx="50%" cy="38%" r="80%">
            <Stop offset="0%" stopColor={theme.bg[0]} />
            <Stop offset="58%" stopColor={theme.bg[1]} />
            <Stop offset="100%" stopColor={theme.bg[2]} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={sw} height={H} fill="url(#sky)" />
        <Path
          d={`M ${sw * (0.5 - sp.topW / 2)} ${sp.top * H} L ${sw * (0.5 + sp.topW / 2)} ${sp.top * H} L ${sw * (0.5 + sp.bottomW / 2)} ${sp.bottom * H} L ${sw * (0.5 - sp.bottomW / 2)} ${sp.bottom * H} Z`}
          fill={theme.spot}
          opacity={0.06 + e * 0.05}
        />
      </Svg>

      {/* ── pulsing aura behind the buddy ── */}
      <Animated.View style={[StyleSheet.absoluteFill, auraStyle]} pointerEvents="none">
        <Svg width={sw} height={H}>
          <Defs>
            <RadialGradient id="aura" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={acc} stopOpacity={0.5} />
              <Stop offset="55%" stopColor={acc} stopOpacity={0.16} />
              <Stop offset="100%" stopColor={acc} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={sw * 0.5} cy={au.cy * H} rx={sw * au.rx} ry={au.ry * H} fill="url(#aura)" />
        </Svg>
      </Animated.View>

      {/* ── octagon podium ── */}
      <Svg width={sw} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="floorpool" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={theme.rim} stopOpacity={0.35} />
            <Stop offset="100%" stopColor={theme.rim} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={cx} cy={cy + depth * 0.5} rx={orx * 1.15} ry={ory * 2.4} fill="url(#floorpool)" opacity={0.6 + e * 0.3} />
        <Path d={sidePath} fill={theme.platform} />
        <Path d={topFace} fill={theme.platform} />
        <Path d={topFace} fill={theme.spot} opacity={0.12} />
        {/* gold glow rim (blurred base + crisp line) */}
        <Path d={rimPath} fill="none" stroke={theme.rim} strokeWidth={7} opacity={0.35} />
        <Path d={rimPath} fill="none" stroke={theme.rim} strokeWidth={2.5} />
      </Svg>

      {/* nameplate */}
      {name ? (
        <View style={[styles.plate, { left: cx - 0.17 * sw, width: 0.34 * sw, top: plateY - 13, borderColor: `${theme.rim}88` }]}>
          <Text style={[styles.plateText, { color: theme.spot }]} numberOfLines={1}>
            {name.toUpperCase()}
          </Text>
        </View>
      ) : null}

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

      {/* ── stat panel (left) ── */}
      {stats && stats.length > 0 ? (
        <View style={styles.statPanel} pointerEvents="none">
          {stats.map((s) => (
            <View key={s.kind} style={styles.statRow}>
              <StatIcon kind={s.kind} color={s.color} />
              <Text style={styles.statLabel}>{s.label}</Text>
              <View style={styles.segs}>
                {Array.from({ length: s.max }).map((_, i) => (
                  <View key={i} style={[styles.seg, { backgroundColor: i < s.value ? s.color : 'rgba(255,255,255,0.16)' }]} />
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* ── level card (right) ── */}
      {xp != null && xpMax ? (
        <View style={styles.levelCard} pointerEvents="none">
          <View style={styles.levelTop}>
            <StatIcon kind="star" color="#f2b21e" size={26} />
            <Text style={styles.levelNum}>Lv. {level}</Text>
          </View>
          <View style={styles.xpTrack}>
            <View style={[styles.xpFill, { width: `${Math.max(4, Math.min(100, (xp / xpMax) * 100))}%` }]} />
          </View>
          <Text style={styles.xpText}>
            {xp} / {xpMax} XP
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── small tinted stat icons ───────────────────────────────────────────
function StatIcon({ kind, color, size = 22 }: { kind: StageStatKind | 'star'; color: string; size?: number }) {
  const P = { width: size, height: size, viewBox: '0 0 60 60' } as const;
  if (kind === 'health')
    return (
      <Svg {...P}>
        <Path d="M30 47C13 36 9 27 12 20c2.6-6 10.6-6.6 14-1 3.4-5.6 11.4-5 14 1 3 7-1 16-10 27z" fill={color} />
      </Svg>
    );
  if (kind === 'energy')
    return (
      <Svg {...P}>
        <Path d="M34 8L16 34h11l-5 18 22-28H31l6-16z" fill={color} />
      </Svg>
    );
  if (kind === 'strength')
    return (
      <Svg {...P}>
        <Rect x={8} y={23} width={8} height={14} rx={2} fill={color} />
        <Rect x={44} y={23} width={8} height={14} rx={2} fill={color} />
        <Rect x={15} y={26} width={6} height={8} rx={1.5} fill={color} />
        <Rect x={39} y={26} width={6} height={8} rx={1.5} fill={color} />
        <Rect x={20} y={27} width={20} height={5} rx={2.5} fill={color} />
      </Svg>
    );
  // focus / star
  return (
    <Svg {...P}>
      <Path d="M30 11l5.6 11.3 12.4 1.8-9 8.8 2.1 12.4L30 39.2 16.9 45.1 19 32.7l-9-8.8 12.4-1.8z" fill={color} />
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

const CARD = 'rgba(20,24,38,0.55)';
const BORDER = 'rgba(255,255,255,0.14)';
const styles = StyleSheet.create({
  scene: { height: H, borderRadius: 20, overflow: 'hidden', backgroundColor: '#0b0d13', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)' },
  plate: { position: 'absolute', height: 26, borderRadius: 8, backgroundColor: 'rgba(18,20,30,0.92)', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  plateText: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  statPanel: { position: 'absolute', left: 12, top: H * 0.48, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 9 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
  statLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: '#e7ecf5', width: 60 },
  segs: { flexDirection: 'row', gap: 2.5 },
  seg: { width: 12, height: 9, borderRadius: 2 },
  levelCard: { position: 'absolute', right: 12, top: H * 0.05, width: 150, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  levelTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  levelNum: { fontSize: 17, fontWeight: '800', color: '#fff' },
  xpTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 8, overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 4, backgroundColor: '#f5b418' },
  xpText: { fontSize: 10, fontWeight: '700', color: '#c3cad9', marginTop: 5, textAlign: 'right' },
  zzz: { position: 'absolute', bottom: '100%', right: -6, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  zzzBig: { fontSize: 19, fontWeight: '800', color: '#dfe6f5', fontStyle: 'italic' },
  zzzMid: { fontSize: 14, fontWeight: '800', color: '#b7c2d6', fontStyle: 'italic', marginBottom: 8 },
  zzzSmall: { fontSize: 10, fontWeight: '800', color: '#8b97ad', fontStyle: 'italic', marginBottom: 16 },
});
