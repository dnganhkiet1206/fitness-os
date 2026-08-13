import * as Haptics from 'expo-haptics';
import { router, useIsFocused } from 'expo-router';
import { Coins, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/ascnd/icon';
import { MascotFigure } from '@/components/ascnd/mascot-figure';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useDailyQuests } from '@/hooks/use-daily-quests';
import { useMascot } from '@/hooks/use-mascot';
import { useMascotInventory, useMascotWallet } from '@/hooks/use-mascot-room';
import { DAILY_QUESTS, levelFromXp } from '@/lib/mascot-room';
import { useI18n } from '@/hooks/use-app-settings';

/**
 * Floating fitness companion — "2.5D": the emoji artwork is animated in
 * real 3D space (perspective + rotateX/rotateY), with squash & stretch,
 * a ground shadow that reacts to hover height and a character-colored
 * aura. All transforms run on the UI thread via Reanimated.
 *
 * Everything here idles forever by design, and this sits on the app's home
 * screen — a tab the user leaves mounted all day. So the float, the sway,
 * the quirk timer and the character's own clock all stop the moment the
 * tab loses focus; an unwatched buddy costs nothing.
 */
export function Mascot() {
  const i18n = useI18n();
  const focused = useIsFocused();
  const { enabled, mascot, message, mood } = useMascot();
  const { data: wallet } = useMascotWallet();
  const { data: inventory } = useMascotInventory();
  const quests = useDailyQuests();
  const [bubbleVisible, setBubbleVisible] = useState(true);
  const tired = mood === 'tired';
  const level = levelFromXp(wallet?.xp ?? 0);
  // The buddy wears its purchased outfit everywhere, not just in its room
  const equippedOutfits = new Set(
    (inventory ?? []).filter((r) => r.equipped).map((r) => r.item_key),
  );
  // Visible gains: the buddy grows a touch with every room level
  const levelScale = Math.min(1 + (level - 1) * 0.02, 1.2);

  const hover = useSharedValue(0); // 0..1 (0 = ground, 1 = top of float)
  const entrance = useSharedValue(0); // 0..1
  const tiltY = useSharedValue(0); // deg — slow look-around
  const nod = useSharedValue(0); // deg rotateX
  const droop = useSharedValue(0); // deg — forward slump when tired
  const spin = useSharedValue(0); // deg rotateY for flips
  const squashX = useSharedValue(1);
  const squashY = useSharedValue(1);
  const bubble = useSharedValue(0);

  // Idle life: float loop + slow look-around sway
  useEffect(() => {
    entrance.value = withDelay(350, withSpring(1, { stiffness: 200, damping: 13 }));
  }, [entrance]);

  useEffect(() => {
    if (!focused) return;
    hover.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1700, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    tiltY.value = withRepeat(
      withSequence(
        withTiming(9, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
        withTiming(-9, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
    return () => {
      // a repeat runs until it is cancelled — leaving the tab is not enough
      cancelAnimation(hover);
      cancelAnimation(tiltY);
      hover.value = 0;
      tiltY.value = 0;
    };
  }, [focused, hover, tiltY]);

  // Tired buddy slumps forward and blinks slow and heavy
  useEffect(() => {
    droop.value = withSpring(tired ? 10 : 0, { stiffness: 120, damping: 14 });
  }, [tired, droop]);

  // Random quirks so it feels alive, not looping: a hop, a nod, or a flip
  // (paused while tired — no energy for tricks)
  useEffect(() => {
    if (tired || !focused) return;
    let alive = true;
    const doQuirk = () => {
      if (!alive) return;
      const roll = Math.random();
      if (roll < 0.45) {
        // hop with squash & stretch
        squashY.value = withSequence(
          withTiming(0.82, { duration: 110 }),
          withSpring(1.12, { stiffness: 400, damping: 9 }),
          withSpring(1, { stiffness: 260, damping: 14 }),
        );
        squashX.value = withSequence(
          withTiming(1.14, { duration: 110 }),
          withSpring(0.92, { stiffness: 400, damping: 9 }),
          withSpring(1, { stiffness: 260, damping: 14 }),
        );
      } else if (roll < 0.8) {
        // curious double-nod (rotateX in perspective)
        nod.value = withSequence(
          withTiming(14, { duration: 140 }),
          withTiming(-6, { duration: 160 }),
          withTiming(10, { duration: 140 }),
          withTiming(0, { duration: 180 }),
        );
      } else {
        // full 3D flip
        spin.value = withSequence(
          withTiming(360, { duration: 650, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: 0 }),
        );
      }
      schedule();
    };
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(doQuirk, 6000 + Math.random() * 8000);
    };
    schedule();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [tired, focused, squashX, squashY, nod, spin]);

  useEffect(() => {
    bubble.value = withSpring(bubbleVisible && message ? 1 : 0, { stiffness: 260, damping: 20 });
  }, [bubbleVisible, message, bubble]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 320 },
      { translateY: interpolate(hover.value, [0, 1], [0, -7]) },
      { rotateY: `${tiltY.value + spin.value}deg` },
      { rotateX: `${nod.value + droop.value}deg` },
      { scale: entrance.value * levelScale },
      { scaleX: squashX.value },
      { scaleY: squashY.value },
    ],
  }));

  // Ground shadow: shrinks and fades as the character floats up — the
  // classic depth cue that sells "hovering above a surface"
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(hover.value, [0, 1], [0.45, 0.18]) * entrance.value,
    transform: [{ scaleX: interpolate(hover.value, [0, 1], [1, 0.72]) }],
  }));

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: bubble.value,
    transform: [{ scale: 0.9 + bubble.value * 0.1 }, { translateY: (1 - bubble.value) * 8 }],
  }));

  if (!enabled) return null;

  const poke = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Excited jump: anticipation squash → stretch up → land with a flip
    squashY.value = withSequence(
      withTiming(0.78, { duration: 90 }),
      withSpring(1.18, { stiffness: 420, damping: 8 }),
      withSpring(1, { stiffness: 260, damping: 13 }),
    );
    squashX.value = withSequence(
      withTiming(1.18, { duration: 90 }),
      withSpring(0.88, { stiffness: 420, damping: 8 }),
      withSpring(1, { stiffness: 260, damping: 13 }),
    );
    spin.value = withSequence(
      withDelay(80, withTiming(360, { duration: 560, easing: Easing.out(Easing.cubic) })),
      withTiming(0, { duration: 0 }),
    );
    setBubbleVisible(true);
    // A tap now leads into the buddy's gym room (quests, coins, shop)
    setTimeout(() => router.push('/mascot-room'), 320);
  };

  return (
    <View style={styles.row} pointerEvents="box-none">
      <Pressable onPress={poke} hitSlop={8}>
        <View style={styles.stage}>
          {/* Ground shadow */}
          <Animated.View style={[styles.groundShadow, shadowStyle]} />
          <Animated.View style={[styles.body, bodyStyle]}>
            <MascotFigure
              mascot={mascot}
              size={54}
              mood={mood}
              level={level}
              equippedOutfits={equippedOutfits}
              animated={focused}
            />
          </Animated.View>
        </View>
      </Pressable>

      <View style={styles.side}>
        {message && (
          <Animated.View
            style={[styles.bubble, bubbleStyle]}
            pointerEvents={bubbleVisible ? 'auto' : 'none'}>
            <Text style={styles.bubbleText}>{message}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={i18n.a11yDismiss} hitSlop={10} onPress={() => setBubbleVisible(false)} style={styles.bubbleClose}>
              <Icon icon={X} size={11} color={colors.mutedForeground} />
            </Pressable>
          </Animated.View>
        )}

        {/*
          ── today's five, on the home screen ──

          The quests were never missing — five of them, with coins and XP, have
          paid out since the room shipped. What was missing is that the only
          place you could see them was inside the room, so the whole economy was
          invisible to anybody who never tapped the buddy. Duolingo puts the
          daily goal on the home screen and in the widget for exactly this
          reason: a goal you cannot see is not a goal.

          Five dots and a count, no labels. The labels are in the room, one tap
          away, and five named quests here would be a second to-do list on a
          screen that already is one — the widgets above *are* the day. This
          says only how much of it is done.

          `ready` gates it: an unread day computes as five unfinished quests,
          and `0/5` shown to somebody who logged all morning is worse than
          showing nothing.
        */}
        {quests.ready ? (
          <View style={styles.quests}>
            <View style={styles.dots}>
              {DAILY_QUESTS.map((q) => (
                <View
                  key={q.key}
                  style={[styles.dot, quests.done[q.key] && styles.dotOn]}
                />
              ))}
            </View>
            <Text style={styles.questCount}>
              {quests.doneCount}/{quests.total}
            </Text>
            {/* The badge is the point of the whole strip: coins already earned
                and sitting uncollected, which nothing outside the room has ever
                said. Absent when there is nothing waiting — a permanent badge
                is decoration. */}
            {quests.unclaimedCoins > 0 ? (
              <View style={styles.coinPill}>
                <Icon icon={Coins} size={11} color={colors.readinessYellow} />
                <Text style={styles.coinText}>+{quests.unclaimedCoins}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* The bubble and the strip share the column beside the buddy, so the strip
     sits under whatever Koa is saying rather than beside it. */
  side: { flex: 1, minWidth: 0, gap: 6 },
  quests: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dots: { flexDirection: 'row', gap: 5 },
  /* 7pt, and the unfilled one is a ring rather than a faint disc: an unfinished
     quest should read as an empty slot, not as a dimmer version of a full one. */
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dotOn: { backgroundColor: colors.readinessGreen, borderColor: colors.readinessGreen },
  questCount: { ...type.caption, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,217,61,0.12)',
  },
  coinText: { fontSize: 11, fontWeight: '700', color: colors.readinessYellow },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stage: {
    width: 74,
    height: 80,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  aura: {
    position: 'absolute',
    top: 6,
    width: 58,
    height: 58,
    borderRadius: 29,
    opacity: 0.16,
    transform: [{ scale: 1.25 }],
  },
  groundShadow: {
    position: 'absolute',
    bottom: 2,
    width: 44,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#000',
  },
  body: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  bubble: {
    /* No `flex: 1` any more. It was a direct child of the row and needed to
       take the remaining width; it is now inside a column, where `flex: 1`
       stretches it *vertically* and pushes the quest strip off the bottom. The
       column stretches it to full width on its own. */
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderBottomLeftRadius: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bubbleText: {
    ...type.footnote,
    color: colors.foreground,
    flex: 1,
    lineHeight: 18,
  },
  bubbleClose: {
    padding: 2,
  },
  bubbleCloseText: {
    fontSize: 11,
    color: colors.mutedForeground,
  },
});
