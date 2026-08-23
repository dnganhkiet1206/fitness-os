import * as Haptics from 'expo-haptics';
import { Check, Plus, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { PickRow } from '@/components/ascnd/pick-row';
import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { toast } from '@/lib/toast';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { rise } from '@/lib/entrance';
import { useI18n } from '@/hooks/use-app-settings';
import {
  useAddSupplement,
  useDeleteSupplement,
  useSupplementChecklist,
  useToggleSupplement,
} from '@/hooks/use-library';

export default function SupplementsScreen() {
  const { data: supplements } = useSupplementChecklist();
  const toggle = useToggleSupplement();
  const addSup = useAddSupplement();
  const delSup = useDeleteSupplement();
  const i18n = useI18n();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [timing, setTiming] = useState('morning');

  const TIMINGS = [
    { key: 'morning', label: i18n.supplementsTimMorning },
    { key: 'pre-workout', label: i18n.supplementsTimPreWorkout },
    { key: 'post-workout', label: i18n.supplementsTimPostWorkout },
    { key: 'with meals', label: i18n.supplementsTimWithMeal },
    { key: 'before bed', label: i18n.supplementsTimBeforeBed },
  ];

  // Timing is stored as an English key ('pre-workout', …) — render the
  // localized label, falling back to the raw value for legacy rows
  const timingLabel = (t: string | null) => TIMINGS.find((x) => x.key === t)?.label ?? t;

  const takenCount = (supplements ?? []).filter((s) => s.taken).length;

  const submit = () => {
    if (!name.trim()) return;
    addSup.mutate(
      { name: name.trim(), category: 'other', dose_text: dose.trim(), timing },
      {
        onSuccess: () => {
          setAdding(false);
          setName('');
          setDose('');
          setTiming('morning');
        },
        onError: (e: Error) => Alert.alert('ASCND', e.message),
      },
    );
  };

  const confirmDelete = (id: string, sName: string) => {
    Alert.alert('ASCND', `${i18n.delete} "${sName}"?`, [
      { text: i18n.cancel, style: 'cancel' },
      {
        text: i18n.delete,
        style: 'destructive',
        onPress: () => delSup.mutate(id, { onError: (e: Error) => toast.error(e.message) }),
      },
    ]);
  };

  return (
    <Screen
      back
      title={i18n.nSupplements}
      headerRight={
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={adding ? i18n.a11yClose : i18n.a11yAdd}
          accessibilityState={{ expanded: adding }}
          hitSlop={8}
          style={[styles.headerAdd, adding && styles.headerAddOn]}
          onPress={() => {
            Haptics.selectionAsync();
            setAdding((v) => !v);
          }}>
          <Icon icon={adding ? X : Plus} size={18} color={adding ? colors.primary : colors.foreground} />
        </PressScale>
      }>
      {adding && (
        <GlassCard style={styles.form}>
          <Text style={styles.formTitle}>{i18n.supplementsAddTitle}</Text>
          <Text style={styles.fieldLabel}>{i18n.supplementsName}</Text>
          <TextInput
            style={styles.input}
            placeholder="Creatine"
            placeholderTextColor={colors.mutedForeground}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
          <Text style={styles.fieldLabel}>{i18n.supplementsDose}</Text>
          <TextInput
            style={styles.input}
            placeholder="5g"
            placeholderTextColor={colors.mutedForeground}
            value={dose}
            onChangeText={setDose}
          />
          <Text style={styles.fieldLabel}>{i18n.supplementsTiming}</Text>
          <PickRow
            value={timing}
            fill={colors.primary}
            slotFill={colors.secondary}
            radius={radius.full}
              gap={spacing.sm}
            style={styles.chipRow}>
            {TIMINGS.map((t) => (
              <PickRow.Item
                key={t.key}
                itemKey={t.key}
                accessibilityLabel={t.label}
                style={styles.chip}
                onPress={() => { Haptics.selectionAsync(); setTiming(t.key); }}>
                <Text style={[styles.chipText, timing === t.key && styles.chipTextActive]}>{t.label}</Text>
              </PickRow.Item>
            ))}
          </PickRow>
          <PressScale
            style={[styles.submitBtn, (!name.trim() || addSup.isPending) && styles.submitDisabled]}
            disabled={!name.trim() || addSup.isPending}
            onPress={submit}>
            {addSup.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <Text style={styles.submitText}>{i18n.save}</Text>
            )}
          </PressScale>
        </GlassCard>
      )}

      {supplements && supplements.length > 0 ? (
        <>
          <GlassCard>
            <Text style={styles.title}>{i18n.nToday}</Text>
            <Text style={styles.big}>
              {takenCount} / {supplements.length}
            </Text>
            <Text style={styles.hint}>{i18n.nTakenToday}</Text>
          </GlassCard>
          {supplements.map((s, i) => (
            <Animated.View key={s.id} entering={rise(i)}>
            <GlassCard style={styles.itemCard}>
              <View style={styles.row}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={i18n.a11yCheckOff}
                  accessibilityState={{ checked: s.taken }}
                  // 24pt drawn and no slop at all — the smallest target in the
                  // app, and a daily one
                  hitSlop={10}
                  style={[styles.checkbox, s.taken && styles.checkboxOn]}
                  onPress={() => toggle.mutate({ supplementId: s.id, taken: !s.taken })}>
                  {s.taken && <Icon icon={Check} size={15} color="#fff" strokeWidth={3} />}
                </Pressable>
                <Pressable
                  style={styles.info}
                  onPress={() => toggle.mutate({ supplementId: s.id, taken: !s.taken })}>
                  <Text style={[styles.title, s.taken && styles.muted]}>{s.name}</Text>
                  <Text style={styles.hint}>
                    {[s.dose_text, timingLabel(s.timing)].filter(Boolean).join(' · ')}
                  </Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={i18n.a11yDelete} hitSlop={8} onPress={() => confirmDelete(s.id, s.name)}>
                  <Icon icon={Trash2} size={15} color={colors.mutedForeground} />
                </Pressable>
              </View>
            </GlassCard>
            </Animated.View>
          ))}
        </>
      ) : (
        <GlassCard>
          <Text style={styles.title}>{i18n.nNoSupplements}</Text>
          <Text style={styles.hint}>{i18n.nNoSupplementsHint}</Text>
        </GlassCard>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerAdd: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerAddOn: { backgroundColor: 'rgba(168,175,189,0.16)' },

  form: { gap: spacing.sm },
  formTitle: { ...type.headline, color: colors.foreground, marginBottom: 2 },
  fieldLabel: { ...type.caption, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4 },
  input: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    color: colors.foreground,
    fontSize: 15,
  },
  chipRow: { flexWrap: 'wrap' },
  /* No background and no radius — the row measures this and draws both. */
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipText: { ...type.footnote, color: colors.secondaryForeground },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '600' },
  submitBtn: {
    height: 46,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { ...type.headline, color: colors.primaryForeground },

  title: { ...type.headline, color: colors.foreground },
  hint: { ...type.footnote, color: colors.mutedForeground, marginTop: 2 },
  big: { ...type.largeTitle, color: colors.foreground, marginTop: spacing.sm },
  muted: { color: colors.mutedForeground },
  itemCard: { paddingVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  info: { flex: 1, minWidth: 0 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.readinessGreen, borderColor: colors.readinessGreen },
});
