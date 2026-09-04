import { Beef, Droplets, Flame } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { MACRO_TINT, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import type { useI18n } from '@/hooks/use-app-settings';

/**
 * The numbers a day of eating is judged by, in one row under the hero card.
 *
 * The calorie card above says a great deal about calories and nothing about
 * anything else, and "how much protein / how much water" were each a tab or a
 * screen away. They are one line each, they change daily, and they are what
 * somebody opening the tab wants confirmed — so they sit together, above the
 * diary, where the eye lands first.
 *
 * **Weight is deliberately not here** (removed at the user's request,
 * 2026-07-29). It was the odd one out: the other three are things you *did*
 * today and can still change before bed, while weight is a measurement with no
 * daily target, logged on a different rhythm and read as a trend rather than a
 * number. It belongs with progress, not with a meal diary.
 *
 * **Read-only on purpose.** Each of these has a place it is logged properly; a
 * row that both reports and edits would need three different affordances in
 * three small boxes. This reports, and the screens that log remain the screens
 * that log.
 *
 * The value is the headline and the target is the small print beside it, so a
 * glance answers "am I near it" without doing arithmetic. `null` reads as `—`
 * rather than `0`: nothing logged and zero logged are different days.
 */

interface Stat {
  key: string;
  icon: typeof Flame;
  color: string;
  label: string;
  /** null when there is nothing logged yet */
  value: number | null;
  /** the goal, when there is one to be near */
  target?: number | null;
  unit: string;
  /** how many decimals the value carries — weight wants one, the rest none */
  decimals?: number;
}

export function QuickStats({
  kcal,
  calorieTarget,
  protein,
  proteinTarget,
  waterMl,
  waterTargetMl,
  i18n,
}: {
  kcal: number;
  calorieTarget: number;
  protein: number;
  proteinTarget: number;
  waterMl: number;
  waterTargetMl: number;
  i18n: ReturnType<typeof useI18n>;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const stats: Stat[] = [
    {
      key: 'kcal',
      icon: Flame,
      color: c.metricOrange,
      label: i18n.nQuickCalories,
      value: kcal,
      target: calorieTarget,
      unit: 'kcal',
    },
    {
      key: 'protein',
      icon: Beef,
      color: c[MACRO_TINT.protein],
      label: i18n.nQuickProtein,
      value: Math.round(protein),
      target: proteinTarget,
      unit: 'g',
    },
    {
      key: 'water',
      icon: Droplets,
      color: c.metricCyan,
      label: i18n.nQuickWater,
      // millilitres are the wrong unit at a glance; litres to one decimal
      value: waterMl / 1000,
      target: waterTargetMl / 1000,
      unit: 'L',
      decimals: 1,
    },
  ];

  return (
    <View style={styles.row}>
      {stats.map((s) => (
        <GlassCard key={s.key} style={styles.tile}>
          <Icon icon={s.icon} size={15} color={s.color} />
          <Text style={styles.label} numberOfLines={1}>
            {s.label}
          </Text>
          <Text style={styles.value} numberOfLines={1}>
            {s.value == null ? '—' : s.value.toFixed(s.decimals ?? 0)}
            <Text style={styles.unit}>{s.unit}</Text>
          </Text>
          {s.target != null ? (
            <Text style={styles.target} numberOfLines={1}>
              /{s.target.toFixed(s.decimals ?? 0)}
            </Text>
          ) : (
            // keeps the four tiles the same height whether or not there is a
            // target under the number
            <Text style={styles.target}> </Text>
          )}
        </GlassCard>
      ))}
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  row: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: 4,
  },
  label: { ...type.caption, color: c.mutedForeground, fontWeight: '600' },
  value: {
    ...type.headline,
    color: c.foreground,
    fontVariant: ['tabular-nums'],
  },
  unit: { ...type.caption, color: c.mutedForeground, fontWeight: '600' },
  target: { ...type.caption, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
}));
