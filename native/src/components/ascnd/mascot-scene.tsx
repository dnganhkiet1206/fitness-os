import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { VectorMascot } from '@/components/ascnd/vector-mascot';
import { colors } from '@/constants/ascnd';
import type { MascotDef } from '@/lib/mascots';
import type { MascotMood } from '@/hooks/use-mascot';
import type { ShopItemKey } from '@/lib/mascot-room';

/**
 * The mascot's gym room — everything code-drawn. A layered SVG scene
 * (wall, window, floor) where purchased gym gear appears, with the
 * VectorMascot character (fully vector, no emoji) standing in the
 * middle wearing its purchased outfits. Tap the buddy to play a
 * reaction; bump `celebrateSignal` for the purchase jump, `flexSignal`
 * for the level-up double-bicep flex.
 *
 * Idle life: real blinks and wandering pupils live inside VectorMascot;
 * this scene adds the body language — hover, strolls with hop-steps,
 * and the tired slump (low hover, droop, dim aura, floating zzz) when
 * the day's log is empty. Muscle growth per level is drawn by the rig.
 */

const SCENE_H = 340; // taller stage: viewBox extends upward (y from -50)
const CHAR = 150; // character render width (standing companion is taller)

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
  // Clamp so the lighting math never goes out of range
  const e = Math.max(0, Math.min(1, energy));
  // Quiet, grounded motion. Breathing/blinking live inside VectorMascot;
  // the scene only adds a soft, intentional acknowledgement (a small nod
  // + settle) on reward, and a gentle forward lean when tired. No float,
  // no walk, no spin — the companion stands and rests between sets.
  const nod = useSharedValue(0); // small rotateX acknowledgement
  const settle = useSharedValue(1); // tiny weight-shift scale
  const droop = useSharedValue(0); // forward lean (rotateX) when tired
  const zzz = useSharedValue(0);
  const tired = mood === 'tired';
  // Level growth is subtle — posture/presence, not a size jump
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
    acknowledge();
  };

  const charStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 420 },
      { rotateX: `${nod.value + droop.value}deg` },
      { scale: settle.value * levelScale },
    ],
  }));

  const shadowStyle = useAnimatedStyle(() => ({ opacity: 0.32 }));

  // zzz drift up and fade in a loop while tired
  const zzzStyle = useAnimatedStyle(() => ({
    opacity: zzz.value < 0.15 ? zzz.value * 4 : interpolate(zzz.value, [0.15, 1], [0.7, 0]),
    transform: [{ translateY: -zzz.value * 22 }],
  }));

  return (
    <View style={styles.scene}>
      {/* Room background + owned gym gear (viewBox extends up for the
          taller stage; all gear keeps its floor coordinates) */}
      <Svg width="100%" height={SCENE_H} viewBox={`0 -50 360 ${SCENE_H}`} preserveAspectRatio="xMidYMax slice">
        <Defs>
          {/* Depth cues borrowed from cozy-room games: the wall darkens
              toward the floor, the floor darkens toward the viewer */}
          <LinearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#191922" />
            <Stop offset="70%" stopColor="#111118" />
            <Stop offset="100%" stopColor="#0d0d12" />
          </LinearGradient>
          <LinearGradient id="lowerWall" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#0f0f15" />
            <Stop offset="100%" stopColor="#0b0b10" />
          </LinearGradient>
          <LinearGradient id="floorBase" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#1b1b23" />
            <Stop offset="100%" stopColor="#121218" />
          </LinearGradient>
          <LinearGradient id="floorWood" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#2c2015" />
            <Stop offset="100%" stopColor="#1e150c" />
          </LinearGradient>
        </Defs>
        {/* Two-tone wall — kept minimal for breathing room */}
        <Rect x={0} y={-50} width={360} height={180} fill="url(#wall)" />
        <Rect x={0} y={130} width={360} height={75} fill="url(#lowerWall)" />
        <Line x1={0} y1={130} x2={360} y2={130} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
        {/* Upgrade: LED strip glowing along the ceiling line */}
        {ownedGym.has('wall_led') && (
          <G>
            <Line x1={8} y1={-38} x2={352} y2={-38} stroke={colors.metricPurple} strokeWidth={7} opacity={0.18} />
            <Line x1={8} y1={-38} x2={352} y2={-38} stroke={colors.metricPurple} strokeWidth={2.5} opacity={0.9} />
          </G>
        )}
        {/* Upgrade: motivation frames on the left wall */}
        {ownedGym.has('wall_frames') && (
          <G>
            <Rect x={96} y={76} width={40} height={30} rx={4} fill="#171a22" stroke="rgba(255,255,255,0.16)" strokeWidth={1.4} />
            <Rect x={104} y={88} width={10} height={4} rx={2} fill={colors.metricOrange} />
            <Rect x={118} y={84} width={4} height={12} rx={2} fill="#8b93a4" />
            <Rect x={96} y={112} width={40} height={26} rx={4} fill="#171a22" stroke="rgba(255,255,255,0.16)" strokeWidth={1.4} />
            <Path d="M 102 130 L 112 120 L 120 126 L 130 116" stroke={colors.readinessGreen} strokeWidth={2.4} fill="none" />
          </G>
        )}
        {/* Window with night skyline */}
        <G>
          <Rect x={252} y={26} width={84} height={90} rx={10} fill="#0a0a12" stroke="rgba(255,255,255,0.1)" strokeWidth={1.5} />
          <Circle cx={318} cy={44} r={16} fill="#e8e6d8" opacity={0.12} />
          <Circle cx={318} cy={44} r={9} fill="#e8e6d8" opacity={0.85} />
          <Rect x={262} y={80} width={10} height={36} fill="#1c2340" />
          <Rect x={276} y={66} width={12} height={50} fill="#232b52" />
          <Rect x={292} y={86} width={9} height={30} fill="#1c2340" />
          <Rect x={305} y={72} width={12} height={44} fill="#202a4e" />
          <Rect x={279} y={72} width={2} height={2} fill={colors.readinessYellow} />
          <Rect x={308} y={78} width={2} height={2} fill={colors.metricCyan} />
          <Rect x={296} y={92} width={2} height={2} fill={colors.readinessYellow} />
        </G>
        {/* Floor — pro neon > wooden > default concrete */}
        {ownedGym.has('floor_neon') ? (
          <G>
            <Rect x={0} y={205} width={360} height={85} fill="#0d1017" />
            <Line x1={0} y1={205} x2={360} y2={205} stroke={colors.metricCyan} strokeWidth={2} opacity={0.75} />
            <Line x1={0} y1={205} x2={360} y2={205} stroke={colors.metricCyan} strokeWidth={7} opacity={0.14} />
            {[60, 140, 220, 300].map((x) => (
              <Line key={x} x1={x} y1={210} x2={x - 26} y2={290} stroke="rgba(24,194,220,0.09)" strokeWidth={1.5} />
            ))}
          </G>
        ) : ownedGym.has('floor_wood') ? (
          <G>
            <Rect x={0} y={205} width={360} height={85} fill="url(#floorWood)" />
            <Line x1={0} y1={205} x2={360} y2={205} stroke="rgba(255,214,150,0.16)" strokeWidth={1.5} />
            {[232, 258].map((y) => (
              <Line key={y} x1={0} y1={y} x2={360} y2={y} stroke="rgba(0,0,0,0.32)" strokeWidth={1.4} />
            ))}
            {[90, 200, 300].map((x, i) => (
              <Line key={x} x1={x} y1={205 + i * 2} x2={x - 14} y2={290} stroke="rgba(0,0,0,0.22)" strokeWidth={1.2} />
            ))}
          </G>
        ) : (
          <G>
            {/* Default: rubber gym floor with speckles + tile seams */}
            <Rect x={0} y={205} width={360} height={85} fill="url(#floorBase)" />
            <Line x1={0} y1={205} x2={360} y2={205} stroke="rgba(255,255,255,0.06)" strokeWidth={1.5} />
            {[120, 240].map((x) => (
              <Line key={x} x1={x} y1={205} x2={x - 18} y2={290} stroke="rgba(0,0,0,0.3)" strokeWidth={1.3} />
            ))}
            {[
              [24, 222], [60, 248], [95, 268], [130, 232], [170, 258],
              [205, 240], [245, 270], [288, 236], [322, 258], [344, 226],
              [40, 275], [150, 280], [265, 222], [310, 278], [80, 225],
            ].map(([x, y], i) => (
              <Circle key={i} cx={x} cy={y} r={1.3} fill="rgba(255,255,255,0.05)" />
            ))}
          </G>
        )}
        {/* Skirting board at the wall/floor junction */}
        <Rect x={0} y={200} width={360} height={5} fill="rgba(0,0,0,0.35)" />
        {/* Rank spotlight: a soft beam from above + a floor pool tinted by
            the buddy's rank, both brightening with the day's energy — the
            room literally lights up the more you log. Grounded on the
            floor (not a halo around the body). */}
        <Path d="M 150 -50 L 210 -50 L 238 250 L 122 250 Z" fill={accent} opacity={0.012 + e * 0.03} />
        <Ellipse cx={180} cy={252} rx={118} ry={30} fill="rgba(255,255,255,0.03)" />
        <Ellipse cx={180} cy={254} rx={92} ry={22} fill={accent} opacity={0.045 + e * 0.13} />

        {ownedGym.has('neon_sign') && <NeonSign />}
        {ownedGym.has('mirror') && <Mirror />}
        {ownedGym.has('punching_bag') && <PunchingBag />}
        {ownedGym.has('dumbbell_rack') && <DumbbellRack />}
        {ownedGym.has('plant') && <Plant />}
        {ownedGym.has('bench') && <Bench />}
        {ownedGym.has('yoga_mat') && (
          <Ellipse cx={180} cy={252} rx={64} ry={13} fill={colors.metricPurple} opacity={0.32} />
        )}
        {ownedGym.has('barbell') && <Barbell />}
        {ownedGym.has('kettlebell') && <Kettlebell />}
        {ownedGym.has('treadmill') && <Treadmill />}
      </Svg>

      {/* Character standing on the floor */}
      <View style={styles.charWrap} pointerEvents="box-none">
        <Animated.View style={[styles.shadow, shadowStyle]} />
        {tired && (
          <Animated.View style={[styles.zzz, zzzStyle]} pointerEvents="none">
            <Text style={styles.zzzBig}>z</Text>
            <Text style={styles.zzzMid}>z</Text>
            <Text style={styles.zzzSmall}>z</Text>
          </Animated.View>
        )}
        <Pressable onPress={poke} hitSlop={10}>
          <Animated.View style={[styles.char, charStyle]}>
            <VectorMascot
              mascot={mascot}
              size={CHAR}
              mood={mood}
              level={level}
              equippedOutfits={equippedOutfits}
            />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Muscle arms (drawn in the 120×120 character box) ──────────────────

// ─── Gym gear (SVG groups in scene coordinates, 360×290) ───────────────

function NeonSign() {
  return (
    <G>
      <SvgText x={112} y={8} fontSize={26} fontWeight="bold" fill="none" stroke={colors.metricCyan} strokeWidth={5} opacity={0.25} textAnchor="middle" letterSpacing={6}>
        ASCND
      </SvgText>
      <SvgText x={112} y={8} fontSize={26} fontWeight="bold" fill={colors.metricCyan} textAnchor="middle" letterSpacing={6}>
        ASCND
      </SvgText>
    </G>
  );
}

function Mirror() {
  return (
    <G>
      <Rect x={20} y={64} width={54} height={118} rx={8} fill="#1b2029" stroke="rgba(255,255,255,0.18)" strokeWidth={1.6} />
      <Line x1={32} y1={82} x2={54} y2={166} stroke="rgba(255,255,255,0.08)" strokeWidth={7} />
      <Line x1={44} y1={76} x2={64} y2={152} stroke="rgba(255,255,255,0.05)" strokeWidth={4} />
      {/* ballet-style rail — reads "gym mirror" instantly */}
      <Line x1={20} y1={150} x2={74} y2={150} stroke="#3a3f4c" strokeWidth={3} />
    </G>
  );
}

function DumbbellRack() {
  // A-frame rack with two tiers of colored hex dumbbells
  const TOP: [number, string][] = [
    [44, colors.metricOrange],
    [64, colors.metricCyan],
    [84, colors.metricPurple],
  ];
  const BOTTOM: [number, string][] = [
    [38, colors.readinessGreen],
    [62, colors.readinessYellow],
    [86, colors.metricOrange],
  ];
  return (
    <G>
      <Ellipse cx={63} cy={246} rx={46} ry={5} fill="rgba(0,0,0,0.32)" />
      <Path d="M 24 244 L 40 196 L 46 196 L 32 244 Z" fill="#2c303a" />
      <Path d="M 102 244 L 86 196 L 80 196 L 94 244 Z" fill="#2c303a" />
      <Rect x={30} y={214} width={66} height={6} rx={3} fill="#3a3f4c" />
      <Rect x={24} y={238} width={78} height={6} rx={3} fill="#3a3f4c" />
      {TOP.map(([x, c]) => (
        <G key={x}>
          <Rect x={x - 10} y={208} width={7} height={12} rx={2.5} fill={c} />
          <Rect x={x + 3} y={208} width={7} height={12} rx={2.5} fill={c} />
          <Rect x={x - 4} y={212} width={8} height={3.5} fill="#8b93a4" />
        </G>
      ))}
      {BOTTOM.map(([x, c]) => (
        <G key={x}>
          <Rect x={x - 11} y={232} width={8} height={13} rx={2.5} fill={c} />
          <Rect x={x + 3} y={232} width={8} height={13} rx={2.5} fill={c} />
          <Rect x={x - 4} y={237} width={8} height={3.5} fill="#8b93a4" />
        </G>
      ))}
    </G>
  );
}

function Plant() {
  return (
    <G>
      <Ellipse cx={318} cy={263} rx={20} ry={4.5} fill="rgba(0,0,0,0.32)" />
      <Path d="M 306 236 L 330 236 L 326 262 L 310 262 Z" fill="#7a4a2c" />
      <Path d="M 318 236 C 306 214 300 210 296 202 C 310 206 314 214 318 236" fill={colors.readinessGreen} />
      <Path d="M 318 236 C 330 212 336 208 342 200 C 328 204 322 214 318 236" fill="#188f66" />
      <Path d="M 318 236 C 318 214 318 206 318 196 C 322 208 322 220 318 236" fill={colors.readinessGreen} />
    </G>
  );
}

function Barbell() {
  // Loaded bar with big red bumper plates — the classic gym silhouette
  return (
    <G>
      <Ellipse cx={280} cy={281} rx={56} ry={5} fill="rgba(0,0,0,0.32)" />
      <Rect x={228} y={262} width={104} height={5} rx={2.5} fill="#9aa2b2" />
      <Circle cx={246} cy={264} r={16} fill="#22262e" stroke="#c8384a" strokeWidth={4} />
      <Circle cx={246} cy={264} r={4} fill="#0d0d12" />
      <Circle cx={314} cy={264} r={16} fill="#22262e" stroke="#c8384a" strokeWidth={4} />
      <Circle cx={314} cy={264} r={4} fill="#0d0d12" />
      <Rect x={262} y={258} width={7} height={13} rx={3} fill="#2c303a" />
      <Rect x={291} y={258} width={7} height={13} rx={3} fill="#2c303a" />
    </G>
  );
}

function Kettlebell() {
  return (
    <G>
      <Ellipse cx={32} cy={280} rx={16} ry={4} fill="rgba(0,0,0,0.32)" />
      <Path d="M 23 251 a 9 9 0 0 1 18 0" stroke="#3a3f4c" strokeWidth={5} fill="none" />
      <Circle cx={32} cy={266} r={13} fill="#22262e" stroke={colors.metricOrange} strokeWidth={1.6} />
      <Ellipse cx={28} cy={262} rx={4} ry={5} fill="rgba(255,255,255,0.08)" />
    </G>
  );
}

function Bench() {
  return (
    <G>
      <Ellipse cx={250} cy={247} rx={40} ry={5} fill="rgba(0,0,0,0.3)" />
      <Rect x={214} y={216} width={72} height={11} rx={5.5} fill="#8f2f3c" />
      <Rect x={214} y={219} width={72} height={3} fill="rgba(255,255,255,0.14)" />
      <Rect x={222} y={227} width={7} height={18} rx={2.5} fill="#2c303a" />
      <Rect x={271} y={227} width={7} height={18} rx={2.5} fill="#2c303a" />
      <Rect x={218} y={243} width={64} height={4} rx={2} fill="#22262e" />
    </G>
  );
}

function PunchingBag() {
  return (
    <G>
      <Line x1={228} y1={-50} x2={228} y2={2} stroke="#4a4f5c" strokeWidth={2.5} />
      <Rect x={214} y={2} width={28} height={64} rx={12} fill="#a4293a" />
      <Rect x={214} y={24} width={28} height={7} fill="rgba(0,0,0,0.28)" />
      <Rect x={219} y={6} width={6} height={52} rx={3} fill="rgba(255,255,255,0.12)" />
    </G>
  );
}

function Treadmill() {
  // Front-center of the floor, clear of the rack corner
  return (
    <G>
      <Ellipse cx={142} cy={277} rx={46} ry={5.5} fill="rgba(0,0,0,0.32)" />
      <Path d="M 102 262 L 180 252 L 184 262 L 106 274 Z" fill="#22262e" stroke="#3a3f4c" strokeWidth={1.4} />
      {[124, 142, 160].map((x) => (
        <Line key={x} x1={x} y1={260 - (x - 124) * 0.12} x2={x + 3} y2={268 - (x - 124) * 0.12} stroke="rgba(255,255,255,0.1)" strokeWidth={1.6} />
      ))}
      {/* Console post + glowing display */}
      <Line x1={108} y1={260} x2={118} y2={238} stroke="#3a3f4c" strokeWidth={4} />
      <Rect x={104} y={224} width={26} height={14} rx={4} fill="#101318" stroke={colors.metricCyan} strokeWidth={1.4} />
      <Line x1={109} y1={231} x2={125} y2={231} stroke={colors.metricCyan} strokeWidth={1.6} opacity={0.8} />
      <Ellipse cx={108} cy={274} rx={5} ry={4} fill="#2c303a" />
      <Ellipse cx={180} cy={263} rx={5} ry={4} fill="#2c303a" />
    </G>
  );
}

const styles = StyleSheet.create({
  scene: {
    height: SCENE_H,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#101016',
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
    paddingBottom: 18,
  },
  char: { alignItems: 'center', justifyContent: 'center' },
  aura: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    transform: [{ scale: 1.2 }],
  },
  shadow: {
    position: 'absolute',
    bottom: 12,
    width: 110,
    height: 16,
    borderRadius: 9,
    backgroundColor: '#000',
  },
  zzz: {
    position: 'absolute',
    bottom: 205,
    marginLeft: 104,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  zzzBig: { fontSize: 19, fontWeight: '800', color: '#8b93a4', fontStyle: 'italic' },
  zzzMid: { fontSize: 14, fontWeight: '800', color: '#6b7280', fontStyle: 'italic', marginBottom: 8 },
  zzzSmall: { fontSize: 10, fontWeight: '800', color: '#4a4f5c', fontStyle: 'italic', marginBottom: 16 },
});
