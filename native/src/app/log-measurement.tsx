import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Check } from 'lucide-react-native';

import { PressScale } from '@/components/ascnd/press-scale';
import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { localDateStr } from '@/lib/local-date';
import { useI18n } from '@/hooks/use-app-settings';
import { useUpsertBodyMeasurement, type BodyMeasurementInput } from '@/hooks/use-fitness-data';
import { useUnits } from '@/hooks/use-units';
import { toast } from '@/lib/toast';
import { displayLength, lengthLabel, lengthToCm } from '@/lib/units';
import { BOUNDS, plausible } from '@/lib/plausible';

type FieldKey = Exclude<keyof BodyMeasurementInput, 'date' | 'notes'>;

export default function LogMeasurementSheet() {
  const i18n = useI18n();
  const { height: lUnit } = useUnits();
  const upsert = useUpsertBodyMeasurement();
  const [date, setDate] = useState(new Date());
  const [fields, setFields] = useState<Partial<Record<FieldKey, string>>>({});

  // Circumference labels carry "(cm)"; swap to the user's length unit
  const lbl = (s: string) => (lUnit === 'in' ? s.replace('(cm)', '(in)') : s);

  // Same field set as the web Progress → "Add measurement" dialog
  const FIELDS: { key: FieldKey; label: string }[] = [
    { key: 'neck_cm', label: lbl(i18n.measureNeck) },
    { key: 'shoulders_cm', label: lbl(i18n.measureShoulders) },
    { key: 'chest_cm', label: lbl(i18n.measureChest) },
    { key: 'waist_cm', label: lbl(i18n.measureWaist) },
    { key: 'hips_cm', label: lbl(i18n.measureHips) },
    { key: 'bicep_left_cm', label: lbl(i18n.measureBicepL) },
    { key: 'bicep_right_cm', label: lbl(i18n.measureBicepR) },
    { key: 'thigh_left_cm', label: lbl(i18n.measureThighL) },
    { key: 'thigh_right_cm', label: lbl(i18n.measureThighR) },
    { key: 'calf_left_cm', label: lbl(i18n.measureCalfL) },
    { key: 'calf_right_cm', label: lbl(i18n.measureCalfR) },
    { key: 'body_fat_pct', label: i18n.measureBodyFat },
  ];

  const setField = (key: FieldKey, v: string) => setFields((prev) => ({ ...prev, [key]: v }));

  /*
    ── the same check the other health inputs got ──

    `body_fat_pct` accepted 500. Circumferences accepted anything at all. Both
    end up on the Progress charts, where one absurd point sets the axis and
    flattens every real reading beside it into a straight line.

    The circumference boxes hold the user's length unit, so the value is
    converted to cm before it is judged — a 40-inch waist is a real waist and
    refusing it because 40 is small in centimetres would be the bug, not the
    fix. Body fat is a percentage in both unit systems and is checked as typed.
  */
  const errorFor = (key: FieldKey): string | null => {
    const raw = fields[key]?.trim();
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return i18n.outOfRange.replace('{min}', '0').replace('{max}', '—').replace('{unit}', '');
    if (key === 'body_fat_pct') {
      return plausible('body_fat_pct', n) ? null
        : i18n.outOfRange
            .replace('{min}', String(BOUNDS.body_fat_pct.min))
            .replace('{max}', String(BOUNDS.body_fat_pct.max))
            .replace('{unit}', '%');
    }
    return plausible('circumference_cm', lengthToCm(n, lUnit)) ? null
      : i18n.outOfRange
          .replace('{min}', String(Math.round(displayLength(BOUNDS.circumference_cm.min, lUnit))))
          .replace('{max}', String(Math.round(displayLength(BOUNDS.circumference_cm.max, lUnit))))
          .replace('{unit}', lengthLabel(lUnit));
  };
  const anyBad = FIELDS.some(({ key }) => errorFor(key) !== null);

  const hasValue = FIELDS.some(({ key }) => {
    const v = fields[key]?.trim();
    return v != null && v.length > 0 && !isNaN(Number(v));
  });
  const canSave = hasValue && !anyBad && !upsert.isPending && !upsert.isSuccess;

  const save = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const payload: BodyMeasurementInput = { date: localDateStr(date) };
    for (const { key } of FIELDS) {
      const v = fields[key]?.trim();
      if (v && !isNaN(Number(v))) {
        // Circumference fields are stored in cm; body_fat_pct is a %
        payload[key] =
          key === 'body_fat_pct' ? Number(v) : Math.round(lengthToCm(Number(v), lUnit) * 10) / 10;
      }
    }
    upsert.mutate(payload, {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
        toast.success(i18n.progressSaved);
      },
      onError: (e: Error) => toast.error(e.message),
    });
  };

  // Two-column rows, like the biometrics sheet
  const rows: (typeof FIELDS)[] = [];
  for (let i = 0; i < FIELDS.length; i += 2) rows.push(FIELDS.slice(i, i + 2));

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{i18n.progressAddMeasurement}</Text>

        <View style={styles.dateRow}>
          <Text style={styles.fieldLabel}>{i18n.progressDate}</Text>
          <DateTimePicker
            value={date}
            mode="date"
            display="compact"
            themeVariant="dark"
            maximumDate={new Date()}
            onChange={(_, d) => d && setDate(d)}
          />
        </View>

        {rows.map((row) => (
          <View key={row[0].key} style={styles.row}>
            {row.map(({ key, label }) => (
              <Field
                key={key}
                label={label}
                value={fields[key] ?? ''}
                onChange={(v) => setField(key, v)}
                style={styles.half}
                error={errorFor(key)}
              />
            ))}
          </View>
        ))}

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
          accessibilityLabel={i18n.save}
          style={[styles.saveButton, !canSave && !upsert.isSuccess && styles.saveDisabled]}
          disabled={!canSave}
          onPress={save}>
          {upsert.isSuccess ? (
            <Icon icon={Check} size={22} color={colors.primaryForeground} strokeWidth={3} />
          ) : upsert.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.saveText}>{i18n.save}</Text>
          )}
        </PressScale>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label, value, onChange, style, error,
}: {
  label: string; value: string; onChange: (v: string) => void; style?: object; error?: string | null;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel} numberOfLines={1}>{label}</Text>
      <TextInput
        style={[styles.input, error ? styles.inputBad : null]}
        keyboardType="decimal-pad"
        placeholder="—"
        placeholderTextColor={colors.mutedForeground}
        value={value}
        onChangeText={onChange}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.card },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { ...type.title, color: colors.foreground, textAlign: 'center', marginBottom: spacing.sm },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
  },
  inputBad: { borderColor: colors.readinessRed },
  fieldError: { ...type.footnote, color: colors.readinessRed },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  saveButton: { height: 50, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  saveDisabled: { opacity: 0.4 },
  saveText: { ...type.headline, color: colors.primaryForeground },
});
