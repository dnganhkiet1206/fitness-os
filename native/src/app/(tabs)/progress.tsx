import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { LineChart } from '@/components/ascnd/line-chart';
import { Screen } from '@/components/ascnd/screen';
import { colors, spacing, type } from '@/constants/ascnd';
import { useReadinessHistory, useWeightHistory } from '@/hooks/use-fitness-data';

const STATUS_COLOR = {
  green: colors.readinessGreen,
  yellow: colors.readinessYellow,
  red: colors.readinessRed,
} as const;

export default function ProgressScreen() {
  const { data: weight } = useWeightHistory(30);
  const { data: readiness } = useReadinessHistory(14);

  return (
    <Screen title="Progress">
      <GlassCard>
        <Text style={styles.cardTitle}>Weight</Text>
        <Text style={styles.cardHint}>Last 30 days</Text>
        <View style={styles.chart}>
          <LineChart points={weight ?? []} color={colors.metricBlue} unit="kg" />
        </View>
      </GlassCard>

      <GlassCard>
        <Text style={styles.cardTitle}>Readiness</Text>
        <Text style={styles.cardHint}>Last 14 days</Text>
        {readiness && readiness.length > 0 ? (
          <View style={styles.bars}>
            {readiness.map((d) => (
              <View key={d.date} style={styles.barSlot}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${Math.max(8, d.value)}%`,
                      backgroundColor: STATUS_COLOR[d.status] ?? colors.readinessYellow,
                    },
                  ]}
                />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyBars}>
            <Text style={styles.cardHint}>Log sleep and training to build your trend</Text>
          </View>
        )}
      </GlassCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTitle: { ...type.headline, color: colors.foreground },
  cardHint: { ...type.footnote, color: colors.mutedForeground, marginTop: 2 },
  chart: { marginTop: spacing.md },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 120,
    marginTop: spacing.md,
  },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { borderRadius: 4, width: '100%' },
  emptyBars: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
