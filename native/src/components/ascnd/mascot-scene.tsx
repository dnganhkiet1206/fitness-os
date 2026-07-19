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
const CHAR = 172; // character render width
const WALK_RANGE = 62; // max px the buddy strolls from center

interface Props {
  mascot: MascotDef;
  ownedGym: Set<string>;
  equippedOutfits: Set<string>;
  celebrateSignal: number;
  flexSignal?: number;
  mood?: MascotMood;
  level?: number;
}

export function MascotScene({
  mascot,
  ownedGym,
  equippedOutfits,
  celebrateSignal,
  flexSignal = 0,
  mood = 'neutral',
  level = 1,
}: Props) {
  const hover = useSharedValue(0);
  const hoverAmp = useSharedValue(6); // hover height — shrinks when tired
  const squashX = useSharedValue(1);
  const squashY = useSharedValue(1);
  const tilt = useSharedValue(0);
  const spin = useSharedValue(0);
  const droop = useSharedValue(0); // forward slump (rotateX) when tired
  const walkX = useSharedValue(0);
  const face = useSharedValue(1); // 1 faces right, -1 faces left
  const zzz = useSharedValue(0);
  const tired = mood === 'tired';
  // Every level adds a little size — gains you can see (capped at +25%)
  const levelScale = Math.min(1 + (level - 1) * 0.025, 1.25);

  useEffect(() => {
    hover.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [hover]);

  // Mood: slump forward, hover barely, drift back to center when tired
  useEffect(() => {
    droop.value = withSpring(tired ? 13 : 0, { stiffness: 120, damping: 14 });
    hoverAmp.value = withTiming(tired ? 2.5 : 6, { duration: 600 });
    if (tired) {
      walkX.value = withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) });
      face.value = withTiming(1, { duration: 200 });
      zzz.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) }), -1);
    } else {
      zzz.value = 0;
    }
  }, [tired, droop, hoverAmp, walkX, face, zzz]);

  // Stroll: every so often wander to a new spot with hop-steps (skipped
  // while tired — a sluggish buddy stays put)
  useEffect(() => {
    if (tired) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        if (!alive) return;
        const target = Math.round(Math.random() * WALK_RANGE * 2 - WALK_RANGE);
        const dist = Math.abs(target - walkX.value);
        if (dist > 14) {
          const dur = dist * 16;
          face.value = withTiming(target > walkX.value ? 1 : -1, { duration: 160 });
          walkX.value = withTiming(target, { duration: dur, easing: Easing.inOut(Easing.quad) });
          const steps = Math.max(2, Math.round(dur / 300));
          squashY.value = withSequence(
            withRepeat(
              withSequence(
                withTiming(0.93, { duration: 150 }),
                withTiming(1.04, { duration: 150 }),
              ),
              steps,
            ),
            withSpring(1, { stiffness: 260, damping: 14 }),
          );
        }
        schedule();
      }, 5000 + Math.random() * 8000);
    };
    schedule();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [tired, walkX, face, squashY]);

  // Purchase celebration: double jump + full spin
  useEffect(() => {
    if (celebrateSignal === 0) return;
    squashY.value = withSequence(
      withTiming(0.75, { duration: 100 }),
      withSpring(1.2, { stiffness: 420, damping: 8 }),
      withSpring(1, { stiffness: 260, damping: 12 }),
    );
    squashX.value = withSequence(
      withTiming(1.2, { duration: 100 }),
      withSpring(0.85, { stiffness: 420, damping: 8 }),
      withSpring(1, { stiffness: 260, damping: 12 }),
    );
    spin.value = withSequence(
      withTiming(360, { duration: 700, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 0 }),
    );
  }, [celebrateSignal, squashX, squashY, spin]);

  // Level-up: double-bicep flex — crouch, pop tall, proud side-to-side shake
  useEffect(() => {
    if (flexSignal === 0) return;
    squashY.value = withSequence(
      withTiming(0.8, { duration: 180 }),
      withSpring(1.16, { stiffness: 380, damping: 9 }),
      withSpring(1, { stiffness: 240, damping: 13 }),
    );
    squashX.value = withSequence(
      withTiming(1.16, { duration: 180 }),
      withSpring(0.9, { stiffness: 380, damping: 9 }),
      withSpring(1, { stiffness: 240, damping: 13 }),
    );
    tilt.value = withSequence(
      withTiming(-9, { duration: 130 }),
      withTiming(9, { duration: 150 }),
      withTiming(-7, { duration: 130 }),
      withTiming(7, { duration: 130 }),
      withSpring(0, { stiffness: 300, damping: 12 }),
    );
  }, [flexSignal, squashX, squashY, tilt]);

  const poke = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    tilt.value = withSequence(
      withTiming(-10, { duration: 120 }),
      withTiming(8, { duration: 140 }),
      withSpring(0, { stiffness: 300, damping: 12 }),
    );
    squashY.value = withSequence(
      withTiming(0.85, { duration: 100 }),
      withSpring(1.12, { stiffness: 400, damping: 9 }),
      withSpring(1, { stiffness: 260, damping: 14 }),
    );
  };

  const charStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 320 },
      { translateX: walkX.value },
      { translateY: -hover.value * hoverAmp.value },
      { rotateX: `${droop.value}deg` },
      { rotateZ: `${tilt.value}deg` },
      { rotateY: `${spin.value}deg` },
      { scaleX: squashX.value * face.value * levelScale },
      { scaleY: squashY.value * levelScale },
    ],
  }));

  const shadowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(hover.value, [0, 1], [0.4, 0.16]),
    transform: [
      { translateX: walkX.value },
      { scaleX: interpolate(hover.value, [0, 1], [1, 0.75]) },
    ],
  }));

  // zzz drift up and fade in a loop while tired
  const zzzStyle = useAnimatedStyle(() => ({
    opacity: zzz.value < 0.15 ? zzz.value * 4 : interpolate(zzz.value, [0.15, 1], [0.7, 0]),
    transform: [{ translateX: walkX.value }, { translateY: -zzz.value * 22 }],
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
            <Stop offset="0%" stopColor="#17171f" />
            <Stop offset="70%" stopColor="#101016" />
            <Stop offset="100%" stopColor="#0c0c11" />
          </LinearGradient>
          <LinearGradient id="floorBase" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#1a1a22" />
            <Stop offset="100%" stopColor="#121218" />
          </LinearGradient>
          <LinearGradient id="floorWood" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#2c2015" />
            <Stop offset="100%" stopColor="#1e150c" />
          </LinearGradient>
        </Defs>
        {/* Wall */}
        <Rect x={0} y={-50} width={360} height={255} fill="url(#wall)" />
        <Line x1={0} y1={68} x2={360} y2={68} stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
        <Line x1={0} y1={136} x2={360} y2={136} stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
        {/* Tiny stars high on the wall */}
        {[
          [30, -30, 1.4],
          [74, -12, 1],
          [150, -34, 1.2],
          [206, -18, 1],
          [332, -32, 1.4],
          [232, 6, 1],
        ].map(([x, y, r], i) => (
          <Circle key={i} cx={x} cy={y} r={r} fill="rgba(255,255,255,0.35)" />
        ))}
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
            <Rect x={96} y={84} width={40} height={30} rx={4} fill="#171a22" stroke="rgba(255,255,255,0.16)" strokeWidth={1.4} />
            <Rect x={104} y={96} width={10} height={4} rx={2} fill={colors.metricOrange} />
            <Rect x={118} y={92} width={4} height={12} rx={2} fill="#8b93a4" />
            <Rect x={96} y={124} width={40} height={26} rx={4} fill="#171a22" stroke="rgba(255,255,255,0.16)" strokeWidth={1.4} />
            <Path d="M 102 142 L 112 132 L 120 138 L 130 128" stroke={colors.readinessGreen} strokeWidth={2.4} fill="none" />
          </G>
        )}
        {/* Window with night skyline */}
        <G>
          <Rect x={252} y={30} width={84} height={92} rx={10} fill="#0a0a12" stroke="rgba(255,255,255,0.1)" strokeWidth={1.5} />
          <Circle cx={318} cy={48} r={16} fill="#e8e6d8" opacity={0.12} />
          <Circle cx={318} cy={48} r={9} fill="#e8e6d8" opacity={0.85} />
          <Rect x={262} y={86} width={10} height={36} fill="#1c2340" />
          <Rect x={276} y={72} width={12} height={50} fill="#232b52" />
          <Rect x={292} y={92} width={9} height={30} fill="#1c2340" />
          <Rect x={305} y={78} width={12} height={44} fill="#202a4e" />
          <Rect x={279} y={78} width={2} height={2} fill={colors.readinessYellow} />
          <Rect x={308} y={84} width={2} height={2} fill={colors.metricCyan} />
          <Rect x={296} y={98} width={2} height={2} fill={colors.readinessYellow} />
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
            <Rect x={0} y={205} width={360} height={85} fill="url(#floorBase)" />
            <Line x1={0} y1={205} x2={360} y2={205} stroke="rgba(255,255,255,0.06)" strokeWidth={1.5} />
          </G>
        )}
        {/* Skirting board at the wall/floor junction + a soft spotlight
            pooling on the floor under the buddy */}
        <Rect x={0} y={200} width={360} height={5} fill="rgba(0,0,0,0.35)" />
        <Ellipse cx={180} cy={252} rx={118} ry={30} fill="rgba(255,255,255,0.028)" />

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
            {/* Aura — dims when the buddy is drained */}
            <View
              style={[styles.aura, { backgroundColor: mascot.accent, opacity: tired ? 0.05 : 0.14 }]}
            />
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
      <SvgText x={112} y={52} fontSize={26} fontWeight="bold" fill="none" stroke={colors.metricCyan} strokeWidth={5} opacity={0.25} textAnchor="middle" letterSpacing={6}>
        ASCND
      </SvgText>
      <SvgText x={112} y={52} fontSize={26} fontWeight="bold" fill={colors.metricCyan} textAnchor="middle" letterSpacing={6}>
        ASCND
      </SvgText>
    </G>
  );
}

function Mirror() {
  return (
    <G>
      <Rect x={20} y={72} width={54} height={110} rx={8} fill="#1b2029" stroke="rgba(255,255,255,0.18)" strokeWidth={1.6} />
      <Line x1={32} y1={90} x2={54} y2={166} stroke="rgba(255,255,255,0.08)" strokeWidth={7} />
      <Line x1={44} y1={84} x2={64} y2={152} stroke="rgba(255,255,255,0.05)" strokeWidth={4} />
    </G>
  );
}

function DumbbellRack() {
  return (
    <G>
      <Ellipse cx={63} cy={244} rx={44} ry={5} fill="rgba(0,0,0,0.32)" />
      <Rect x={26} y={214} width={78} height={7} rx={3.5} fill="#3a3f4c" />
      <Rect x={30} y={221} width={6} height={22} fill="#2c303a" />
      <Rect x={94} y={221} width={6} height={22} fill="#2c303a" />
      {[40, 62, 84].map((cx, i) => (
        <G key={i}>
          <Rect x={cx - 9} y={205} width={7} height={11} rx={2.5} fill={colors.metricOrange} />
          <Rect x={cx + 2} y={205} width={7} height={11} rx={2.5} fill={colors.metricOrange} />
          <Rect x={cx - 3} y={209} width={6} height={3} fill="#8b93a4" />
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
  return (
    <G>
      <Ellipse cx={280} cy={281} rx={56} ry={5} fill="rgba(0,0,0,0.32)" />
      <Rect x={228} y={262} width={104} height={5} rx={2.5} fill="#8b93a4" />
      <Rect x={238} y={250} width={11} height={29} rx={4} fill="#22262e" stroke={colors.metricCyan} strokeWidth={1.4} />
      <Rect x={311} y={250} width={11} height={29} rx={4} fill="#22262e" stroke={colors.metricCyan} strokeWidth={1.4} />
      <Rect x={252} y={255} width={7} height={19} rx={3} fill="#2c303a" />
      <Rect x={301} y={255} width={7} height={19} rx={3} fill="#2c303a" />
    </G>
  );
}

function Kettlebell() {
  return (
    <G>
      <Ellipse cx={125} cy={261} rx={16} ry={4} fill="rgba(0,0,0,0.32)" />
      <Path d="M 116 232 a 9 9 0 0 1 18 0" stroke="#3a3f4c" strokeWidth={5} fill="none" />
      <Circle cx={125} cy={247} r={13} fill="#22262e" stroke={colors.metricOrange} strokeWidth={1.6} />
      <Ellipse cx={121} cy={243} rx={4} ry={5} fill="rgba(255,255,255,0.08)" />
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
      <Line x1={228} y1={0} x2={228} y2={52} stroke="#4a4f5c" strokeWidth={2.5} />
      <Rect x={214} y={52} width={28} height={64} rx={12} fill="#a4293a" />
      <Rect x={214} y={74} width={28} height={7} fill="rgba(0,0,0,0.28)" />
      <Rect x={219} y={56} width={6} height={52} rx={3} fill="rgba(255,255,255,0.12)" />
    </G>
  );
}

function Treadmill() {
  return (
    <G>
      <Ellipse cx={62} cy={273} rx={46} ry={5.5} fill="rgba(0,0,0,0.32)" />
      {/* Front-left of the floor, in front of the rack (painter order) */}
      <Path d="M 22 258 L 100 248 L 104 258 L 26 270 Z" fill="#22262e" stroke="#3a3f4c" strokeWidth={1.4} />
      {[44, 62, 80].map((x) => (
        <Line key={x} x1={x} y1={256 - (x - 44) * 0.12} x2={x + 3} y2={264 - (x - 44) * 0.12} stroke="rgba(255,255,255,0.1)" strokeWidth={1.6} />
      ))}
      {/* Console post + glowing display */}
      <Line x1={28} y1={256} x2={38} y2={232} stroke="#3a3f4c" strokeWidth={4} />
      <Rect x={24} y={218} width={26} height={14} rx={4} fill="#101318" stroke={colors.metricCyan} strokeWidth={1.4} />
      <Line x1={29} y1={225} x2={45} y2={225} stroke={colors.metricCyan} strokeWidth={1.6} opacity={0.8} />
      <Ellipse cx={28} cy={270} rx={5} ry={4} fill="#2c303a" />
      <Ellipse cx={100} cy={259} rx={5} ry={4} fill="#2c303a" />
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
