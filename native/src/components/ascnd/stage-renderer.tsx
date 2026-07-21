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
import Svg, { Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { MascotFigure } from '@/components/ascnd/mascot-figure';
import stageCfg from '@/config/stage/stage.json';
import stageThemes from '@/config/stage/stage-theme.json';
import { triggerMascotAction } from '@/hooks/use-mascot-emotion';
import type { MascotMood } from '@/hooks/use-mascot';
import type { MascotDef } from '@/lib/mascots';

/**
 * The mascot Stage — a code-drawn showcase, no room / furniture. A themeable
 * gradient sky, a glowing platform, a pulsing aura and rising particles put
 * all the attention on the buddy (which runs the Emotion Engine). Everything
 * here is SVG + Reanimated, so new skins are data, not new art.
 *
 * Skin comes from stage-theme.json (`themeKey`); layout from stage.json.
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
  /** Rank colour tints the aura/spotlight on top of the theme. */
  accent?: string;
  /** Today's energy 0..1 — brightens aura + particles. */
  energy?: number;
  celebrateSignal?: number;
  flexSignal?: number;
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
}: Props) {
  const theme = THEMES.themes[themeKey ?? THEMES.default] ?? THEMES.themes[THEMES.default];
  const acc = accent ?? theme.aura;
  const e = Math.max(0, Math.min(1, energy));
  const [sw, setSw] = useState(Dimensions.get('window').width - 32);
  const onLayout = (ev: LayoutChangeEvent) => setSw(ev.nativeEvent.layout.width);

  // buddy body language
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
    settle.value = withSequence(
      withTiming(1.03, { duration: 180 }),
      withSpring(1, { stiffness: 180, damping: 14 }),
    );
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
    opacity: (0.35 + aura.value * 0.3) * (0.6 + e * 0.4),
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

  return (
    <View style={styles.scene} onLayout={onLayout}>
      {/* ── static backdrop: sky, spotlight, platform ── */}
      <Svg width={sw} height={H} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={theme.bg[0]} />
            <Stop offset="55%" stopColor={theme.bg[1]} />
            <Stop offset="100%" stopColor={theme.bg[2]} />
          </LinearGradient>
          <RadialGradient id="glowTL" cx="18%" cy="12%" r="55%">
            <Stop offset="0%" stopColor={theme.spot} stopOpacity={0.22} />
            <Stop offset="100%" stopColor={theme.spot} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="pool" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={acc} stopOpacity={0.5} />
            <Stop offset="100%" stopColor={acc} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={sw} height={H} fill="url(#sky)" />
        <Rect x={0} y={0} width={sw} height={H} fill="url(#glowTL)" />
        {/* spotlight beam from above */}
        <Path
          d={`M ${sw * (0.5 - sp.topW / 2)} ${sp.top * H} L ${sw * (0.5 + sp.topW / 2)} ${sp.top * H} L ${sw * (0.5 + sp.bottomW / 2)} ${sp.bottom * H} L ${sw * (0.5 - sp.bottomW / 2)} ${sp.bottom * H} Z`}
          fill={theme.spot}
          opacity={0.06 + e * 0.05}
        />
        {/* floor glow pool */}
        <Ellipse cx={sw * 0.5} cy={pf.cy * H} rx={sw * (pf.rx + 0.06)} ry={pf.ry * H * 2.2} fill="url(#pool)" opacity={0.5 + e * 0.3} />
        {/* platform disc */}
        <Ellipse cx={sw * 0.5} cy={pf.cy * H} rx={sw * pf.rx} ry={pf.ry * H} fill={theme.platform} />
        <Ellipse cx={sw * 0.5} cy={pf.cy * H} rx={sw * pf.rx} ry={pf.ry * H} fill="none" stroke={theme.rim} strokeWidth={2} opacity={0.9} />
        <Ellipse cx={sw * 0.5} cy={pf.cy * H - pf.ry * H * 0.35} rx={sw * pf.rx * 0.82} ry={pf.ry * H * 0.5} fill={theme.spot} opacity={0.1} />
      </Svg>

      {/* ── pulsing aura behind the buddy ── */}
      <Animated.View style={[StyleSheet.absoluteFill, auraStyle]} pointerEvents="none">
        <Svg width={sw} height={H}>
          <Defs>
            <RadialGradient id="aura" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={acc} stopOpacity={0.55} />
              <Stop offset="55%" stopColor={acc} stopOpacity={0.18} />
              <Stop offset="100%" stopColor={acc} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={sw * 0.5} cy={au.cy * H} rx={sw * au.rx} ry={au.ry * H} fill="url(#aura)" />
        </Svg>
      </Animated.View>

      {/* ── rising particles ── */}
      {Array.from({ length: STAGE.particles.count }).map((_, i) => (
        <Particle key={i} sw={sw} color={theme.spot} energy={e} idx={i} />
      ))}

      {/* ── the buddy ── */}
      <View
        style={{
          position: 'absolute',
          left: STAGE.mascot.x * sw - size / 2,
          bottom: STAGE.mascot.bottom * H,
          width: size,
          alignItems: 'center',
        }}
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
            <MascotFigure mascot={mascot} size={size} mood={mood} level={level} equippedOutfits={equippedOutfits} />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

// ─── a single rising light mote ───────────────────────────────────────
function Particle({ sw, color, energy, idx }: { sw: number; color: string; energy: number; idx: number }) {
  const t = useSharedValue(0);
  // deterministic-ish spread from the index so particles don't clump
  const x = ((idx * 61) % 100) / 100;
  const size = 3 + ((idx * 37) % 5);
  const dur = 5200 + ((idx * 53) % 3200);
  const delay = (idx * 400) % 4000;
  const drift = ((idx % 2 === 0 ? 1 : -1) * (6 + (idx % 4) * 3));

  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: dur, easing: Easing.linear }), -1, false));
  }, [t, dur, delay]);

  const style = useAnimatedStyle(() => {
    const p = t.value;
    const op = p < 0.12 ? (p / 0.12) * 0.7 : p > 0.85 ? ((1 - p) / 0.15) * 0.7 : 0.7;
    return {
      opacity: op * (0.5 + energy * 0.5),
      transform: [{ translateY: -p * H * 0.72 }, { translateX: Math.sin(p * Math.PI * 2) * drift }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          bottom: H * 0.16,
          left: x * (sw - 12) + 6,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  scene: {
    height: H,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#0b0d13',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  zzz: { position: 'absolute', bottom: '100%', right: -6, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  zzzBig: { fontSize: 19, fontWeight: '800', color: '#dfe6f5', fontStyle: 'italic' },
  zzzMid: { fontSize: 14, fontWeight: '800', color: '#b7c2d6', fontStyle: 'italic', marginBottom: 8 },
  zzzSmall: { fontSize: 10, fontWeight: '800', color: '#8b97ad', fontStyle: 'italic', marginBottom: 16 },
});
