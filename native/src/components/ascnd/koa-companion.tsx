import { router, usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset } from '@/constants/expo-template-theme';

import { MascotFigure } from '@/components/ascnd/mascot-figure';
import { useCelebrationHead } from '@/lib/celebration-queue';
import { useKoaContext } from '@/hooks/use-koa-context';
import { useMascotIdentity, useMascotSettings } from '@/hooks/use-mascot';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { baseEmotion } from '@/lib/mascot-emotion';
import { nextPerch, perchPoint, type PerchId } from '@/lib/koa-perch';
import { tabBarVisible } from '@/lib/tab-bar-visibility';

/**
 * Koa, everywhere you are.
 *
 * ── what was wrong ──
 *
 * The character had a mind that followed you and a body that did not.
 * `useKoaContext` is read from `use-extras`, `use-quest-autoclaim` and
 * `use-streak-guard` — the whole app — while the only thing that drew Koa was
 * `mascot.tsx`, a 54pt figure at the top of one tab. Everywhere else it existed
 * only as an event: a celebration, an error face, an empty state.
 *
 * ── and the two ways a following companion goes wrong ──
 *
 * Pinned to a corner it becomes wallpaper: the eye stops seeing it by the
 * second day, which is the same fate as the thumbnail it replaced. Drifting on
 * a timer it becomes something moving in your peripheral vision while you are
 * reading a number, and motion beats type every time.
 *
 * So `koa-perch.ts` holds the rule that avoids both — **movement is caused**.
 * Koa moves when your state changed and holds perfectly still otherwise, and it
 * never returns to the spot it just left.
 *
 * ── it gets out of the way by itself ──
 *
 * The opacity is `tabBarVisible`, the shared value the scroll handler already
 * drives. Scrolling means reading, and while you read the tab bar gets out of
 * the way; there is no reason for the character to be the one thing that does
 * not. Reusing that signal rather than adding a scroll listener also means the
 * two can never disagree about whether you are reading.
 *
 * ── and it does not talk ──
 *
 * No bubble here, deliberately. Being *seen* more and *interrupting* more are
 * different things, and only the second one is rationed. `mascot-budget.ts`
 * still governs every word Koa says, at three a day, and this file does not
 * touch it. The character is present; it is not louder.
 */

/** Small. It is company, not a widget. */
const SIZE = 46;

/**
 * Where the bottom edge is, for the character.
 *
 * `BottomTabInset` and not a number of my own: it is the strip every screen in
 * this app already keeps clear for the tab bar — `screen.tsx:285` and Today
 * both pad by it — so standing in it is standing in space that is reserved
 * rather than space somebody is using.
 *
 * The first version invented 64, and the character clipped the corner of a
 * session row on the Workouts tab. A constant the pages already agree on cannot
 * disagree with the pages.
 */
const BOTTOM_RESERVE = BottomTabInset;

/** One travel, slow enough to read as walking rather than snapping. */
const TRAVEL_MS = 900;

/**
 * The tabs the companion stands on — a list of where it *is*, not of where it
 * is not.
 *
 * A blacklist was the first version and it is the wrong shape here. The
 * companion is mounted at the root, above the `Stack`, so it draws over pushed
 * routes and over the six modal presentations too. Every modal added later
 * would have needed remembering, and the failure mode of forgetting is a koala
 * floating on top of somebody's meal sheet.
 *
 * A whitelist cannot drift that way: a route nobody added here gets nothing.
 *
 * ── and every tab still has the character ──
 *
 * Two tabs are missing from this list on purpose, and neither is missing Koa:
 *
 *   · **Today** already renders `<Mascot />` inline, at 54pt with its speech
 *     bubble — that is the character's voice, and two Koas on one screen is one
 *     too many.
 *   · **Assistant** has the particle figure behind it, which is a whole body
 *     already; a koala standing on it would be two subjects on one background.
 *
 * So the app goes from Koa on one screen to Koa on every tab — in the form that
 * suits each one. `tools/koa-companion.mjs` checks that: a new tab added to
 * `app/(tabs)/` has to appear here or be given a reason.
 */
const COMPANION_ROUTES = ['/nutrition', '/workouts', '/progress'];

export function KoaCompanion() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  /*
    ── every read here is free, and that is a hard requirement ──

    `useMascot()` is four query subscriptions deep and `useMascotEmotion()` adds
    more. That is right for Today, whose whole job is to have an opinion about
    your day. It is wrong for something mounted on *every* screen: this file
    would put an observer on `daily_log` and `today_meals` on the shop, the
    settings page and the awards list, and React Query refetches a stale query
    the moment an observer mounts.

    This app has already paid that bill twice — a version that called
    `useDailyStreak()` directly fired six queries when you opened Awards, and
    `LoadFailed` reading the profile it was rendered *because of* put the whole
    app in an oscillation loop that `tools/live.mjs` found as twenty-five blank
    routes.

    So: `useMascotIdentity` is the settings store and nothing else,
    `useKoaContext` reads the React Query cache without subscribing, and the
    face comes from `baseEmotion` — the same pure function Today resolves its
    own face with, so the two cannot drift into disagreeing about the same day.
  */
  const { enabled, mascot } = useMascotIdentity();
  const { companion } = useMascotSettings();
  const koa = useKoaContext();
  const celebrating = useCelebrationHead();
  const emotion = baseEmotion({
    mood: koa.mood,
    streak: koa.streak,
    hour: koa.hour,
    riskHour: koa.riskHour,
    streakAtRisk: koa.streak > 0 && koa.emptyToday,
    /* The workout flow has its own full-size character moments; a curling koala
       in the corner there would be the second one. */
    onWorkoutScreen: false,
  });
  const reduceMotion = useReducedMotion();

  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [perchId, setPerchId] = useState<PerchId | null>(null);

  /*
    The counter that stands in for "something changed".

    Not a clock and not `Math.random()`: both would move the character while
    nothing was happening, which is the drifting failure. It is bumped by the
    effect below, and only when the band the emotion belongs to has actually
    changed.
  */
  const cause = useRef(0);

  /*
    Translation, not `left`/`top`.

    Animating layout props re-runs layout every frame, and `tools/motion.mjs`
    stopped the first version of this file for exactly that. It matters more
    here than almost anywhere else in the app: this view is mounted on *every*
    screen, so a layout pass per frame would be a layout pass per frame on the
    shop, the settings page and every list in the product. A transform is
    composited and costs the same whether it moves or sits still — the same
    constraint `assistant-aura.tsx` is built around.
  */
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  /* Placed before it is shown, so the first appearance is not a slide in from
     the corner of the screen. */
  const placed = useRef(false);

  useEffect(() => {
    if (!box) return;
    const perch = nextPerch(emotion, perchId, cause.current);
    if (perch.id === perchId) return;

    cause.current += 1;
    setPerchId(perch.id);

    const { left: l, top: t } = perchPoint(perch, box, SIZE);
    if (!placed.current || reduceMotion) {
      /* First placement, or the system asking for less motion — arrive without
         travelling. Reduce Motion is a request about movement, not about
         whether the character exists. */
      tx.value = l;
      ty.value = t;
      scale.value = perch.scale;
      placed.current = true;
      return;
    }
    const timing = { duration: TRAVEL_MS, easing: Easing.inOut(Easing.cubic) };
    tx.value = withTiming(l, timing);
    ty.value = withTiming(t, timing);
    scale.value = withTiming(perch.scale, timing);
  }, [emotion, box, perchId, reduceMotion, tx, ty, scale]);

  /*
    Gone while you are reading, back when you stop.

    `tabBarVisible` is the shared value the scroll handler already drives, so
    the character and the tab bar can never disagree about whether you are
    reading. It fades all the way out rather than down to a ghost: something
    half-visible over a paragraph is worse than either state, and the whole
    reason this sits at the edge is to not be in the way.
  */
  const fade = useDerivedValue(() => tabBarVisible.value);

  const style = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const hidden =
    !enabled ||
    !companion ||
    !!celebrating ||
    !COMPANION_ROUTES.includes(pathname);

  if (hidden) return null;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((p) => (p && Math.abs(p.width - width) < 1 && Math.abs(p.height - height) < 1 ? p : { width, height }));
  };

  return (
    /*
      `box-none` so the whole screen is not swallowed: only the character itself
      takes touches, everything else falls through to the page underneath.
    */
    <View
      style={[styles.layer, { top: insets.top, bottom: insets.bottom + BOTTOM_RESERVE }]}
      pointerEvents="box-none"
      onLayout={onLayout}>
      {box ? (
        <Animated.View style={[styles.perch, style]} pointerEvents="box-none">
          <Pressable
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={mascot.name}
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/mascot-room');
            }}>
            {/* No outfits here: the wardrobe lives behind `useMascotInventory`,
                which is a query, and this figure is on every screen. The room
                and Today still dress the character. */}
            <MascotFigure mascot={mascot} size={SIZE} emotion={emotion} animated />
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /*
    `overflow: hidden` is what lets the character stand *in* the bottom edge
    rather than on top of it: the part of it below the page is clipped away, so
    a figure at `rise: 0.38` really is a head and shoulders and not a whole
    koala sitting lower down.
  */
  layer: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  /* Pinned at the origin; everything that moves it is a transform. */
  perch: { position: 'absolute', left: 0, top: 0, width: SIZE, height: SIZE },
});
