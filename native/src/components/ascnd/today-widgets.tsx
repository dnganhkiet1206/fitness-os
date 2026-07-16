import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { LineChart } from '@/components/ascnd/line-chart';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useLogWeight, useReadinessHistory, useTodayWeight } from '@/hooks/use-fitness-data';
import { useSupplementChecklist, useToggleSupplement } from '@/hooks/use-library';
import { supabase } from '@/integrations/supabase/client';

const READINESS_COLOR: Record<string, string> = {
  green: colors.readinessGreen,
  yellow: colors.readinessYellow,
  red: colors.readinessRed,
};

/** Weight check-in — shows today's weight vs profile, or an inline logger */
export function WeightCheckinCard({ profileWeight }: { profileWeight: number | null }) {
  const i18n = useI18n();
  const { data: todayWeight } = useTodayWeight();
  const logWeight = useLogWeight();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue(todayWeight?.toString() ?? profileWeight?.toString() ?? '');
  }, [todayWeight, profileWeight]);

  const diff = todayWeight != null && profileWeight != null ? todayWeight - profileWeight : null;
  const showLogger = editing || todayWeight == null;

  const submit = () => {
    const val = parseFloat(value);
    if (isNaN(val) || val <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    logWeight.mutate(val, { onSuccess: () => setEditing(false) });
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
          <Text style={styles.weightUnit}>kg</Text>
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
            <Text style={styles.weightValue}>{todayWeight}</Text>
            <Text style={styles.weightUnit}>kg</Text>
          </View>
          {diff != null && Math.abs(diff) >= 0.05 && (
            <View
              style={[
                styles.diffPill,
                { backgroundColor: diff > 0 ? 'rgba(220,47,47,0.12)' : 'rgba(32,181,131,0.12)' },
              ]}>
              <Text
                style={[
                  styles.diffText,
                  { color: diff > 0 ? colors.readinessRed : colors.readinessGreen },
                ]}>
                {diff > 0 ? '↑ +' : '↓ '}
                {diff.toFixed(1)}
              </Text>
            </View>
          )}
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
        <Text style={styles.allDone}>{i18n.nAllSupplementsDone}</Text>
      ) : (
        <View style={styles.suppList}>
          {supplements.map((s) => (
            <Pressable
              key={s.id}
              style={styles.suppRow}
              onPress={() => toggle.mutate({ supplementId: s.id, taken: !s.taken })}>
              <View style={[styles.checkbox, s.taken && styles.checkboxOn]}>
                {s.taken && <Text style={styles.checkmark}>✓</Text>}
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

/** Readiness trend — 14-day line, hidden until there are 2+ points */
export function ReadinessTrendCard() {
  const i18n = useI18n();
  const { data: history } = useReadinessHistory(14);

  if (!history || history.length < 2) return null;
  const points = history.map((h) => ({ date: h.date, value: h.value }));
  const last = history[history.length - 1];
  const color = READINESS_COLOR[last.status] ?? colors.primary;

  return (
    <GlassCard>
      <Text style={styles.cardTitle}>{i18n.nReadinessTrend}</Text>
      <LineChart points={points} color={color} height={120} />
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
  const [tapped, setTapped] = useState(false);

  const nudges = useMutation({
    mutationFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const { data, error } = await supabase.functions.invoke('ai-smart-nudges', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (error) throw error;
      return (data?.nudges ?? []) as Nudge[];
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
          <Text style={styles.cardTitle}>✦ {i18n.nSmartTips}</Text>
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
  cardTitle: { ...type.headline, color: colors.foreground },
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
  weightValue: { ...type.largeTitle, color: colors.foreground, fontVariant: ['tabular-nums'] },
  diffPill: { paddingHorizontal: spacing.sm + 2, paddingVertical: 4, borderRadius: radius.full },
  diffText: { ...type.footnote, fontWeight: '700', fontVariant: ['tabular-nums'] },

  // Supplements
  allDone: { ...type.body, color: colors.readinessGreen, marginTop: spacing.sm },
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
