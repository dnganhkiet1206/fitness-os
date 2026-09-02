import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LineChart } from '@/components/ascnd/line-chart';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { errorText } from '@/lib/error-copy';
import { useRise } from '@/lib/entrance';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { AI_FAILURE_KEY, callEdge, EDGE_FUNCTIONS } from '@/lib/edge';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/useTodayData';
import { supabase } from '@/integrations/supabase/client';
import { localDateStr, localDayRangeISO, weekStartOf } from '@/lib/local-date';
import { metricMean } from '@/lib/nutrition-mean';
import { deloadWarranted, recoveryBacked } from '@/lib/readiness-week';
import { latestAcwr } from '@/lib/training-card';

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

/* Shared with the challenges and the goals screen — see `weekStartOf`. */
const getWeekStart = weekStartOf;

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
  /* Lần vẽ đầu hiện NGAY, cascade chỉ chạy cho thứ mount vào một màn hình
     đã ở đó — xem `useRise`. Bản trước gọi `rise` trần, tức là mười cái
     lò xo bắt đầu bên trong giây đầu tiên của một màn cũng đang chạy truy
     vấn; khung hình rơi trong quãng đó để lại đúng giá trị đầu, và giá trị
     đầu của `FadeInDown` là chưa nhìn thấy. */
  const rise = useRise();
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
      const { data, error } = await supabase
        .from('daily_logs')
        /* `readiness_explain` travels with the score because the deload rule
           below is a recovery question and the score alone cannot answer it —
           see `lib/readiness-week.ts`. Same row, one more column, no new table
           and no new query. */
        .select('date, kcal, protein_g, volume_load, readiness_score, readiness_explain, acwr')
        .eq('user_id', user!.id)
        .gte('date', startStr)
        .lt('date', endStr)
        .order('date');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: workouts } = useQuery({
    queryKey: ['wr_workouts', user?.id, startStr],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('id, date_time, pain_flags')
        .eq('user_id', user!.id)
        .gte('date_time', localDayRangeISO(startStr).start)
        .lt('date_time', localDayRangeISO(endStr).start);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sleepLogs } = useQuery({
    queryKey: ['wr_sleep', user?.id, startStr],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sleep_logs')
        .select('waketime, deep_min, rem_min, light_min')
        .eq('user_id', user!.id)
        .gte('waketime', localDayRangeISO(startStr).start)
        .lt('waketime', localDayRangeISO(endStr).start);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: prevLogs } = useQuery({
    queryKey: ['wr_prev', user?.id, startStr],
    enabled: !!user,
    queryFn: async () => {
      const prevStart = new Date(weekStart);
      prevStart.setDate(prevStart.getDate() - 7);
      const { data, error } = await supabase
        .from('daily_logs')
        .select('kcal, protein_g, volume_load')
        .eq('user_id', user!.id)
        .gte('date', localDateStr(prevStart))
        .lt('date', startStr);
      if (error) throw error;
      return data ?? [];
    },
  });

  /*
    ── the analysis is kept, and it used to be thrown away ──

    This was a `useMutation`, which holds its result in component state and
    nothing else. Leave the screen and the week you just had analysed is gone;
    come back and the button is waiting again, ready to spend another model call
    on data that has not changed. That is the same mistake `SmartTipsCard` made
    with the daily insight, fixed there a while ago and never carried across.

    So it is a query now, keyed and cached. The cache is React Query's, held for
    a week (`gcTime`) and never considered stale (`staleTime: Infinity`) — a
    finished week is a finished week.

    ── the key is what decides when it may run again ──

    `week_start` and `lang` are obvious. `daysLogged` is the interesting one: it
    is how many days of that week have any data at all, and it is in the key so
    that *the analysis refreshes exactly when the week gains a day* and at no
    other time.

    That is deliberately not a "3 refreshes per week" budget. A budget makes the
    person decide when to spend one, which is a decision they cannot make well —
    they do not know whether anything has changed since the last run. The day
    count does know. A past week's count never changes, so its analysis is
    computed once and kept for good; the current week's changes at most six more
    times, and every one of those is a moment where the answer genuinely should
    be different because the app now knows something it did not.

    ── and it still does not run on its own ──

    `enabled` is the button, or a cache that already holds this exact key. The
    screen has charts and stats above the AI card that are worth opening it for,
    so arriving must not spend a call — but arriving at a week already analysed
    should show the analysis rather than the button, which is what reading the
    cache during render buys.
  */
  const qc = useQueryClient();
  const daysLogged = (dailyLogs ?? []).filter(
    (d) => Number(d.kcal) > 0 || Number(d.volume_load) > 0 || d.readiness_score != null,
  ).length;
  const reviewKey = ['weekly_review', user?.id, startStr, lang, daysLogged] as const;
  const [asked, setAsked] = useState(false);

  const analyze = useQuery({
    queryKey: reviewKey,
    // `getQueryData` during render is a read, not a subscription — it decides
    // whether this week is one we have already paid for.
    enabled: !!user && (asked || qc.getQueryData(reviewKey) !== undefined),
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24 * 7,
    retry: 1,
    queryFn: async () => {
      const res = await callEdge<AIAnalysis>(EDGE_FUNCTIONS.weeklyReview, {
        week_start: startStr,
        lang,
      });
      // The alert this feeds used to print the raw client message, which for a
      // missing function reads `Edge Function returned a non-2xx status code`.
      if (!res.ok) throw new Error(i18n[AI_FAILURE_KEY[res.failure]]);
      return res.data ?? null;
    },
  });

  /* The mutation reported success and failure through callbacks. A query has
     neither, so the two effects it had are re-attached to the transitions
     themselves — a haptic when an analysis arrives, an alert when one fails. */
  useEffect(() => {
    if (analyze.data) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [analyze.data]);
  useEffect(() => {
    if (analyze.error) Alert.alert('ASCND', errorText(analyze.error, i18n));
  }, [analyze.error]);

  const a = analyze.data;

  // ── Stats (web computation, verbatim) ────────────────────────────────
  const logs = dailyLogs ?? [];
  const daysWithData = logs.length;
  const targets = {
    kcal: profile?.tdee_target_kcal ?? 2200,
    protein: profile?.macro_protein_g ?? 140,
    sleepH: Number(profile?.sleep_target_hours) || 8,
  };

  /* Each over its own population — see `metricMean`. `proteinDays` is what the
     protein recommendation below gates on: `daysWithData` counts rows, and a
     row is not a meal. */
  const { mean: avgKcal } = metricMean(logs, (l) => Number(l.kcal));
  const { mean: avgProtein, count: proteinDays } = metricMean(logs, (l) => Number(l.protein_g));
  const avgSleepMin = avg(
    (sleepLogs ?? []).map((s) => (s.deep_min ?? 0) + (s.rem_min ?? 0) + (s.light_min ?? 0)),
  );
  const avgSleepH = avgSleepMin / 60;
  const totalVolume = sum(logs.map((l) => Number(l.volume_load) || 0));
  const workoutCount = (workouts ?? []).length;
  /* Already population-correct before this round — kept as it was, and the day
     count now travels with it for the same reason the other two carry one. */
  const readinessDays = logs.filter((l) => l.readiness_score).length;
  const avgReadiness = avg(
    logs.filter((l) => l.readiness_score).map((l) => Number(l.readiness_score)),
  );

  const pLogs = prevLogs ?? [];
  /* The same population rule, because these two are the other half of a delta:
     comparing a mean over meal days against a mean over every row would report
     a change in eating that is really a change in how many days HealthKit
     happened to write. */
  const prevAvgKcal = metricMean(pLogs, (l) => Number(l.kcal)).mean;
  const prevAvgProtein = metricMean(pLogs, (l) => Number(l.protein_g)).mean;
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

  /*
    ── the ratio is read, not recomputed — see `latestAcwr` ──

    This block used to be four lines of its own arithmetic over
    `daily_logs.volume_load` divided by a flat 28, which is a second ACWR
    implementation and disagreed with the canonical one by a factor of four for
    a new account training perfectly evenly. `daily_logs.acwr` is written by
    `recomputeDailyLog` from `computeReadiness`; this screen now shows that.

    `null` when no day in the week carries a ratio, and it stays `null` all the
    way to the tile — the engine refuses to score a week it cannot measure, and
    substituting 0 here would put that refusal back.
  */
  const acwr = latestAcwr(logs);

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
  /*
    Nothing to say about a ratio that does not exist. The old chain ran on a
    number that was always present because its own formula fell back to 0, so a
    week the engine had declined to score still produced training advice.

    The `load7d > 0` guard the "train more" branch used to carry is gone with
    it: `acwr` is non-null only when `training_load_28d > 0`, so a baseline
    provably exists by the time this runs, and `acwr === 0` now means what it
    says — a real week of nothing against a real baseline, which is exactly the
    person that branch is addressed to.
  */
  if (acwr == null) {
    /* no ratio, no verdict */
  } else if (acwr > 1.5) {
    recommendations.push({ kind: 'warning', text: L(
      `ACWR cao (${acwr}). Giảm 15-20% volume tuần tới để tránh chấn thương.`,
      `ACWR high (${acwr}). Cut volume 15-20% next week to avoid injury.`) });
  } else if (acwr > 1.3) {
    recommendations.push({ kind: 'warning', text: L(
      `ACWR hơi cao (${acwr}). Giảm 5-10% volume hoặc bớt 1-2 sets/bài tập.`,
      `ACWR slightly high (${acwr}). Cut 5-10% volume or drop 1-2 sets per exercise.`) });
  } else if (acwr < 0.6) {
    recommendations.push({ kind: 'info', text: L(
      `ACWR thấp (${acwr}). Có thể tăng 10-15% volume dần dần.`,
      `ACWR low (${acwr}). You can add 10-15% volume gradually.`) });
  } else if (acwr >= 0.8 && acwr <= 1.3) {
    recommendations.push({ kind: 'success', text: L(
      `ACWR tối ưu (${acwr}). Giữ nguyên hoặc tăng nhẹ 5% volume.`,
      `ACWR optimal (${acwr}). Hold steady or bump volume ~5%.`) });
  }
  /* `readinessDays`, not `daysWithData`: the gate has to count the days the
     mean was actually built from. A row written by the step sync carries no
     readiness score, so it was padding this threshold with days that
     contributed nothing to the number being judged. */
  /* `deloadWarranted`, not the bare threshold: a deload is a recovery
     instruction, and a readiness score built from training load alone measured
     no recovery — it was telling somebody with an ACWR of 0.01 to cut volume.
     The mean, the threshold and `readinessDays` are unchanged; see
     `lib/readiness-week.ts` for what was measured. */
  if (deloadWarranted(logs, avgReadiness, readinessDays)) {
    recommendations.push({ kind: 'warning', text: L(
      'Readiness trung bình thấp. Cân nhắc tuần deload: giảm 40-50% volume, giữ cường độ.',
      'Low average readiness. Consider a deload week: cut volume 40-50%, keep intensity.') });
  } else if (avgReadiness >= 75) {
    /* The other half of the same rule. The action — push progressive overload —
       is training-state advice and is right either way; the *reason* given for
       it is not. "Phục hồi tốt!" over a week of load-only scores praises a
       recovery nobody measured, which is the deload warning's mistake pointed
       the opposite way. Threshold, mean and `recoveryBacked` all unchanged. */
    recommendations.push({ kind: 'success', text: recoveryBacked(logs)
      ? L('Phục hồi tốt! Có thể đẩy progressive overload: +2.5kg hoặc +1 rep mỗi bài chính.',
          'Great recovery! Push progressive overload: +2.5kg or +1 rep on your main lifts.')
      : L('Khả năng tập đang tốt! Có thể đẩy progressive overload: +2.5kg hoặc +1 rep mỗi bài chính.',
          'Training capacity looks high! Push progressive overload: +2.5kg or +1 rep on your main lifts.') });
  }
  if (avgSleepH < targets.sleepH - 1) {
    recommendations.push({ kind: 'warning', text: L(
      `Thiếu ngủ (${avgSleepH.toFixed(1)}h vs ${targets.sleepH}h). Ưu tiên ngủ trước khi tăng volume.`,
      `Sleep debt (${avgSleepH.toFixed(1)}h vs ${targets.sleepH}h). Prioritize sleep before adding volume.`) });
  }
  /* `proteinDays`: three days of *protein*, not three rows. This is the
     sentence Chain AC measured being produced for somebody hitting 150 g on
     every day they ate — five logged days out of seven read as 107 g, and the
     three that made the threshold were step-only rows. */
  if (avgProtein < targets.protein * 0.8 && proteinDays >= 3) {
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
    { icon: Activity, label: i18n.weeklyReviewReadiness, value: `${Math.round(avgReadiness)}`, sub: acwr != null ? `ACWR ${acwr}` : '—', d: null },
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
    <Screen refreshable back title={i18n.weeklyReviewTitle}>
      {/* Week navigation (web) */}
      <View style={styles.weekNav}>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={i18n.a11yPrevWeek}
          hitSlop={8}
          style={styles.weekBtn}
          onPress={() => {
            Haptics.selectionAsync();
            setAsked(false);
            setWeekOffset((o) => o - 1);
          }}>
          <Icon icon={ChevronLeft} size={16} color={colors.mutedForeground} />
        </PressScale>
        <Text style={styles.weekLabel}>{rangeLabel}</Text>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={i18n.a11yNextWeek}
          hitSlop={8}
          disabled={weekOffset >= 0}
          style={[styles.weekBtn, weekOffset >= 0 && styles.disabled]}
          onPress={() => {
            Haptics.selectionAsync();
            setAsked(false);
            setWeekOffset((o) => Math.min(o + 1, 0));
          }}>
          <Icon icon={ChevronRight} size={16} color={colors.mutedForeground} />
        </PressScale>
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
                <Icon icon={Sparkles} size={17} />
                <Text style={styles.title}>{i18n.nAiAnalysis}</Text>
              </View>
              <Text style={styles.hint}>{i18n.nWeeklyReviewHint}</Text>
              <PressScale
                /* isFetching, not isPending: in React Query v5 a *disabled*
                   query is already `pending`, so isPending here would put a
                   spinner on the button before anybody had pressed it. */
                style={[styles.cta, analyze.isFetching && styles.disabled]}
                disabled={analyze.isFetching}
                onPress={() => setAsked(true)}>
                {analyze.isFetching ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={styles.ctaText}>{i18n.nAnalyzeWeek}</Text>
                )}
              </PressScale>
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
  dayLabel: { fontSize: 11, color: colors.mutedForeground, textAlign: 'center' },
  valLabel: { ...type.mono, fontSize: 11, color: colors.mutedForeground, textAlign: 'center' },
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
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.mutedForeground,
  },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  deltaText: { ...type.mono, fontSize: 11 },
  statValue: { ...type.mono, fontSize: 22, fontWeight: '700', color: colors.foreground },
  statSub: { fontSize: 11, color: colors.mutedForeground },

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
  score: { fontSize: 44, fontWeight: '700', color: colors.foreground, marginTop: spacing.sm },
  summary: { ...type.body, color: colors.secondaryForeground, marginTop: spacing.sm, lineHeight: 21 },
  itemCard: { paddingVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  /* Emoji bỏ qua `color`, nhưng khai nó ra để `tools/text-color.mjs` không
     cần một danh sách ngoại lệ mà người sau phải hiểu. */
  iconEmoji: { fontSize: 22, color: colors.foreground },
  info: { flex: 1, minWidth: 0 },
  itemTitle: { ...type.body, fontWeight: '600', color: colors.foreground },
  trendMark: { color: colors.mutedForeground },
  priorityDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
});
