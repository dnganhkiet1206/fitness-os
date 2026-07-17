import DateTimePicker from '@react-native-community/datetimepicker';
import { useMutation } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/useTodayData';
import { supabase } from '@/integrations/supabase/client';
import { localDateStr } from '@/lib/local-date';
import {
  displayHeight,
  displayWeight,
  heightToCm,
  weightToKg,
  type HeightUnit,
  type WeightUnit,
} from '@/lib/units';

type Form = {
  name: string;
  dob: string;
  sex: string;
  activity_level: string;
  height_cm: string;
  weight_kg: string;
  goal: string;
  tdee_target_kcal: string;
  macro_protein_g: string;
  macro_carbs_g: string;
  macro_fat_g: string;
  water_target_ml: string;
  units_weight: string;
  units_height: string;
  sleep_target_hours: string;
  sleep_target_bedtime: string;
  sleep_target_waketime: string;
};

const EMPTY: Form = {
  name: '', dob: '', sex: 'male', activity_level: 'moderate',
  height_cm: '175', weight_kg: '70', goal: 'maintain', tdee_target_kcal: '2200',
  macro_protein_g: '150', macro_carbs_g: '250', macro_fat_g: '70',
  water_target_ml: '2500', units_weight: 'kg', units_height: 'cm',
  sleep_target_hours: '8', sleep_target_bedtime: '23:00', sleep_target_waketime: '07:00',
};

/** "HH:MM[:SS]" → Date for the time spinner */
function timeToDate(t: string): Date {
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h || 0, m || 0);
}
function dateToTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function EditProfileSheet() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const i18n = useI18n();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(EMPTY);
  const [showDob, setShowDob] = useState(false);
  // Display strings for the weight/height fields (form keeps metric)
  const [wDisp, setWDisp] = useState('');
  const [hDisp, setHDisp] = useState('');

  useEffect(() => {
    if (!profile) return;
    const uW: WeightUnit = profile.units_weight === 'lbs' ? 'lbs' : 'kg';
    const uH: HeightUnit = profile.units_height === 'in' ? 'in' : 'cm';
    setWDisp(String(displayWeight(Number(profile.weight_kg ?? 70), uW)));
    setHDisp(String(displayHeight(Number(profile.height_cm ?? 175), uH)));
    setForm({
      name: profile.name ?? '',
      dob: profile.dob ?? '',
      sex: profile.sex ?? 'male',
      activity_level: profile.activity_level ?? 'moderate',
      height_cm: String(profile.height_cm ?? 175),
      weight_kg: String(profile.weight_kg ?? 70),
      goal: profile.goal ?? 'maintain',
      tdee_target_kcal: String(profile.tdee_target_kcal ?? 2200),
      macro_protein_g: String(profile.macro_protein_g ?? 150),
      macro_carbs_g: String(profile.macro_carbs_g ?? 250),
      macro_fat_g: String(profile.macro_fat_g ?? 70),
      water_target_ml: String(profile.water_target_ml ?? 2500),
      units_weight: profile.units_weight ?? 'kg',
      units_height: profile.units_height ?? 'cm',
      sleep_target_hours: String(profile.sleep_target_hours ?? 8),
      sleep_target_bedtime: (profile.sleep_target_bedtime ?? '23:00').slice(0, 5),
      sleep_target_waketime: (profile.sleep_target_waketime ?? '07:00').slice(0, 5),
    });
  }, [profile]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase
        .from('profiles')
        .update({
          name: form.name,
          dob: form.dob || null,
          sex: form.sex,
          activity_level: form.activity_level,
          height_cm: Number(form.height_cm) || null,
          weight_kg: Number(form.weight_kg) || null,
          goal: form.goal,
          tdee_target_kcal: Number(form.tdee_target_kcal) || null,
          macro_protein_g: Number(form.macro_protein_g) || null,
          macro_carbs_g: Number(form.macro_carbs_g) || null,
          macro_fat_g: Number(form.macro_fat_g) || null,
          water_target_ml: Number(form.water_target_ml) || null,
          units_weight: form.units_weight,
          units_height: form.units_height,
          sleep_target_hours: Number(form.sleep_target_hours) || null,
          sleep_target_bedtime: form.sleep_target_bedtime,
          sleep_target_waketime: form.sleep_target_waketime,
        })
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    },
    onError: (e: Error) => Alert.alert('ASCND', e.message),
  });

  const goals = [
    { key: 'bulk', label: i18n.goalBulk },
    { key: 'cut', label: i18n.goalCut },
    { key: 'maintain', label: i18n.goalMaintain },
    { key: 'recomp', label: i18n.goalRecomp },
    { key: 'strength', label: i18n.goalStrength },
    { key: 'endurance', label: i18n.goalEndurance },
  ];
  const activities = [
    { key: 'sedentary', label: i18n.activitySedentary },
    { key: 'light', label: i18n.activityLight },
    { key: 'moderate', label: i18n.activityModerate },
    { key: 'high', label: i18n.activityHigh },
    { key: 'athlete', label: i18n.activityAthlete },
  ];
  const sexes = [
    { key: 'male', label: i18n.settingsSexMale },
    { key: 'female', label: i18n.settingsSexFemale },
    { key: 'other', label: i18n.settingsSexOther },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Text style={styles.headerCancel}>{i18n.nCancel}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{i18n.settingsPersonalInfo}</Text>
        <Pressable hitSlop={8} onPress={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Text style={styles.headerSave}>{i18n.save}</Text>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Name */}
        <Field label={i18n.settingsName}>
          <TextInput
            style={styles.input}
            value={form.name}
            onChangeText={(v) => set('name', v)}
            placeholder="—"
            placeholderTextColor={colors.mutedForeground}
          />
        </Field>

        {/* DOB */}
        <Field label={i18n.settingsDob}>
          <Pressable style={styles.input} onPress={() => setShowDob((s) => !s)}>
            <Text style={styles.inputText}>{form.dob || '—'}</Text>
          </Pressable>
          {showDob && (
            <DateTimePicker
              value={form.dob ? new Date(form.dob) : new Date(2000, 0, 1)}
              mode="date"
              display="spinner"
              maximumDate={new Date()}
              themeVariant="dark"
              onChange={(_, d) => {
                if (d) set('dob', localDateStr(d));
              }}
            />
          )}
        </Field>

        {/* Sex */}
        <Field label={i18n.settingsSex}>
          <Segmented options={sexes} value={form.sex} onChange={(v) => set('sex', v)} />
        </Field>

        {/* Height + Weight (entered in the user's display units) */}
        <View style={styles.row}>
          <Field label={`${i18n.settingsHeight} (${form.units_height})`} style={styles.half}>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={hDisp}
              onChangeText={(v) => {
                setHDisp(v);
                const n = parseFloat(v);
                set('height_cm', v && !isNaN(n) ? String(Math.round(heightToCm(n, form.units_height as HeightUnit))) : '');
              }}
            />
          </Field>
          <Field label={`${i18n.settingsWeight} (${form.units_weight})`} style={styles.half}>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={wDisp}
              onChangeText={(v) => {
                setWDisp(v);
                const n = parseFloat(v);
                set('weight_kg', v && !isNaN(n) ? String(Math.round(weightToKg(n, form.units_weight as WeightUnit) * 10) / 10) : '');
              }}
            />
          </Field>
        </View>

        {/* Units — flipping converts the field in place */}
        <View style={styles.row}>
          <Field label={i18n.settingsWeight} style={styles.half}>
            <Segmented
              options={[{ key: 'kg', label: 'kg' }, { key: 'lbs', label: 'lbs' }]}
              value={form.units_weight}
              onChange={(v) => {
                const kg = Number(form.weight_kg) || 0;
                set('units_weight', v);
                setWDisp(kg ? String(displayWeight(kg, v as WeightUnit)) : '');
              }}
            />
          </Field>
          <Field label={i18n.settingsHeight} style={styles.half}>
            <Segmented
              options={[{ key: 'cm', label: 'cm' }, { key: 'in', label: 'in' }]}
              value={form.units_height}
              onChange={(v) => {
                const cm = Number(form.height_cm) || 0;
                set('units_height', v);
                setHDisp(cm ? String(displayHeight(cm, v as HeightUnit)) : '');
              }}
            />
          </Field>
        </View>

        {/* Activity level */}
        <Field label={i18n.settingsActivityLevel}>
          <ChipGrid options={activities} value={form.activity_level} onChange={(v) => set('activity_level', v)} />
        </Field>

        {/* Goal */}
        <Field label={i18n.settingsGoal}>
          <ChipGrid options={goals} value={form.goal} onChange={(v) => set('goal', v)} />
        </Field>

        <View style={styles.divider} />

        {/* Daily calories */}
        <Field label={`${i18n.nDailyTarget} (kcal)`}>
          <TextInput
            style={[styles.input, styles.bigInput]}
            keyboardType="number-pad"
            value={form.tdee_target_kcal}
            onChangeText={(v) => set('tdee_target_kcal', v)}
          />
        </Field>

        {/* Macros */}
        <View style={styles.row}>
          <Field label={i18n.nProtein} style={styles.third}>
            <TextInput style={styles.input} keyboardType="number-pad" value={form.macro_protein_g} onChangeText={(v) => set('macro_protein_g', v)} />
          </Field>
          <Field label={i18n.nCarbs} style={styles.third}>
            <TextInput style={styles.input} keyboardType="number-pad" value={form.macro_carbs_g} onChangeText={(v) => set('macro_carbs_g', v)} />
          </Field>
          <Field label={i18n.nFat} style={styles.third}>
            <TextInput style={styles.input} keyboardType="number-pad" value={form.macro_fat_g} onChangeText={(v) => set('macro_fat_g', v)} />
          </Field>
        </View>

        {/* Water target */}
        <Field label={`${i18n.settingsWaterTarget} (ml)`}>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={form.water_target_ml}
            onChangeText={(v) => set('water_target_ml', v)}
          />
        </Field>

        <View style={styles.divider} />

        {/* Sleep targets (web Settings sleep page) */}
        <Field label={`${i18n.settingsSleepTarget} — ${i18n.settingsSleepHours}`}>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={form.sleep_target_hours}
            onChangeText={(v) => set('sleep_target_hours', v)}
          />
        </Field>
        <View style={styles.row}>
          <Field label={i18n.settingsBedtime} style={styles.half}>
            <View style={styles.pickerWrap}>
              <DateTimePicker
                value={timeToDate(form.sleep_target_bedtime)}
                mode="time"
                display="compact"
                themeVariant="dark"
                onChange={(_, d) => {
                  if (d) set('sleep_target_bedtime', dateToTime(d));
                }}
              />
            </View>
          </Field>
          <Field label={i18n.settingsWakeTime} style={styles.half}>
            <View style={styles.pickerWrap}>
              <DateTimePicker
                value={timeToDate(form.sleep_target_waketime)}
                mode="time"
                display="compact"
                themeVariant="dark"
                onChange={(_, d) => {
                  if (d) set('sleep_target_waketime', dateToTime(d));
                }}
              />
            </View>
          </Field>
        </View>
      </ScrollView>
    </View>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Segmented({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Pressable
          key={o.key}
          style={[styles.segment, value === o.key && styles.segmentActive]}
          onPress={() => {
            Haptics.selectionAsync();
            onChange(o.key);
          }}>
          <Text style={[styles.segmentText, value === o.key && styles.segmentTextActive]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ChipGrid({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.chipGrid}>
      {options.map((o) => (
        <Pressable
          key={o.key}
          style={[styles.gridChip, value === o.key && styles.gridChipActive]}
          onPress={() => {
            Haptics.selectionAsync();
            onChange(o.key);
          }}>
          <Text style={[styles.gridChipText, value === o.key && styles.gridChipTextActive]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.card },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerCancel: { ...type.body, color: colors.mutedForeground },
  headerTitle: { ...type.headline, color: colors.foreground },
  headerSave: { ...type.headline, color: colors.primary, fontWeight: '700' },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  field: { gap: 6 },
  fieldLabel: { ...type.caption, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.6 },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    color: colors.foreground,
    fontSize: 16,
    justifyContent: 'center',
  },
  inputText: { color: colors.foreground, fontSize: 16 },
  bigInput: { height: 56, fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  third: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.xs },
  pickerWrap: { alignItems: 'flex-start' },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.secondary,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segment: { flex: 1, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { ...type.footnote, color: colors.secondaryForeground, fontWeight: '600' },
  segmentTextActive: { color: colors.primaryForeground },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  gridChipActive: { borderColor: colors.primary, backgroundColor: 'rgba(168,178,196,0.12)' },
  gridChipText: { ...type.footnote, color: colors.secondaryForeground },
  gridChipTextActive: { color: colors.foreground, fontWeight: '600' },
});
