import * as Haptics from 'expo-haptics';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { LucideIcon } from 'lucide-react-native';
import { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing, type } from '@/constants/ascnd';

/**
 * A row you can swipe, with the action growing out from under it.
 *
 * ── what makes the iOS one feel the way it does ──
 *
 * Three things, and none of them is the easing curve:
 *
 *   · **It tracks the finger.** Not "animates to a state on release" — the
 *     action is exactly as far open as you have dragged, on every frame. That
 *     is why `renderRightActions` is handed Reanimated shared values rather
 *     than a React number: the button's size is computed on the UI thread from
 *     the same drag the row is following, so the two can never lag apart.
 *   · **It commits before you let go.** Past the threshold the row is going to
 *     open whatever you do next, and it says so — the label appears and a tick
 *     of haptic fires. The reference material puts the same rule on the haptic:
 *     fire it on the causal event, on the same frame as the visual.
 *   · **A little hysteresis.** About ten points of movement before the gesture
 *     commits to a direction, so a vertical scroll that wanders sideways does
 *     not peel rows open on the way past.
 *
 * ── why this wraps `ReanimatedSwipeable` instead of a pan handler ──
 *
 * The physics — friction, overshoot, the release decision, the interaction with
 * a scrolling parent — is the hard part and `react-native-gesture-handler` 2.32
 * already ships it, tested, with exactly the knobs above. Writing a
 * `Gesture.Pan()` version means reimplementing a scroll conflict resolver, and
 * this repository has spent the whole session removing second implementations
 * of things it already had.
 *
 * What is ours is the presentation: the action is a capsule that grows, and the
 * word only appears once the row is committed.
 *
 * ── a swipe is never the only way ──
 *
 * `today-meals.tsx` argued this and was right: "Not a swipe and not a
 * long-press. Both are invisible until guessed." So every action reachable by
 * swiping here is also on a button somewhere the eye can find it. The swipe is
 * the fast path for people who know it is there, not the path.
 */

/** How far the row opens at rest. One action, one thumb's width. */
const OPEN_W = 84;

/**
 * Where the action commits.
 *
 * Two thirds of the open width. Below it a release springs shut, above it a
 * release opens — and the label appearing is what tells you which side of the
 * line you are on before you find out by letting go.
 */
const COMMIT = OPEN_W * 0.66;

/** Movement before the gesture takes the row, so a scroll can drift. */
const HYSTERESIS = 10;

function Action({
  progress,
  icon,
  label,
  tint,
  onPress,
}: {
  progress: SharedValue<number>;
  icon: LucideIcon;
  label: string;
  tint: string;
  onPress: () => void;
}) {
  /* `progress` is 1 at the open position and 0 closed, so the capsule reaches
     full size exactly when the row does — the two are the same drag. */
  const grow = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.72, 1], 'clamp') }],
    opacity: interpolate(progress.value, [0, 0.35, 1], [0, 0.6, 1], 'clamp'),
  }));
  /* The word arrives only once the row is committed. Before that it would be a
     label on a button you have not decided to press. */
  const word = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.66, 0.95], [0, 1], 'clamp'),
  }));

  return (
    <View style={styles.actionWrap}>
      <Animated.View style={[styles.action, { backgroundColor: tint }, grow]}>
        <Text accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.hit} />
        <Icon icon={icon} size={17} color={colors.primaryForeground} />
        <Animated.Text style={[styles.actionText, word]} numberOfLines={1}>
          {label}
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

export function SwipeRow({
  children,
  icon,
  label,
  tint = colors.readinessRed,
  onAction,
  bothEdges = false,
}: {
  children: React.ReactNode;
  icon: LucideIcon;
  label: string;
  tint?: string;
  onAction: () => void;
  /**
   * Mở được từ CẢ HAI mép, không chỉ mép phải.
   *
   * Mặc định là false vì hàng bữa ăn và hàng buổi tập đã sống một thời gian với
   * đúng một chiều, và đổi thói quen của một cử chỉ đang dùng được là một cái
   * giá không ai xin.
   *
   * Thẻ NHÓM ở chế độ sắp xếp thì bật: ở đó không có nút xoá nào trên màn hình
   * cả, nên cú vuốt là đường DUY NHẤT — và một đường duy nhất thì không nên bắt
   * người ta đoán đúng chiều.
   */
  bothEdges?: boolean;
}) {
  /* One tick, when the row crosses into "letting go will open this". Fired from
     the will-open callback rather than from a progress watcher so it cannot
     repeat while the finger wobbles on the line. */
  const buzzed = useRef(false);

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={COMMIT}
      dragOffsetFromRightEdge={HYSTERESIS}
      overshootRight={false}
      {...(bothEdges
        ? {
            leftThreshold: COMMIT,
            dragOffsetFromLeftEdge: HYSTERESIS,
            overshootLeft: false,
            renderLeftActions: (progress: SharedValue<number>) => (
              <Action progress={progress} icon={icon} label={label} tint={tint} onPress={onAction} />
            ),
          }
        : null)}
      onSwipeableWillOpen={() => {
        if (buzzed.current) return;
        buzzed.current = true;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onSwipeableWillClose={() => {
        buzzed.current = false;
      }}
      renderRightActions={(progress) => (
        <Action progress={progress} icon={icon} label={label} tint={tint} onPress={onAction} />
      )}>
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  actionWrap: { width: OPEN_W, justifyContent: 'center', alignItems: 'center' },
  action: {
    flex: 1,
    marginVertical: 2,
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    alignSelf: 'stretch',
  },
  /* The whole capsule is the target, laid over it rather than wrapping it — a
     Pressable around an Animated.View would fight the swipe for the gesture. */
  hit: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  actionText: { ...type.caption, color: colors.primaryForeground, fontWeight: '700' },
});
