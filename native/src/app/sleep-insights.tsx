import { Lightbulb } from 'lucide-react-native';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { rise } from '@/lib/entrance';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useProfile, useSleepHistory } from '@/hooks/useTodayData';
import { getLocale } from '@/lib/i18n';

const DEEP = colors.metricPurple;
const REM = colors.metricCyan;
const LIGHT = '#565663';

export default function SleepInsightsScreen() {
  const { lang } = useAppSettings();
  const i18n = useI18n();
  const locale = getLocale(lang);
  const { data: sleepLogs } = useSleepHistory(7);
  const { data: profile } = useProfile();
  const targetHours = Number(profile?.sleep_target_hours) || 8;

  const nights = useMemo(
    () =>
      (sleepLogs ?? []).map((s) => {
        const deep = Number(s.deep_min ?? 0);
        const rem = Number(s.rem_min ?? 0);
        const light = Number(s.light_min ?? 0);
        const total = deep + rem + light;
        const wake = new Date(s.waketime);
        return {
          day: wake.toLocaleDateString(locale, { weekday: 'short' }),
          total_h: total / 60,
          deep_h: deep / 60,
          rem_h: rem / 60,
          light_h: light / 60,
          quality: Number(s.quality ?? 0),
        };
      }),
    [sleepLogs, locale],
  );

  const stats = useMemo(() => {
    if (nights.length === 0) return null;
    const n = nights.length;
    const sum = (f: (x: (typeof nights)[number]) => number) => nights.reduce((a, x) => a + f(x), 0);
    const avgTotal = sum((d) => d.total_h) / n;
    const avgQuality = sum((d) => d.quality) / n;
    const avgDeep = sum((d) => d.deep_h) / n;
    const avgRem = sum((d) => d.rem_h) / n;
    const debt = Math.max(0, targetHours * 7 - sum((d) => d.total_h));
    return { avgTotal, avgQuality, avgDeep, avgRem, debt };
  }, [nights, targetHours]);

  const insights = useMemo(() => {
    if (!stats) return [];
    const out: string[] = [];
    if (stats.avgTotal < targetHours - 0.5) {
      out.push(
        lang === 'vi'
          ? `Bạn ngủ trung bình ${stats.avgTotal.toFixed(1)}h, thiếu ${(targetHours - stats.avgTotal).toFixed(1)}h so với mục tiêu.`
          : `You sleep ${stats.avgTotal.toFixed(1)}h on average, short by ${(targetHours - stats.avgTotal).toFixed(1)}h vs target.`,
      );
    }
    if (stats.avgDeep < 1) {
      out.push(
        lang === 'vi'
          ? 'Deep sleep thấp (<1h). Hãy tránh rượu và caffeine trước giờ ngủ.'
          : 'Deep sleep is low (<1h). Avoid alcohol and caffeine before bed.',
      );
    }
    if (stats.avgRem < 1.2) {
      out.push(
        lang === 'vi'
          ? 'REM sleep thấp. Cố gắng đi ngủ đều giờ hơn.'
          : 'REM sleep is low. Try to keep a consistent bedtime.',
      );
    }
    if (stats.debt > 5) {
      out.push(
        lang === 'vi'
          ? `Nợ giấc ngủ tuần: ${stats.debt.toFixed(1)}h. Cân nhắc ngủ bù cuối tuần.`
          : `Weekly sleep debt: ${stats.debt.toFixed(1)}h. Consider catching up on weekends.`,
      );
    }
    if (stats.avgQuality >= 7) {
      out.push(lang === 'vi' ? 'Chất lượng giấc ngủ tốt! Giữ vững thói quen.' : 'Sleep quality is good! Keep it up.');
    }
    return out;
  }, [stats, targetHours, lang]);

  const maxH = Math.max(8, ...nights.map((n) => n.total_h));

  return (
    <Screen back title={i18n.sleepTitle}>
      {!stats ? (
        <GlassCard>
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{i18n.sleepNoData}</Text>
            <Text style={styles.emptyMsg}>{i18n.sleepNoDataMsg}</Text>
          </View>
        </GlassCard>
      ) : (
        <>
          {/* Stat grid */}
          <Animated.View style={styles.statGrid} entering={rise(0)}>
            <StatCard value={`${stats.avgTotal.toFixed(1)}h`} label={i18n.sleepAvg} color={colors.foreground} />
            <StatCard value={`${stats.avgQuality.toFixed(1)}`} label={i18n.sleepAvgQuality} color={colors.readinessGreen} />
            <StatCard value={`${stats.avgDeep.toFixed(1)}h`} label={i18n.sleepAvgDeep} color={DEEP} />
            <StatCard value={`${stats.debt.toFixed(1)}h`} label={i18n.sleepDebt} color={stats.debt > 5 ? colors.readinessRed : colors.mutedForeground} />
          </Animated.View>

          {/* Stage chart */}
          <Animated.View entering={rise(1)}>
          <GlassCard>
            <Text style={styles.cardTitle}>{i18n.sleepStages}</Text>
            <View style={styles.legend}>
              <LegendDot color={DEEP} label={i18n.sleepDeep} />
              <LegendDot color={REM} label="REM" />
              <LegendDot color={LIGHT} label="Light" />
            </View>
            <View style={styles.chart}>
              {nights.map((n, i) => (
                <View key={i} style={styles.barCol}>
                  <View style={styles.barTrack}>
                    <View style={{ flexGrow: Math.max(0, maxH - n.total_h) }} />
                    <View style={[styles.barSeg, { flexGrow: n.light_h, backgroundColor: LIGHT }]} />
                    <View style={[styles.barSeg, { flexGrow: n.rem_h, backgroundColor: REM }]} />
                    <View style={[styles.barSeg, { flexGrow: n.deep_h, backgroundColor: DEEP }]} />
                  </View>
                  <Text style={styles.barLabel}>{n.day}</Text>
                </View>
              ))}
            </View>
          </GlassCard>
          </Animated.View>

          {/* Insights */}
          {insights.length > 0 && (
            <Animated.View entering={rise(2)}>
            <GlassCard>
              <View style={styles.cardTitleRow}>
                <Icon icon={Lightbulb} size={15} color={colors.readinessYellow} />
                <Text style={styles.cardTitle}>{i18n.sleepInsights}</Text>
              </View>
              <View style={styles.insightList}>
                {insights.map((text, i) => (
                  <View key={i} style={styles.insightRow}>
                    <Text style={styles.insightBullet}>•</Text>
                    <Text style={styles.insightText}>{text}</Text>
                  </View>
                ))}
              </View>
            </GlassCard>
            </Animated.View>
          )}
        </>
      )}
    </Screen>
  );
}

function StatCard({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <GlassCard style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </GlassCard>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardTitle: { ...type.headline, color: colors.foreground },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  empty: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.xs },
  emptyTitle: { ...type.body, color: colors.foreground, fontWeight: '600' },
  emptyMsg: { ...type.footnote, color: colors.mutedForeground, textAlign: 'center' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCard: { width: '47.5%', alignItems: 'flex-start', gap: 2 },
  statValue: { ...type.title, ...type.mono },
  statLabel: { ...type.caption, color: colors.mutedForeground },
  legend: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 2 },
  legendText: { ...type.caption, color: colors.mutedForeground },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: 160, marginTop: spacing.md },
  barCol: { flex: 1, alignItems: 'center', gap: 6 },
  barTrack: { width: '70%', height: 140, flexDirection: 'column', backgroundColor: colors.background, borderRadius: 4, overflow: 'hidden' },
  barSeg: { width: '100%', flexBasis: 0 },
  barLabel: { ...type.caption, color: colors.mutedForeground },
  insightList: { marginTop: spacing.sm, gap: spacing.sm },
  insightRow: { flexDirection: 'row', gap: spacing.sm },
  insightBullet: { ...type.body, color: colors.primary },
  insightText: { ...type.footnote, color: colors.foreground, flex: 1, lineHeight: 19 },
});
