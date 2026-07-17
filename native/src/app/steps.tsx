import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useStepsHistory } from '@/hooks/use-fitness-data';

const GOAL = 10000;

export default function StepsScreen() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { data: history } = useStepsHistory(14);

  const stats = useMemo(() => {
    const h = history ?? [];
    const last7 = h.slice(-7);
    const today = h.length > 0 ? h[h.length - 1].steps : 0;
    const avg = last7.length > 0 ? Math.round(last7.reduce((s, d) => s + d.steps, 0) / last7.length) : 0;
    const recent3 = h.slice(-3).map((d) => d.steps);
    const older3 = h.slice(-6, -3).map((d) => d.steps);
    const avgR = recent3.length ? recent3.reduce((a, b) => a + b, 0) / recent3.length : 0;
    const avgO = older3.length ? older3.reduce((a, b) => a + b, 0) / older3.length : 0;
    const trend = avgO > 0 ? ((avgR - avgO) / avgO) * 100 : 0;
    return { today, avg, last7, trend };
  }, [history]);

  const pct = Math.min(100, (stats.today / GOAL) * 100);
  const maxWeek = Math.max(GOAL, ...stats.last7.map((d) => d.steps));

  return (
    <Screen back title={i18n.nStepsTitle}>
      <GlassCard>
        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.bigValue}>{stats.today.toLocaleString()}</Text>
            <Text style={styles.cardHint}>{i18n.nStepsGoal.replace('{x}', GOAL.toLocaleString())}</Text>
          </View>
          <Text style={styles.pct}>{Math.round(pct)}%</Text>
        </View>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${pct}%` }]} />
        </View>
      </GlassCard>

      <View style={styles.statRow}>
        <GlassCard style={styles.statCard}>
          <Text style={styles.statValue}>{stats.avg.toLocaleString()}</Text>
          <Text style={styles.statLabel}>{i18n.nDailyAvg}</Text>
        </GlassCard>
        <GlassCard style={styles.statCard}>
          <Text style={[styles.statValue, { color: stats.trend >= 0 ? colors.readinessGreen : colors.readinessRed }]}>
            {stats.trend >= 0 ? '↑' : '↓'} {Math.abs(Math.round(stats.trend))}%
          </Text>
          <Text style={styles.statLabel}>{i18n.nLast7Days}</Text>
        </GlassCard>
      </View>

      <GlassCard>
        <Text style={styles.cardTitle}>{i18n.nLast7Days}</Text>
        <View style={styles.chart}>
          {stats.last7.map((d) => {
            const h = maxWeek > 0 ? (d.steps / maxWeek) * 100 : 0;
            const met = d.steps >= GOAL;
            const dayLetter = new Date(d.date).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { weekday: 'short' });
            return (
              <View key={d.date} style={styles.barCol}>
                <View style={styles.barColTrack}>
                  <View style={[styles.barColFill, { height: `${Math.max(3, h)}%`, backgroundColor: met ? colors.primary : colors.secondary }]} />
                </View>
                <Text style={styles.barColLabel}>{dayLetter}</Text>
              </View>
            );
          })}
        </View>
      </GlassCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTitle: { ...type.headline, color: colors.foreground },
  cardHint: { ...type.footnote, color: colors.mutedForeground, marginTop: 2 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  bigValue: { ...type.largeTitle, ...type.mono, color: colors.foreground },
  pct: { ...type.title, color: colors.primary, fontVariant: ['tabular-nums'] },
  barTrack: { height: 10, borderRadius: 5, backgroundColor: colors.background, overflow: 'hidden', marginTop: spacing.md },
  barFill: { height: '100%', borderRadius: 5, backgroundColor: colors.primary },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: { flex: 1, gap: 2 },
  statValue: { ...type.title, ...type.mono, color: colors.foreground },
  statLabel: { ...type.caption, color: colors.mutedForeground },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: 130, marginTop: spacing.md },
  barCol: { flex: 1, alignItems: 'center', gap: 6 },
  barColTrack: { width: '60%', height: 104, justifyContent: 'flex-end', backgroundColor: colors.background, borderRadius: 4, overflow: 'hidden' },
  barColFill: { width: '100%', borderRadius: 4 },
  barColLabel: { ...type.caption, color: colors.mutedForeground },
});
