import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { nav } from '@/lib/nav';
import { Check, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
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

import { ProgressBar } from '@/components/ascnd/progress-bar';
import { PressScale } from '@/components/ascnd/press-scale';
import { Icon } from '@/components/ascnd/icon';
import { duration } from '@/constants/motion';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { toast } from '@/lib/toast';
import {
  useCreateFoodItem,
  useDeleteFoodItem,
  useFoodItem,
  useUpdateFoodItem,
  type FoodFormData,
} from '@/hooks/use-nutrition';

const MACRO_COLORS = {
  protein: colors.readinessYellow,
  carbs: colors.metricBlue,
  fat: colors.metricOrange,
};

/** Add/edit custom food — mirrors the web FoodItemDialog */
export default function FoodEditorSheet() {
  const i18n = useI18n();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;

  const { data: existing } = useFoodItem(id ?? null);
  const create = useCreateFoodItem();
  const update = useUpdateFoodItem();
  const remove = useDeleteFoodItem();

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [serving, setServing] = useState('100');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');

  useEffect(() => {
    if (!existing) return;
    setName(existing.name ?? '');
    setBrand(existing.brand ?? '');
    setServing(String(Number(existing.serving_g) || 100));
    setKcal(String(Math.round(Number(existing.kcal)) || ''));
    setProtein(String(Math.round(Number(existing.protein_g)) || ''));
    setCarbs(String(Math.round(Number(existing.carbs_g)) || ''));
    setFat(String(Math.round(Number(existing.fat_g)) || ''));
    setFiber(String(Math.round(Number(existing.fiber_g)) || ''));
  }, [existing]);

  const num = (v: string) => Number(v) || 0;
  const calcKcal = Math.round(num(protein) * 4 + num(carbs) * 4 + num(fat) * 9);
  const totalMacroG = num(protein) + num(carbs) + num(fat);
  const proteinPct = totalMacroG > 0 ? Math.round((num(protein) / totalMacroG) * 100) : 0;
  const carbsPct = totalMacroG > 0 ? Math.round((num(carbs) / totalMacroG) * 100) : 0;
  const fatPct = totalMacroG > 0 ? 100 - proteinPct - carbsPct : 0;

  const saving = create.isPending || update.isPending;
  // Stays disabled after success so the closing sheet can't double-submit
  const saved = create.isSuccess || update.isSuccess || remove.isSuccess;
  const canSave = name.trim().length > 0 && !saving && !saved;

  const save = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const data: FoodFormData = {
      name: name.trim(),
      brand: brand.trim(),
      serving_g: num(serving) || 100,
      kcal: num(kcal),
      protein_g: num(protein),
      carbs_g: num(carbs),
      fat_g: num(fat),
      fiber_g: num(fiber),
    };
    const opts = {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        nav.back();
        toast.success(isEdit ? i18n.foodUpdated : i18n.foodAdded);
      },
      onError: (e: Error) => toast.fail(e),
    };
    if (isEdit && id) update.mutate({ id, ...data }, opts);
    else create.mutate(data, opts);
  };

  const confirmDelete = () => {
    if (!id) return;
    Alert.alert('ASCND', `${i18n.delete} "${name.trim() || existing?.name || ''}"?`, [
      { text: i18n.cancel, style: 'cancel' },
      {
        text: i18n.delete,
        style: 'destructive',
        onPress: () =>
          remove.mutate(id, {
            onSuccess: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              nav.back();
              toast.success(i18n.foodDeleted);
            },
            onError: (e: Error) => toast.fail(e),
          }),
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{isEdit ? i18n.foodEditTitle : i18n.foodAddTitle}</Text>

        <Field label={i18n.foodName} value={name} onChange={setName} placeholder={i18n.foodNamePlaceholder} />
        <Field label={i18n.foodBrand} value={brand} onChange={setBrand} placeholder={i18n.foodBrandPlaceholder} />

        <View style={styles.servingRow}>
          <Text style={styles.fieldLabel}>{i18n.foodServing}</Text>
          <View style={styles.servingInputWrap}>
            <TextInput
              style={styles.servingInput}
              keyboardType="number-pad"
              value={serving}
              onChangeText={setServing}
            />
            <Text style={styles.unit}>g</Text>
          </View>
        </View>

        {/* Calories card with auto-calc from macros (web FoodItemDialog) */}
        <View style={styles.macroCard}>
          <Text style={styles.fieldLabel}>{i18n.foodCalories}</Text>
          <View style={styles.kcalRow}>
            <View style={styles.kcalInputWrap}>
              <TextInput
                style={styles.kcalInput}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={colors.mutedForeground}
                value={kcal}
                onChangeText={setKcal}
              />
              <Text style={styles.unit}>kcal</Text>
            </View>
            <PressScale
              style={styles.autoCalcBtn}
              onPress={() => {
                Haptics.selectionAsync();
                setKcal(String(calcKcal));
              }}>
              <Text style={styles.autoCalcText}>{i18n.foodAutoCalc} ({calcKcal})</Text>
            </PressScale>
          </View>

          {totalMacroG > 0 && (
            <View style={styles.distBar}>
              <View style={[styles.distSeg, { flex: proteinPct, backgroundColor: MACRO_COLORS.protein }]} />
              <View style={[styles.distSeg, { flex: carbsPct, backgroundColor: MACRO_COLORS.carbs }]} />
              <View style={[styles.distSeg, { flex: fatPct, backgroundColor: MACRO_COLORS.fat }]} />
            </View>
          )}

          <View style={styles.macroGrid}>
            <MacroField label={i18n.foodProtein} value={protein} onChange={setProtein} pct={proteinPct} color={MACRO_COLORS.protein} />
            <MacroField label={i18n.foodCarbs} value={carbs} onChange={setCarbs} pct={carbsPct} color={MACRO_COLORS.carbs} />
            <MacroField label={i18n.foodFat} value={fat} onChange={setFat} pct={fatPct} color={MACRO_COLORS.fat} />
          </View>

          <View style={styles.fiberRow}>
            <Text style={styles.fieldLabel}>{i18n.foodFiber}</Text>
            <View style={styles.fiberInputWrap}>
              <TextInput
                style={styles.fiberInput}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={colors.mutedForeground}
                value={fiber}
                onChangeText={setFiber}
              />
              <Text style={styles.unit}>g</Text>
            </View>
          </View>
        </View>

        <View style={styles.actionsRow}>
          {isEdit && (
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={i18n.a11yDelete}
              style={styles.deleteBtn}
              onPress={confirmDelete}
              disabled={remove.isPending || saved}>
              {remove.isPending ? (
                <ActivityIndicator color={colors.readinessRed} size="small" />
              ) : (
                <Icon icon={Trash2} size={18} color={colors.readinessRed} />
              )}
            </PressScale>
          )}
          <PressScale
            style={[styles.saveButton, !canSave && !saved && styles.saveDisabled]}
            disabled={!canSave}
            onPress={save}>
            {saved ? (
              <Icon icon={Check} size={22} color={colors.primaryForeground} strokeWidth={3} />
            ) : saving ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.saveText}>{isEdit ? i18n.save : i18n.add}</Text>
            )}
          </PressScale>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label, value, onChange, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        value={value}
        onChangeText={onChange}
      />
    </View>
  );
}

function MacroField({
  label, value, onChange, pct, color,
}: {
  label: string; value: string; onChange: (v: string) => void; pct: number; color: string;
}) {
  return (
    <View style={styles.macroCell}>
      <Text style={styles.macroLabel} numberOfLines={1}>{label}</Text>
      <TextInput
        style={styles.macroInput}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor={colors.mutedForeground}
        value={value}
        onChangeText={onChange}
      />
      <View style={styles.macroMetaRow}>
        <Text style={styles.macroMeta}>g</Text>
        <Text style={styles.macroMeta}>{pct}%</Text>
      </View>
      <ProgressBar
        pct={pct}
        height={4}
        radius={2}
        trackColor={colors.background}
        color={color}
        delay={0}
        duration={duration.move}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.card },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { ...type.title, color: colors.foreground, textAlign: 'center', marginBottom: spacing.sm },
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
  unit: { ...type.footnote, color: colors.mutedForeground },

  servingRow: { gap: 6 },
  servingInputWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  servingInput: {
    width: 96,
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    textAlign: 'center',
    color: colors.foreground,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },

  macroCard: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm + 2,
  },
  kcalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kcalInputWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kcalInput: {
    width: 96,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
    textAlign: 'center',
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  autoCalcBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  autoCalcText: { ...type.caption, color: colors.mutedForeground },
  distBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  distSeg: { height: '100%' },
  macroGrid: { flexDirection: 'row', gap: spacing.sm },
  macroCell: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    gap: 5,
  },
  macroLabel: { ...type.caption, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.6 },
  macroInput: {
    height: 34,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    textAlign: 'center',
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    paddingVertical: 0,
  },
  macroMetaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  macroMeta: { fontSize: 11, color: colors.mutedForeground },
  fiberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fiberInputWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fiberInput: {
    width: 64,
    height: 34,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
    textAlign: 'center',
    color: colors.foreground,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    paddingVertical: 0,
  },

  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  deleteBtn: {
    width: 50,
    height: 50,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,59,92,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    flex: 1,
    height: 50,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveDisabled: { opacity: 0.4 },
  saveText: { ...type.headline, color: colors.primaryForeground },
});
