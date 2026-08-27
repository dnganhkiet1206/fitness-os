import { nav } from '@/lib/nav';
import * as Haptics from 'expo-haptics';
import { ChevronRight } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import {
  DAY_LONG_EN,
  DAY_LONG_VI,
  DAY_SHORT_EN,
  DAY_SHORT_VI,
  STATE_STYLE,
  WeekStrip,
  dayStateOf,
} from '@/components/ascnd/week-strip';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useWorkoutSessions } from '@/hooks/use-fitness-data';
import { useRoutineDays, useWorkoutTemplates } from '@/hooks/use-library';
import { localDateStr, routineIndex, weekDates } from '@/lib/local-date';

/**
 * Plan, at the top of the training tab.
 *
 * ── why it is a card and not a button ──
 *
 * Plan was a pill in a row of four for a while, and before that a bar at the
 * bottom of the page. Both were *links*: to find out whether today is a
 * training day, and which one, you had to go somewhere. That is a navigation
 * for a question with a one-line answer, asked every single day.
 *
 * So this answers it here — the week's shape in seven dots, and one line saying
 * what today is — and opens Plan for everything that does not fit on a line:
 * the sets, the ticks, the other weeks, the editing.
 *
 * This is deliberately *not* the day panel in miniature. The panel is where you
 * stand mid-workout with a weight box and a rep box per set; a summary of it is
 * a summary of the wrong thing. What belongs on a tab is the question the tab
 * gets asked on the way past.
 *
 * ── the strip is the same strip ──
 *
 * `week-strip.tsx`, the drawing Plan itself uses. Tapping a cell here opens
 * Plan *on that day*, which is why the day travels as a param: tapping Thursday
 * and landing on today would be the card lying about what it does.
 *
 * ── it never claims the week is empty ──
 *
 * A failed read of `routine_days` and a genuinely unplanned week are the same
 * shape from here — no rows — and they are not the same fact. The summary line
 * falls back to "chưa có kế hoạch" only when the read *succeeded*; while it is
 * loading or after it failed, the line is simply absent, and the dots draw the
 * rest state they draw for a day with nothing on it. Plan itself is one tap
 * away and says what happened.
 */
export function PlanCard() {
  const { data: days, isPending, isError } = useRoutineDays();
  const { data: templates } = useWorkoutTemplates();
  /* The same fourteen-day window the tab already asks for below, so the card
     costs no read of its own — see the sessions list further down the tab. */
  const { data: sessions } = useWorkoutSessions(14);
  const { lang } = useAppSettings();
  const i18n = useI18n();

  const vi = lang === 'vi';
  const longNames = vi ? DAY_LONG_VI : DAY_LONG_EN;
  const shortNames = vi ? DAY_SHORT_VI : DAY_SHORT_EN;

  const dates = weekDates();
  const todayStr = localDateStr();
  const today = routineIndex(new Date());
  const trained = new Set((sessions ?? []).map((s) => localDateStr(new Date(s.date_time))));

  const byDay = new Map((days ?? []).map((d) => [d.day_of_week, d]));
  const hasWork = Array.from({ length: 7 }, (_, i) => {
    const d = byDay.get(i);
    return !!d?.template_id && !d?.is_rest;
  });

  const open = (day: number) => {
    Haptics.selectionAsync();
    nav.push({ pathname: '/workouts/plan', params: { day: String(day) } });
  };

  const todayTpl = (() => {
    const d = byDay.get(today);
    return d?.template_id ? templates?.find((t) => t.id === d.template_id) ?? null : null;
  })();
  const todayState = dayStateOf(hasWork[today], todayStr, todayStr, trained);
  /* Loading and failed both mean "no answer", and neither is "you have not
     planned anything". Absent is the only honest line for both. */
  const summary =
    isPending || isError
      ? null
      : todayTpl && !byDay.get(today)?.is_rest
        ? todayTpl.name
        : byDay.get(today)
          ? i18n.nRoutineRestDay
          : i18n.nPlanNothingToday;

  return (
    <GlassCard style={styles.card}>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={`${i18n.nPlan}${summary ? `, ${summary}` : ''}`}
        style={styles.head}
        onPress={() => open(today)}>
        <View style={styles.headCopy}>
          <Text style={styles.title}>{i18n.nPlan}</Text>
          {summary ? (
            <View style={styles.summaryRow}>
              {/* The dot carries today's state in the same colour the strip
                  below uses for it, so the line and the week agree without the
                  line having to repeat the word. */}
              <View style={[styles.summaryDot, { backgroundColor: STATE_STYLE[todayState].tint }]} />
              <Text style={styles.summary} numberOfLines={1}>{summary}</Text>
            </View>
          ) : null}
        </View>
        <Icon icon={ChevronRight} size={18} color={colors.mutedForeground} />
      </PressScale>

      <WeekStrip
        dates={dates}
        hasWork={hasWork}
        /* Nothing is "open" on a card — the fill means "the day you are
           reading", and here you are not reading a day, you are picking one. */
        selected={null}
        todayStr={todayStr}
        trained={trained}
        longNames={longNames}
        shortNames={shortNames}
        onPick={open}
      />
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, borderRadius: radius.xl },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headCopy: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...type.headline, color: colors.foreground },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryDot: { width: 6, height: 6, borderRadius: 3 },
  summary: { ...type.footnote, color: colors.mutedForeground, flexShrink: 1 },
});
