import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { colors, radius, type } from '@/constants/ascnd';
import type { ExerciseInsight, Trend } from '@/lib/exercise-trend';

/**
 * How one movement is going, beside the movement.
 *
 * ── the problem it is the answer to ──
 *
 * Exercise Intelligence had exactly one door: a button on the Workouts tab.
 * Four screens in this app print an exercise name to the reader and not one of
 * them said anything about it. So somebody looking at today's plan — with the
 * exercise right there in front of them — had to leave the screen, open another
 * one, and scroll a list of everything they had trained in ninety days to find
 * the row they were already looking at.
 *
 * The information belongs where the exercise is. This is that: a chip small
 * enough to sit on a plan row, and a way through to the detail so the list is
 * somewhere you arrive at rather than somewhere you search.
 *
 * ── one component, two callers, on purpose ──
 *
 * The routine panel and the log sheet both want this and they want it at
 * different sizes. Two hand-built versions is the shape of bug this repository
 * keeps finding, so there is one, with `compact` for the log sheet — where the
 * instruction was to show only what is needed and not crowd the row.
 */

const ICON: Record<Trend, typeof TrendingUp> = {
  IMPROVING: TrendingUp,
  DECLINING: TrendingDown,
  PLATEAU: Minus,
  STABLE: Minus,
  INSUFFICIENT_DATA: Minus,
};

const TINT: Record<Trend, string> = {
  IMPROVING: colors.readinessGreen,
  DECLINING: colors.readinessRed,
  PLATEAU: colors.readinessYellow,
  STABLE: colors.mutedForeground,
  INSUFFICIENT_DATA: colors.mutedForeground,
};

/** Where the chip sends you, so the deep link is written in one place. */
export const insightHref = (exerciseKey: string) =>
  ({ pathname: '/exercise-insight', params: { ex: exerciseKey } }) as const;

export function TrendChip({
  insight,
  label,
  compact = false,
}: {
  /**
   * `null` when the engine has nothing for this movement, and then nothing is
   * drawn. A chip reading "no data" on every row of a new user's first plan is
   * twelve pieces of furniture saying the same nothing.
   */
  insight: ExerciseInsight | null | undefined;
  /** the exercise name, for the screen reader — the chip itself is a glyph and a number */
  label: string;
  compact?: boolean;
}) {
  if (!insight || insight.trend === 'INSUFFICIENT_DATA') return null;

  const tint = TINT[insight.trend];
  const pct = insight.changePct === null ? null : Math.round(insight.changePct * 100);

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={() => {
        Haptics.selectionAsync();
        router.push(insightHref(insight.exerciseKey));
      }}>
      <View style={[styles.chip, compact && styles.compact, { borderColor: tint }]}>
        <Icon icon={ICON[insight.trend]} size={compact ? 10 : 11} color={tint} />
        {/*
          Compact drops the number, it does not shrink it.

          The first version set the percentage to 10pt here, and
          `tools/tap-targets`' sibling `tools/type-scale.mjs` refused it against
          Apple's 11pt floor with the fix written into the message: "muốn dày
          đặc hơn thì bớt nhãn đi, đừng thu nhỏ chữ". It is right, and it is
          also the better answer for this row — the log sheet already prints the
          number that matters ("Lần trước 55 kg × 9") on the same line, so the
          arrow is the only thing the chip has left to add.
        */}
        {!compact && pct !== null && pct !== 0 ? (
          <Text style={[styles.text, { color: tint }]}>
            {pct > 0 ? '+' : ''}
            {pct}%
          </Text>
        ) : null}
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  compact: { paddingHorizontal: 5, paddingVertical: 1, gap: 2 },
  text: { ...type.caption, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
