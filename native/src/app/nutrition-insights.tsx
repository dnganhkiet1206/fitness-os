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
import { fillCopy } from '@/lib/copy-fill';

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
        fillCopy(i18n.nCxInsightProteinGap, {
          avg: String(Math.round(stats.avgProtein)),
          gap: String(Math.round(gap)),
          target: String(targets.protein),
        }),
      );
    } else if (stats.proteinDays >= 5) {
      out.push(
        fillCopy(i18n.nCxInsightProteinHit, {
          days: String(stats.proteinDays),
          n: String(stats.n),
        }),
      );
    }
    if (targets.fiber > 0 && stats.avgFiber < targets.fiber * 0.6) {
      out.push(
        fillCopy(i18n.nCxInsightFiberLow, {
          avg: String(Math.round(stats.avgFiber)),
          target: String(targets.fiber),
        }),
      );
    }
    return out;
  }, [stats, targets, i18n]);

  const maxProtein = Math.max(targets.protein * 1.15, ...rows.map((r) => r.protein));

  return (
    <Screen
      refreshable
      back
      title={i18n.nCxInsightTitle7d}
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
          title={i18n.nCxInsightEmpty}
          hint={i18n.nCxInsightEmptyHint}
        />
      ) : (
        <View style={styles.body}>
          {stats && (
            <HeroMetric
              value={`${Math.round(stats.avgProtein)}g`}
              caption={fillCopy(i18n.nCxInsightProteinCaption, { target: String(targets.protein) })}
            />
          )}

          <GlassCard style={styles.card}>
            <Text style={styles.cardTitle}>{i18n.nCxInsightProteinTitle}</Text>
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
                <Text style={styles.cardTitle}>{i18n.nCxInsightHead}</Text>
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
