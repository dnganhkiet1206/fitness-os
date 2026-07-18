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
import type { ShopItemKey } from '@/lib/mascot-room';

/**
 * The mascot's gym room — everything code-drawn. A layered SVG scene
 * (wall, window, floor) where purchased gym gear appears, with the
 * animated emoji companion standing in the middle wearing its purchased
 * outfit layers (SVG stickers anchored over the glyph). Tap the buddy to
 * play a reaction; bump `celebrateSignal` to fire the purchase jump.
 */

const SCENE_H = 290;
const CHAR = 120; // character box; emoji glyph is centered inside

interface Props {
  mascot: MascotDef;
  ownedGym: Set<string>;
  equippedOutfits: Set<string>;
  celebrateSignal: number;
}

export function MascotScene({ mascot, ownedGym, equippedOutfits, celebrateSignal }: Props) {
  const hover = useSharedValue(0);
  const squashX = useSharedValue(1);
  const squashY = useSharedValue(1);
  const tilt = useSharedValue(0);
  const spin = useSharedValue(0);

  useEffect(() => {
    hover.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [hover]);

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
      { translateY: interpolate(hover.value, [0, 1], [0, -6]) },
      { rotateZ: `${tilt.value}deg` },
      { rotateY: `${spin.value}deg` },
      { scaleX: squashX.value },
      { scaleY: squashY.value },
    ],
  }));

  const shadowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(hover.value, [0, 1], [0.4, 0.16]),
    transform: [{ scaleX: interpolate(hover.value, [0, 1], [1, 0.75]) }],
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
        {ownedGym.has('dumbbell_rack') && <DumbbellRack />}
        {ownedGym.has('plant') && <Plant />}
        {ownedGym.has('yoga_mat') && (
          <Ellipse cx={180} cy={252} rx={64} ry={13} fill={colors.metricPurple} opacity={0.32} />
        )}
        {ownedGym.has('barbell') && <Barbell />}
      </Svg>

      {/* Character standing on the floor */}
      <View style={styles.charWrap} pointerEvents="box-none">
        <Animated.View style={[styles.shadow, shadowStyle]} />
        <Pressable onPress={poke} hitSlop={10}>
          <Animated.View style={[styles.char, charStyle]}>
            {/* Aura */}
            <View style={[styles.aura, { backgroundColor: mascot.accent }]} />
            <Text style={styles.emoji}>{mascot.emoji}</Text>
            {/* Outfit stickers, anchored over the glyph */}
            <Svg width={CHAR} height={CHAR} viewBox={`0 0 ${CHAR} ${CHAR}`} style={StyleSheet.absoluteFill} pointerEvents="none">
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
            </Svg>
          </Animated.View>
        </Pressable>
      </View>
    </View>
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
});
