import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useRoutineDays, useUpsertRoutineDay, useWorkoutTemplates } from '@/hooks/use-library';

const DAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAYS_VI = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

export default function RoutineScreen() {
  const { data: days } = useRoutineDays();
  const { data: templates } = useWorkoutTemplates();
  const { lang } = useAppSettings();
  const i18n = useI18n();
  const upsert = useUpsertRoutineDay();
  const dayNames = lang === 'vi' ? DAYS_VI : DAYS_EN;
  const [picking, setPicking] = useState<number | null>(null);

  const byDay = new Map((days ?? []).map((d) => [d.day_of_week, d]));
  const templateName = (id: string | null | undefined) =>
    id ? templates?.find((t) => t.id === id)?.name ?? null : null;

  const assign = (dayOfWeek: number, templateId: string | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    upsert.mutate({ day_of_week: dayOfWeek, template_id: templateId, is_rest: !templateId });
    setPicking(null);
  };

  const toggleDeload = (dayOfWeek: number, isDeload: boolean) => {
    const d = byDay.get(dayOfWeek);
    upsert.mutate({
      day_of_week: dayOfWeek,
      is_deload: isDeload,
      template_id: d?.template_id ?? null,
      is_rest: d?.is_rest ?? false,
    });
  };

  return (
    <Screen title={i18n.nRoutine}>
      <Text style={styles.hint}>{i18n.nRoutineHint}</Text>

      {dayNames.map((label, idx) => {
        const d = byDay.get(idx);
        const isRest = d?.is_rest ?? !d?.template_id;
        const name = templateName(d?.template_id);
        return (
          <GlassCard key={idx} style={[styles.dayCard, isRest && styles.dayCardRest]}>
            <View style={styles.row}>
              <View style={styles.dayInfo}>
                <Text style={styles.day}>{label}</Text>
                {d?.is_deload ? (
                  <View style={styles.deloadBadge}>
                    <Text style={styles.deloadText}>{i18n.nDeload}</Text>
                  </View>
                ) : null}
              </View>
              <Pressable
                style={({ pressed }) => [styles.assignBtn, pressed && styles.pressed]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setPicking(idx);
                }}>
                <Text style={[styles.assignText, !isRest && styles.assignTextActive]} numberOfLines={1}>
                  {isRest ? i18n.nRest : name ?? i18n.nChooseWorkout}
                </Text>
                <Text style={styles.assignChevron}>⌄</Text>
              </Pressable>
            </View>

            {!isRest && (
              <View style={styles.deloadRow}>
                <Text style={styles.deloadLabel}>{i18n.nDeload}</Text>
                <Switch
                  value={d?.is_deload ?? false}
                  onValueChange={(v) => toggleDeload(idx, v)}
                  trackColor={{ true: colors.readinessYellow, false: colors.secondary }}
                />
              </View>
            )}
          </GlassCard>
        );
      })}

      {/* Template picker */}
      <Modal
        visible={picking !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPicking(null)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setPicking(null)}>
          <Pressable style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>
              {picking !== null ? dayNames[picking] : ''}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerRowPressed]}
              onPress={() => picking !== null && assign(picking, null)}>
              <Text style={styles.pickerRest}>🌙 {i18n.nRest}</Text>
            </Pressable>
            {(templates ?? []).map((t) => (
              <Pressable
                key={t.id}
                style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerRowPressed]}
                onPress={() => picking !== null && assign(picking, t.id)}>
                <Text style={styles.pickerName}>🏋 {t.name}</Text>
                {t.type ? <Text style={styles.pickerType}>{t.type}</Text> : null}
              </Pressable>
            ))}
            {(!templates || templates.length === 0) && (
              <Text style={styles.pickerEmpty}>{i18n.nRoutineHint}</Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { ...type.footnote, color: colors.mutedForeground, marginBottom: spacing.xs },
  dayCard: { paddingVertical: spacing.md, gap: spacing.sm },
  dayCardRest: { opacity: 0.62 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  dayInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  day: { ...type.headline, color: colors.foreground },
  deloadBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: 'rgba(230,185,61,0.18)',
  },
  deloadText: { ...type.caption, color: colors.readinessYellow, fontWeight: '600' },
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 190,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
  },
  assignText: { ...type.footnote, color: colors.mutedForeground, flexShrink: 1 },
  assignTextActive: { color: colors.primary, fontWeight: '600' },
  assignChevron: { color: colors.mutedForeground, fontSize: 14 },
  deloadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deloadLabel: { ...type.footnote, color: colors.mutedForeground },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  pickerSheet: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  pickerTitle: {
    ...type.caption,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  pickerRowPressed: { backgroundColor: colors.secondary },
  pickerRest: { ...type.body, color: colors.mutedForeground },
  pickerName: { ...type.body, color: colors.foreground, flex: 1 },
  pickerType: { ...type.caption, color: colors.mutedForeground, textTransform: 'capitalize' },
  pickerEmpty: { ...type.footnote, color: colors.mutedForeground, textAlign: 'center', padding: spacing.md },
});
