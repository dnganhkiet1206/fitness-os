import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Dimensions, type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { MascotBuddy } from '@/components/ascnd/mascot-buddy';
import { KoaStudio } from '@/components/ascnd/studio/koa-studio';
import { LiveLight, LiveStageGlow } from '@/components/ascnd/studio/light-drift';
import { DriftingMotes } from '@/components/ascnd/studio/motes-drift';
import { SCENE_BOTTOM, STAGE_MARK, STUDIO_SKINS, STUDIO_W } from '@/components/ascnd/studio/palette';
import { triggerMascotAction, useMascotEmotion } from '@/hooks/use-mascot-emotion';
import type { MascotMood } from '@/hooks/use-mascot';
import type { MascotDef } from '@/lib/mascots';

/**
 * The Stage: Koa Studio with the buddy standing in it.
 *
 * The room is `components/ascnd/studio/` — a static SVG scene built to the
 * "Koa Studio" brief and held to the design screenshot by
 * `tools/koa-studio/compare.mjs`. This file owns only what the scene is not:
 * where the character stands, how it reacts to a touch, and the fade into
 * the page.
 *
 * The buddy is placed from `STAGE_MARK`, the same number the scene composes
 * itself around, so the room and the character cannot drift apart.
 *
 * What used to be here is gone with the design it served: a hand-drawn wall,
 * spotlight, podium and prop layout engine, a vignette, a neon ring, a
 * pulsing aura, rising particles, and three floating cards that repeated the
 * level, streak and quest counts the page already shows below the stage.
 * Energy still reaches the room — it lifts the podium's ring and the pool of
 * light on the floor — and the streak is on the wall where the design puts
 * it.
 */

/** the studio, cropped to the room; the rest of its artboard is app content */
const ASPECT = SCENE_BOTTOM / STUDIO_W;
/**
 * Koa's drawn width, in artboard units.
 *
 * A third of the room's width. The podium's top face is 274 wide and the
 * gap from it up to the lamp is 346, so a character much past this stops
 * being something standing in a room and starts being the room.
 */
const HERO_W = 128;
const PAGE = '#070708';

interface Props {
  mascot: MascotDef;
  /** a stage unlock from the shop */
  themeKey?: string;
  equippedOutfits?: Set<string>;
  mood?: MascotMood;
  level?: number;
  accent?: string;
  energy?: number;
  celebrateSignal?: number;
  flexSignal?: number;
  /** days, shown on the room's wall card */
  streak?: number;
  /** false pauses the buddy and the stage's own loops (screen not focused) */
  animated?: boolean;
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
  streak,
  animated = true,
}: Props) {
  const emotion = useMascotEmotion();
  const [sw, setSw] = useState(Dimensions.get('window').width - 32);
  const onLayout = (ev: LayoutChangeEvent) => setSw(ev.nativeEvent.layout.width);

  const k = sw / STUDIO_W;
  const H = Math.round(sw * ASPECT);
  const size = Math.round(HERO_W * k);
  const tired = mood === 'tired';
  const levelScale = Math.min(1 + (level - 1) * 0.012, 1.1);

  const nod = useSharedValue(0);
  const settle = useSharedValue(1);
  const droop = useSharedValue(0);
  const zzz = useSharedValue(0);

  useEffect(() => {
    droop.value = withSpring(tired ? 8 : 0, { stiffness: 120, damping: 15 });
    if (!tired || !animated) {
      cancelAnimation(zzz);
      zzz.value = 0;
      return;
    }
    zzz.value = withRepeat(withTiming(1, { duration: 2800, easing: Easing.out(Easing.quad) }), -1);
  }, [tired, animated, droop, zzz]);

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

  // A poke waves and nods the stage. The character's own reaction to a
  // touch (the cheek pop) went with the hand-drawn figure; re-adding it
  // means a layer on top of the generated tree.
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

  return (
    <View style={[styles.scene, { height: H }]} onLayout={onLayout}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <KoaStudio
          width={sw}
          height={H}
          skin={themeKey}
          energy={energy}
          streak={streak}
          motes={animated ? <DriftingMotes /> : undefined}
          light={animated ? <LiveLight /> : undefined}
          stageGlow={animated ? <LiveStageGlow glow={STUDIO_SKINS[themeKey ?? 'default']?.glow} energy={energy} /> : undefined}
        />
      </View>

      {/* the buddy, on the mark the scene is built around */}
      <View
        style={{
          position: 'absolute',
          left: STAGE_MARK.x * k - size / 2,
          top: STAGE_MARK.y * k - size * 1.25 + 6 * k,
          width: size,
          alignItems: 'center',
        }}
        pointerEvents="box-none">
        {tired ? (
          <Animated.View style={[styles.zzz, zzzStyle]} pointerEvents="none">
            <Text style={styles.zzzBig}>z</Text>
            <Text style={styles.zzzMid}>z</Text>
            <Text style={styles.zzzSmall}>z</Text>
          </Animated.View>
        ) : null}
        <Pressable onPress={poke} hitSlop={12}>
          <Animated.View style={charStyle}>
            <MascotBuddy
              mascot={mascot}
              emotion={emotion}
              size={size}
              mood={mood}
              level={level}
              accent={accent}
              equippedOutfits={equippedOutfits}
              animated={animated}
            />
          </Animated.View>
        </Pressable>
      </View>

      {/* the stage has no frame: every edge dissolves into the page */}
      <Svg width={sw} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="stageFadeV" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={PAGE} stopOpacity={0.66} />
            <Stop offset="0.12" stopColor={PAGE} stopOpacity={0} />
            <Stop offset="0.82" stopColor={PAGE} stopOpacity={0} />
            <Stop offset="1" stopColor={PAGE} stopOpacity={1} />
          </LinearGradient>
          <LinearGradient id="stageFadeH" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={PAGE} stopOpacity={0.9} />
            <Stop offset="0.1" stopColor={PAGE} stopOpacity={0} />
            <Stop offset="0.9" stopColor={PAGE} stopOpacity={0} />
            <Stop offset="1" stopColor={PAGE} stopOpacity={0.9} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={sw} height={H} fill="url(#stageFadeH)" />
        <Rect x={0} y={0} width={sw} height={H} fill="url(#stageFadeV)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { overflow: 'hidden', backgroundColor: PAGE },
  zzz: { position: 'absolute', bottom: '100%', right: -6, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  zzzBig: { fontSize: 19, fontWeight: '800', color: '#dfe6f5', fontStyle: 'italic' },
  zzzMid: { fontSize: 14, fontWeight: '800', color: '#b7c2d6', fontStyle: 'italic', marginBottom: 8 },
  zzzSmall: { fontSize: 10, fontWeight: '800', color: '#8b97ad', fontStyle: 'italic', marginBottom: 16 },
});
