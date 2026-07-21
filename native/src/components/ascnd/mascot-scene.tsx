import { Image } from 'expo-image';
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
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';

import { MascotFigure } from '@/components/ascnd/mascot-figure';
import { triggerMascotAction } from '@/hooks/use-mascot-emotion';
import { colors } from '@/constants/ascnd';
import type { MascotMood } from '@/hooks/use-mascot';
import type { MascotDef } from '@/lib/mascots';

/**
 * The mascot's gym room — a photoreal diorama. A dark neon backdrop
 * (scene-wall + scene-floor images) with the buddy centred on a lit
 * podium; purchased gear appears around the room using pre-rendered,
 * background-removed prop art, with a few simpler pieces (mirror,
 * kettlebell, barbell, treadmill) still drawn as vector so every shop
 * item has a home. Layout follows the ASCND room reference: weights on
 * the left, bench + plant on the right, heavy bag overhead, STATS panel
 * on the wall.
 *
 * The buddy runs the full Emotion Engine (wave/curl/sleep/celebrate) via
 * MascotFigure; this scene adds the room's body language — a soft reward
 * nod, a tired forward-lean + floating zzz, and the rank spotlight that
 * brightens with the day's logged energy. Tap the buddy for a wave.
 */

const SCENE_H = 340;
const FLOOR_H = 0.5 * SCENE_H; // floor image height (bottom), carries the neon junction

// Pre-rendered, background-removed prop art + its aspect (height / width).
const R = {
  wall: require('@/assets/room/scene-wall.webp'),
  floor: require('@/assets/room/scene-floor.webp'),
  bench: require('@/assets/room/prop-bench.webp'),
  heavybag: require('@/assets/room/prop-heavybag.webp'),
  plant: require('@/assets/room/prop-plant.webp'),
  rack: require('@/assets/room/prop-rack.webp'),
  statscreen: require('@/assets/room/prop-statscreen.webp'),
};
const ASPECT = { bench: 0.981, heavybag: 3.641, plant: 1.291, rack: 0.662, statscreen: 0.681 };

interface Props {
  mascot: MascotDef;
  ownedGym: Set<string>;
  equippedOutfits: Set<string>;
  celebrateSignal: number;
  flexSignal?: number;
  mood?: MascotMood;
  level?: number;
  /** Rank colour — tints the floor spotlight so higher ranks feel richer */
  accent?: string;
  /** Today's energy 0..1 — the room's spotlight brightens as you log */
  energy?: number;
}

export function MascotScene({
  mascot,
  ownedGym,
  equippedOutfits,
  celebrateSignal,
  flexSignal = 0,
  mood = 'neutral',
  level = 1,
  accent = '#8b93a4',
  energy = 0.5,
}: Props) {
  const e = Math.max(0, Math.min(1, energy));
  const [sw, setSw] = useState(Dimensions.get('window').width - 32);
  const onLayout = (ev: LayoutChangeEvent) => setSw(ev.nativeEvent.layout.width);

  const nod = useSharedValue(0);
  const settle = useSharedValue(1);
  const droop = useSharedValue(0);
  const zzz = useSharedValue(0);
  const tired = mood === 'tired';
  const levelScale = Math.min(1 + (level - 1) * 0.012, 1.1);

  useEffect(() => {
    droop.value = withSpring(tired ? 8 : 0, { stiffness: 120, damping: 15 });
    if (tired) {
      zzz.value = withRepeat(withTiming(1, { duration: 2800, easing: Easing.out(Easing.quad) }), -1);
    } else {
      zzz.value = 0;
    }
  }, [tired, droop, zzz]);

  const acknowledge = () => {
    nod.value = withSequence(
      withTiming(6, { duration: 200, easing: Easing.out(Easing.quad) }),
      withSpring(0, { stiffness: 160, damping: 14 }),
    );
    settle.value = withSequence(
      withTiming(1.02, { duration: 180 }),
      withSpring(1, { stiffness: 180, damping: 14 }),
    );
  };

  useEffect(() => {
    if (celebrateSignal === 0) return;
    acknowledge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrateSignal]);
  useEffect(() => {
    if (flexSignal === 0) return;
    acknowledge();
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
  const zzzStyle = useAnimatedStyle(() => ({
    opacity: zzz.value < 0.15 ? zzz.value * 4 : Math.max(0, 1 - (zzz.value - 0.15) / 0.85) * 0.7,
    transform: [{ translateY: -zzz.value * 22 }],
  }));

  // Absolute box for a floor-standing prop: bottom edge sits on the floor line.
  const prop = (cx: number, w: number, aspect: number, bottom: number) => {
    const width = w * sw;
    return {
      position: 'absolute' as const,
      width,
      height: width * aspect,
      left: cx * sw - width / 2,
      bottom: bottom * SCENE_H,
    };
  };

  const charSize = Math.round(0.32 * sw);

  return (
    <View style={styles.scene} onLayout={onLayout}>
      {/* ── photoreal backdrop ── */}
      <Image source={R.wall} style={StyleSheet.absoluteFill} contentFit="cover" />
      <Image
        source={R.floor}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: FLOOR_H }}
        contentFit="cover"
      />

      {/* ── rank spotlight: soft beam + floor pool, brightening with energy ── */}
      <Svg
        width={sw}
        height={SCENE_H}
        style={StyleSheet.absoluteFill}
        pointerEvents="none">
        <Path
          d={`M ${sw * 0.4} 0 L ${sw * 0.6} 0 L ${sw * 0.66} ${SCENE_H * 0.72} L ${sw * 0.34} ${SCENE_H * 0.72} Z`}
          fill={accent}
          opacity={0.02 + e * 0.05}
        />
        <Ellipse
          cx={sw * 0.5}
          cy={SCENE_H * 0.95}
          rx={sw * 0.28}
          ry={SCENE_H * 0.07}
          fill={accent}
          opacity={0.06 + e * 0.16}
        />
      </Svg>

      {/* ── ambient room identity (always present) ── */}
      <Text style={styles.neon}>ASCND</Text>
      <WallCard style={{ top: SCENE_H * 0.17, left: sw * 0.25, width: sw * 0.19 }} label="WORKOUT" kind="bars" />
      <WallCard style={{ top: SCENE_H * 0.33, left: sw * 0.25, width: sw * 0.19 }} label="PROGRESS" kind="trend" />
      <Image
        source={R.statscreen}
        style={{ position: 'absolute', right: sw * 0.02, top: SCENE_H * 0.12, width: sw * 0.26, height: sw * 0.26 * ASPECT.statscreen }}
        contentFit="contain"
      />
      {/* podium under the buddy */}
      <View
        style={{
          position: 'absolute',
          left: sw * 0.25,
          width: sw * 0.5,
          height: SCENE_H * 0.11,
          bottom: SCENE_H * 0.02,
          borderRadius: 999,
          backgroundColor: 'rgba(30,34,44,0.85)',
          borderWidth: 1,
          borderColor: 'rgba(80,120,180,0.28)',
        }}
      />
      {ownedGym.has('yoga_mat') && (
        <View
          style={{
            position: 'absolute',
            left: sw * 0.3,
            width: sw * 0.4,
            height: SCENE_H * 0.07,
            bottom: SCENE_H * 0.04,
            borderRadius: 999,
            backgroundColor: colors.metricPurple,
            opacity: 0.32,
          }}
        />
      )}

      {/* ── gear behind / around the buddy (gated by ownership) ── */}
      {ownedGym.has('punching_bag') && (
        <Image
          source={R.heavybag}
          style={{ position: 'absolute', top: -SCENE_H * 0.02, left: sw * 0.5 - sw * 0.065, width: sw * 0.13, height: sw * 0.13 * ASPECT.heavybag }}
          contentFit="contain"
        />
      )}
      {ownedGym.has('mirror') && <Mirror w={sw * 0.12} left={sw * 0.02} bottom={SCENE_H * 0.28} />}
      {ownedGym.has('dumbbell_rack') && <Image source={R.rack} style={prop(0.18, 0.28, ASPECT.rack, 0.3)} contentFit="contain" />}
      {ownedGym.has('bench') && <Image source={R.bench} style={prop(0.82, 0.3, ASPECT.bench, 0.19)} contentFit="contain" />}
      {ownedGym.has('plant') && <Image source={R.plant} style={prop(0.95, 0.13, ASPECT.plant, 0.3)} contentFit="contain" />}
      {ownedGym.has('treadmill') && <Treadmill w={sw * 0.22} left={sw * 0.6} bottom={SCENE_H * 0.32} />}

      {/* ── character on the podium ── */}
      <View style={styles.charWrap} pointerEvents="box-none">
        {tired && (
          <Animated.View style={[styles.zzz, zzzStyle]} pointerEvents="none">
            <Text style={styles.zzzBig}>z</Text>
            <Text style={styles.zzzMid}>z</Text>
            <Text style={styles.zzzSmall}>z</Text>
          </Animated.View>
        )}
        <Pressable onPress={poke} hitSlop={10}>
          <Animated.View style={[styles.char, charStyle]}>
            <MascotFigure
              mascot={mascot}
              size={charSize}
              mood={mood}
              level={level}
              equippedOutfits={equippedOutfits}
            />
          </Animated.View>
        </Pressable>
      </View>

      {/* ── gear in front of the buddy ── */}
      {ownedGym.has('kettlebell') && <Kettlebell w={sw * 0.12} left={sw * 0.07} bottom={SCENE_H * 0.05} />}
      {ownedGym.has('barbell') && <Barbell w={sw * 0.22} left={sw * 0.78} bottom={SCENE_H * 0.05} />}
    </View>
  );
}

// ─── Wall UI cards (WORKOUT / PROGRESS) ────────────────────────────────
function WallCard({
  style,
  label,
  kind,
}: {
  style: object;
  label: string;
  kind: 'bars' | 'trend';
}) {
  return (
    <View style={[styles.card, style]}>
      <Text style={styles.cardLabel}>{label}</Text>
      {kind === 'bars' ? (
        <View style={styles.cardBars}>
          {[0.4, 0.65, 1].map((h, i) => (
            <View
              key={i}
              style={{
                width: 5,
                height: 14 * h,
                borderRadius: 1.5,
                backgroundColor: i === 2 ? colors.metricOrange : 'rgba(140,150,170,0.7)',
              }}
            />
          ))}
        </View>
      ) : (
        <Svg width={44} height={16} style={{ marginTop: 4 }}>
          <Path d="M 2 13 L 14 5 L 24 9 L 42 2" stroke={colors.readinessGreen} strokeWidth={2} fill="none" />
          <Path d="M 42 2 L 35 3 L 39 8 Z" fill={colors.readinessGreen} />
        </Svg>
      )}
    </View>
  );
}

// ─── Vector gear (self-contained SVG boxes, positioned absolutely) ─────
function box(w: number, left: number, bottom: number, aspect: number) {
  return { position: 'absolute' as const, left, bottom, width: w, height: w * aspect };
}

function Mirror({ w, left, bottom }: { w: number; left: number; bottom: number }) {
  return (
    <Svg style={box(w, left, bottom, 2.4)} viewBox="0 0 100 240">
      <Rect x={6} y={4} width={88} height={232} rx={12} fill="#1b2029" stroke="rgba(255,255,255,0.18)" strokeWidth={2.5} />
      <Line x1={26} y1={30} x2={64} y2={150} stroke="rgba(255,255,255,0.09)" strokeWidth={12} />
      <Line x1={48} y1={22} x2={80} y2={120} stroke="rgba(255,255,255,0.05)" strokeWidth={7} />
    </Svg>
  );
}

function Kettlebell({ w, left, bottom }: { w: number; left: number; bottom: number }) {
  return (
    <Svg style={box(w, left, bottom, 1.05)} viewBox="0 0 100 105">
      <Ellipse cx={50} cy={99} rx={34} ry={5} fill="rgba(0,0,0,0.35)" />
      <Path d="M 30 46 a 20 20 0 0 1 40 0" stroke="#3a3f4c" strokeWidth={11} fill="none" />
      <Circle cx={50} cy={68} r={28} fill="#22262e" stroke={colors.metricOrange} strokeWidth={3} />
      <Ellipse cx={50} cy={70} rx={12} ry={9} fill={colors.metricOrange} />
      <Ellipse cx={40} cy={58} rx={7} ry={9} fill="rgba(255,255,255,0.09)" />
    </Svg>
  );
}

function Barbell({ w, left, bottom }: { w: number; left: number; bottom: number }) {
  return (
    <Svg style={box(w, left, bottom, 0.42)} viewBox="0 0 200 84">
      <Ellipse cx={100} cy={78} rx={92} ry={6} fill="rgba(0,0,0,0.32)" />
      <Rect x={20} y={38} width={160} height={7} rx={3.5} fill="#9aa2b2" />
      <Circle cx={44} cy={41} r={26} fill="#22262e" stroke="#c8384a" strokeWidth={7} />
      <Circle cx={44} cy={41} r={6} fill="#0d0d12" />
      <Circle cx={156} cy={41} r={26} fill="#22262e" stroke="#c8384a" strokeWidth={7} />
      <Circle cx={156} cy={41} r={6} fill="#0d0d12" />
      <Rect x={74} y={32} width={9} height={18} rx={4} fill="#2c303a" />
      <Rect x={117} y={32} width={9} height={18} rx={4} fill="#2c303a" />
    </Svg>
  );
}

function Treadmill({ w, left, bottom }: { w: number; left: number; bottom: number }) {
  return (
    <Svg style={box(w, left, bottom, 0.72)} viewBox="0 0 160 115">
      <Ellipse cx={82} cy={108} rx={62} ry={7} fill="rgba(0,0,0,0.3)" />
      <Path d="M 20 96 L 132 78 L 140 96 L 28 112 Z" fill="#22262e" stroke="#3a3f4c" strokeWidth={2} />
      <Line x1={40} y1={60} x2={60} y2={94} stroke="#3a3f4c" strokeWidth={6} />
      <Rect x={22} y={40} width={40} height={22} rx={6} fill="#101318" stroke={colors.metricCyan} strokeWidth={2} />
      <Line x1={30} y1={51} x2={54} y2={51} stroke={colors.metricCyan} strokeWidth={2.4} opacity={0.85} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  scene: {
    height: SCENE_H,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#0b0d13',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  charWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: SCENE_H * 0.03,
  },
  char: { alignItems: 'center', justifyContent: 'center' },
  neon: {
    position: 'absolute',
    top: SCENE_H * 0.05,
    left: 16,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 4,
    color: '#5eb4ff',
    textShadowColor: 'rgba(94,180,255,0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  card: {
    position: 'absolute',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(18,22,30,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(70,82,104,0.7)',
  },
  cardLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, color: '#c3cad9' },
  cardBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, marginTop: 5, height: 14 },
  zzz: {
    position: 'absolute',
    bottom: SCENE_H * 0.6,
    marginLeft: 104,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  zzzBig: { fontSize: 19, fontWeight: '800', color: '#8b93a4', fontStyle: 'italic' },
  zzzMid: { fontSize: 14, fontWeight: '800', color: '#6b7280', fontStyle: 'italic', marginBottom: 8 },
  zzzSmall: { fontSize: 10, fontWeight: '800', color: '#4a4f5c', fontStyle: 'italic', marginBottom: 16 },
});
