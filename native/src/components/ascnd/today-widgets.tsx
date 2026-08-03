import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Check, PartyPopper, Sparkles } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { ProgressBar } from '@/components/ascnd/progress-bar';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useLogWeight, useReadinessHistory, useTodayWeight } from '@/hooks/use-fitness-data';
import { useSupplementChecklist, useToggleSupplement } from '@/hooks/use-library';
import { useProfile } from '@/hooks/useTodayData';
import { useUnits } from '@/hooks/use-units';
import { callAi, EDGE_FUNCTIONS } from '@/lib/ai';
import { localDateStr, parseLocalDate } from '@/lib/local-date';
import { displayWeight, weightLabel, weightToKg } from '@/lib/units';

const NEUTRAL = '#9aa0aa';

/**
 * Colour a weight change by health goal, not just direction: for an
 * underweight person gaining is good (green) and losing is bad (red); for an
 * overweight person it's reversed; in the normal range (or unknown BMI) any
 * change is neutral grey. `diff` sign is the direction; BMI decides meaning.
 */
function weightDiffTone(bmi: number | null, diff: number): { color: string; bg: string } {
  const green = { color: colors.readinessGreen, bg: 'rgba(32,181,131,0.12)' };
  const red = { color: colors.readinessRed, bg: 'rgba(220,47,47,0.12)' };
  const neutral = { color: NEUTRAL, bg: 'rgba(154,160,170,0.12)' };
  if (bmi == null || (bmi >= 18.5 && bmi < 25)) return neutral; // normal / unknown
  const gaining = diff > 0;
  if (bmi < 18.5) return gaining ? green : red; // underweight: gain good
  return gaining ? red : green; // overweight (bmi >= 25): lose good
}

/** Weight check-in — shows today's weight vs profile, or an inline logger */
export function WeightCheckinCard({ profileWeight }: { profileWeight: number | null }) {
  const i18n = useI18n();
  const { weight: wUnit } = useUnits();
  const { data: todayWeight } = useTodayWeight();
  const { data: profile } = useProfile();
  const logWeight = useLogWeight();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  // BMI from the current weight (kg) + height decides how a change reads
  const heightCm = Number(profile?.height_cm) || 0;
  const currentKg = todayWeight ?? profileWeight ?? 0;
  const bmi = heightCm > 0 && currentKg > 0 ? currentKg / Math.pow(heightCm / 100, 2) : null;

  // Stored values are kg; show + accept entry in the user's unit
  const todayDisp = todayWeight != null ? displayWeight(todayWeight, wUnit) : null;
  const profileDisp = profileWeight != null ? displayWeight(profileWeight, wUnit) : null;

  useEffect(() => {
    setValue(todayDisp?.toString() ?? profileDisp?.toString() ?? '');
  }, [todayDisp, profileDisp]);

  const diff = todayDisp != null && profileDisp != null ? todayDisp - profileDisp : null;
  const showLogger = editing || todayWeight == null;

  const submit = () => {
    const val = parseFloat(value);
    if (isNaN(val) || val <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    logWeight.mutate(weightToKg(val, wUnit), { onSuccess: () => setEditing(false) });
  };

  return (
    <GlassCard>
      <Text style={styles.cardTitle}>{i18n.nWeightTitle}</Text>
      {showLogger ? (
        <View style={styles.weightLogger}>
          <TextInput
            style={styles.weightInput}
            keyboardType="decimal-pad"
            value={value}
            onChangeText={setValue}
            placeholder="70.0"
            placeholderTextColor={colors.mutedForeground}
          />
          <Text style={styles.weightUnit}>{weightLabel(wUnit)}</Text>
          <Pressable
            style={({ pressed }) => [styles.weightBtn, pressed && styles.pressed]}
            onPress={submit}
            disabled={logWeight.isPending}>
            {logWeight.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <Text style={styles.weightBtnText}>{i18n.nLogWeight}</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.weightDisplay} onPress={() => setEditing(true)}>
          <View style={styles.weightValueRow}>
            <Text style={styles.weightValue}>{todayDisp}</Text>
            <Text style={styles.weightUnit}>{weightLabel(wUnit)}</Text>
          </View>
          {diff != null && Math.abs(diff) >= 0.05 && (() => {
            const tone = weightDiffTone(bmi, diff);
            return (
              <View style={[styles.diffPill, { backgroundColor: tone.bg }]}>
                <Text style={[styles.diffText, { color: tone.color }]}>
                  {diff > 0 ? '↑ +' : '↓ '}
                  {diff.toFixed(1)}
                </Text>
              </View>
            );
          })()}
        </Pressable>
      )}
    </GlassCard>
  );
}

/** Supplement checklist — tap to toggle taken; hidden when user has none */
export function SupplementChecklistCard() {
  const i18n = useI18n();
  const { data: supplements } = useSupplementChecklist();
  const toggle = useToggleSupplement();

  if (!supplements || supplements.length === 0) return null;

  const takenCount = supplements.filter((s) => s.taken).length;
  const allDone = takenCount === supplements.length;

  return (
    <GlassCard>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>{i18n.nSupplements}</Text>
        <Text style={styles.cardHint}>
          {takenCount}/{supplements.length} {i18n.nTakenToday}
        </Text>
      </View>
      {allDone ? (
        <View style={styles.allDoneRow}>
          <Icon icon={PartyPopper} size={15} color={colors.readinessYellow} />
          <Text style={styles.allDone}>{i18n.nAllSupplementsDone}</Text>
        </View>
      ) : (
        <View style={styles.suppList}>
          {supplements.map((s) => (
            <Pressable
              key={s.id}
              style={styles.suppRow}
              onPress={() => toggle.mutate({ supplementId: s.id, taken: !s.taken })}>
              <View style={[styles.checkbox, s.taken && styles.checkboxOn]}>
                {s.taken && <Icon icon={Check} size={15} color="#fff" strokeWidth={3} />}
              </View>
              <View style={styles.suppInfo}>
                <Text style={[styles.suppName, s.taken && styles.suppNameDone]} numberOfLines={1}>
                  {s.name}
                </Text>
                {s.dose_text ? <Text style={styles.suppDose}>{s.dose_text}</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </GlassCard>
  );
}

const readinessZone = (v: number) =>
  v >= 75 ? colors.readinessGreen : v >= 50 ? colors.readinessYellow : colors.readinessRed;

/**
 * Readiness 7-day analysis — matches the web "Phân tích": one bar per day
 * coloured by zone, avg/max/min stats, and the three-zone legend. Hidden
 * until there are 2+ points.
 */
export function ReadinessTrendCard() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { data: history } = useReadinessHistory(7);

  if (!history || history.length < 2) return null;

  const values = history.map((h) => h.value);
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';

  const stats = [
    { label: lang === 'vi' ? 'TB' : 'Avg', value: avg },
    { label: lang === 'vi' ? 'Cao nhất' : 'Max', value: max },
    { label: lang === 'vi' ? 'Thấp nhất' : 'Min', value: min },
  ];
  const legend = [
    { c: colors.readinessGreen, t: lang === 'vi' ? '75+ Tập luyện' : '75+ Train' },
    { c: colors.readinessYellow, t: lang === 'vi' ? '50–74 Vừa phải' : '50–74 Moderate' },
    { c: colors.readinessRed, t: lang === 'vi' ? '<50 Phục hồi' : '<50 Recover' },
  ];

  return (
    <GlassCard style={styles.trendCard}>
      <View>
        <Text style={styles.cardTitle}>{i18n.nReadinessTrend}</Text>
        <Text style={styles.cardHint}>
          {lang === 'vi'
            ? 'Mức độ sẵn sàng tập luyện của bạn trong tuần qua'
            : 'Your training readiness over the past week'}
        </Text>
      </View>

      <View style={styles.trendBars}>
        {history.map((h, i) => {
          const day = parseLocalDate(h.date).toLocaleDateString(locale, { weekday: 'short' });
          const zone = readinessZone(h.value);
          return (
            <View key={h.date} style={styles.trendRow}>
              <Text style={styles.trendDay}>{day}</Text>
              <ProgressBar pct={h.value} color={zone} height={8} radius={4} delay={i * 60} style={styles.trendBar} />
              <Text style={[styles.trendVal, { color: zone }]}>{Math.round(h.value)}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.trendStats}>
        {stats.map((s) => (
          <View key={s.label} style={styles.trendStat}>
            <Text style={styles.trendStatLabel}>{s.label}</Text>
            <Text style={[styles.trendStatValue, { color: readinessZone(s.value) }]}>{s.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.trendLegend}>
        {legend.map((z) => (
          <View key={z.t} style={styles.trendLegendItem}>
            <View style={[styles.trendLegendDot, { backgroundColor: z.c }]} />
            <Text style={styles.trendLegendText}>{z.t}</Text>
          </View>
        ))}
      </View>
    </GlassCard>
  );
}

interface Nudge {
  type: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  icon: string;
}

const PRIORITY_COLOR: Record<string, string> = {
  high: colors.readinessRed,
  medium: colors.readinessYellow,
  low: colors.readinessGreen,
};

/** AI smart tips — nudges generated from recent data via edge function */
export function SmartTipsCard() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const [tapped, setTapped] = useState(false);

  const nudges = useMutation({
    mutationFn: async () => {
      const res = await callAi<{ nudges?: Nudge[] }>(EDGE_FUNCTIONS.smartNudges, {
        lang,
        date: localDateStr(),
      });
      // Nudges are a bonus, not a task the user asked for, so a failure here
      // stays quiet — but it still fails rather than pretending to zero tips,
      // so the card can say "none right now" only when that is true.
      if (!res.ok) throw new Error(res.failure);
      return res.data?.nudges ?? [];
    },
  });

  const load = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTapped(true);
    nudges.mutate();
  };

  return (
    <GlassCard>
      <View style={styles.cardHeaderRow}>
        <View style={styles.tipsTitleWrap}>
          <View style={styles.tipsTitleRow}>
            <Icon icon={Sparkles} size={16} color={colors.primary} />
            <Text style={styles.cardTitle}>{i18n.nSmartTips}</Text>
          </View>
          <Text style={styles.cardHint}>{i18n.nTipsHint}</Text>
        </View>
        {tapped && !nudges.isPending && (
          <Pressable hitSlop={8} onPress={load}>
            <Text style={styles.refreshText}>{i18n.nTipsRefresh}</Text>
          </Pressable>
        )}
      </View>

      {!tapped ? (
        <Pressable
          style={({ pressed }) => [styles.tipsBtn, pressed && styles.pressed]}
          onPress={load}>
          <Text style={styles.tipsBtnText}>{i18n.nSmartTips}</Text>
        </Pressable>
      ) : nudges.isPending ? (
        <View style={styles.tipsLoading}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.cardHint}>{i18n.nTipsLoading}</Text>
        </View>
      ) : !nudges.data || nudges.data.length === 0 ? (
        <Text style={styles.tipsEmpty}>{i18n.nTipsEmpty}</Text>
      ) : (
        <View style={styles.nudgeList}>
          {nudges.data.map((n, i) => (
            <View key={i} style={styles.nudgeRow}>
              <View
                style={[styles.nudgeDot, { backgroundColor: PRIORITY_COLOR[n.priority] ?? colors.mutedForeground }]}
              />
              <Text style={styles.nudgeText}>{n.message}</Text>
            </View>
          ))}
        </View>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  // Web dashboard micro-title: 12px semibold uppercase, wide tracking
  cardTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    color: colors.mutedForeground,
  },
  cardHint: { ...type.footnote, color: colors.mutedForeground, marginTop: 2 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },

  // Weight
  weightLogger: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  weightInput: {
    width: 100,
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    color: colors.foreground,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
  weightUnit: { ...type.body, color: colors.mutedForeground },
  weightBtn: {
    marginLeft: 'auto',
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightBtnText: { ...type.headline, color: colors.primaryForeground },
  weightDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  weightValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  weightValue: { ...type.largeTitle, ...type.mono, color: colors.foreground },
  diffPill: { paddingHorizontal: spacing.sm + 2, paddingVertical: 4, borderRadius: radius.full },
  diffText: { ...type.footnote, fontWeight: '700', fontVariant: ['tabular-nums'] },

  // Readiness 7-day analysis
  trendCard: { gap: spacing.md },
  trendBars: { gap: spacing.sm },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trendDay: { width: 34, fontSize: 11, color: colors.mutedForeground, textTransform: 'capitalize' },
  trendBar: { flex: 1 },
  trendVal: { width: 28, textAlign: 'right', fontSize: 12, fontFamily: 'Menlo', fontWeight: '700', fontVariant: ['tabular-nums'] },
  trendStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  trendStat: { alignItems: 'center', gap: 2 },
  trendStatLabel: { fontSize: 9, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.6 },
  trendStatValue: { fontSize: 20, fontFamily: 'Menlo', fontWeight: '700', fontVariant: ['tabular-nums'] },
  trendLegend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md, rowGap: 4 },
  trendLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  trendLegendDot: { width: 7, height: 7, borderRadius: 4 },
  trendLegendText: { fontSize: 9, color: colors.mutedForeground },

  // Supplements
  allDone: { ...type.body, color: colors.readinessGreen },
  allDoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  suppList: { marginTop: spacing.sm, gap: spacing.sm },
  suppRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.readinessGreen, borderColor: colors.readinessGreen },
  checkmark: { color: '#fff', fontSize: 15, fontWeight: '700' },
  suppInfo: { flex: 1, minWidth: 0 },
  suppName: { ...type.body, color: colors.foreground },
  suppNameDone: { color: colors.mutedForeground, textDecorationLine: 'line-through' },
  suppDose: { ...type.caption, color: colors.mutedForeground },

  // Smart tips
  tipsTitleWrap: { flex: 1, minWidth: 0 },
  tipsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  refreshText: { ...type.footnote, color: colors.primary, fontWeight: '600' },
  tipsBtn: {
    marginTop: spacing.md,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipsBtnText: { ...type.headline, color: colors.foreground },
  tipsLoading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  tipsEmpty: { ...type.footnote, color: colors.mutedForeground, marginTop: spacing.md },
  nudgeList: { marginTop: spacing.md, gap: spacing.sm + 2 },
  nudgeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  nudgeDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  nudgeText: { ...type.footnote, color: colors.foreground, flex: 1, lineHeight: 19 },
});
