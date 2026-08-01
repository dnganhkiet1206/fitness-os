import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, glass, radius, spacing, type } from '@/constants/ascnd';
import type { useI18n } from '@/hooks/use-app-settings';
import type { WeightUnit } from '@/lib/units';
import { displayWeight, weightLabel, weightToKg } from '@/lib/units';

/**
 * Set a target weight — a sheet up from the bottom, the way Cal AI does it.
 *
 * The number is the whole screen: one large field, the unit beside it, and a
 * full-width Save. No stepper. A stepper suits a steps goal, where the value
 * is a round number you nudge; a target weight is a number people already know
 * before they open this, and stepping to it from where they are now is a lot
 * of taps to enter something they could type.
 *
 * A sheet rather than a centred dialog because the keyboard is coming up
 * either way: a bottom sheet rises to meet it instead of being shoved around
 * by it, and the Save button stays exactly where the thumb already is.
 *
 * ── it works in the display unit ──
 *
 * You type kilograms or pounds — whichever the app is set to — and it is
 * converted on save. The store is always kilograms, so switching units later
 * changes what the field reads and never what the target is.
 *
 * ── what counts as valid ──
 *
 * A finite number inside the same 30–300 kg the store clamps to. Save is
 * simply disabled outside it, with the range printed under the field, rather
 * than accepting the entry and quietly moving it: a goal that saves as a
 * different number than the one you typed is worse than one that refuses.
 *
 * A comma is read as a decimal point. Vietnamese keyboards give a comma for
 * decimals and `Number('72,5')` is `NaN`, which would have made half the
 * decimal entries on a Vietnamese phone silently unsaveable.
 */

/** the range the store clamps to, in kg */
const MIN_KG = 30;
const MAX_KG = 300;

export function WeightGoalDialog({
  visible,
  goalKg,
  currentKg,
  unit,
  i18n,
  onSave,
  onClose,
}: {
  visible: boolean;
  /** the target as stored, or null when none is set */
  goalKg: number | null;
  /** latest weigh-in, used to seed the field the first time */
  currentKg: number | null;
  unit: WeightUnit;
  i18n: ReturnType<typeof useI18n>;
  onSave: (kg: number | null) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const wl = weightLabel(unit);
  const [text, setText] = useState('');

  /**
   * Reseed every time it opens, not once on mount.
   *
   * The sheet stays mounted between openings, so without this it would show
   * whatever was typed last time — including a half-finished number that was
   * cancelled.
   */
  useEffect(() => {
    if (!visible) return;
    const seed = goalKg ?? currentKg;
    setText(seed == null ? '' : String(Math.round(displayWeight(seed, unit) * 10) / 10));
  }, [visible, goalKg, currentKg, unit]);

  const parsed = Number(text.replace(',', '.'));
  const kg = Number.isFinite(parsed) && text.trim() !== '' ? weightToKg(parsed, unit) : null;
  const valid = kg != null && kg >= MIN_KG && kg <= MAX_KG;

  const save = () => {
    if (!valid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSave(kg);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      {/* Tapping the scrim closes without saving */}
      <Pressable style={styles.scrim} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.bottom}>
          {/* Swallow taps on the sheet so they do not reach the scrim */}
          <Pressable onPress={() => {}}>
            <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
              <View style={styles.grabber} />
              <Text style={styles.title}>{i18n.nWeightGoalTitle}</Text>

              <View style={styles.fieldRow}>
                <TextInput
                  style={styles.input}
                  value={text}
                  onChangeText={setText}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  placeholder="0.0"
                  placeholderTextColor={colors.mutedForeground}
                  autoFocus
                  selectTextOnFocus
                  onSubmitEditing={save}
                  returnKeyType="done"
                />
                <Text style={styles.unit}>{wl}</Text>
              </View>
              <Text style={styles.hint}>
                {i18n.nWeightGoalRange
                  .replace('{min}', String(Math.round(displayWeight(MIN_KG, unit))))
                  .replace('{max}', String(Math.round(displayWeight(MAX_KG, unit))))}{' '}
                {wl}
              </Text>

              <Pressable
                disabled={!valid}
                style={({ pressed }) => [styles.save, !valid && styles.saveOff, pressed && styles.pressed]}
                onPress={save}>
                <Text style={styles.saveText}>{i18n.nWeightGoalSave}</Text>
              </Pressable>

              {/* Clearing is only offered when there is something to clear */}
              {goalKg != null ? (
                <Pressable
                  style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onSave(null);
                    onClose();
                  }}>
                  <Text style={styles.ghostText}>{i18n.nWeightGoalClear}</Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  bottom: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: glass.borderWidth,
    borderTopColor: glass.border,
    paddingHorizontal: spacing.card,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  title: { ...type.headline, color: colors.foreground },

  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 60,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(24,24,27,0.4)',
  },
  input: {
    flex: 1,
    fontSize: 30,
    fontWeight: '700',
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
    padding: 0,
  },
  unit: { ...type.body, color: colors.mutedForeground },
  hint: { ...type.caption, color: colors.mutedForeground },

  save: {
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    marginTop: spacing.xs,
  },
  saveOff: { opacity: 0.4 },
  saveText: { ...type.headline, color: colors.primaryForeground },
  ghost: { alignItems: 'center', paddingVertical: spacing.sm },
  ghostText: { ...type.footnote, color: colors.mutedForeground },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
