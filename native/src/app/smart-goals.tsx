import { useQuery } from '@tanstack/react-query';
import { Flame } from 'lucide-react-native';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LineChart } from '@/components/ascnd/line-chart';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useUnits } from '@/hooks/use-units';
import { useProfile } from '@/hooks/useTodayData';
import { supabase } from '@/integrations/supabase/client';
import { adaptiveTDEE, worthMentioning } from '@/lib/adaptive-tdee';
import { calcTargetCalories } from '@/lib/fitness-calc';
import { localDateStr, weekStartOf } from '@/lib/local-date';
import { convertWeight, displayWeight, weightLabel } from '@/lib/units';

/*
  `weekStartOf` rather than a fourth copy of the arithmetic. The line here was
  `getDate() - getDay() + 1`, which on a **Sunday** resolves to tomorrow — so
  "this week" ran from tomorrow to next Sunday, held no data at all, and the
  advice below it silently fell back to a week-old window. Right six days out of
  seven, and wrong on the day people sit down to review their week.
*/
function weekDates(weeksAgo: number) {
  const start = weekStartOf();
  start.setDate(start.getDate() - weeksAgo * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: localDateStr(start), end: localDateStr(end) };
}

function weekAvg(logs: { date: string; weight_kg: number }[], start: string, end: string) {
  const w = logs.filter((l) => l.date >= start && l.date <= end);
  if (w.length === 0) return null;
  return w.reduce((s, l) => s + l.weight_kg, 0) / w.length;
}

export default function SmartGoalsScreen() {
  const { user } = useAuth();
  const { data: profile, isError, refetch, isRefetching } = useProfile();
  const { lang } = useAppSettings();
  const { weight: wUnit } = useUnits();
  const wl = weightLabel(wUnit);
  const i18n = useI18n();

  const { data: weightLogs } = useQuery({
    queryKey: ['sg_weight', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - 35);
      const { data, error } = await supabase
        .from('weight_logs')
        .select('date, weight_kg')
        .eq('user_id', user!.id)
        .gte('date', localDateStr(from))
        .order('date', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((d) => ({ date: d.date as string, weight_kg: Number(d.weight_kg) }));
    },
  });

  const { data: dailyLogs } = useQuery({
    queryKey: ['sg_daily', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - 14);
      const { data, error } = await supabase
        .from('daily_logs')
        .select('date, kcal, protein_g')
        .eq('user_id', user!.id)
        .gte('date', localDateStr(from))
        .order('date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const analysis = useMemo(() => {
    if (!weightLogs || weightLogs.length < 3 || !profile) return null;
    const goal = profile.goal || 'maintain';
    /* The suggestion below re-applies the goal multiplier to a *measured* TDEE,
       so it has to pass through the same floor onboarding does — otherwise the
       one place that can lower somebody's target is the one place with no
       lower bound on it. */
    const sex = (profile.sex as 'male' | 'female' | 'other') || 'other';
    const currentCal = Number(profile.tdee_target_kcal) || 2200;

    const weekAvgs: { week: string; value: number | null }[] = [];
    for (let i = 3; i >= 0; i--) {
      const { start, end } = weekDates(i);
      weekAvgs.push({ week: `W${4 - i}`, value: weekAvg(weightLogs, start, end) });
    }
    const valid = weekAvgs.filter((w) => w.value !== null) as { week: string; value: number }[];
    if (valid.length < 2) return null;

    const last2 = valid.slice(-2);
    const weeklyChange = last2[1].value - last2[0].value;
    const targetMin = goal === 'bulk' ? 0.25 : goal === 'cut' ? -0.75 : -0.1;
    const targetMax = goal === 'bulk' ? 0.5 : goal === 'cut' ? -0.25 : 0.1;
    const onTrack = weeklyChange >= targetMin && weeklyChange <= targetMax;

    /*
      ── the advice used to be built from half the equation ──

      What follows below was the whole of it: if the weight had moved the wrong
      way two weeks running, suggest a fixed ±150 or ±250 kcal. It never looked
      at what the person ate.

      That cannot tell the two explanations apart, and they need opposite
      answers. If the target is right and they ate 400 over it, the fix is to
      eat the target — but the old rule told them to *lower the target*, which
      makes tomorrow's number harder to hit than today's and starts a spiral.
      Only if the target itself is wrong does moving it help.

      Intake is the half that separates them, and both halves are already
      loaded on this screen. `adaptiveTDEE` is the energy-balance identity —
      mean intake minus what the scale did — which is what MacroFactor and the
      other adaptive trackers measure instead of guessing from a multiplier.
      It refuses unless there are ten logged days, six weigh-ins and ten days
      between the first and last, because it is trivially computable from
      garbage.

      When it can answer, the suggestion becomes arithmetic: measure the real
      expenditure, then apply the goal's own multiplier to it. When it cannot,
      the old heuristic stands — it is a guess, but it is the guess this screen
      has always made, and removing it would leave nothing.
    */
    const measured = adaptiveTDEE(
      (dailyLogs ?? []).map((d) => ({ date: String(d.date), kcal: Number(d.kcal) || 0 })),
      (weightLogs ?? []).map((w) => ({ date: w.date, kg: w.weight_kg })),
    );

    let twoWeekDeviation = false;
    let calorieAdjustment = 0;
    let fromMeasurement = false;
    let measuredDays = 0;

    if (measured.ok) {
      const shouldBe = calcTargetCalories(measured.measured, goal, sex);
      if (worthMentioning(shouldBe, currentCal)) {
        twoWeekDeviation = true;
        fromMeasurement = true;
        measuredDays = measured.loggedDays;
        calorieAdjustment = shouldBe - currentCal;
      }
    } else if (valid.length >= 3) {
      const prev2 = valid.slice(-3, -1);
      const prevChange = prev2[1].value - prev2[0].value;
      const bothOff =
        (goal === 'bulk' && weeklyChange < targetMin && prevChange < targetMin) ||
        (goal === 'cut' && weeklyChange > targetMax && prevChange > targetMax);
      if (bothOff) {
        twoWeekDeviation = true;
        if (goal === 'bulk') calorieAdjustment = weeklyChange < 0 ? 250 : 150;
        if (goal === 'cut') calorieAdjustment = weeklyChange > 0 ? -250 : -150;
      }
    }
    return { valid, weeklyChange, onTrack, twoWeekDeviation, calorieAdjustment, fromMeasurement, measuredDays, currentCal, targetMin, targetMax, goal };
  }, [weightLogs, dailyLogs, profile]);

  const protein = useMemo(() => {
    if (!dailyLogs || dailyLogs.length === 0 || !profile) return null;
    const target = Number(profile.macro_protein_g) || 150;
    const perMeal = Math.round(target / 4);
    const lowDays = dailyLogs.filter((d) => Number(d.protein_g) < target * 0.7);
    return { target, perMeal, lowDays: lowDays.length, totalDays: dailyLogs.length };
  }, [dailyLogs, profile]);

  const goalLabels: Record<string, string> = {
    bulk: i18n.goalBulk, cut: i18n.goalCut, maintain: i18n.goalMaintain,
    recomp: i18n.goalRecomp, strength: i18n.goalStrength, endurance: i18n.goalEndurance,
  };
  const week = lang === 'vi' ? 'tuần' : 'week';
  const day = lang === 'vi' ? 'ngày' : 'day';

  return (
    <Screen back title={i18n.smartGoalsTitle}>
      {/* Weight trend */}
      <GlassCard>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>{i18n.smartGoalsWeightTrend}</Text>
          <View style={styles.goalPill}>
            <Text style={styles.goalPillText}>{goalLabels[profile?.goal || 'maintain']}</Text>
          </View>
        </View>

        {/* A failed read is not "not enough data yet". Without the profile there is
        no analysis, and the zero branch asks somebody to log more of what they
        have already logged. */}
        {isError ? (
          <LoadFailed i18n={i18n} onRetry={() => void refetch()} busy={isRefetching} />
        ) : analysis ? (
          <>
            <View style={styles.chart}>
              <LineChart
                points={analysis.valid.map((w) => ({ date: w.week, value: displayWeight(w.value, wUnit) }))}
                color={colors.readinessGreen}
                unit={wl}
              />
            </View>
            <View style={[styles.callout, analysis.onTrack ? styles.calloutGood : styles.calloutBad]}>
              <Text style={styles.calloutValue}>
                {analysis.weeklyChange > 0 ? '+' : ''}
                {convertWeight(analysis.weeklyChange, wUnit).toFixed(2)} {wl}/{week}
              </Text>
              <Text style={styles.calloutTarget}>
                {i18n.target}: {analysis.targetMin > 0 ? '+' : ''}{convertWeight(analysis.targetMin, wUnit).toFixed(2)} — {analysis.targetMax > 0 ? '+' : ''}{convertWeight(analysis.targetMax, wUnit).toFixed(2)} {wl}/{week}
              </Text>
              <Text style={[styles.calloutStatus, { color: analysis.onTrack ? colors.readinessGreen : colors.readinessRed }]}>
                {analysis.onTrack ? i18n.smartGoalsOnTrack : i18n.smartGoalsOffTrack}
              </Text>
            </View>

            {analysis.twoWeekDeviation && analysis.calorieAdjustment !== 0 && (
              <View style={styles.suggestion}>
                <View style={styles.suggestionTitleRow}>
                  <Icon icon={Flame} size={15} />
                  <Text style={styles.suggestionTitle}>{i18n.smartGoalsCalorieSuggestion}</Text>
                </View>
                <Text style={styles.suggestionValue}>
                  {analysis.calorieAdjustment > 0 ? '+' : ''}{analysis.calorieAdjustment} kcal/{day}
                </Text>
                <Text style={styles.suggestionDetail}>
                  {analysis.currentCal} kcal → {analysis.currentCal + analysis.calorieAdjustment} kcal
                </Text>
                {/*
                  Where the number came from, when it came from them.

                  Being told to change a calorie target is being told to change
                  what you eat every day for months. "Because your own intake
                  and your own scale say so" is a different sentence from a rule
                  about weekly trends, and only one of them is checkable by the
                  person reading it. Shown only when it is true.
                */}
                {analysis.fromMeasurement ? (
                  <Text style={styles.suggestionDetail}>
                    {i18n.smartGoalsMeasured.replace('{d}', String(analysis.measuredDays))}
                  </Text>
                ) : null}
              </View>
            )}
          </>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{i18n.smartGoalsNeedData}</Text>
            <Text style={styles.emptyMsg}>{i18n.smartGoalsNeedDataMsg}</Text>
          </View>
        )}
      </GlassCard>

      {/* Protein coach */}
      <GlassCard>
        <Text style={styles.cardTitle}>{i18n.smartGoalsProteinCoach}</Text>
        {protein ? (
          <>
            <View style={styles.proteinGrid}>
              <ProteinStat value={`${protein.target}g`} label={i18n.smartGoalsPerDay} color={colors.primary} />
              <ProteinStat value={`${protein.perMeal}g`} label={i18n.smartGoalsPerMeal} color={colors.metricBlue} />
              <ProteinStat
                value={String(protein.lowDays)}
                label={i18n.smartGoalsLowDays}
                color={protein.lowDays > 0 ? colors.readinessRed : colors.readinessGreen}
              />
            </View>
            <View style={styles.splitBox}>
              <Text style={styles.splitLabel}>{i18n.smartGoalsProteinSplit}</Text>
              {[i18n.mealBreakfast, i18n.mealLunch, i18n.mealSnack, i18n.mealDinner].map((m) => (
                <View key={m} style={styles.splitRow}>
                  <Text style={styles.splitMeal}>{m}</Text>
                  <Text style={styles.splitVal}>{protein.perMeal}g</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.emptyMsg}>{i18n.smartGoalsNoNutritionData}</Text>
        )}
      </GlassCard>
    </Screen>
  );
}

function ProteinStat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={styles.proteinStat}>
      <Text style={[styles.proteinValue, { color }]}>{value}</Text>
      <Text style={styles.proteinLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { ...type.headline, color: colors.foreground },
  goalPill: { paddingHorizontal: spacing.sm + 2, paddingVertical: 3, borderRadius: radius.full, backgroundColor: 'rgba(168,178,196,0.14)' },
  goalPillText: { ...type.caption, color: colors.primary, fontWeight: '600', textTransform: 'capitalize' },
  chart: { marginTop: spacing.md },
  callout: { marginTop: spacing.md, borderRadius: radius.md, padding: spacing.md, gap: 3 },
  calloutGood: { backgroundColor: 'rgba(32,181,131,0.1)' },
  calloutBad: { backgroundColor: 'rgba(220,47,47,0.1)' },
  calloutValue: { ...type.headline, color: colors.foreground, fontVariant: ['tabular-nums'] },
  calloutTarget: { ...type.caption, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  calloutStatus: { ...type.footnote, fontWeight: '600', marginTop: 2 },
  suggestion: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: 'rgba(230,185,61,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(230,185,61,0.25)',
    gap: 2,
  },
  suggestionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  suggestionTitle: { ...type.footnote, color: colors.foreground, fontWeight: '600' },
  suggestionValue: { ...type.title, color: colors.readinessYellow, fontVariant: ['tabular-nums'], marginTop: 2 },
  suggestionDetail: { ...type.caption, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  empty: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.xs },
  emptyTitle: { ...type.body, color: colors.foreground, fontWeight: '600' },
  emptyMsg: { ...type.footnote, color: colors.mutedForeground, textAlign: 'center', marginTop: spacing.sm },
  proteinGrid: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  proteinStat: { flex: 1, alignItems: 'center', backgroundColor: colors.background, borderRadius: radius.md, paddingVertical: spacing.md, gap: 2 },
  proteinValue: { ...type.title, fontVariant: ['tabular-nums'] },
  proteinLabel: { ...type.caption, color: colors.mutedForeground, textAlign: 'center' },
  splitBox: { marginTop: spacing.md, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  splitLabel: { ...type.caption, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600', marginBottom: 2 },
  splitRow: { flexDirection: 'row', justifyContent: 'space-between' },
  splitMeal: { ...type.footnote, color: colors.mutedForeground },
  splitVal: { ...type.footnote, color: colors.foreground, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
