import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { LineChart } from '@/components/ascnd/line-chart';
import { Screen } from '@/components/ascnd/screen';
import { colors, spacing, type } from '@/constants/ascnd';
import { useReadinessHistory, useWeightHistory } from '@/hooks/use-fitness-data';
import { useI18n } from '@/hooks/use-app-settings';

const STATUS_COLOR = {
  green: colors.readinessGreen,
  yellow: colors.readinessYellow,
  red: colors.readinessRed,
} as const;

export default function ProgressScreen() {
  const { data: weight } = useWeightHistory(30);
  const { data: readiness } = useReadinessHistory(14);
  const i18n = useI18n();

  return (
    <Screen title={i18n.navProgress}>
      <GlassCard>
        <Text style={styles.cardTitle}>{i18n.nWeight}</Text>
        <Text style={styles.cardHint}>{i18n.nLast30d}</Text>
        <View style={styles.chart}>
          <LineChart points={weight ?? []} color={colors.metricBlue} unit="kg" emptyLabel={i18n.nNotEnoughData} />
        </View>
      </GlassCard>

      <GlassCard>
        <Text style={styles.cardTitle}>{i18n.nReadiness}</Text>
        <Text style={styles.cardHint}>{i18n.nLast14d}</Text>
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
            <Text style={styles.cardHint}>{i18n.nBuildTrendHint}</Text>
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
