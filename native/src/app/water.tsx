import * as Haptics from 'expo-haptics';
import { ChevronDown, Droplets, Minus, PencilLine, Plus } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { ProgressBar } from '@/components/ascnd/progress-bar';
import { WaterChart } from '@/components/ascnd/water-chart';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { duration } from '@/constants/motion';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useVolumeUnit } from '@/hooks/use-volume-unit';
import { useProfile } from '@/hooks/useTodayData';
import { useAddWater, useRemoveLastWater, useTodayWater, useTodayWaterLogs, useWaterWeek } from '@/hooks/use-water';
import { displayVolume, volumeLabel, volumeToMl } from '@/lib/units';
import { toast } from '@/lib/toast';

// Quick-add amounts in the display unit (converted to ml on tap)
const QUICK_ML = [250, 500, 750];
const QUICK_OZ = [8, 12, 16];

/**
 * The most anyone drinks in one sitting, in the display unit.
 *
 * Not a safety rail — it is a typo rail. The three presets are all three digits
 * in millilitres, so a slipped keystroke reads as a plausible number rather than
 * as nonsense: 2500 instead of 250 is a day's target logged as one glass, and
 * nothing downstream would flag it. Two litres in one go is already generous for
 * a genuine entry, so anything past it is worth a second look before it lands.
 */
const MAX_ONE_GO = { ml: 2000, oz: 68 } as const;

export default function WaterScreen() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { unit: vUnit } = useVolumeUnit();
  const vl = volumeLabel(vUnit);
  const { data: profile } = useProfile();
  const { data: total } = useTodayWater();
  const { data: logs } = useTodayWaterLogs();
  const { data: week } = useWaterWeek();
  const addWater = useAddWater();
  const removeLast = useRemoveLastWater();

  /**
   * Manual entry.
   *
   * The three presets cover a glass, a bottle and a big bottle, and nothing
   * else: a 330ml can, a 600ml bottle, half a cup left in the glass. Rounding
   * those to the nearest preset is not logging water, it is guessing at it —
   * and the guess compounds across a day into a figure the ring reports as
   * fact. Anything that is not one of the three had no way in at all.
   *
   * The text is kept as a string rather than a number so a half-typed value is
   * representable. Parsing on every keystroke turns "" into `NaN` and "0.5"
   * into `0` on the way past the decimal point, and the field fights the person
   * using it.
   */
  const [manualOpen, setManualOpen] = useState(false);
  const [manualText, setManualText] = useState('');

  /**
   * The day's entries, open by default and foldable away.
   *
   * They were rows inside one card, which reads as a table — fine for three
   * entries and a wall by the time somebody has been drinking properly all day.
   * A card each gives every entry its own edge, and once they are cards the
   * list is long enough that being able to fold it stops being a nicety.
   *
   * Open by default because it is the bottom of the screen with nothing under
   * it to be pushed away, and it is the detail the screen exists to show.
   */
  const [logsOpen, setLogsOpen] = useState(true);

  // Same turning chevron as the diary's meal cards — one glyph rotating rather
  // than two glyphs swapped, so the header shows the fold happening.
  const turn = useSharedValue(1);
  useEffect(() => {
    turn.value = withTiming(logsOpen ? 1 : 0, { duration: duration.move, easing: Easing.out(Easing.cubic) });
  }, [logsOpen, turn]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }));

  const target = Number(profile?.water_target_ml) || 2500;
  const todayMl = total ?? 0;
  const pct = Math.min(100, (todayMl / target) * 100);

  const QUICK = vUnit === 'oz' ? QUICK_OZ : QUICK_ML;
  // ml → "1.80 L" (metric) or "61 oz" (imperial)
  const bigValue = vUnit === 'oz' ? `${displayVolume(todayMl, 'oz')} oz` : `${(todayMl / 1000).toFixed(2)}L`;
  const targetLabel = vUnit === 'oz' ? `${displayVolume(target, 'oz')} oz` : `${(target / 1000).toFixed(1)}L`;

  return (
    <Screen back title={i18n.nWaterTitle}>
      {/* Today ring/summary */}
      <GlassCard>
        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.bigValue}>{bigValue}</Text>
            <Text style={styles.cardHint}>{i18n.nOfTarget.replace('{x}', targetLabel)}</Text>
          </View>
          <Text style={styles.pct}>{Math.round(pct)}%</Text>
        </View>
        <ProgressBar pct={pct} color={colors.metricBlue} height={10} radius={5} style={styles.barTrack} />
        <Text style={styles.quickLabel}>{i18n.nQuickAdd}</Text>
        <View style={styles.quickRow}>
          {/* Undo last entry (web: minus button) */}
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={i18n.a11yRemove}
            style={[styles.undoBtn, (!logs || logs.length === 0) && styles.undoDisabled]}
            disabled={!logs || logs.length === 0 || removeLast.isPending}
            onPress={() =>
              /*
                ── the ring moves, then quietly moves back ──

                All three water writes are optimistic and none of them said a
                word when the server refused: `use-water` rolls the patch back
                and stops there, so the number ticked up, then dropped again on
                its own, with no explanation and nothing to retry. These are the
                two most-tapped write buttons in the app, and they were the only
                ones in it with no error path at all — every log-* sheet has
                toasted its failures for a long time.
              */
              removeLast.mutate({
                onError: (e: Error) => toast.error(e.message),
              })
            }>
            <Icon icon={Minus} size={16} color={colors.foreground} strokeWidth={2.5} />
          </PressScale>
          {QUICK.map((amount) => (
            <PressScale
              key={amount}
              /*
                The visible label is a bare number, so the accessible name was
                "8" — a screen reader says the amount and not the unit, nor what
                pressing it does. `tools/tap-targets.mjs` cannot catch this: the
                button *has* text, so it passes the icon-only rule. A name that
                exists but says nothing is its own failure.
              */
              accessibilityRole="button"
              accessibilityLabel={i18n.a11yAddWater
                .replace('{x}', String(amount))
                .replace('{unit}', vl)}
              style={styles.quickBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                addWater.mutate(volumeToMl(amount, vUnit), {
                  onError: (e: Error) => toast.error(e.message),
                });
              }}>
              <Icon icon={Plus} size={14} color={colors.foreground} strokeWidth={2.5} />
              <Text style={styles.quickText}>{amount}</Text>
            </PressScale>
          ))}
        </View>

        {/* Anything the three presets do not cover */}
        <PressScale
          accessibilityRole="button"
          style={styles.customBtn}
          onPress={() => {
            Haptics.selectionAsync();
            setManualText('');
            setManualOpen(true);
          }}>
          <Icon icon={PencilLine} size={15} color={colors.mutedForeground} />
          <Text style={styles.customText}>{i18n.nWaterCustom}</Text>
        </PressScale>
      </GlassCard>

      <ManualWaterSheet
        visible={manualOpen}
        value={manualText}
        onChange={setManualText}
        unitLabel={vl}
        max={vUnit === 'oz' ? MAX_ONE_GO.oz : MAX_ONE_GO.ml}
        i18n={i18n}
        busy={addWater.isPending}
        onClose={() => setManualOpen(false)}
        onSave={(amount) => {
          addWater.mutate(volumeToMl(amount, vUnit), {
            onError: (e: Error) => toast.error(e.message),
          });
          setManualOpen(false);
        }}
      />

      {/* 7-day chart */}
      <GlassCard>
        <WaterChart days={week ?? []} target={target} unit={vUnit} lang={lang} i18n={i18n} />
      </GlassCard>

      {/* Today's log entries — one card each, foldable */}
      {logs && logs.length > 0 && (
        <View style={styles.logSection}>
          {/*
            A bare section header rather than another card. The entries below it
            are cards now, and a card holding a row of cards is a box inside a
            box — the heading belongs to the group, not to a surface of its own.
          */}
          <PressScale
            accessibilityRole="button"
            onPress={() => {
              Haptics.selectionAsync();
              setLogsOpen((v) => !v);
            }}
            style={styles.logHead}>
            <Text style={styles.cardTitle}>{i18n.nTodayLogs}</Text>
            {/* The count stays visible folded, so the header still says how much
                is behind it rather than just that something is */}
            <Text style={styles.logCount}>
              {logs.length === 1
                ? i18n.nWaterEntriesOne
                : i18n.nWaterEntries.replace('{n}', String(logs.length))}
            </Text>
            <Animated.View style={chevron}>
              <Icon icon={ChevronDown} size={18} color={colors.mutedForeground} />
            </Animated.View>
          </PressScale>

          {/* One card in after another on the way open, all out together on the
              way closed — see `today-meals.tsx` for why the stagger is one-way */}
          {logsOpen
            ? logs.map((l, i) => (
                <GlassCard
                  key={l.id}
                  style={styles.logCard}
                  entering={FadeInDown.duration(220).delay(i * 40).easing(Easing.out(Easing.cubic))}
                  exiting={FadeOut.duration(110)}
                  layout={LinearTransition.duration(260)}>
                  <View style={styles.logIcon}>
                    <Icon icon={Droplets} size={16} />
                  </View>
                  <Text style={styles.logAmount}>
                    {displayVolume(Number(l.amount_ml), vUnit)} <Text style={styles.logUnit}>{vl}</Text>
                  </Text>
                  <Text style={styles.logTime}>
                    {new Date(l.logged_at).toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </GlassCard>
              ))
            : null}
        </View>
      )}
    </Screen>
  );
}

/**
 * Type an amount in.
 *
 * A numeric keypad and one field. No stepper: the amounts this exists for are
 * the ones the presets miss, which are arbitrary — 330, 180, 600 — and stepping
 * to an arbitrary number is worse than typing it.
 *
 * ── what counts as a number ──
 *
 * Commas and full stops both appear as the decimal separator depending on the
 * keyboard the device offers, so the comma is normalised before parsing rather
 * than rejected. Everything else that is not a digit or a separator is dropped
 * as it is typed, because `keyboardType` is a suggestion — a hardware keyboard,
 * a paste, or an Android IME can all put letters in a numeric field.
 *
 * ── the ceiling ──
 *
 * Over `max` the sheet says so and will not save. Silently clamping would log a
 * number the person did not enter, which is worse than the typo: they would
 * have no reason to look again.
 *
 * ── the keyboard ──
 *
 * `KeyboardAvoidingView` on iOS only. Android resizes the window itself, and
 * running both lifts the sheet twice.
 */
function ManualWaterSheet({
  visible,
  value,
  onChange,
  unitLabel,
  max,
  i18n,
  busy,
  onClose,
  onSave,
}: {
  visible: boolean;
  value: string;
  onChange: (v: string) => void;
  unitLabel: string;
  max: number;
  i18n: ReturnType<typeof useI18n>;
  busy: boolean;
  onClose: () => void;
  onSave: (amount: number) => void;
}) {
  const amount = Number(value.replace(',', '.'));
  const valid = Number.isFinite(amount) && amount > 0 && amount <= max;
  const tooMuch = Number.isFinite(amount) && amount > max;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.scrimFill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.scrim} onPress={onClose}>
          {/* the card swallows taps so pressing inside it does not dismiss */}
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{i18n.nWaterCustomTitle}</Text>

            {/*
              The field is a surface, and its width is set rather than left to
              the platform.

              An unstyled `TextInput` has no intrinsic width on native and takes
              the browser's default `size` on web — about twenty characters,
              which at 34pt is wider than the sheet containing it. It rendered
              as a white band across the whole screen with the number clipped off
              the right edge. Two lines of style, and neither platform gets to
              decide.
            */}
            <View style={styles.inputField}>
              <TextInput
                value={value}
                onChangeText={(t) => onChange(t.replace(/[^0-9.,]/g, ''))}
                keyboardType="decimal-pad"
                inputMode="decimal"
                autoFocus
                selectTextOnFocus
                placeholder="0"
                placeholderTextColor={colors.mutedForeground}
                style={styles.input}
                maxLength={6}
              />
              <Text style={styles.inputUnit}>{unitLabel}</Text>
            </View>

            {/* Reserved whether or not it is showing, so the sheet does not
                jump taller the moment the number goes out of range */}
            <Text style={[styles.sheetWarn, !tooMuch && styles.sheetWarnHidden]}>
              {i18n.nWaterTooMuch.replace('{x}', `${max} ${unitLabel}`)}
            </Text>

            <View style={styles.sheetActions}>
              <PressScale
                accessibilityRole="button"
                onPress={onClose}
                style={styles.sheetBtn}>
                <Text style={styles.sheetBtnText}>{i18n.cancel}</Text>
              </PressScale>
              <PressScale
                accessibilityRole="button"
                disabled={!valid || busy}
                onPress={() => onSave(amount)}
                style={[styles.sheetBtn, styles.sheetBtnPrimary, (!valid || busy) && styles.sheetBtnDisabled]}>
                <Text style={[styles.sheetBtnText, styles.sheetBtnTextPrimary]}>{i18n.save}</Text>
              </PressScale>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cardTitle: { ...type.headline, color: colors.foreground },
  cardHint: { ...type.footnote, color: colors.mutedForeground, marginTop: 2 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  bigValue: { ...type.largeTitle, ...type.mono, color: colors.foreground },
  pct: { ...type.title, color: colors.metricBlue, fontVariant: ['tabular-nums'] },
  barTrack: { height: 10, borderRadius: 5, backgroundColor: colors.background, overflow: 'hidden', marginTop: spacing.md },
  quickLabel: { ...type.caption, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600', marginTop: spacing.md },
  quickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  quickBtn: { flex: 1, height: 46, borderRadius: radius.md, backgroundColor: colors.secondary, flexDirection: 'row', gap: 2, alignItems: 'center', justifyContent: 'center' },
  undoBtn: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoDisabled: { opacity: 0.35 },
  quickText: { ...type.headline, color: colors.foreground },
  logSection: { gap: spacing.sm },
  logHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  logCount: { ...type.footnote, color: colors.mutedForeground, flex: 1, textAlign: 'right' },
  logCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, paddingVertical: spacing.sm + 4 },
  logIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(14,165,233,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logAmount: { ...type.body, color: colors.foreground, fontWeight: '600', fontVariant: ['tabular-nums'], flex: 1 },
  logUnit: { ...type.footnote, fontWeight: '400', color: colors.mutedForeground },
  logTime: { ...type.footnote, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },

  // ── manual entry ──
  customBtn: {
    marginTop: spacing.sm,
    height: 42,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
  },
  customText: { ...type.footnote, fontWeight: '600', color: colors.mutedForeground },
  scrimFill: { flex: 1 },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: '#1b1b1f',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
  },
  sheetTitle: { ...type.headline, color: colors.foreground, textAlign: 'center' },
  inputField: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  input: {
    width: 132,
    textAlign: 'right',
    fontSize: 34,
    fontWeight: '700',
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
    padding: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  inputUnit: { ...type.body, color: colors.mutedForeground },
  sheetWarn: { ...type.caption, color: colors.readinessRed, textAlign: 'center' },
  sheetWarnHidden: { opacity: 0 },
  sheetActions: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch', marginTop: spacing.xs },
  sheetBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  sheetBtnPrimary: { backgroundColor: colors.metricBlue },
  sheetBtnDisabled: { opacity: 0.4 },
  sheetBtnText: { ...type.footnote, fontWeight: '600', color: colors.foreground },
  sheetBtnTextPrimary: { color: '#04121f' },
});
