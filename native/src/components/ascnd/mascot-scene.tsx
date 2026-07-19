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
import Svg, { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { colors } from '@/constants/ascnd';
import type { MascotDef } from '@/lib/mascots';
import type { MascotMood } from '@/hooks/use-mascot';
import type { ShopItemKey } from '@/lib/mascot-room';

/**
 * The mascot's gym room — everything code-drawn. A layered SVG scene
 * (wall, window, floor) where purchased gym gear appears, with the
 * animated emoji companion standing in the middle wearing its purchased
 * outfit layers (SVG stickers anchored over the glyph). Tap the buddy to
 * play a reaction; bump `celebrateSignal` to fire the purchase jump.
 *
 * Idle life: the buddy blinks (quick squint), occasionally strolls to a
 * new spot on the floor with little hop-steps, and — when the user hasn't
 * logged meals/workouts — goes visibly tired: droops forward, hovers low
 * and slow, aura dims, zzz float up, a sweat drop appears.
 *
 * Gains: levels literally build muscle — the buddy grows a bit each
 * level and the code-drawn physique builds out milestone by milestone:
 * flexed arms at level 2 (and they keep thickening EVERY level),
 * shoulder caps at 4, chest pecs at 6, effort sparks at 9, and a golden
 * pump outline at 12. Bump `flexSignal` on level-up for the
 * double-bicep flex celebration.
 */

const SCENE_H = 290;
const CHAR = 120; // character box; emoji glyph is centered inside
const WALK_RANGE = 68; // max px the buddy strolls from center

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
  const blinkSq = useSharedValue(1); // quick squint multiplied into scaleY
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

  // Blink: random squint every few seconds (slower, heavier when tired)
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        if (!alive) return;
        blinkSq.value = withSequence(
          withTiming(tired ? 0.78 : 0.86, { duration: tired ? 140 : 70 }),
          withTiming(1, { duration: tired ? 260 : 110 }),
        );
        schedule();
      }, (tired ? 1800 : 2600) + Math.random() * 3600);
    };
    schedule();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [blinkSq, tired]);

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
      { scaleY: squashY.value * blinkSq.value * levelScale },
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
      {/* Room background + owned gym gear */}
      <Svg width="100%" height={SCENE_H} viewBox={`0 0 360 ${SCENE_H}`} preserveAspectRatio="xMidYMax slice">
        {/* Wall */}
        <Rect x={0} y={0} width={360} height={205} fill="#101016" />
        <Line x1={0} y1={68} x2={360} y2={68} stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
        <Line x1={0} y1={136} x2={360} y2={136} stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
        {/* Upgrade: LED strip glowing along the ceiling line */}
        {ownedGym.has('wall_led') && (
          <G>
            <Line x1={8} y1={12} x2={352} y2={12} stroke={colors.metricPurple} strokeWidth={7} opacity={0.18} />
            <Line x1={8} y1={12} x2={352} y2={12} stroke={colors.metricPurple} strokeWidth={2.5} opacity={0.9} />
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
            <Rect x={0} y={205} width={360} height={SCENE_H - 205} fill="#0d1017" />
            <Line x1={0} y1={205} x2={360} y2={205} stroke={colors.metricCyan} strokeWidth={2} opacity={0.75} />
            <Line x1={0} y1={205} x2={360} y2={205} stroke={colors.metricCyan} strokeWidth={7} opacity={0.14} />
            {[60, 140, 220, 300].map((x) => (
              <Line key={x} x1={x} y1={210} x2={x - 26} y2={SCENE_H} stroke="rgba(24,194,220,0.09)" strokeWidth={1.5} />
            ))}
          </G>
        ) : ownedGym.has('floor_wood') ? (
          <G>
            <Rect x={0} y={205} width={360} height={SCENE_H - 205} fill="#241a10" />
            <Line x1={0} y1={205} x2={360} y2={205} stroke="rgba(255,214,150,0.16)" strokeWidth={1.5} />
            {[232, 258].map((y) => (
              <Line key={y} x1={0} y1={y} x2={360} y2={y} stroke="rgba(0,0,0,0.32)" strokeWidth={1.4} />
            ))}
            {[90, 200, 300].map((x, i) => (
              <Line key={x} x1={x} y1={205 + i * 2} x2={x - 14} y2={SCENE_H} stroke="rgba(0,0,0,0.22)" strokeWidth={1.2} />
            ))}
          </G>
        ) : (
          <G>
            <Rect x={0} y={205} width={360} height={SCENE_H - 205} fill="#16161d" />
            <Line x1={0} y1={205} x2={360} y2={205} stroke="rgba(255,255,255,0.06)" strokeWidth={1.5} />
          </G>
        )}

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
              style={[styles.aura, { backgroundColor: mascot.accent, opacity: tired ? 0.06 : 0.16 }]}
            />
            <Text style={styles.emoji}>{mascot.emoji}</Text>
            {/* Outfit stickers, anchored over the glyph */}
            <Svg width={CHAR} height={CHAR} viewBox={`0 0 ${CHAR} ${CHAR}`} style={StyleSheet.absoluteFill} pointerEvents="none">
              {/* Muscles first so outfits layer on top of them */}
              {level >= 2 && <MuscleArms level={level} />}
              {equippedOutfits.has('headband') && (
                <G>
                  <Rect x={26} y={26} width={68} height={11} rx={5.5} fill="#e6485c" />
                  <Rect x={26} y={29} width={68} height={2.5} fill="rgba(255,255,255,0.35)" />
                </G>
              )}
              {equippedOutfits.has('cap') && (
                <G>
                  <Path d="M 28 30 A 32 26 0 0 1 92 30 L 92 36 L 28 36 Z" fill={colors.metricBlue} />
                  <Rect x={54} y={6} width={12} height={16} rx={5} fill={colors.metricBlue} />
                  <Rect x={20} y={33} width={54} height={8} rx={4} fill="#2b62b4" />
                  <Circle cx={60} cy={18} r={3.4} fill="#2b62b4" />
                </G>
              )}
              {equippedOutfits.has('sunglasses') && (
                <G>
                  <Rect x={30} y={48} width={26} height={15} rx={6} fill="#0c0c10" stroke="rgba(255,255,255,0.4)" strokeWidth={1.2} />
                  <Rect x={64} y={48} width={26} height={15} rx={6} fill="#0c0c10" stroke="rgba(255,255,255,0.4)" strokeWidth={1.2} />
                  <Line x1={56} y1={54} x2={64} y2={54} stroke="rgba(255,255,255,0.4)" strokeWidth={2} />
                  <Rect x={33} y={50} width={9} height={3.5} rx={1.7} fill="rgba(255,255,255,0.3)" />
                  <Rect x={67} y={50} width={9} height={3.5} rx={1.7} fill="rgba(255,255,255,0.3)" />
                </G>
              )}
              {equippedOutfits.has('medal') && (
                <G>
                  <Path d="M 48 78 L 60 96 L 72 78" stroke="#e6485c" strokeWidth={5} fill="none" />
                  <Circle cx={60} cy={99} r={9.5} fill={colors.readinessYellow} stroke="#a8790e" strokeWidth={1.6} />
                  <SvgText x={60} y={103} fontSize={9.5} fontWeight="bold" fill="#7a570a" textAnchor="middle">1</SvgText>
                </G>
              )}
              {equippedOutfits.has('belt') && (
                <G>
                  <Rect x={30} y={92} width={60} height={11} rx={5.5} fill="#5a4634" />
                  <Rect x={52} y={90} width={16} height={15} rx={3} fill="#c9a24a" />
                  <Rect x={56} y={94} width={8} height={7} rx={1.6} fill="#7a5f1e" />
                </G>
              )}
              {tired && (
                <Path
                  d="M 92 30 C 98 40 99 45 92 47 C 85 45 86 40 92 30"
                  fill={colors.metricCyan}
                  opacity={0.8}
                />
              )}
            </Svg>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Muscle arms (drawn in the 120×120 character box) ──────────────────

const SKIN = '#e2a76f';
const SKIN_DARK = '#d89a5e';

/**
 * Code-drawn physique that builds out with the buddy's level. The arms
 * thicken EVERY level (not in steps); milestones add body parts:
 * shoulder caps at 4, chest pecs at 6, effort sparks at 9, golden pump
 * outline at 12. One arm is drawn on the left and mirrored right.
 */
function MuscleArms({ level }: { level: number }) {
  const bicep = Math.min(4.5 + level * 0.55, 12);
  const armW = Math.min(5 + level * 0.6, 12.5);
  const golden = level >= 12;
  const pump = golden ? { stroke: colors.readinessYellow, strokeWidth: 1.8, strokeOpacity: 0.75 } : {};
  const arm = (
    <G>
      {/* shoulder → elbow */}
      <Path d="M 32 64 C 23 63 16 68 13 76" stroke={SKIN} strokeWidth={armW} strokeLinecap="round" fill="none" />
      {/* elbow → raised fist (the flex) */}
      <Path d="M 13 76 C 10 66 12 58 18 52" stroke={SKIN} strokeWidth={armW - 1} strokeLinecap="round" fill="none" />
      {/* shoulder cap */}
      {level >= 4 && <Circle cx={33} cy={58} r={bicep * 0.72} fill={SKIN} {...pump} />}
      {/* bicep bulge + shine */}
      <Circle cx={19} cy={66} r={bicep} fill={SKIN} {...pump} />
      <Circle cx={16.5} cy={63} r={bicep * 0.34} fill="rgba(255,255,255,0.35)" />
      {/* fist */}
      <Circle cx={18} cy={50} r={armW * 0.62} fill={SKIN_DARK} />
      {level >= 9 && (
        <G>
          <Line x1={7} y1={57} x2={3} y2={53} stroke={colors.readinessYellow} strokeWidth={2} strokeLinecap="round" />
          <Line x1={5} y1={66} x2={1} y2={66} stroke={colors.readinessYellow} strokeWidth={2} strokeLinecap="round" />
          <Line x1={7} y1={75} x2={3} y2={79} stroke={colors.readinessYellow} strokeWidth={2} strokeLinecap="round" />
        </G>
      )}
    </G>
  );
  return (
    <G>
      {arm}
      <G transform={`translate(${CHAR},0) scale(-1,1)`}>{arm}</G>
      {/* chest pecs — sit above the belt line so outfits still read */}
      {level >= 6 && (
        <G>
          <Ellipse cx={49} cy={84} rx={11} ry={7.5} fill={SKIN} {...pump} />
          <Ellipse cx={71} cy={84} rx={11} ry={7.5} fill={SKIN} {...pump} />
          <Line x1={60} y1={78} x2={60} y2={90} stroke="rgba(0,0,0,0.18)" strokeWidth={1.6} />
          <Ellipse cx={46} cy={81} rx={3.6} ry={2.2} fill="rgba(255,255,255,0.3)" />
          <Ellipse cx={68} cy={81} rx={3.6} ry={2.2} fill="rgba(255,255,255,0.3)" />
        </G>
      )}
    </G>
  );
}

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
      <Path d="M 116 232 a 9 9 0 0 1 18 0" stroke="#3a3f4c" strokeWidth={5} fill="none" />
      <Circle cx={125} cy={247} r={13} fill="#22262e" stroke={colors.metricOrange} strokeWidth={1.6} />
      <Ellipse cx={121} cy={243} rx={4} ry={5} fill="rgba(255,255,255,0.08)" />
    </G>
  );
}

function Bench() {
  return (
    <G>
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
    paddingBottom: 26,
  },
  char: { width: CHAR, height: CHAR, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 88, lineHeight: CHAR },
  aura: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    opacity: 0.16,
    transform: [{ scale: 1.16 }],
  },
  shadow: {
    position: 'absolute',
    bottom: 16,
    width: 84,
    height: 14,
    borderRadius: 8,
    backgroundColor: '#000',
  },
  zzz: {
    position: 'absolute',
    bottom: 150,
    marginLeft: 74,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  zzzBig: { fontSize: 19, fontWeight: '800', color: '#8b93a4', fontStyle: 'italic' },
  zzzMid: { fontSize: 14, fontWeight: '800', color: '#6b7280', fontStyle: 'italic', marginBottom: 8 },
  zzzSmall: { fontSize: 10, fontWeight: '800', color: '#4a4f5c', fontStyle: 'italic', marginBottom: 16 },
});
