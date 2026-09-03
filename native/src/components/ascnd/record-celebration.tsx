import { useEffect } from 'react';
import { nav } from '@/lib/nav';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { MascotFigure } from '@/components/ascnd/mascot-figure';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { duration } from '@/constants/motion';
import { useI18n } from '@/hooks/use-app-settings';
import { useMascotIdentity } from '@/hooks/use-mascot';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useUnits } from '@/hooks/use-units';
import type { PersonalRecord } from '@/lib/personal-record';
import { recordLine } from '@/lib/record-line';
import { displayWeight, weightLabel, type WeightUnit } from '@/lib/units';

/**
 * The moment a workout beat something.
 *
 * ── why the sheet stops instead of closing ──
 *
 * Saving a workout used to do three things in one frame: a haptic, a
 * `nav.back()`, and a toast reading "Đã lưu buổi tập". That is the right
 * amount of ceremony for the ordinary case and it is the wrong amount for the
 * rare one. A personal record is the largest thing that happens in a strength
 * app — it is the reason people keep a log at all — and it was landing in the
 * same grey bar as "saved".
 *
 * The character placement research is unanimous about where a companion earns
 * its keep: onboarding, empty states, errors, and **success moments**. Koa was
 * present for the first three and absent from the biggest instance of the
 * fourth. So the sheet holds for a beat, Koa comes up looking pleased, and the
 * numbers say what they beat. Then it closes by itself.
 *
 * ── and only when there is something to stop for ──
 *
 * Nothing here renders unless a record was actually set. An ordinary session
 * closes exactly as it did before, in one frame, with the toast. A celebration
 * that fires on every save is a two-second tax on logging, which is the fastest
 * way to teach somebody to stop logging — the same rationing the peek budget
 * exists for, applied to the one screen a budget cannot see.
 *
 * ── it closes itself, and it can be closed ──
 *
 * `HOLD_MS` is the auto-dismiss, because a celebration that waits for a tap is
 * a dialog. The whole surface is also pressable, because a celebration that
 * cannot be skipped is worse than one that can. Both routes call `onDone`
 * once — the screen navigates from there, so a double fire would pop twice.
 */

/** Long enough to read one line and see the face; short enough not to wait. */
export const RECORD_HOLD_MS = 2600;

/**
 * Three at most.
 *
 * A session that beats four movements is a real thing — the first week back
 * after a layoff does it routinely — and a list of nine is not a celebration,
 * it is a report. The count in the title stays honest either way.
 */
const MAX_LINES = 3;

export function RecordCelebration({
  records,
  onDone,
}: {
  records: PersonalRecord[];
  onDone: () => void;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  /* Identity only: the face here is pinned to `proud`. */
  const { mascot } = useMascotIdentity();
  const { weight: wUnit } = useUnits();
  const reduced = useReducedMotion();

  const enter = useSharedValue(0);
  const pop = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      /* Reduce Motion keeps the moment and drops the travel — the figure is
         simply there. Setting both to their end state is what makes the styles
         below constant rather than animated; nothing is skipped. */
      enter.value = 1;
      pop.value = 1;
    } else {
      enter.value = withTiming(1, { duration: duration.appear });
      pop.value = withDelay(90, withSpring(1, { stiffness: 200, damping: 13 }));
    }
    const t = setTimeout(onDone, RECORD_HOLD_MS);
    return () => clearTimeout(t);
    // `onDone` is stable for the life of this overlay; listing it would restart
    // the dismissal clock on every re-render of the screen behind it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const veil = useAnimatedStyle(() => ({ opacity: enter.value }));
  const figure = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: 0.86 + pop.value * 0.14 }],
  }));

  const shown = records.slice(0, MAX_LINES);
  const title =
    records.length > 1
      ? i18n.nPrTitleMany.replace('{n}', String(records.length))
      : i18n.nPrTitle;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.root, veil]}
      /* The form is still mounted underneath — deliberately, so the keyboard
         does not animate away over an empty page. A screen reader would
         otherwise walk straight past the celebration into twenty text fields
         belonging to a workout that has already been saved. */
      accessibilityViewIsModal
      importantForAccessibility="yes">
      {/* The whole surface, so the skip is wherever the thumb already is. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={i18n.nPrContinue}
        style={StyleSheet.absoluteFill}
        onPress={onDone}
      />
      <Animated.View style={[styles.stage, figure]} pointerEvents="none">
        <MascotFigure mascot={mascot} size={150} emotion="proud" animated={!reduced} />
      </Animated.View>

      {/* One region, read out as one sentence — a screen reader landing on a
          kicker, a title and three lines separately would hear five fragments
          and no moment. */}
      <View
        style={styles.card}
        pointerEvents="none"
        accessible
        accessibilityRole="summary"
        accessibilityLabel={`${title}. ${shown.map((r) => recordLine(r, i18n, wUnit)).join('. ')}`}>
        <Text style={styles.kicker}>{title}</Text>
        {shown.map((r, i) => (
          <Text key={`${r.exercise}-${i}`} style={styles.line} numberOfLines={2}>
            {recordLine(r, i18n, wUnit)}
          </Text>
        ))}
      </View>

      <Text style={styles.hint} pointerEvents="none">
        {i18n.nPrContinue}
      </Text>
    </Animated.View>
  );
}

const stylesFor = makeStyles((c) => ({
  /* Opaque, and the sheet's own colour. A translucent veil over a form of
     twenty text fields is a celebration you read through a keyboard. */
  root: {
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
    zIndex: 10,
  },
  stage: { alignItems: 'center', justifyContent: 'center' },
  card: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: c.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 2.5,
    color: c.primary,
    marginBottom: 2,
  },
  line: { ...type.headline, color: c.foreground, textAlign: 'center' },
  hint: { ...type.caption, color: c.mutedForeground, marginTop: spacing.sm },
}));
