import DateTimePicker from '@react-native-community/datetimepicker';
import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useInvalidateToday } from '@/hooks/useTodayData';
import { supabase } from '@/integrations/supabase/client';
import { recomputeDailyLog } from '@/lib/daily-log-service';

// Emoji picks map onto the web's 1–10 quality scale (SleepCard shows "x/10")
const QUALITY = [2, 4, 6, 8, 10] as const;
const QUALITY_EMOJI = ['😫', '😕', '😐', '🙂', '😴'];

/** Bedtime after noon belongs to yesterday; waketime is always today. */
function withDate(time: Date, dayOffset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return d;
}

export default function LogSleepSheet() {
  const { user } = useAuth();
  const invalidate = useInvalidateToday();
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const [bedtime, setBedtime] = useState(new Date(2000, 0, 1, 23, 0));
  const [waketime, setWaketime] = useState(new Date(2000, 0, 1, 7, 0));
  const [quality, setQuality] = useState<number>(8);
  const [deepMin, setDeepMin] = useState('');
  const [remMin, setRemMin] = useState('');
  const [lightMin, setLightMin] = useState('');

  const bedDate = withDate(bedtime, bedtime.getHours() >= 12 ? -1 : 0);
  const wakeDate = withDate(waketime, 0);
  const durationMin = Math.max(0, Math.round((wakeDate.getTime() - bedDate.getTime()) / 60000));

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase.from('sleep_logs').insert({
        user_id: user.id,
        bedtime: bedDate.toISOString(),
        waketime: wakeDate.toISOString(),
        quality,
        deep_min: Number(deepMin) || 0,
        rem_min: Number(remMin) || 0,
        light_min: Number(lightMin) || 0,
      });
      if (error) throw error;
      await recomputeDailyLog(user.id, new Date().toISOString().split('T')[0]);
    },
    onSuccess: () => {
      invalidate();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    },
    onError: (e: Error) => Alert.alert('ASCND', e.message),
  });

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{i18n.nLogSleepTitle}</Text>

      <View style={styles.rowFields}>
        <View style={styles.halfField}>
          <Text style={styles.fieldLabel}>{i18n.nBedtime}</Text>
          <View style={styles.pickerWrap}>
            <DateTimePicker
              value={bedtime}
              mode="time"
              display="spinner"
              themeVariant="dark"
              onChange={(_, d) => d && setBedtime(d)}
            />
          </View>
        </View>
        <View style={styles.halfField}>
          <Text style={styles.fieldLabel}>{i18n.nWakeUp}</Text>
          <View style={styles.pickerWrap}>
            <DateTimePicker
              value={waketime}
              mode="time"
              display="spinner"
              themeVariant="dark"
              onChange={(_, d) => d && setWaketime(d)}
            />
          </View>
        </View>
      </View>

      <View style={styles.durationRow}>
        <Text style={styles.fieldLabel}>{i18n.nDuration}</Text>
        <Text style={styles.duration}>
          {Math.floor(durationMin / 60)}h {String(durationMin % 60).padStart(2, '0')}m
        </Text>
      </View>

      {/* Sleep stages (web: deep / REM / light minutes) */}
      <Text style={styles.fieldLabel}>{lang === 'vi' ? 'Giai đoạn giấc ngủ' : 'Sleep Stages'}</Text>
      <View style={styles.stagesRow}>
        {[
          { label: i18n.logSleepDeep, value: deepMin, set: setDeepMin },
          { label: i18n.logSleepREM, value: remMin, set: setRemMin },
          { label: i18n.logSleepLight, value: lightMin, set: setLightMin },
        ].map((s) => (
          <View key={s.label} style={styles.stageCell}>
            <Text style={styles.stageLabel}>{s.label}</Text>
            <TextInput
              style={styles.stageInput}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
              value={s.value}
              onChangeText={s.set}
            />
            <Text style={styles.stageUnit}>{i18n.logSleepMinutes}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.fieldLabel}>{i18n.nHowSleep}</Text>
      <View style={styles.chips}>
        {QUALITY.map((q, i) => (
          <Pressable
            key={q}
            onPress={() => {
              Haptics.selectionAsync();
              setQuality(q);
            }}
            style={[styles.chip, quality === q && styles.chipActive]}>
            <Text style={styles.chipEmoji}>{QUALITY_EMOJI[i]}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.saveButton,
          save.isPending && styles.saveDisabled,
          pressed && !save.isPending && styles.pressed,
        ]}
        disabled={save.isPending}
        onPress={() => save.mutate()}>
        {save.isPending ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.saveText}>{i18n.nSaveSleep}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.card },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { ...type.title, color: colors.foreground, textAlign: 'center', marginBottom: spacing.sm },
  fieldLabel: { ...type.footnote, color: colors.mutedForeground },
  rowFields: { flexDirection: 'row', gap: spacing.md },
  halfField: { flex: 1, gap: spacing.sm },
  pickerWrap: {
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    alignItems: 'center',
  },
  durationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  duration: { ...type.headline, color: colors.foreground },
  stagesRow: { flexDirection: 'row', gap: spacing.sm },
  stageCell: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: spacing.sm + 2,
    alignItems: 'center',
    gap: 4,
  },
  stageLabel: { ...type.caption, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.8 },
  stageInput: {
    ...type.headline,
    color: colors.foreground,
    textAlign: 'center',
    minWidth: 56,
    paddingVertical: 2,
    fontVariant: ['tabular-nums'],
  },
  stageUnit: { ...type.caption, color: colors.mutedForeground },
  chips: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flex: 1,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipEmoji: { fontSize: 24 },
  saveButton: {
    height: 50,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  saveDisabled: { opacity: 0.4 },
  saveText: { ...type.headline, color: colors.primaryForeground },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
