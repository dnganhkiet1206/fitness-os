import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

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
    <Screen
      title={i18n.navProgress}
      headerRight={
        <View style={styles.headerButtons}>
          <Pressable
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            onPress={() => { Haptics.selectionAsync(); router.push('/weekly-review'); }}>
            {Platform.OS === 'ios' ? (
              <SymbolView name="sparkles.rectangle.stack" size={18} tintColor={colors.mutedForeground} />
            ) : (
              <Text style={styles.iconFallback}>✦</Text>
            )}
          </Pressable>
          <Pressable
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            onPress={() => { Haptics.selectionAsync(); router.push('/smart-goals'); }}>
            {Platform.OS === 'ios' ? (
              <SymbolView name="brain.head.profile" size={19} tintColor={colors.mutedForeground} />
            ) : (
              <Text style={styles.iconFallback}>◈</Text>
            )}
          </Pressable>
          <Pressable
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            onPress={() => { Haptics.selectionAsync(); router.push('/challenges'); }}>
            {Platform.OS === 'ios' ? (
              <SymbolView name="target" size={20} tintColor={colors.mutedForeground} />
            ) : (
              <Text style={styles.iconFallback}>◎</Text>
            )}
          </Pressable>
          <Pressable
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            onPress={() => { Haptics.selectionAsync(); router.push('/awards'); }}>
            {Platform.OS === 'ios' ? (
              <SymbolView name="trophy.fill" size={19} tintColor={colors.mutedForeground} />
            ) : (
              <Text style={styles.iconFallback}>🏆</Text>
            )}
          </Pressable>
        </View>
      }>
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
  headerButtons: { flexDirection: 'row', gap: spacing.sm },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  iconFallback: { fontSize: 14, color: colors.mutedForeground },
  pressed: { opacity: 0.85, transform: [{ scale: 0.95 }] },
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
