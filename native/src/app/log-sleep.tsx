import DateTimePicker from '@react-native-community/datetimepicker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Angry, Check, Frown, Laugh, Meh, Smile, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PressScale } from '@/components/ascnd/press-scale';
import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useInvalidateToday } from '@/hooks/useTodayData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';
import { recomputeDailyLog } from '@/lib/daily-log-service';
import { localDateStr } from '@/lib/local-date';
import { BOUNDS, plausible, plausibleText } from '@/lib/plausible';
import { offlineNow } from '@/lib/offline';
import { OFFLINE_WRITE_KEY, type OfflineWrite } from '@/lib/offline-write';
import { sleepSpan } from '@/lib/sleep-window';

// Face picks map onto the web's 1–10 quality scale (SleepCard shows
// "x/10") — code-drawn lucide faces on a red→teal neon ramp
const QUALITY: { value: number; icon: LucideIcon; color: string }[] = [
  { value: 2, icon: Angry, color: colors.readinessRed },
  { value: 4, icon: Frown, color: colors.metricOrange },
  { value: 6, icon: Meh, color: colors.readinessYellow },
  { value: 8, icon: Smile, color: colors.readinessGreen },
  { value: 10, icon: Laugh, color: colors.metricCyan },
];

export default function LogSleepSheet() {
  const { user } = useAuth();
  const invalidate = useInvalidateToday();
  const queryClient = useQueryClient();
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const [bedtime, setBedtime] = useState(new Date(2000, 0, 1, 23, 0));
  const [waketime, setWaketime] = useState(new Date(2000, 0, 1, 7, 0));
  const [quality, setQuality] = useState<number>(8);
  const [deepMin, setDeepMin] = useState('');
  const [remMin, setRemMin] = useState('');
  const [lightMin, setLightMin] = useState('');

  /*
    Which day each time belongs to is `lib/sleep-window.ts`'s question — it is
    a rule whose failures are all at the edges (a nap once became a 26-hour
    night here), so it lives where `tools/sleep-window.mjs` can run it against a
    table of cases rather than inside this screen where nothing could.
  */
  const { bedDate, wakeDate, minutes: durationMin } = sleepSpan(bedtime, waketime);

  /*
    And the span still has to be a possible night. The pickers make the
    arithmetic sound, not the result: 11:00 → 07:00 is now a legal 20-hour span,
    which is not a night anybody slept.
  */
  const durationBad = !plausible('sleep_duration_min', durationMin);
  const durationError = durationBad
    ? i18n.outOfRange
        .replace('{min}', String(BOUNDS.sleep_duration_min.min))
        .replace('{max}', String(BOUNDS.sleep_duration_min.max))
        .replace('{unit}', i18n.logSleepMinutes)
    : null;

  /*
    ── the stages have to fit inside the night ──

    The times come from pickers, so the night's length is sound by
    construction. The three stage boxes were free text with no check at all,
    which let a night of 8 hours carry 600 minutes of deep sleep — a
    contradiction visible on the same card, printed by the app about itself.

    Two things are wrong with a number like that and they need different
    checks. `sleep_stage_min` catches the one that could not be a stage at all;
    the sum catches the one where each part is fine and the whole is not.
    Neither figure feeds readiness — `asleepMinutes` uses the span or
    HealthKit's `asleep_min` — so this is about what Sleep Insights draws, not
    about the score.
  */
  const stages = [deepMin, remMin, lightMin].map((v) => (v.trim() ? Number(v) : 0));
  const stageBad = [deepMin, remMin, lightMin].some((v) => !plausibleText('sleep_stage_min', v));
  const stageSum = stages.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const stagesOverrun = durationMin > 0 && stageSum > durationMin;
  const stageError = stageBad
    ? i18n.outOfRange
        .replace('{min}', String(BOUNDS.sleep_stage_min.min))
        .replace('{max}', String(BOUNDS.sleep_stage_min.max))
        .replace('{unit}', i18n.logSleepMinutes)
    : stagesOverrun
      ? i18n.sleepStagesOverrun.replace('{sum}', String(stageSum)).replace('{total}', String(durationMin))
      : null;

  const queue = useMutation<void, Error, OfflineWrite>({
    mutationKey: [...OFFLINE_WRITE_KEY],
  });

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
      await recomputeDailyLog(user.id, localDateStr());
    },
    onSuccess: () => {
      invalidate();
      // Sleep Insights screen reads its own multi-night history key
      queryClient.invalidateQueries({ queryKey: ['sleep_history', user?.id] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
      toast.success(i18n.logSleepSaved);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    /*
      ── the only one of the four log sheets without this ──

      `log-biometrics`, `log-measurement` and `log-meal` all wrap their scroll
      view in a `KeyboardAvoidingView` and set `keyboardShouldPersistTaps`. This
      one had neither, and it is the sheet whose text fields sit furthest down
      the page — the three stage boxes are below the time pickers, with the
      quality chips and Save below them.

      Two things that costs. Save can end up under the keyboard with nothing to
      lift it; and without `persistTaps`, the first tap on Save or on a quality
      chip while the keyboard is open is spent dismissing the keyboard rather
      than pressing the thing under your finger. That second one is not a
      layout complaint — it reads as a button that does not work the first time.
    */
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{i18n.nLogSleepTitle}</Text>

      {/* Bed/wake times — compact pickers in settings-style rows (the old
          half-width spinners clipped horizontally) */}
      <View style={styles.timeCard}>
        <View style={styles.timeRow}>
          <Text style={styles.timeLabel}>{i18n.nBedtime}</Text>
          <DateTimePicker
            value={bedtime}
            mode="time"
            display="compact"
            themeVariant="dark"
            onChange={(_, d) => d && setBedtime(d)}
          />
        </View>
        <View style={[styles.timeRow, styles.timeRowBorder]}>
          <Text style={styles.timeLabel}>{i18n.nWakeUp}</Text>
          <DateTimePicker
            value={waketime}
            mode="time"
            display="compact"
            themeVariant="dark"
            onChange={(_, d) => d && setWaketime(d)}
          />
        </View>
        <View style={[styles.timeRow, styles.timeRowBorder]}>
          <Text style={styles.timeLabel}>{i18n.nDuration}</Text>
          <Text style={styles.duration}>
            {Math.floor(durationMin / 60)}h {String(durationMin % 60).padStart(2, '0')}m
          </Text>
        </View>
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
      {stageError ? <Text style={styles.stageError}>{stageError}</Text> : null}
      {durationError ? <Text style={styles.stageError}>{durationError}</Text> : null}

      <Text style={styles.fieldLabel}>{i18n.nHowSleep}</Text>
      <View style={styles.chips}>
        {QUALITY.map((q) => {
          const active = quality === q.value;
          return (
            <Pressable
              key={q.value}
              accessibilityRole="button"
              accessibilityLabel={i18n.a11ySleepQuality.replace('{x}', String(q.value))}
              accessibilityState={{ selected: active }}
              onPress={() => {
                Haptics.selectionAsync();
                setQuality(q.value);
              }}
              style={[
                styles.chip,
                active && { backgroundColor: `${q.color}24`, borderColor: q.color, borderWidth: 1 },
              ]}>
              <Icon icon={q.icon} size={24} color={active ? q.color : colors.mutedForeground} />
            </Pressable>
          );
        })}
      </View>

      <PressScale
                /* The name has to be a constant, because the *text* is not.

           This button renders a Check on success and a spinner while
           pending, and in both of those branches there is no `<Text>` in the
           tree at all — so the control announced itself as an unnamed
           element at exactly the two moments a person most needs to know
           what it is doing. `tools/tap-targets.mjs` documents this as the
           blind spot it cannot see, and these five buttons were sitting in
           it. */
        accessibilityRole="button"
        accessibilityLabel={i18n.nSaveSleep}
        style={[
          styles.saveButton,
          (save.isPending || !!stageError || !!durationError) && styles.saveDisabled,
        ]}
        disabled={save.isPending || save.isSuccess || !!stageError || !!durationError}
        onPress={() => {
          /* Offline this write used to pause for ever: the button stayed
             disabled on `isPending`, no toast fired, the sheet never closed,
             and the paused mutation was dropped on the next launch. */
          if (offlineNow() && user) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
            toast.success(i18n.logMealQueued);
            queue.mutate({
              kind: 'sleep',
              userId: user.id,
              bedtime: bedDate.toISOString(),
              waketime: wakeDate.toISOString(),
              quality,
              deepMin: Number(deepMin) || 0,
              remMin: Number(remMin) || 0,
              lightMin: Number(lightMin) || 0,
            });
            return;
          }
          save.mutate();
        }}>
        {save.isSuccess ? (
          <Icon icon={Check} size={22} color={colors.primaryForeground} strokeWidth={3} />
        ) : save.isPending ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.saveText}>{i18n.nSaveSleep}</Text>
        )}
      </PressScale>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.card },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { ...type.title, color: colors.foreground, textAlign: 'center', marginBottom: spacing.sm },
  fieldLabel: { ...type.footnote, color: colors.mutedForeground },
  timeCard: {
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: spacing.xs,
  },
  timeRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  timeLabel: { ...type.body, color: colors.foreground },
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
  saveButton: {
    height: 50,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  saveDisabled: { opacity: 0.4 },
  stageError: { ...type.footnote, color: colors.readinessRed },
  saveText: { ...type.headline, color: colors.primaryForeground },
});
