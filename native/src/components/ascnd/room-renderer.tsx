import { Image, type ImageStyle } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Dimensions,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
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
import { BACKDROPS, ITEM_ART, SHOP_TO_SLOT, type SlotKey } from '@/config/room/room-assets';
import sceneCfg from '@/config/room/scene.json';
import themeCfg from '@/config/room/theme.json';
import userRoom from '@/config/room/user_room.json';
import { colors } from '@/constants/ascnd';
import { triggerMascotAction } from '@/hooks/use-mascot-emotion';
import type { MascotMood } from '@/hooks/use-mascot';
import type { MascotDef } from '@/lib/mascots';

/**
 * Data-driven room renderer.
 *
 *   scene.json      → positions   (where every slot/decor sits + z order)
 *   theme.json      → skin        (backdrop art keys + palette + lighting)
 *   user_room.json  → the player   (theme + placed items, live-overridable)
 *   room-assets.ts  → art registry (require()d sources + measured aspects)
 *
 * The renderer resolves those into absolutely-positioned, z-sorted layers.
 * All layout is width-relative (measured via onLayout) so the diorama
 * scales across screens; the buddy runs the Emotion Engine and the scene
 * keeps its reward nod, tired lean + zzz, and energy-driven spotlight.
 */

type Anchor = 'floor' | 'wall' | 'ceiling';
interface Slot {
  z: number;
  anchor: Anchor;
  x: number;
  w: number;
  bottom?: number;
  top?: number;
}
interface Decor {
  z: number;
  x: number;
  top?: number;
  bottom?: number;
  w?: number;
  h?: number;
  size?: number;
}
interface Scene {
  canvas: { height: number; floorHeight: number };
  spotlight: {
    z: number;
    beamTop: number;
    beamBottom: number;
    beamWidthTop: number;
    beamWidthBottom: number;
    poolCy: number;
    poolRx: number;
    poolRy: number;
  };
  decor: { neon: Decor; workout: Decor; progress: Decor; podium: Decor };
  slots: Record<string, Slot>;
}
interface Theme {
  wall: string;
  floor: string;
  accent: string;
  beamOpacity: number;
  poolOpacity: number;
  podiumFill: string;
  podiumBorder: string;
}

const SCENE = sceneCfg as unknown as Scene;
const THEMES = themeCfg as unknown as { default: string; themes: Record<string, Theme> };
const H = SCENE.canvas.height;
const FLOOR_H = SCENE.canvas.floorHeight * H;

interface Props {
  mascot: MascotDef;
  /** Shop keys the player has placed. Defaults to user_room.json. */
  owned?: Set<string>;
  /** Theme key. Defaults to user_room.json / theme.json default. */
  themeKey?: string;
  equippedOutfits?: Set<string>;
  mood?: MascotMood;
  level?: number;
  /** Rank colour overrides the theme accent for the spotlight. */
  accent?: string;
  /** Today's energy 0..1 — brightens the spotlight. */
  energy?: number;
  celebrateSignal?: number;
  flexSignal?: number;
}

export function RoomRenderer({
  mascot,
  owned,
  themeKey,
  equippedOutfits,
  mood = 'neutral',
  level = 1,
  accent,
  energy = 0.5,
  celebrateSignal = 0,
  flexSignal = 0,
}: Props) {
  const placed = owned ?? new Set<string>(userRoom.placed);
  const theme = THEMES.themes[themeKey ?? userRoom.theme] ?? THEMES.themes[THEMES.default];
  const acc = accent ?? theme.accent;
  const e = Math.max(0, Math.min(1, energy));

  const [sw, setSw] = useState(Dimensions.get('window').width - 32);
  const onLayout = (ev: LayoutChangeEvent) => setSw(ev.nativeEvent.layout.width);

  // ── buddy body language (reward nod, tired lean, floating zzz) ──
  const nod = useSharedValue(0);
  const settle = useSharedValue(1);
  const droop = useSharedValue(0);
  const zzz = useSharedValue(0);
  const tired = mood === 'tired';
  const levelScale = Math.min(1 + (level - 1) * 0.012, 1.1);

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
      withTiming(1.02, { duration: 180 }),
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
  const zzzStyle = useAnimatedStyle(() => ({
    opacity: zzz.value < 0.15 ? zzz.value * 4 : Math.max(0, 1 - (zzz.value - 0.15) / 0.85) * 0.7,
    transform: [{ translateY: -zzz.value * 22 }],
  }));

  // ── absolute box for a slot: bottom edge on the floor / top for wall ──
  const boxFor = (slot: Slot, aspect: number): ViewStyle => {
    const width = slot.w * sw;
    const base: ViewStyle = { position: 'absolute', width, height: width * aspect, left: slot.x * sw - width / 2 };
    if (slot.anchor === 'floor') base.bottom = (slot.bottom ?? 0) * H;
    else base.top = (slot.top ?? 0) * H;
    return base;
  };

  // ── build z-sorted layers ──
  const layers: { z: number; node: ReactNode }[] = [];
  // Each layer is wrapped in a full-scene View by the final map, so nodes
  // just position themselves relative to the scene. key is only for clarity.
  const push = (z: number, _key: string, node: ReactNode) => layers.push({ z, node });

  // backdrop
  layers.push({
    z: -2,
    node: <Image key="wall" source={BACKDROPS[theme.wall]} style={StyleSheet.absoluteFill} contentFit="cover" />,
  });
  layers.push({
    z: -1,
    node: (
      <Image
        key="floor"
        source={BACKDROPS[theme.floor]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: FLOOR_H }}
        contentFit="cover"
      />
    ),
  });

  // spotlight
  const sp = SCENE.spotlight;
  push(
    sp.z,
    'spotlight',
    <Svg width={sw} height={H}>
      <Path
        d={`M ${sw * (0.5 - sp.beamWidthTop / 2)} ${sp.beamTop * H} L ${sw * (0.5 + sp.beamWidthTop / 2)} ${sp.beamTop * H} L ${sw * (0.5 + sp.beamWidthBottom / 2)} ${sp.beamBottom * H} L ${sw * (0.5 - sp.beamWidthBottom / 2)} ${sp.beamBottom * H} Z`}
        fill={acc}
        opacity={theme.beamOpacity * (0.4 + e)}
      />
      <Ellipse cx={sw * 0.5} cy={sp.poolCy * H} rx={sw * sp.poolRx} ry={sp.poolRy * H} fill={acc} opacity={theme.poolOpacity * (0.4 + e)} />
    </Svg>,
  );

  // decor: neon, cards, podium
  const d = SCENE.decor;
  push(
    d.neon.z,
    'neon',
    <Text style={[styles.neon, { left: d.neon.x * sw, top: (d.neon.top ?? 0) * H, fontSize: d.neon.size ?? 24 }]}>ASCND</Text>,
  );
  push(d.workout.z, 'workout', <WallCard style={{ left: d.workout.x * sw, top: (d.workout.top ?? 0) * H, width: (d.workout.w ?? 0.19) * sw }} label="WORKOUT" kind="bars" />);
  push(d.progress.z, 'progress', <WallCard style={{ left: d.progress.x * sw, top: (d.progress.top ?? 0) * H, width: (d.progress.w ?? 0.19) * sw }} label="PROGRESS" kind="trend" />);
  push(
    d.podium.z,
    'podium',
    <>
      <View
        style={{
          position: 'absolute',
          left: d.podium.x * sw - ((d.podium.w ?? 0.5) * sw) / 2,
          width: (d.podium.w ?? 0.5) * sw,
          height: (d.podium.h ?? 0.11) * H,
          bottom: (d.podium.bottom ?? 0.02) * H,
          borderRadius: 999,
          backgroundColor: theme.podiumFill,
          borderWidth: 1,
          borderColor: theme.podiumBorder,
        }}
      />
      {placed.has('yoga_mat') && (
        <View
          style={{
            position: 'absolute',
            left: d.podium.x * sw - ((d.podium.w ?? 0.5) * sw * 0.8) / 2,
            width: (d.podium.w ?? 0.5) * sw * 0.8,
            height: (d.podium.h ?? 0.11) * H * 0.6,
            bottom: (d.podium.bottom ?? 0.02) * H + 4,
            borderRadius: 999,
            backgroundColor: colors.metricPurple,
            opacity: 0.32,
          }}
        />
      )}
    </>,
  );

  // slots: statscreen is always-on decor; gym slots gate on placement
  const slotVisible = (key: string): boolean => {
    if (key === 'statscreen' || key === 'mascot') return true;
    return placed.has(shopKeyFor(key as SlotKey));
  };
  (Object.keys(SCENE.slots) as string[]).forEach((key) => {
    const slot = SCENE.slots[key];
    if (key === 'mascot' || !slotVisible(key)) return;
    const art = ITEM_ART[key as SlotKey];
    const box = boxFor(slot, art.aspect);
    if (art.render === 'image' && art.source) {
      push(slot.z, key, <Image source={art.source} style={box as ImageStyle} contentFit="contain" />);
    } else {
      push(slot.z, key, <VectorGear name={key as SlotKey} style={box} />);
    }
  });

  // mascot slot (with its own body-language wrapper)
  const ms = SCENE.slots.mascot;
  const size = Math.round(ms.w * sw);
  push(
    ms.z,
    'mascot',
    <View style={{ position: 'absolute', left: ms.x * sw - size / 2, bottom: (ms.bottom ?? 0.03) * H, width: size, alignItems: 'center' }}>
      {tired && (
        <Animated.View style={[styles.zzz, zzzStyle]} pointerEvents="none">
          <Text style={styles.zzzBig}>z</Text>
          <Text style={styles.zzzMid}>z</Text>
          <Text style={styles.zzzSmall}>z</Text>
        </Animated.View>
      )}
      <Pressable onPress={poke} hitSlop={10}>
        <Animated.View style={charStyle}>
          <MascotFigure mascot={mascot} size={size} mood={mood} level={level} equippedOutfits={equippedOutfits} />
        </Animated.View>
      </Pressable>
    </View>,
  );

  layers.sort((a, b) => a.z - b.z);

  return (
    <View style={styles.scene} onLayout={onLayout}>
      {layers.map((l, i) => (
        <View key={i} style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {l.node}
        </View>
      ))}
    </View>
  );
}

/** Reverse SHOP_TO_SLOT: which shop key places this slot. */
function shopKeyFor(slot: SlotKey): string {
  const hit = Object.entries(SHOP_TO_SLOT).find(([, s]) => s === slot);
  return hit ? hit[0] : slot;
}

// ─── Wall UI cards ─────────────────────────────────────────────────────
function WallCard({ style, label, kind }: { style: ViewStyle; label: string; kind: 'bars' | 'trend' }) {
  return (
    <View style={[styles.card, style]}>
      <Text style={styles.cardLabel}>{label}</Text>
      {kind === 'bars' ? (
        <View style={styles.cardBars}>
          {[0.4, 0.65, 1].map((h, i) => (
            <View key={i} style={{ width: 5, height: 14 * h, borderRadius: 1.5, backgroundColor: i === 2 ? colors.metricOrange : 'rgba(140,150,170,0.7)' }} />
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

// ─── Vector gear (drawn pieces for shop items without photo art) ───────
function VectorGear({ name, style }: { name: SlotKey; style: ViewStyle }) {
  if (name === 'mirror') {
    return (
      <Svg style={style} viewBox="0 0 100 240">
        <Rect x={6} y={4} width={88} height={232} rx={12} fill="#1b2029" stroke="rgba(255,255,255,0.18)" strokeWidth={2.5} />
        <Line x1={26} y1={30} x2={64} y2={150} stroke="rgba(255,255,255,0.09)" strokeWidth={12} />
        <Line x1={48} y1={22} x2={80} y2={120} stroke="rgba(255,255,255,0.05)" strokeWidth={7} />
      </Svg>
    );
  }
  if (name === 'kettlebell') {
    return (
      <Svg style={style} viewBox="0 0 100 105">
        <Ellipse cx={50} cy={99} rx={34} ry={5} fill="rgba(0,0,0,0.35)" />
        <Path d="M 30 46 a 20 20 0 0 1 40 0" stroke="#3a3f4c" strokeWidth={11} fill="none" />
        <Circle cx={50} cy={68} r={28} fill="#22262e" stroke={colors.metricOrange} strokeWidth={3} />
        <Ellipse cx={50} cy={70} rx={12} ry={9} fill={colors.metricOrange} />
        <Ellipse cx={40} cy={58} rx={7} ry={9} fill="rgba(255,255,255,0.09)" />
      </Svg>
    );
  }
  if (name === 'barbell') {
    return (
      <Svg style={style} viewBox="0 0 200 84">
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
  // treadmill
  return (
    <Svg style={style} viewBox="0 0 160 115">
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
    height: H,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#0b0d13',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  neon: {
    position: 'absolute',
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
  zzz: { position: 'absolute', bottom: '100%', right: -6, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  zzzBig: { fontSize: 19, fontWeight: '800', color: '#8b93a4', fontStyle: 'italic' },
  zzzMid: { fontSize: 14, fontWeight: '800', color: '#6b7280', fontStyle: 'italic', marginBottom: 8 },
  zzzSmall: { fontSize: 10, fontWeight: '800', color: '#4a4f5c', fontStyle: 'italic', marginBottom: 16 },
});
