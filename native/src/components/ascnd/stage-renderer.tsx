import * as Haptics from 'expo-haptics';
import { memo, useEffect, useMemo, useState } from 'react';
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

import { HERO_W } from '@/components/ascnd/koa/koa-frame';
import { MascotBuddy } from '@/components/ascnd/mascot-buddy';
import { KoaStudio } from '@/components/ascnd/studio/koa-studio';
import { PlantsCanvas } from '@/components/ascnd/studio/plants-live';
import { useBugClock } from '@/components/ascnd/studio/bugs-live';
import { StudioLive } from '@/components/ascnd/studio/studio-live';
import { moonPhase } from '@/components/ascnd/studio/window';
import { SCENE_BOTTOM, STAGE_MARK, STUDIO_SKINS, STUDIO_W } from '@/components/ascnd/studio/palette';
import { useMascotEmotion } from '@/hooks/use-mascot-emotion';
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
/**
 * The room's canvases, memoised.
 *
 * Every prop they take is a primitive, and this component re-renders on each
 * emotion tick, each poke and each celebration signal — without this, all
 * three rebuilt their whole element trees, some two hundred SVG nodes, for
 * nothing.
 *
 * `KoaStudio` is wrapped here rather than in its own file on purpose:
 * `preview.mjs` bundles that file and calls the export directly, and `memo()`
 * returns an object rather than a function, which breaks the tool outright.
 */
const Studio = memo(KoaStudio);

const ASPECT = SCENE_BOTTOM / STUDIO_W;
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
  /**
   * The page is mid-scroll. The buddy's clock stops in place for the duration
   * — the character is translating with the ScrollView, so a paused idle is
   * invisible, and not re-rasterising the figure every frame is what keeps the
   * scroll smooth. It freezes in place rather than dropping to the static
   * frame, so there is no snap when it starts or stops. See `KoaFigure`.
   */
  scrolling?: boolean;
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
  scrolling = false,
}: Props) {
  const emotion = useMascotEmotion();
  const [sw, setSw] = useState(Dimensions.get('window').width - 32);
  const onLayout = (ev: LayoutChangeEvent) => setSw(ev.nativeEvent.layout.width);

  /**
   * The moon, fixed for as long as the screen is open.
   *
   * `moonPhase()` is a function of the clock, so calling it inline returned a
   * *different float on every render* — 0.480713847 then 0.480713853 sixteen
   * milliseconds later. That is never equal to itself, so it defeats any
   * memo below it and rebuilds the window's canvas on every emotion tick and
   * every poke. The moon does not move visibly within a session, so pinning
   * it at mount costs nothing and makes the prop stable.
   */
  const phase = useMemo(() => moonPhase(), []);

  const k = sw / STUDIO_W;
  const H = Math.round(sw * ASPECT);
  const size = Math.round(HERO_W * k);
  const tired = mood === 'tired';
  const levelScale = Math.min(1 + (level - 1) * 0.012, 1.1);

  /**
   * The insects' clock, owned here because two things read it.
   *
   * The bee and the butterflies fly on it, and the character glances at
   * whichever of them has landed. On a clock each they would agree for a
   * minute and then have Koa staring at an empty shelf, so there is one and it
   * belongs to whatever contains both of them — which is this file.
   */
  const bugs = useBugClock(animated);

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

  /**
   * A poke is haptic only.
   *
   * It used to wave the character and nod the stage. Both read as a sticker
   * being tapped rather than as a companion being touched: the pose swap is a
   * cut to a different drawing, and the nod is the whole figure rocking as one
   * rigid piece. Removed at the user's direction, 2026-07-28 — a touch should
   * be felt, not performed.
   *
   * If a visible reaction goes back in, it has to come from inside the rig —
   * an ear flick, the cheek pop the hand-drawn figure had — not from a
   * transform on the container.
   */
  const poke = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
        {/* The room is three canvases, not one: the plants sway, and anything
            that moves needs a canvas to itself — but they also have to stay
            under the vignette, which the front half carries. See
            plants-live.tsx. */}
        <Studio
          width={sw}
          height={H}
          skin={themeKey}
          energy={energy}
          streak={streak}
          moonPhase={phase}
          live={animated}
          layer="back"
        />
        <View style={StyleSheet.absoluteFill}>
          <PlantsCanvas width={sw} height={H} animated={animated} />
        </View>
        <View style={StyleSheet.absoluteFill}>
          <Studio
            width={sw}
            height={H}
            skin={themeKey}
            energy={energy}
            streak={streak}
            label={mascot.name}
            live={animated}
            layer="front"
          />
        </View>
        {/* The moving parts, on their own canvas directly over the studio.
            Animating them inside it redrew all of its shapes every frame; see
            studio-live.tsx. It has to be absolutely positioned — as a plain
            sibling it lays out *below* the studio rather than on top of it. */}
        {animated ? (
          <View style={StyleSheet.absoluteFill}>
            <StudioLive
              width={sw}
              glow={STUDIO_SKINS[themeKey ?? 'default']?.glow}
              energy={energy}
              bugs={bugs}
              scrolling={scrolling}
            />
          </View>
        ) : null}
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
              running={!scrolling}
              gaze={bugs}
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
