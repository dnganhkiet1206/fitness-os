import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
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

import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useUpsertBodyMeasurement, type BodyMeasurementInput } from '@/hooks/use-fitness-data';

type FieldKey = Exclude<keyof BodyMeasurementInput, 'date' | 'notes'>;

export default function LogMeasurementSheet() {
  const i18n = useI18n();
  const upsert = useUpsertBodyMeasurement();
  const [date, setDate] = useState(new Date());
  const [fields, setFields] = useState<Partial<Record<FieldKey, string>>>({});

  // Same field set as the web Progress → "Add measurement" dialog
  const FIELDS: { key: FieldKey; label: string }[] = [
    { key: 'neck_cm', label: i18n.measureNeck },
    { key: 'shoulders_cm', label: i18n.measureShoulders },
    { key: 'chest_cm', label: i18n.measureChest },
    { key: 'waist_cm', label: i18n.measureWaist },
    { key: 'hips_cm', label: i18n.measureHips },
    { key: 'bicep_left_cm', label: i18n.measureBicepL },
    { key: 'bicep_right_cm', label: i18n.measureBicepR },
    { key: 'thigh_left_cm', label: i18n.measureThighL },
    { key: 'thigh_right_cm', label: i18n.measureThighR },
    { key: 'calf_left_cm', label: i18n.measureCalfL },
    { key: 'calf_right_cm', label: i18n.measureCalfR },
    { key: 'body_fat_pct', label: i18n.measureBodyFat },
  ];

  const setField = (key: FieldKey, v: string) => setFields((prev) => ({ ...prev, [key]: v }));

  const hasValue = FIELDS.some(({ key }) => {
    const v = fields[key]?.trim();
    return v != null && v.length > 0 && !isNaN(Number(v));
  });
  const canSave = hasValue && !upsert.isPending;

  const save = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const payload: BodyMeasurementInput = { date: date.toISOString().split('T')[0] };
    for (const { key } of FIELDS) {
      const v = fields[key]?.trim();
      if (v && !isNaN(Number(v))) payload[key] = Number(v);
    }
    upsert.mutate(payload, {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      },
      onError: (e: Error) => Alert.alert('ASCND', e.message),
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
              />
            ))}
          </View>
        ))}

        <Pressable
          style={({ pressed }) => [styles.saveButton, !canSave && styles.saveDisabled, pressed && canSave && styles.pressed]}
          disabled={!canSave}
          onPress={save}>
          {upsert.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.saveText}>{i18n.save}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label, value, onChange, style,
}: {
  label: string; value: string; onChange: (v: string) => void; style?: object;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel} numberOfLines={1}>{label}</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        placeholder="—"
        placeholderTextColor={colors.mutedForeground}
        value={value}
        onChangeText={onChange}
      />
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
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  saveButton: { height: 50, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  saveDisabled: { opacity: 0.4 },
  saveText: { ...type.headline, color: colors.primaryForeground },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
