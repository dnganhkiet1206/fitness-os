import * as Haptics from 'expo-haptics';
import { CheckCircle2, CircleDashed, Dumbbell, Moon } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { MusicLaunch } from '@/components/ascnd/music-launch';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { DayPlan } from '@/components/ascnd/day-plan';
import { colors, glass, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useWorkoutSessions } from '@/hooks/use-fitness-data';
import { useRoutineDays, useUpsertRoutineDay, useWorkoutTemplates } from '@/hooks/use-library';
import { localDateStr, routineIndex, weekDates } from '@/lib/local-date';

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
 * ── the strip picks the day; the day is the page ──
 *
 * The dates across the top were decorative for one commit — today marked, a dot
 * where there was training, and nothing happened when you touched them. The
 * argument for that was that every day they named was already a card below, so
 * a tap would only be a second route to something on screen.
 *
 * That argument was wrong in a way worth writing down. Seven summary cards can
 * only ever be summaries: six exercises fit in a card, twenty-two *sets* do
 * not, and sets are what you are looking at when you are actually training. So
 * the seven cards could never become the thing you use mid-workout, and the
 * strip that could have got you to one day was doing nothing.
 *
 * Now it picks. One day is open at a time, in full — every set, with somewhere
 * to tick it off — and the strip carries the week: today ringed, the selected
 * day filled, and a dot under each day saying where it stands.
 *
 * Nothing is stacked on anything. The strip selects, the panel below shows, and
 * neither is a second way to do what the other does.
 *
 * ── the states ──
 *
 * Done, to do, not trained, rest. "Not trained" is deliberately flat — a past
 * training day with no session is a fact and the app does not get to have an
 * opinion about it, so no red and no warning glyph, the same muted grey as
 * everything else that is simply over.
 *
 * ── nothing was taken away ──
 *
 * Assigning a template, marking a day as rest and toggling deload are all still
 * here, in the sheet behind the pencil. Seven `Switch`es down the screen were
 * seven controls to read past, and deload is a thing you set once a month; on
 * the day it is now a badge, which is what a rarely-changed state looks like.
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
  /* Silver, not yellow. A training day that has not happened yet is not a
     warning about anything — it is Thursday. Yellow is what this app uses for
     "approaching a limit", and spending it here would leave nothing to say
     that with. */
  todo: { icon: CircleDashed, tint: colors.primary, wash: 'rgba(168,175,189,0.14)' },
  missed: { icon: CircleDashed, tint: colors.mutedForeground, wash: 'rgba(255,255,255,0.06)' },
  /*
    Rest is purple, and it is the only state here that is a *choice*.

    Done, to do and not-trained are all reports on a training day — they are
    the app telling you where you got to. A rest day is something you decided,
    and it earns a colour of its own for that: neon purple, the app's own, so a
    week reads as a shape at a glance. Grey said "nothing here", which is the
    one thing a planned rest day is not.
  */
  rest: { icon: Moon, tint: colors.metricPurple, wash: 'rgba(180,92,255,0.14)' },
};

export default function RoutineScreen() {
  const { data: days } = useRoutineDays();
  const { data: templates, isError: templatesFailed } = useWorkoutTemplates();
  /*
    Fourteen days back covers the current week from any day inside it — Sunday
    is six days from Monday — with a week of slack, and it is the window every
    other screen already asks for, so this reuses a cache that is usually warm
    rather than opening a second query for the same table.
  */
  const { data: sessions } = useWorkoutSessions(14);
  const { lang } = useAppSettings();
  const i18n = useI18n();
  const upsert = useUpsertRoutineDay();
  const [picking, setPicking] = useState<number | null>(null);
  /*
    Opens on today, which is the day you came here for on six days out of seven.
    `routineIndex` rather than a stored preference: the right default changes
    every midnight, and a remembered one would be wrong by morning.
  */
  const [selected, setSelected] = useState(() => routineIndex(new Date()));

  const vi = lang === 'vi';
  const longNames = vi ? DAY_LONG_VI : DAY_LONG_EN;
  const shortNames = vi ? DAY_SHORT_VI : DAY_SHORT_EN;

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
    /* Every set on this page carries a weight box and a rep box, and a
       twelve-set day runs them well past the fold — the one condition
       `screen.tsx` names for turning this on. */
    <Screen back keyboardAware title={i18n.nRoutine}>
      {/*
        The week, and the control that moves you through it.

        Each cell is a button: the weekday, the date, and a dot underneath in
        the colour of where that day stands. The dot is the whole week's status
        in seven pixels — green behind you, silver ahead, nothing on a rest day
        — which is what the seven cards used to spend a screen and a half
        saying.

        Today is ringed and the open day is filled. They are usually the same
        cell and they are different marks, because the one time it matters is
        the one time they are not: looking at Saturday's plan on a Tuesday, you
        need to see both which day you are reading and which day it is.
      */}
      <View style={styles.weekRow}>
        {dates.map((d, idx) => {
          const day = byDay.get(idx);
          const dStr = localDateStr(d);
          const isToday = dStr === todayStr;
          const isOpen = idx === selected;
          const hasWork = !!day?.template_id && !day?.is_rest;
          const state: DayState = !hasWork
            ? 'rest'
            : trained.has(dStr)
              ? 'done'
              : dStr < todayStr
                ? 'missed'
                : 'todo';
          return (
            <PressScale
              key={idx}
              accessibilityRole="tab"
              accessibilityState={{ selected: isOpen }}
              accessibilityLabel={`${longNames[idx]} ${d.getDate()}`}
              onPress={() => {
                Haptics.selectionAsync();
                setSelected(idx);
              }}
              style={styles.weekCell}>
              <Text style={[styles.weekName, isOpen && styles.weekNameOn]}>{shortNames[idx]}</Text>
              <View style={[styles.weekDate, isToday && styles.weekDateToday, isOpen && styles.weekDateOn]}>
                <Text style={[styles.weekNum, isOpen && styles.weekNumOn]}>{d.getDate()}</Text>
              </View>
              {/* The dot is the week's shape in seven marks: green behind
                  you, silver ahead, purple where you chose to rest. */}
              <View style={[styles.weekDot, { backgroundColor: STATE_STYLE[state].tint }]} />
            </PressScale>
          );
        })}
      </View>

      {(() => {
        const day = byDay.get(selected);
        const tpl = templateFor(day?.template_id);
        const dStr = localDateStr(dates[selected]);
        const state: DayState = !tpl || day?.is_rest
          ? 'rest'
          : trained.has(dStr)
            ? 'done'
            : dStr < todayStr
              ? 'missed'
              : 'todo';
        const look = STATE_STYLE[state];
        const stateLabel =
          state === 'rest'
            ? i18n.nRoutineRestDay
            : state === 'done'
              ? i18n.nRoutineDone
              : state === 'missed'
                ? i18n.nRoutineMissed
                : i18n.nRoutineTodo;
        return (
          <View style={styles.dayHead}>
            <Text style={styles.dayName}>{longNames[selected]}</Text>
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
        );
      })()}

      {/*
        The shortcut out to music, on the screen where somebody is actually
        training.

        `/log-workout` has one too, but that screen is where a session gets
        *recorded* — which for a lot of people is afterwards. This is the panel
        you tick sets off on while you are in the middle of it, so it is the
        screen where "put something on" is a live thought rather than a
        retrospective one.

        Only on a day that has work in it. A music row under a rest day is
        offering to soundtrack nothing.
      */}
      {!byDay.get(selected)?.is_rest && byDay.get(selected)?.template_id ? <MusicLaunch /> : null}

      {/*
        Keyed by the day.

        The panel keeps live state — which sets are ticked, what rest each one
        is on — and reads a stored resume point for the day it is showing.
        Without the key, moving from Monday to Tuesday would reuse the mounted
        instance and its ticks, and the storage read would land a moment later
        on top of a panel that had already shown somebody else's workout as
        half done.
      */}
      <DayPlan
        key={selected}
        dateStr={localDateStr(dates[selected])}
        template={templateFor(byDay.get(selected)?.template_id)}
        isRest={!!byDay.get(selected)?.is_rest}
        sessions={(sessions ?? []).filter((sn) => localDateStr(new Date(sn.date_time)) === localDateStr(dates[selected]))}
        i18n={i18n}
        onEdit={() => setPicking(selected)}
      />

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

              {/*
                A failed read is not "you have no templates".

                This is a picker inside a sheet, so the full failure card would
                not fit and would be the wrong shape anyway — one line of text
                is replacing one line of text. What matters is that the line
                stops making a claim about the account when the truth is that
                the list could not be read.
              */}
              {templatesFailed ? (
                <Text style={styles.pickerEmpty}>{i18n.nLoadFailed}</Text>
              ) : !templates || templates.length === 0 ? (
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
  weekCell: { alignItems: 'center', gap: 6, flex: 1, paddingVertical: 4 },
  weekName: { ...type.caption, color: colors.mutedForeground },
  weekNameOn: { color: colors.foreground, fontWeight: '700' },
  weekDate: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  /* Today is a ring, the open day is a fill. Usually the same cell, and two
     marks rather than one because the time it matters is the time they differ:
     reading Saturday's plan on a Tuesday, you need both. */
  weekDateToday: { borderColor: colors.primary },
  weekDateOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  weekNum: { ...type.footnote, color: colors.foreground, fontVariant: ['tabular-nums'] },
  weekNumOn: { color: colors.primaryForeground, fontWeight: '700' },
  /* Always drawn, transparent when the day is empty — a dot that appears and
     disappears would shift the row's height by three points as the week is
     edited. */
  weekDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'transparent' },

  // ── the open day ──
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  dayName: { ...type.headline, color: colors.foreground },
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
