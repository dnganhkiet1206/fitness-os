import { useMutation, useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import {
  Activity,
  AlertTriangle,
  Beef,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Flame,
  Minus,
  Moon,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LineChart } from '@/components/ascnd/line-chart';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { rise } from '@/lib/entrance';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { AI_FAILURE_KEY, callAi, EDGE_FUNCTIONS } from '@/lib/ai';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/useTodayData';
import { supabase } from '@/integrations/supabase/client';
import { localDateStr, localDayRangeISO } from '@/lib/local-date';

interface AIInsight {
  category: string;
  icon: string;
  title: string;
  detail: string;
  trend: 'up' | 'down' | 'stable';
}
interface AIRecommendation {
  priority: 'high' | 'medium' | 'low';
  action: string;
  reason: string;
}
interface AIAnalysis {
  summary: string;
  score: number;
  insights: AIInsight[];
  recommendations: AIRecommendation[];
}

const TREND = { up: '↑', down: '↓', stable: '→' } as const;
const PRIORITY_COLOR = {
  high: '#dc2f2f',
  medium: '#ef7c26',
  low: '#a8b2c4',
} as const;

const DAYS_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

/** 7-day bar chart drawn with plain views (web BarChart equivalent) */
function WeekBars({
  data,
  color,
  target,
  unit,
  days,
}: {
  data: number[];
  color: string;
  target?: number;
  unit?: string;
  days: string[];
}) {
  const max = Math.max(...data, target ?? 0, 1);
  return (
    <View style={barStyles.wrap}>
      <View style={barStyles.chart}>
        {target != null && target > 0 && (
          <View style={[barStyles.targetLine, { bottom: `${(target / max) * 100}%` }]} />
        )}
        {data.map((v, i) => (
          <View key={i} style={barStyles.col}>
            <View style={barStyles.barTrack}>
              <View
                style={[
                  barStyles.bar,
                  { height: `${Math.max((v / max) * 100, v > 0 ? 3 : 0)}%`, backgroundColor: color },
                ]}
              />
            </View>
          </View>
        ))}
      </View>
      <View style={barStyles.labels}>
        {days.map((d, i) => (
          <View key={i} style={barStyles.col}>
            <Text style={barStyles.dayLabel}>{d}</Text>
            <Text style={barStyles.valLabel} numberOfLines={1}>
              {data[i] > 0 ? `${Math.round(data[i] * 10) / 10}${unit ?? ''}` : '·'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function WeeklyReviewScreen() {
  const { user, session } = useAuth();
  const { data: profile } = useProfile();
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';
  const DAYS = lang === 'vi' ? DAYS_VI : DAYS_EN;
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = useMemo(() => {
    const ws = getWeekStart(new Date());
    ws.setDate(ws.getDate() + weekOffset * 7);
    return ws;
  }, [weekOffset]);
  const weekEnd = useMemo(() => {
    const we = new Date(weekStart);
    we.setDate(we.getDate() + 7);
    return we;
  }, [weekStart]);
  const startStr = localDateStr(weekStart);
  const endStr = localDateStr(weekEnd);

  const rangeLabel = `${weekStart.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${new Date(
    weekEnd.getTime() - 86400000,
  ).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`;

  const { data: dailyLogs } = useQuery({
    queryKey: ['wr_daily', user?.id, startStr],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('daily_logs')
        .select('date, kcal, protein_g, volume_load, readiness_score')
        .eq('user_id', user!.id)
        .gte('date', startStr)
        .lt('date', endStr)
        .order('date');
      return data ?? [];
    },
  });

  const { data: workouts } = useQuery({
    queryKey: ['wr_workouts', user?.id, startStr],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('workout_sessions')
        .select('id, date_time, pain_flags')
        .eq('user_id', user!.id)
        .gte('date_time', localDayRangeISO(startStr).start)
        .lt('date_time', localDayRangeISO(endStr).start);
      return data ?? [];
    },
  });

  const { data: sleepLogs } = useQuery({
    queryKey: ['wr_sleep', user?.id, startStr],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('sleep_logs')
        .select('waketime, deep_min, rem_min, light_min')
        .eq('user_id', user!.id)
        .gte('waketime', localDayRangeISO(startStr).start)
        .lt('waketime', localDayRangeISO(endStr).start);
      return data ?? [];
    },
  });

  const { data: prevLogs } = useQuery({
    queryKey: ['wr_prev', user?.id, startStr],
    enabled: !!user,
    queryFn: async () => {
      const prevStart = new Date(weekStart);
      prevStart.setDate(prevStart.getDate() - 7);
      const { data } = await supabase
        .from('daily_logs')
        .select('kcal, protein_g, volume_load')
        .eq('user_id', user!.id)
        .gte('date', localDateStr(prevStart))
        .lt('date', startStr);
      return data ?? [];
    },
  });

  const { data: monthLogs } = useQuery({
    queryKey: ['wr_month', user?.id, startStr],
    enabled: !!user,
    queryFn: async () => {
      const d = new Date(weekEnd);
      d.setDate(d.getDate() - 28);
      const { data } = await supabase
        .from('daily_logs')
        .select('volume_load')
        .eq('user_id', user!.id)
        .gte('date', localDateStr(d))
        .lt('date', endStr);
      return data ?? [];
    },
  });

  const analyze = useMutation({
    mutationFn: async () => {
      const res = await callAi<AIAnalysis>(EDGE_FUNCTIONS.weeklyReview, {
        week_start: startStr,
        lang,
      });
      // The alert this feeds used to print the raw client message, which for a
      // missing function reads `Edge Function returned a non-2xx status code`.
      if (!res.ok) throw new Error(i18n[AI_FAILURE_KEY[res.failure]]);
      return res.data;
    },
    onSuccess: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    onError: (e: Error) => Alert.alert('ASCND', e.message),
  });

  const a = analyze.data;

  // ── Stats (web computation, verbatim) ────────────────────────────────
  const logs = dailyLogs ?? [];
  const daysWithData = logs.length;
  const targets = {
    kcal: profile?.tdee_target_kcal ?? 2200,
    protein: profile?.macro_protein_g ?? 140,
    sleepH: Number(profile?.sleep_target_hours) || 8,
  };

  const avgKcal = avg(logs.map((l) => Number(l.kcal) || 0));
  const avgProtein = avg(logs.map((l) => Number(l.protein_g) || 0));
  const avgSleepMin = avg(
    (sleepLogs ?? []).map((s) => (s.deep_min ?? 0) + (s.rem_min ?? 0) + (s.light_min ?? 0)),
  );
  const avgSleepH = avgSleepMin / 60;
  const totalVolume = sum(logs.map((l) => Number(l.volume_load) || 0));
  const workoutCount = (workouts ?? []).length;
  const avgReadiness = avg(
    logs.filter((l) => l.readiness_score).map((l) => Number(l.readiness_score)),
  );

  const pLogs = prevLogs ?? [];
  const prevAvgKcal = avg(pLogs.map((l) => Number(l.kcal) || 0));
  const prevAvgProtein = avg(pLogs.map((l) => Number(l.protein_g) || 0));
  const prevTotalVolume = sum(pLogs.map((l) => Number(l.volume_load) || 0));

  const chartData = DAYS.map((day, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dateStr = localDateStr(d);
    const log = logs.find((l) => l.date === dateStr);
    const sleep = (sleepLogs ?? []).find(
      (s) => localDateStr(new Date(s.waketime)) === dateStr,
    );
    const sleepMin = sleep ? (sleep.deep_min ?? 0) + (sleep.rem_min ?? 0) + (sleep.light_min ?? 0) : 0;
    return {
      day,
      date: dateStr,
      kcal: Number(log?.kcal) || 0,
      protein: Number(log?.protein_g) || 0,
      sleep_h: +(sleepMin / 60).toFixed(1),
      volume: Number(log?.volume_load) || 0,
      readiness: Number(log?.readiness_score) || 0,
    };
  });

  // ACWR
  const load7d = totalVolume;
  const load28d = sum((monthLogs ?? []).map((l) => Number(l.volume_load) || 0));
  const chronicAvg = load28d / 28;
  const acwr = chronicAvg > 0 ? +((load7d / 7) / chronicAvg).toFixed(2) : 0;

  // Pain flags
  const painFlags = (workouts ?? []).flatMap((w) => {
    const flags = Array.isArray(w.pain_flags)
      ? (w.pain_flags as { bodyPart: string; pain_0_10: number }[])
      : [];
    return flags.filter((f) => f.pain_0_10 >= 5);
  });

  // Adaptive training recommendations (web rules) — localized per lang
  const L = (vi: string, en: string) => (lang === 'vi' ? vi : en);
  const recommendations: { kind: 'success' | 'warning' | 'info'; text: string }[] = [];
  if (acwr > 1.5) {
    recommendations.push({ kind: 'warning', text: L(
      `ACWR cao (${acwr}). Giảm 15-20% volume tuần tới để tránh chấn thương.`,
      `ACWR high (${acwr}). Cut volume 15-20% next week to avoid injury.`) });
  } else if (acwr > 1.3) {
    recommendations.push({ kind: 'warning', text: L(
      `ACWR hơi cao (${acwr}). Giảm 5-10% volume hoặc bớt 1-2 sets/bài tập.`,
      `ACWR slightly high (${acwr}). Cut 5-10% volume or drop 1-2 sets per exercise.`) });
  } else if (acwr < 0.6 && load7d > 0) {
    recommendations.push({ kind: 'info', text: L(
      `ACWR thấp (${acwr}). Có thể tăng 10-15% volume dần dần.`,
      `ACWR low (${acwr}). You can add 10-15% volume gradually.`) });
  } else if (acwr >= 0.8 && acwr <= 1.3) {
    recommendations.push({ kind: 'success', text: L(
      `ACWR tối ưu (${acwr}). Giữ nguyên hoặc tăng nhẹ 5% volume.`,
      `ACWR optimal (${acwr}). Hold steady or bump volume ~5%.`) });
  }
  if (avgReadiness < 50 && daysWithData >= 3) {
    recommendations.push({ kind: 'warning', text: L(
      'Readiness trung bình thấp. Cân nhắc tuần deload: giảm 40-50% volume, giữ cường độ.',
      'Low average readiness. Consider a deload week: cut volume 40-50%, keep intensity.') });
  } else if (avgReadiness >= 75) {
    recommendations.push({ kind: 'success', text: L(
      'Phục hồi tốt! Có thể đẩy progressive overload: +2.5kg hoặc +1 rep mỗi bài chính.',
      'Great recovery! Push progressive overload: +2.5kg or +1 rep on your main lifts.') });
  }
  if (avgSleepH < targets.sleepH - 1) {
    recommendations.push({ kind: 'warning', text: L(
      `Thiếu ngủ (${avgSleepH.toFixed(1)}h vs ${targets.sleepH}h). Ưu tiên ngủ trước khi tăng volume.`,
      `Sleep debt (${avgSleepH.toFixed(1)}h vs ${targets.sleepH}h). Prioritize sleep before adding volume.`) });
  }
  if (avgProtein < targets.protein * 0.8 && daysWithData >= 3) {
    recommendations.push({ kind: 'info', text: L(
      `Protein thấp (${Math.round(avgProtein)}g vs ${targets.protein}g). Tăng protein để hỗ trợ phục hồi.`,
      `Low protein (${Math.round(avgProtein)}g vs ${targets.protein}g). Increase protein to support recovery.`) });
  }
  if (painFlags.length > 0) {
    const parts = [...new Set(painFlags.map((f) => f.bodyPart))].join(', ');
    recommendations.push({ kind: 'warning', text: L(
      `Có cảnh báo đau: ${parts}. Tránh bài tập trực tiếp vùng này hoặc giảm tải.`,
      `Pain flagged: ${parts}. Avoid direct work on these areas or reduce load.`) });
  }
  if (totalVolume > prevTotalVolume * 1.15 && prevTotalVolume > 0) {
    recommendations.push({ kind: 'info', text: L(
      `Volume tăng ${Math.round((totalVolume / prevTotalVolume - 1) * 100)}% so với tuần trước. Theo dõi phục hồi.`,
      `Volume up ${Math.round((totalVolume / prevTotalVolume - 1) * 100)}% vs last week. Watch your recovery.`) });
  }

  const delta = (curr: number, prev: number) => (prev ? Math.round(((curr - prev) / prev) * 100) : null);

  const statCards: {
    icon: LucideIcon;
    label: string;
    value: string;
    sub: string;
    d: number | null;
  }[] = [
    { icon: Flame, label: i18n.weeklyReviewAvgCalories, value: `${Math.round(avgKcal)}`, sub: `/${targets.kcal}`, d: delta(avgKcal, prevAvgKcal) },
    { icon: Beef, label: i18n.weeklyReviewAvgProtein, value: `${Math.round(avgProtein)}g`, sub: `/${targets.protein}g`, d: delta(avgProtein, prevAvgProtein) },
    { icon: Moon, label: i18n.weeklyReviewAvgSleep, value: `${avgSleepH.toFixed(1)}h`, sub: `/${targets.sleepH}h`, d: null },
    { icon: Dumbbell, label: i18n.weeklyReviewVolume, value: `${Math.round(totalVolume / 1000)}k`, sub: `${workoutCount} ${i18n.weeklyReviewSessions}`, d: delta(totalVolume, prevTotalVolume) },
    { icon: Activity, label: i18n.weeklyReviewReadiness, value: `${Math.round(avgReadiness)}`, sub: acwr ? `ACWR ${acwr}` : '—', d: null },
  ];

  const REC_STYLE = {
    warning: { color: '#dc2f2f', bg: 'rgba(220,47,47,0.1)', icon: AlertTriangle },
    success: { color: colors.readinessGreen, bg: 'rgba(43,245,168,0.1)', icon: CheckCircle2 },
    info: { color: colors.metricBlue, bg: 'rgba(59,166,255,0.1)', icon: Activity },
  } as const;

  const readinessPoints = chartData
    .filter((c) => c.readiness > 0)
    .map((c) => ({ date: c.date, value: c.readiness }));

  return (
    <Screen back title={i18n.weeklyReviewTitle}>
      {/* Week navigation (web) */}
      <View style={styles.weekNav}>
        <Pressable
          hitSlop={8}
          style={({ pressed }) => [styles.weekBtn, pressed && styles.pressed]}
          onPress={() => {
            Haptics.selectionAsync();
            analyze.reset();
            setWeekOffset((o) => o - 1);
          }}>
          <Icon icon={ChevronLeft} size={16} color={colors.mutedForeground} />
        </Pressable>
        <Text style={styles.weekLabel}>{rangeLabel}</Text>
        <Pressable
          hitSlop={8}
          disabled={weekOffset >= 0}
          style={({ pressed }) => [styles.weekBtn, weekOffset >= 0 && styles.disabled, pressed && styles.pressed]}
          onPress={() => {
            Haptics.selectionAsync();
            analyze.reset();
            setWeekOffset((o) => Math.min(o + 1, 0));
          }}>
          <Icon icon={ChevronRight} size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Summary stat tiles */}
      <Animated.View style={styles.statGrid} entering={rise(0)}>
        {statCards.map((c, i) => (
          <GlassCard key={i} style={styles.statCard}>
            <View style={styles.statHead}>
              <View style={styles.statLabelRow}>
                <Icon icon={c.icon} size={13} color={colors.mutedForeground} />
                <Text style={styles.statLabel} numberOfLines={1}>{c.label}</Text>
              </View>
              {c.d != null && c.d !== 0 && (
                <View style={styles.deltaRow}>
                  <Icon
                    icon={c.d > 0 ? TrendingUp : TrendingDown}
                    size={11}
                    color={c.d > 0 ? colors.readinessGreen : '#dc2f2f'}
                  />
                  <Text style={[styles.deltaText, { color: c.d > 0 ? colors.readinessGreen : '#dc2f2f' }]}>
                    {Math.abs(c.d)}%
                  </Text>
                </View>
              )}
              {c.d === 0 && <Icon icon={Minus} size={11} color={colors.mutedForeground} />}
            </View>
            <Text style={styles.statValue}>{c.value}</Text>
            <Text style={styles.statSub}>{c.sub}</Text>
          </GlassCard>
        ))}
      </Animated.View>

      {daysWithData > 0 ? (
        <>
          {/* Daily calories */}
          <Animated.View entering={rise(1)}>
          <GlassCard>
            <Text style={styles.microTitle}>{i18n.weeklyReviewDailyNutrition}</Text>
            <WeekBars data={chartData.map((c) => c.kcal)} color="#ef7c26" target={targets.kcal} days={DAYS} />
          </GlassCard>
          </Animated.View>

          {/* Sleep + Volume */}
          <Animated.View entering={rise(2)}>
          <GlassCard>
            <Text style={styles.microTitle}>{i18n.weeklyReviewSleepChart}</Text>
            <WeekBars data={chartData.map((c) => c.sleep_h)} color="#b45cff" target={targets.sleepH} unit="h" days={DAYS} />
          </GlassCard>
          </Animated.View>
          <Animated.View entering={rise(3)}>
          <GlassCard>
            <Text style={styles.microTitle}>Volume Load</Text>
            <WeekBars data={chartData.map((c) => c.volume)} color={colors.metricBlue} days={DAYS} />
          </GlassCard>
          </Animated.View>

          {/* Readiness trend */}
          <Animated.View entering={rise(4)}>
          <GlassCard>
            <Text style={styles.microTitle}>{i18n.weeklyReviewReadinessChart}</Text>
            <LineChart points={readinessPoints} color="#ffd93d" height={140} />
          </GlassCard>
          </Animated.View>

          {/* Adaptive recommendations */}
          {recommendations.length > 0 && (
            <Animated.View entering={rise(5)}>
            <GlassCard>
              <View style={styles.microTitleRow}>
                <Icon icon={Target} size={14} color={colors.readinessGreen} />
                <Text style={styles.microTitle}>{i18n.weeklyReviewRecommendations}</Text>
              </View>
              <View style={styles.recList}>
                {recommendations.map((r, i) => {
                  const rs = REC_STYLE[r.kind];
                  return (
                    <View key={i} style={[styles.recRow, { backgroundColor: rs.bg }]}>
                      <Icon icon={rs.icon} size={15} color={rs.color} />
                      <Text style={styles.recText}>{r.text}</Text>
                    </View>
                  );
                })}
              </View>
            </GlassCard>
            </Animated.View>
          )}

          {/* AI analysis */}
          {!a ? (
            <Animated.View entering={rise(6)}>
            <GlassCard>
              <View style={styles.titleRow}>
                <Icon icon={Sparkles} size={17} color={colors.primary} />
                <Text style={styles.title}>{i18n.nAiAnalysis}</Text>
              </View>
              <Text style={styles.hint}>{i18n.nWeeklyReviewHint}</Text>
              <Pressable
                style={({ pressed }) => [styles.cta, analyze.isPending && styles.disabled, pressed && styles.pressed]}
                disabled={analyze.isPending}
                onPress={() => analyze.mutate()}>
                {analyze.isPending ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={styles.ctaText}>{i18n.nAnalyzeWeek}</Text>
                )}
              </Pressable>
            </GlassCard>
            </Animated.View>
          ) : (
            <>
              <Animated.View entering={rise(6)}>
              <GlassCard>
                <Text style={styles.title}>{i18n.nWeekScore}</Text>
                <Text style={styles.score}>{a.score}</Text>
                <Text style={styles.summary}>{a.summary}</Text>
              </GlassCard>
              </Animated.View>

              {a.insights?.map((ins, i) => (
                <Animated.View key={i} entering={rise(7 + i)}>
                <GlassCard style={styles.itemCard}>
                  <View style={styles.row}>
                    <Text style={styles.iconEmoji}>{ins.icon}</Text>
                    <View style={styles.info}>
                      <Text style={styles.itemTitle}>
                        {ins.title} <Text style={styles.trendMark}>{TREND[ins.trend] ?? ''}</Text>
                      </Text>
                      <Text style={styles.hint}>{ins.detail}</Text>
                    </View>
                  </View>
                </GlassCard>
                </Animated.View>
              ))}

              {a.recommendations?.map((rec, i) => (
                <Animated.View key={`r${i}`} entering={rise(8 + i)}>
                <GlassCard style={styles.itemCard}>
                  <View style={styles.row}>
                    <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLOR[rec.priority] ?? colors.border }]} />
                    <View style={styles.info}>
                      <Text style={styles.itemTitle}>{rec.action}</Text>
                      <Text style={styles.hint}>{rec.reason}</Text>
                    </View>
                  </View>
                </GlassCard>
                </Animated.View>
              ))}
            </>
          )}
        </>
      ) : (
        <GlassCard>
          <Text style={styles.hint}>{i18n.noData}</Text>
        </GlassCard>
      )}
    </Screen>
  );
}

const barStyles = StyleSheet.create({
  wrap: { marginTop: spacing.sm },
  chart: {
    height: 120,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  targetLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  col: { flex: 1, alignItems: 'center' },
  barTrack: { width: '100%', height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4, opacity: 0.85 },
  labels: { flexDirection: 'row', gap: 6, marginTop: 6 },
  dayLabel: { fontSize: 9, color: colors.mutedForeground, textAlign: 'center' },
  valLabel: { ...type.mono, fontSize: 8, color: colors.mutedForeground, textAlign: 'center' },
});

const styles = StyleSheet.create({
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: -spacing.sm,
  },
  weekBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  weekLabel: { ...type.footnote, fontWeight: '600', color: colors.foreground, minWidth: 130, textAlign: 'center' },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 4 },
  statCard: { width: '47.5%', gap: 4, paddingVertical: spacing.md },
  statHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  statLabel: {
    flex: 1,
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.mutedForeground,
  },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  deltaText: { ...type.mono, fontSize: 10 },
  statValue: { ...type.mono, fontSize: 22, fontWeight: '700', color: colors.foreground },
  statSub: { fontSize: 10, color: colors.mutedForeground },

  microTitle: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: colors.mutedForeground,
  },
  microTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  recList: { gap: spacing.sm, marginTop: spacing.sm },
  recRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
    padding: spacing.sm + 4,
    borderRadius: radius.md,
  },
  recText: { ...type.footnote, color: colors.secondaryForeground, flex: 1, lineHeight: 19 },

  title: { ...type.headline, color: colors.foreground },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hint: { ...type.footnote, color: colors.mutedForeground, marginTop: 4, lineHeight: 18 },
  cta: {
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  ctaText: { ...type.headline, color: colors.primaryForeground },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
  score: { fontSize: 44, fontWeight: '700', color: colors.foreground, marginTop: spacing.sm },
  summary: { ...type.body, color: colors.secondaryForeground, marginTop: spacing.sm, lineHeight: 21 },
  itemCard: { paddingVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  iconEmoji: { fontSize: 22 },
  info: { flex: 1, minWidth: 0 },
  itemTitle: { ...type.body, fontWeight: '600', color: colors.foreground },
  trendMark: { color: colors.mutedForeground },
  priorityDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
});
