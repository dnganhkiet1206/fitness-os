import { Beef, Droplets, Flame, Scale } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { colors, spacing, type } from '@/constants/ascnd';
import type { useI18n } from '@/hooks/use-app-settings';

/**
 * The four numbers a day is actually judged by, in one row under the hero card.
 *
 * The calorie card above says a great deal about calories and nothing about
 * anything else, and the answers to "how much protein / how much water / what
 * do I weigh" were each a tab or a screen away. They are one line each, they
 * change daily, and they are what somebody opening the tab wants confirmed —
 * so they sit together, above the diary, where the eye lands first.
 *
 * **Read-only on purpose.** Every one of these has a place it is logged
 * properly; a row that both reports and edits would need four different
 * affordances in four small boxes. This reports, and the screens that log
 * remain the screens that log.
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
  weightKg,
  waterMl,
  waterTargetMl,
  i18n,
}: {
  kcal: number;
  calorieTarget: number;
  protein: number;
  proteinTarget: number;
  /** today's weigh-in, or the profile's last known weight; null if neither */
  weightKg: number | null;
  waterMl: number;
  waterTargetMl: number;
  i18n: ReturnType<typeof useI18n>;
}) {
  const stats: Stat[] = [
    {
      key: 'kcal',
      icon: Flame,
      color: colors.metricOrange,
      label: i18n.nQuickCalories,
      value: kcal,
      target: calorieTarget,
      unit: 'kcal',
    },
    {
      key: 'protein',
      icon: Beef,
      color: '#e6485c',
      label: i18n.nQuickProtein,
      value: Math.round(protein),
      target: proteinTarget,
      unit: 'g',
    },
    {
      key: 'weight',
      icon: Scale,
      color: colors.metricPurple,
      label: i18n.nQuickWeight,
      value: weightKg,
      // a weight has no daily target — the goal weight lives in Progress
      target: null,
      unit: 'kg',
      decimals: 1,
    },
    {
      key: 'water',
      icon: Droplets,
      color: colors.metricCyan,
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: 4,
  },
  label: { ...type.caption, color: colors.mutedForeground, fontWeight: '600' },
  value: {
    ...type.headline,
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
  },
  unit: { ...type.caption, color: colors.mutedForeground, fontWeight: '600' },
  target: { ...type.caption, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
});
