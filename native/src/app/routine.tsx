import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { CheckCircle2, ChevronRight, CircleDashed, Dumbbell, Moon, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { volume, type TplExercise } from '@/components/ascnd/template-list';
import { colors, glass, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useWorkoutSessions } from '@/hooks/use-fitness-data';
import { useUnits } from '@/hooks/use-units';
import { useRoutineDays, useUpsertRoutineDay, useWorkoutTemplates } from '@/hooks/use-library';
import { rise } from '@/lib/entrance';
import { localDateStr, weekDates } from '@/lib/local-date';
import { effortRange, estimatedMinutes } from '@/lib/prescription';
import { displayWeight, weightLabel } from '@/lib/units';

/**
 * The training week.
 *
 * ── what it used to be, and why that was not enough ──
 *
 * Seven cards, each carrying a weekday, a dropdown reading either "Rest" or a
 * template's name, and a Deload switch. It was a *form for editing the routine*
 * and it worked as one. It was not a picture of your week.
 *
 * What it could not answer is everything you actually open this screen for. Is
 * today a training day. Have I done it. What is Wednesday going to cost me —
 * six exercises or nine, forty minutes or seventy, is it the heavy one. The
 * name of a template is not an answer to any of those; it is a label you have
 * to already know the meaning of.
 *
 * Every one of those answers was already in the database and none of them was
 * on this screen. The exercises are stored on the template, the sessions are
 * stored with their dates, and the arithmetic — volume, duration, effort — was
 * already written for the builder.
 *
 * ── so: dates, and a state per day ──
 *
 * The week runs across the top with real dates on it, so "Thứ 4" is a day you
 * can locate rather than a row in a list, and today is marked. Each day then
 * says what it is (`Push`, `Rest`), what it costs, and where it stands: done,
 * waiting, not trained, resting.
 *
 * "Not trained" is deliberately flat. A past training day with no session is a
 * fact and the app does not get to have an opinion about it — no red, no
 * warning glyph, the same muted grey as everything else that is simply over.
 *
 * ── nothing was taken away ──
 *
 * Assigning a template, marking a day as rest and toggling deload are all still
 * here; they moved into the sheet that opens when you tap a day. That is a
 * straight win rather than a compromise: seven `Switch`es down the screen were
 * seven controls to read past on a screen whose job is to be read, and deload
 * is a thing you set once a month. On the card it is now a badge, which is what
 * a state you rarely change should look like.
 */

const DAY_LONG_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_LONG_VI = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const DAY_SHORT_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_SHORT_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/**
 * Where a day stands.
 *
 * Four states and no fifth. A rest day is not "done" when it passes — there was
 * nothing to do — so it keeps saying rest, today and afterwards.
 */
type DayState = 'rest' | 'done' | 'todo' | 'missed';

const STATE_STYLE: Record<DayState, { icon: typeof CheckCircle2; tint: string; wash: string }> = {
  done: { icon: CheckCircle2, tint: colors.readinessGreen, wash: 'rgba(63,185,80,0.14)' },
  todo: { icon: CircleDashed, tint: colors.readinessYellow, wash: 'rgba(230,185,61,0.14)' },
  missed: { icon: CircleDashed, tint: colors.mutedForeground, wash: 'rgba(255,255,255,0.06)' },
  rest: { icon: Moon, tint: colors.mutedForeground, wash: 'rgba(255,255,255,0.06)' },
};

export default function RoutineScreen() {
  const { data: days } = useRoutineDays();
  const { data: templates } = useWorkoutTemplates();
  /*
    Fourteen days back covers the current week from any day inside it — Sunday
    is six days from Monday — with a week of slack, and it is the window every
    other screen already asks for, so this reuses a cache that is usually warm
    rather than opening a second query for the same table.
  */
  const { data: sessions } = useWorkoutSessions(14);
  const { lang } = useAppSettings();
  const { weight: wUnit } = useUnits();
  const i18n = useI18n();
  const upsert = useUpsertRoutineDay();
  const [picking, setPicking] = useState<number | null>(null);

  const vi = lang === 'vi';
  const longNames = vi ? DAY_LONG_VI : DAY_LONG_EN;
  const shortNames = vi ? DAY_SHORT_VI : DAY_SHORT_EN;
  const wl = weightLabel(wUnit);

  const dates = weekDates();
  const todayStr = localDateStr();
  const trained = new Set((sessions ?? []).map((s) => localDateStr(new Date(s.date_time))));

  const byDay = new Map((days ?? []).map((d) => [d.day_of_week, d]));
  const templateFor = (id: string | null | undefined) =>
    id ? templates?.find((t) => t.id === id) ?? null : null;

  const assign = (dayOfWeek: number, templateId: string | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const d = byDay.get(dayOfWeek);
    upsert.mutate({
      day_of_week: dayOfWeek,
      template_id: templateId,
      is_rest: !templateId,
      // Marking a day as rest should not silently drop a deload that was set on
      // it; the day is still part of the week's plan either way.
      is_deload: d?.is_deload ?? false,
    });
    setPicking(null);
  };

  const toggleDeload = (dayOfWeek: number, isDeload: boolean) => {
    const d = byDay.get(dayOfWeek);
    upsert.mutate({
      day_of_week: dayOfWeek,
      is_deload: isDeload,
      template_id: d?.template_id ?? null,
      is_rest: d?.is_rest ?? true,
    });
  };

  return (
    <Screen back title={i18n.nRoutine}>
      {/*
        The week, with dates on it.

        Not a control. It carries today's marker and a dot on the days that have
        training, and tapping it does nothing — every day it names is a card a
        thumb's length below, so a tap target here would be a second way to
        reach something already on screen, and the first thing anyone would
        expect it to do (filter to one day) would hide the week this screen
        exists to show.
      */}
      <View style={styles.weekRow} accessibilityRole="header">
        {dates.map((d, idx) => {
          const day = byDay.get(idx);
          const isToday = localDateStr(d) === todayStr;
          const hasWork = !!day?.template_id && !day?.is_rest;
          return (
            <View key={idx} style={styles.weekCell}>
              <Text style={[styles.weekName, isToday && styles.weekNameToday]}>{shortNames[idx]}</Text>
              <View style={[styles.weekDate, isToday && styles.weekDateToday]}>
                <Text style={[styles.weekNum, isToday && styles.weekNumToday]}>{d.getDate()}</Text>
              </View>
              <View style={[styles.weekDot, hasWork && styles.weekDotOn]} />
            </View>
          );
        })}
      </View>

      {longNames.map((label, idx) => {
        const day = byDay.get(idx);
        const tpl = templateFor(day?.template_id);
        const isRest = day?.is_rest || !tpl;
        const date = dates[idx];
        const dateStr = localDateStr(date);
        const isToday = dateStr === todayStr;

        const state: DayState = isRest
          ? 'rest'
          : trained.has(dateStr)
            ? 'done'
            : dateStr < todayStr
              ? 'missed'
              : 'todo';
        const stateLabel =
          state === 'rest'
            ? i18n.nRoutineRestDay
            : state === 'done'
              ? i18n.nRoutineDone
              : state === 'missed'
                ? i18n.nRoutineMissed
                : i18n.nRoutineTodo;
        const look = STATE_STYLE[state];

        const exs: TplExercise[] = Array.isArray(tpl?.exercises) ? (tpl.exercises as TplExercise[]) : [];
        const effort = effortRange(exs);
        const meta = tpl
          ? [
              i18n.nRoutineExercises.replace('{n}', String(exs.length)),
              i18n.nRoutineMinutes.replace('{n}', String(estimatedMinutes(exs))),
              effort
                ? effort[0] === effort[1]
                  ? i18n.nRoutineEffort.replace('{x}', String(effort[0]))
                  : i18n.nRoutineEffortRange.replace('{a}', String(effort[0])).replace('{b}', String(effort[1]))
                : null,
            ]
              .filter(Boolean)
              .join('  ·  ')
          : i18n.nRoutineRestHint;

        return (
          <Animated.View key={idx} entering={rise(idx)}>
            <GlassCard style={[styles.dayCard, isToday && styles.dayCardToday]}>
              <View style={styles.dayHead}>
                <Text style={[styles.dayName, isToday && styles.dayNameToday]}>{label}</Text>
                {tpl?.type ? <Text style={styles.dayType}>· {tpl.type}</Text> : null}
                {day?.is_deload ? (
                  <View style={styles.deloadBadge}>
                    <Text style={styles.deloadText}>{i18n.nDeload}</Text>
                  </View>
                ) : null}
                <View style={styles.headSpacer} />
                <View style={[styles.statePill, { backgroundColor: look.wash }]}>
                  <Icon icon={look.icon} size={12} color={look.tint} />
                  <Text style={[styles.stateText, { color: look.tint }]}>{stateLabel}</Text>
                </View>
              </View>

              {/*
                The whole body is the button, not a chevron at the end of it.

                A row that opens something should be pressable everywhere it is
                readable — this is the mistake the template cards were rebuilt
                to fix, where a chevron sat at the end of a row that was not a
                control at all.
              */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${label} — ${tpl?.name ?? i18n.nRoutineRestDay}, ${stateLabel}`}
                onPress={() => {
                  Haptics.selectionAsync();
                  setPicking(idx);
                }}
                style={({ pressed }) => [styles.dayBody, pressed && styles.pressed]}>
                <View style={styles.dayIcon}>
                  <Icon icon={isRest ? Moon : Dumbbell} size={16} color={isRest ? colors.mutedForeground : colors.primary} />
                </View>
                <View style={styles.dayText}>
                  <Text style={[styles.dayTitle, isRest && styles.dayTitleRest]} numberOfLines={1}>
                    {tpl?.name ?? (day?.is_rest ? i18n.nRoutineRestDay : i18n.nRoutineNothing)}
                  </Text>
                  <Text style={styles.dayMeta} numberOfLines={1}>{meta}</Text>
                </View>
                {/* Volume only where there is any — a rest day showing "0 kg"
                    is a measurement of nothing, and reads as a failure. */}
                {tpl && volume(exs) > 0 ? (
                  <Text style={styles.dayVolume}>
                    {Math.round(displayWeight(volume(exs), wUnit)).toLocaleString()} {wl}
                  </Text>
                ) : null}
                <Icon icon={ChevronRight} size={15} color={colors.mutedForeground} />
              </Pressable>
            </GlassCard>
          </Animated.View>
        );
      })}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push('/workout-builder');
        }}
        style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}>
        <Icon icon={Plus} size={17} color="#fff" strokeWidth={2.5} />
        <Text style={styles.addText}>{i18n.nRoutineAdd}</Text>
      </Pressable>

      {/*
        One day, everything about it.

        The old sheet picked a template and nothing else; deload lived out on
        the card. Both belong to the same question — what is this day — so they
        are asked in the same place.
      */}
      <Modal
        visible={picking !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPicking(null)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setPicking(null)}>
          <Pressable style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>{picking !== null ? longNames[picking] : ''}</Text>

            <ScrollView style={styles.pickerScroll} keyboardShouldPersistTaps="handled">
              <Pressable
                style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerRowPressed]}
                onPress={() => picking !== null && assign(picking, null)}>
                <View style={styles.pickerRowInner}>
                  <Icon icon={Moon} size={16} color={colors.mutedForeground} />
                  <Text style={styles.pickerRest}>{i18n.nRoutineRestDay}</Text>
                </View>
                {picking !== null && !byDay.get(picking)?.template_id ? (
                  <Icon icon={CheckCircle2} size={16} color={colors.primary} />
                ) : null}
              </Pressable>

              {(templates ?? []).map((t) => (
                <Pressable
                  key={t.id}
                  style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerRowPressed]}
                  onPress={() => picking !== null && assign(picking, t.id)}>
                  <View style={styles.pickerRowInner}>
                    <Icon icon={Dumbbell} size={16} color={colors.primary} />
                    <Text style={styles.pickerName} numberOfLines={1}>{t.name}</Text>
                  </View>
                  {picking !== null && byDay.get(picking)?.template_id === t.id ? (
                    <Icon icon={CheckCircle2} size={16} color={colors.primary} />
                  ) : null}
                </Pressable>
              ))}

              {!templates || templates.length === 0 ? (
                <Text style={styles.pickerEmpty}>{i18n.nRoutineNoTemplates}</Text>
              ) : null}
            </ScrollView>

            {/* Deload applies to a day that has training on it; on a rest day
                there is nothing to lighten. */}
            {picking !== null && byDay.get(picking)?.template_id ? (
              <View style={styles.deloadRow}>
                <View style={styles.deloadCopy}>
                  <Text style={styles.deloadLabel}>{i18n.nDeload}</Text>
                </View>
                <Switch
                  value={byDay.get(picking)?.is_deload ?? false}
                  onValueChange={(v) => toggleDeload(picking, v)}
                  trackColor={{ true: colors.readinessYellow, false: colors.secondary }}
                />
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // ── the week strip ──
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  weekCell: { alignItems: 'center', gap: 6, flex: 1 },
  weekName: { ...type.caption, color: colors.mutedForeground },
  weekNameToday: { color: colors.primary, fontWeight: '600' },
  weekDate: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  weekDateToday: { backgroundColor: colors.primary },
  weekNum: { ...type.footnote, color: colors.foreground, fontVariant: ['tabular-nums'] },
  weekNumToday: { color: '#fff', fontWeight: '700' },
  /* Always drawn, transparent when the day is empty — a dot that appears and
     disappears would shift the row's height by three points as the week is
     edited. */
  weekDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  weekDotOn: { backgroundColor: colors.primary },

  // ── one day ──
  dayCard: { padding: spacing.md, gap: spacing.sm },
  /* Today is the one card you are looking for when you open this screen, so it
     gets a border rather than a fill — enough to find at a glance, not enough
     to make the other six look switched off. */
  dayCardToday: { borderColor: colors.primary },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayName: { ...type.footnote, color: colors.foreground, fontWeight: '600' },
  dayNameToday: { color: colors.primary },
  dayType: { ...type.footnote, color: colors.mutedForeground, textTransform: 'capitalize', flexShrink: 1 },
  headSpacer: { flex: 1 },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  stateText: { ...type.caption, fontWeight: '600' },
  deloadBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: 'rgba(230,185,61,0.18)',
  },
  deloadText: { ...type.caption, color: colors.readinessYellow, fontWeight: '600' },

  dayBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  dayIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
  },
  dayText: { flex: 1, minWidth: 0, gap: 2 },
  dayTitle: { ...type.body, color: colors.foreground, fontWeight: '500' },
  dayTitleRest: { color: colors.mutedForeground, fontWeight: '400' },
  dayMeta: { ...type.footnote, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  dayVolume: { ...type.footnote, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
  },
  addText: { ...type.body, color: '#fff', fontWeight: '600' },

  // ── the day sheet ──
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  pickerSheet: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  pickerTitle: {
    ...type.caption,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
  },
  /* Bounded, because the list is as long as the number of workouts you have
     saved — at a dozen it would otherwise push the deload row off the bottom of
     the screen, and the sheet has no way to scroll to it. */
  pickerScroll: { maxHeight: 320 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  pickerRowPressed: { backgroundColor: colors.secondary },
  pickerRowInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 },
  pickerRest: { ...type.body, color: colors.mutedForeground },
  pickerName: { ...type.body, color: colors.foreground, flexShrink: 1 },
  pickerEmpty: { ...type.footnote, color: colors.mutedForeground, textAlign: 'center', padding: spacing.md },
  deloadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  deloadCopy: { flex: 1 },
  deloadLabel: { ...type.body, color: colors.foreground },
});
