import { haptics as Haptics } from '@/lib/haptics';
import { nav } from '@/lib/nav';
import { Lightbulb, UtensilsCrossed } from 'lucide-react-native';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { HeroMetric } from '@/components/ascnd/hero-metric';
import { ChartBar } from '@/components/ascnd/chart-bar';
import { Icon } from '@/components/ascnd/icon';
import { EmptyState } from '@/components/ascnd/empty-state';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { Screen } from '@/components/ascnd/screen';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useProfile, useNutritionHistory } from '@/hooks/use-today-data';
import { macroTargetsFor } from '@/lib/macro-targets';
import { getLocale } from '@/lib/i18n';

/*
  P1-5 (DE-XUAT-2): nutrition was the most consistently logged domain and the
  only one with no trend view — sleep had stage bars + debt + findings,
  exercise had per-movement verdicts, nutrition had a progress bar.

  Follows the `sleep-insights.tsx` shape: hero metric, 7-day bars against the
  target line, auto findings. Protein first (the headline macro), fiber second
  (the one the meal plan used to drop — P1-6 DE-XUAT wired it through).
*/

const BAR_H = 140;

export default function NutritionInsightsScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const { lang } = useAppSettings();
  const i18n = useI18n();
  const locale = getLocale(lang);
  const vi = lang === 'vi';
  const { data: days, isPending, isError, refetch, isRefetching } = useNutritionHistory(7);
  const { data: profile } = useProfile();
  const targets = macroTargetsFor(profile);

  const rows = useMemo(
    () =>
      (days ?? []).map((d) => ({
        day: new Date(`${d.date}T12:00:00`).toLocaleDateString(locale, { weekday: 'short' }),
        protein: Number(d.protein_g) || 0,
        fiber: Number(d.fiber_g) || 0,
        kcal: Number(d.kcal) || 0,
      })),
    [days, locale],
  );

  const stats = useMemo(() => {
    if (rows.length === 0) return null;
    const n = rows.length;
    const avgProtein = rows.reduce((a, r) => a + r.protein, 0) / n;
    const avgFiber = rows.reduce((a, r) => a + r.fiber, 0) / n;
    const proteinDays = rows.filter((r) => r.protein >= targets.protein).length;
    return { avgProtein, avgFiber, proteinDays, n };
  }, [rows, targets.protein]);

  const insights = useMemo(() => {
    if (!stats) return [];
    const out: string[] = [];
    const gap = targets.protein - stats.avgProtein;
    if (gap > 10) {
      out.push(
        vi
          ? `Protein trung bình ${Math.round(stats.avgProtein)}g/ngày, thiếu ${Math.round(gap)}g so với mục tiêu ${targets.protein}g.`
          : `Averaging ${Math.round(stats.avgProtein)}g protein/day, ${Math.round(gap)}g short of your ${targets.protein}g target.`,
      );
    } else if (stats.proteinDays >= 5) {
      out.push(
        vi
          ? `Đạt mục tiêu protein ${stats.proteinDays}/${stats.n} ngày — giữ vững!`
          : `Hit your protein target ${stats.proteinDays}/${stats.n} days — keep it up!`,
      );
    }
    if (targets.fiber > 0 && stats.avgFiber < targets.fiber * 0.6) {
      out.push(
        vi
          ? `Chất xơ trung bình ${Math.round(stats.avgFiber)}g, thấp hơn nhiều so với mục tiêu ${targets.fiber}g. Thêm rau hoặc yến mạch vào bữa sáng.`
          : `Averaging ${Math.round(stats.avgFiber)}g fiber, well under your ${targets.fiber}g target. Add vegetables or oats to breakfast.`,
      );
    }
    return out;
  }, [stats, targets, vi]);

  const maxProtein = Math.max(targets.protein * 1.15, ...rows.map((r) => r.protein));

  return (
    <Screen
      refreshable
      back
      title={vi ? 'Dinh dưỡng 7 ngày' : '7-day nutrition'}
    >
      {isError ? (
        <LoadFailed i18n={i18n} onRetry={() => void refetch()} busy={isRefetching} />
      ) : isPending ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title={vi ? 'Chưa có dữ liệu' : 'No data yet'}
          hint={vi ? 'Ghi bữa ăn vài ngày để xem xu hướng ở đây.' : 'Log meals for a few days to see trends here.'}
        />
      ) : (
        <View style={styles.body}>
          {stats && (
            <HeroMetric
              value={`${Math.round(stats.avgProtein)}g`}
              caption={
                vi
                  ? `Protein trung bình/ngày · mục tiêu ${targets.protein}g`
                  : `Avg protein/day · target ${targets.protein}g`
              }
            />
          )}

          <GlassCard style={styles.card}>
            <Text style={styles.cardTitle}>{vi ? 'Protein 7 ngày qua' : 'Protein, last 7 days'}</Text>
            <View style={styles.bars}>
              {rows.map((r, i) => (
                <View key={i} style={styles.barCol}>
                  <View style={styles.barTrack}>
                    <ChartBar
                      heightPct={(r.protein / maxProtein) * 100}
                      color={r.protein >= targets.protein ? c.readinessGreen : c.primary}
                      delay={i * 45}
                    />
                    {/* Target line */}
                    <View
                      style={[
                        styles.targetLine,
                        { bottom: `${(targets.protein / maxProtein) * 100}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.barLabel}>{r.day}</Text>
                </View>
              ))}
            </View>
          </GlassCard>

          {insights.length > 0 && (
            <GlassCard style={styles.card}>
              <View style={styles.insightHead}>
                <Icon icon={Lightbulb} size={16} color={c.primary} />
                <Text style={styles.cardTitle}>{vi ? 'Nhận xét' : 'Insights'}</Text>
              </View>
              {insights.map((s, i) => (
                <Text key={i} style={styles.insight}>
                  {'•  '}
                  {s}
                </Text>
              ))}
            </GlassCard>
          )}
        </View>
      )}
    </Screen>
  );
}

const stylesFor = makeStyles((c) =>
  StyleSheet.create({
    body: { gap: spacing.lg, paddingBottom: spacing.xl },
    card: { padding: spacing.lg },
    cardTitle: { ...type.headline, color: c.foreground, marginBottom: spacing.md },
    bars: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: BAR_H + 24 },
    barCol: { flex: 1, alignItems: 'center' },
    barTrack: { width: '100%', height: BAR_H, justifyContent: 'flex-end', position: 'relative' },
    targetLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 2,
      backgroundColor: c.glassMuted,
      opacity: 0.6,
    },
    barLabel: { ...type.caption, color: c.glassMuted, marginTop: spacing.xs },
    insightHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    insight: { ...type.body, color: c.foreground, marginBottom: spacing.sm, lineHeight: 22 },
    center: { alignItems: 'center', paddingVertical: spacing.xl },
  }),
);
