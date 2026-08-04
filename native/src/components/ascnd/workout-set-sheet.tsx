import * as Haptics from 'expo-haptics';
import { ChevronDown, ChevronUp, Minus, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { Easing, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import type { useI18n } from '@/hooks/use-app-settings';
import type { TemplateExercise } from '@/hooks/use-library';
import { displayWeight, weightLabel, weightToKg, type WeightUnit } from '@/lib/units';

/**
 * How one exercise is prescribed — sets, reps, load, rest and effort.
 *
 * ── why this is a sheet and not five boxes in a row ──
 *
 * The builder used to put all five on one line inside every exercise card:
 * `Sets | Reps | kg | RPE | Rest`, each a bordered text field. On a 390pt
 * screen that is about 66pt of width apiece, so five number pads, five labels
 * at 11pt, and no room for any of them to say what it is. Worse, the five had
 * equal weight — RPE and rest, which most people set once and never touch, drew
 * exactly as loudly as sets and reps, which are the whole prescription.
 *
 * So the card outside shows the prescription as a sentence — `3 × 10 · 60 kg` —
 * and the editing happens here, one row per value, with room for a name and a
 * hint. It is the shape Apple's Fitness and Health use for the same job: a
 * summary you read, and a focused place you go to change it.
 *
 * ── steppers, and still typable ──
 *
 * Every row is `−  value  +` where the value is a real text field. The buttons
 * are for the normal case (nudge the reps by one, add a plate) and the field is
 * for the case a stepper is bad at (rest of 180s, a working weight of 82.5).
 * Taking the typing away would have been a real loss — it is what the old row
 * of boxes was *good* at — so it is still there, just no longer the only way.
 *
 * ── order is edited here too ──
 *
 * Which exercise comes first is part of the prescription: compounds while you
 * are fresh, isolation after. There was no way to express that at all before —
 * the list could only be appended to — and a drag handle needs a gesture
 * library the project does not carry, so the move is two buttons on the thing
 * being moved, disabled at the ends.
 */

/** Rest as a person says it: `45s`, `1:30`. */
export function restLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
/** Two decimal places, so 2.5-kg steps cannot drift into 82.50000000000001 */
const tidy = (n: number) => Math.round(n * 100) / 100;

/**
 * One `−  value  +` control.
 *
 * `initial` is read once, on mount. That is safe *because* the sheet is mounted
 * fresh each time an exercise is opened — nothing pushes a new value in from
 * outside while it is on screen, so the stepper owning its own number cannot
 * drift from the parent's. If that ever stops being true, this needs a sync
 * effect and the comment above it explaining why.
 */
function Stepper({
  initial,
  min,
  max,
  step,
  decimals = 0,
  a11yLabel,
  onChange,
}: {
  initial: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  a11yLabel: string;
  onChange: (n: number) => void;
}) {
  const fmt = (n: number) => (decimals ? String(n) : String(Math.round(n)));
  const [num, setNum] = useState(initial);
  const [str, setStr] = useState(() => fmt(initial));

  const commit = (n: number) => {
    const c = clamp(tidy(n), min, max);
    setNum(c);
    onChange(c);
    return c;
  };

  const bump = (dir: 1 | -1) => {
    Haptics.selectionAsync();
    setStr(fmt(commit(num + dir * step)));
  };

  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${a11yLabel} −`}
        disabled={num <= min}
        onPress={() => bump(-1)}
        style={({ pressed }) => [styles.stepBtn, num <= min && styles.stepOff, pressed && styles.pressed]}>
        <Icon icon={Minus} size={16} color={colors.foreground} strokeWidth={2.5} />
      </Pressable>

      <TextInput
        accessibilityLabel={a11yLabel}
        style={styles.stepValue}
        keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
        value={str}
        selectTextOnFocus
        onChangeText={(t) => {
          // The field keeps whatever was typed — including the empty string
          // mid-edit — while the stored number is the clamped reading of it.
          setStr(t);
          commit(Number(t.replace(',', '.')) || 0);
        }}
        // Leaving the field is where a half-finished entry becomes a number
        onEndEditing={() => setStr(fmt(num))}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${a11yLabel} +`}
        disabled={num >= max}
        onPress={() => bump(1)}
        style={({ pressed }) => [styles.stepBtn, num >= max && styles.stepOff, pressed && styles.pressed]}>
        <Icon icon={Plus} size={16} color={colors.foreground} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function WorkoutSetSheet({
  item,
  index,
  total,
  unit,
  i18n,
  onChange,
  onMove,
  onRemove,
  onClose,
}: {
  item: TemplateExercise;
  index: number;
  total: number;
  unit: WeightUnit;
  i18n: ReturnType<typeof useI18n>;
  onChange: (patch: Partial<TemplateExercise>) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const wl = weightLabel(unit);

  return (
    <View style={styles.overlay}>
      {/* Tapping the dimmed page behind the sheet closes it — the standard way
          out of a sheet, and the reason there is no cancel button. Nothing here
          is staged: every change is already applied to the workout. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={i18n.a11yClose} />

      {/* The rows are text fields, so the panel has to clear the keyboard.
          `box-none` keeps the dimmed area behind it tappable. */}
      <KeyboardAvoidingView
        style={styles.holder}
        pointerEvents="box-none"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View
          entering={SlideInDown.duration(240).easing(Easing.out(Easing.cubic))}
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.grabber} />

          <Text style={styles.name} numberOfLines={2}>{item.exerciseName}</Text>
          <Text style={styles.position}>
            {index + 1} / {total}
          </Text>

          <Row label={i18n.nWbSets}>
            <Stepper
              initial={item.sets}
              min={1}
              max={20}
              step={1}
              a11yLabel={i18n.nWbSets}
              onChange={(n) => onChange({ sets: n })}
            />
          </Row>

          <Row label={i18n.nWbReps}>
            <Stepper
              initial={item.reps}
              min={1}
              max={100}
              step={1}
              a11yLabel={i18n.nWbReps}
              onChange={(n) => onChange({ reps: n })}
            />
          </Row>

          {/*
            Stepped in the unit on screen and stored in kilograms, like every
            other weight in the app. 2.5 is the step because that is the smallest
            plate pair on a bar; in pounds it is 5, for the same reason.
          */}
          <Row label={`${i18n.nWbLoad} (${wl})`} hint={item.weight ? undefined : i18n.nWbBodyweight}>
            <Stepper
              initial={displayWeight(item.weight, unit)}
              min={0}
              max={unit === 'kg' ? 500 : 1100}
              step={unit === 'kg' ? 2.5 : 5}
              decimals={1}
              a11yLabel={i18n.nWbLoad}
              onChange={(n) => onChange({ weight: tidy(weightToKg(n, unit)) })}
            />
          </Row>

          <Row label={i18n.nWbRest} hint={restLabel(item.restSeconds ?? 90)}>
            <Stepper
              initial={item.restSeconds ?? 90}
              min={0}
              max={600}
              step={15}
              a11yLabel={i18n.nWbRest}
              onChange={(n) => onChange({ restSeconds: n })}
            />
          </Row>

          <Row label={i18n.nWbEffort} hint={i18n.nWbEffortHint}>
            <Stepper
              initial={item.rpe ?? 7}
              min={5}
              max={10}
              step={1}
              a11yLabel={i18n.nWbEffort}
              onChange={(n) => onChange({ rpe: n })}
            />
          </Row>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={i18n.nWbMoveUp}
              disabled={index === 0}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onMove(index - 1);
              }}
              style={({ pressed }) => [styles.action, index === 0 && styles.stepOff, pressed && styles.pressed]}>
              <Icon icon={ChevronUp} size={16} color={colors.foreground} />
              <Text style={styles.actionText}>{i18n.nWbMoveUp}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={i18n.nWbMoveDown}
              disabled={index >= total - 1}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onMove(index + 1);
              }}
              style={({ pressed }) => [
                styles.action,
                index >= total - 1 && styles.stepOff,
                pressed && styles.pressed,
              ]}>
              <Icon icon={ChevronDown} size={16} color={colors.foreground} />
              <Text style={styles.actionText}>{i18n.nWbMoveDown}</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onRemove();
            }}
            style={({ pressed }) => [styles.remove, pressed && styles.pressed]}>
            <Icon icon={Trash2} size={15} color={colors.destructive} />
            <Text style={styles.removeText}>{i18n.nWbRemove}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.done, pressed && styles.pressed]}>
            <Text style={styles.doneText}>{i18n.nWbDone}</Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  /*
    An overlay inside the screen, not a `Modal`.

    The builder is itself presented as a modal (`_layout` gives it
    `presentation: 'modal'`), and a `Modal` opened from inside one of those
    renders blank on this RN / react-native-screens combination — the same
    new-arch bug `_layout` already records against formSheet detents. It fails
    silently: the state flips, nothing appears, and the button looks dead.

    Nothing here needs a separate window anyway. It covers the screen it belongs
    to, and being in the same tree means the slide-in can be Reanimated's rather
    than the platform's.
  */
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Above the list it covers, on both platforms
    zIndex: 40,
    elevation: 40,
  },
  /* Pins the panel to the bottom of whatever space the keyboard leaves. */
  holder: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  name: { ...type.title2, color: colors.foreground },
  position: { ...type.caption, color: colors.mutedForeground, marginBottom: spacing.sm },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowLabel: { ...type.body, color: colors.foreground },
  rowHint: { ...type.caption, color: colors.mutedForeground },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  // 44pt of target on each button — the platform minimum, which the old 40pt
  // boxes crammed five-across did not reach
  stepBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepOff: { opacity: 0.3 },
  stepValue: {
    width: 62,
    height: 44,
    textAlign: 'center',
    color: colors.foreground,
    fontSize: 17,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },

  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
  },
  actionText: { ...type.footnote, color: colors.foreground },

  remove: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
  },
  removeText: { ...type.footnote, color: colors.destructive, fontWeight: '600' },

  done: {
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  doneText: { ...type.headline, color: colors.primaryForeground },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
