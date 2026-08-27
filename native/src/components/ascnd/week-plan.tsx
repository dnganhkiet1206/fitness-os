import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { CheckCircle2, ChevronLeft, ChevronRight, Dumbbell, Moon, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { PressScale } from '@/components/ascnd/press-scale';
import { MusicLaunch } from '@/components/ascnd/music-launch';
import { Icon } from '@/components/ascnd/icon';
import { DayPlan } from '@/components/ascnd/day-plan';
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
import { useRoutineDays, useUpsertRoutineDay, useWorkoutTemplates } from '@/hooks/use-library';
import { getLocale } from '@/lib/i18n';
import { localDateStr, routineIndex, weekDates } from '@/lib/local-date';

/**
 * Plan — the training week, in full.
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
 * ── the states ──
 *
 * Done, to do, not trained, rest. "Not trained" is deliberately flat — a past
 * training day with no session is a fact and the app does not get to have an
 * opinion about it, so no red and no warning glyph, the same muted grey as
 * everything else that is simply over. The rule itself lives in `week-strip`,
 * with the drawing that both this page and the training tab's card share.
 *
 * ── nothing was taken away ──
 *
 * Assigning a workout, marking a day as rest and toggling deload are all still
 * here, in the sheet behind the pencil. Seven `Switch`es down the screen were
 * seven controls to read past, and deload is a thing you set once a month; on
 * the day it is now a badge, which is what a rarely-changed state looks like.
 *
 * ── where it lives ──
 *
 * `/workouts/plan` — a page of its own, inside the training tab rather than on
 * the root stack. That distinction is the whole point and it is visible: a root
 * push covers the `UITabBarController` entirely, so Plan would leave the tab
 * bar behind and stop being *in* the tab in any sense a person can see. Nested,
 * the bar stays, Tập luyện stays lit, and back returns to the tab's own page.
 *
 * It has no `<Screen>` of its own for the same reason it is not a section: the
 * page that mounts it is the scaffold, and two nested would give the route two
 * scroll views and two safe areas.
 */

/**
 * How far the arrows go, and why there is a wall at all.
 *
 * `routine_days` is `UNIQUE(user_id, day_of_week)` — seven rows, no date
 * column. The plan is a *repeating weekly pattern*, so stepping back a week
 * does not show you the plan you were following then; it shows today's plan
 * laid over that week's dates, with the real sessions underneath it. That is
 * useful for a week or a month — it is how you see what you actually did
 * against what you intend to do — and it gets steadily less true the further
 * back it goes, because the further back you go the more likely it is the plan
 * has changed since.
 *
 * Four weeks each way is the range where the reading is worth having. It is
 * also what bounds the query: the sessions window below is widened to reach the
 * oldest visible date, and an unbounded arrow would be an unbounded fetch.
 */
const WEEKS_BACK = 4;
const WEEKS_FORWARD = 4;

export function WeekPlan({ initialDay }: { initialDay?: number | null }) {
  const { data: days } = useRoutineDays();
  const { data: templates, isError: templatesFailed } = useWorkoutTemplates();
  const { lang } = useAppSettings();
  const i18n = useI18n();
  const upsert = useUpsertRoutineDay();
  const [picking, setPicking] = useState<number | null>(null);
  /*
    The day the page was opened on.

    `initialDay` is what the training tab's card passes when you tap a cell on
    it — tapping Thursday there and landing on today would be the card lying
    about what it does. With nothing passed it opens on today, which is the day
    you came here for on six days out of seven. `routineIndex` rather than a
    stored preference: the right default changes every midnight, and a
    remembered one would be wrong by morning.
  */
  const [selected, setSelected] = useState(() => initialDay ?? routineIndex(new Date()));
  /** 0 is the week you are in. Negative is behind you. */
  const [weekOffset, setWeekOffset] = useState(0);

  const anchor = new Date();
  anchor.setDate(anchor.getDate() + weekOffset * 7);
  const dates = weekDates(anchor);

  /*
    The window follows the arrows.

    Fourteen days covers the current week from any day inside it — Sunday is six
    days from Monday — with a week of slack, and it is the window every other
    screen already asks for, so at rest this reuses a cache that is usually
    warm. Step back and it has to reach further or the week you are looking at
    comes back with no sessions in it at all, which the strip would draw as
    seven "not trained" dots: a claim about your training built out of a query
    bound that did not move.

    `7 * (1 - weekOffset)` is the distance to the Monday of the oldest visible
    week from *today*, worst case (today is Sunday), rounded up to whole weeks.
  */
  const { data: sessions } = useWorkoutSessions(Math.max(14, 7 * (1 - weekOffset)));

  const vi = lang === 'vi';
  const longNames = vi ? DAY_LONG_VI : DAY_LONG_EN;
  const shortNames = vi ? DAY_SHORT_VI : DAY_SHORT_EN;

  const todayStr = localDateStr();
  const trained = new Set((sessions ?? []).map((s) => localDateStr(new Date(s.date_time))));

  const locale = getLocale(lang);
  /* The week you are in says so; every other week is named by its dates,
     because "3 weeks ago" is arithmetic the reader has to do to find out
     whether it is the week they mean. */
  const rangeLabel =
    weekOffset === 0
      ? i18n.nThisWeek
      : `${dates[0].toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${dates[6].toLocaleDateString(
          locale,
          { day: 'numeric', month: 'short' },
        )}`;

  const byDay = new Map((days ?? []).map((d) => [d.day_of_week, d]));
  const templateFor = (id: string | null | undefined) =>
    id ? templates?.find((t) => t.id === id) ?? null : null;
  const hasWork = Array.from({ length: 7 }, (_, i) => {
    const d = byDay.get(i);
    return !!d?.template_id && !d?.is_rest;
  });

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

  const step = (by: number) => {
    Haptics.selectionAsync();
    setWeekOffset((o) => Math.max(-WEEKS_BACK, Math.min(WEEKS_FORWARD, o + by)));
  };

  const dStr = localDateStr(dates[selected]);
  const openDay = byDay.get(selected);
  const openTpl = templateFor(openDay?.template_id);
  const state = dayStateOf(!!openTpl && !openDay?.is_rest, dStr, todayStr, trained);
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
    <>
      {/*
        Which week, and the way through them.

        The same shape the weekly review already uses for the same job — two
        32pt buttons around a centred label — so somebody who has moved through
        weeks on one screen already knows how on this one.
      */}
      <View style={styles.weekNav}>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={i18n.a11yPrevWeek}
          hitSlop={8}
          disabled={weekOffset <= -WEEKS_BACK}
          style={[styles.navBtn, weekOffset <= -WEEKS_BACK && styles.navBtnOff]}
          onPress={() => step(-1)}>
          <Icon icon={ChevronLeft} size={16} color={colors.mutedForeground} />
        </PressScale>
        <Text style={styles.weekLabel}>{rangeLabel}</Text>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={i18n.a11yNextWeek}
          hitSlop={8}
          disabled={weekOffset >= WEEKS_FORWARD}
          style={[styles.navBtn, weekOffset >= WEEKS_FORWARD && styles.navBtnOff]}
          onPress={() => step(1)}>
          <Icon icon={ChevronRight} size={16} color={colors.mutedForeground} />
        </PressScale>
      </View>

      <WeekStrip
        dates={dates}
        hasWork={hasWork}
        selected={selected}
        todayStr={todayStr}
        trained={trained}
        longNames={longNames}
        shortNames={shortNames}
        onPick={setSelected}
      />

      <View style={styles.dayHead}>
        <Text style={styles.dayName}>{longNames[selected]}</Text>
        {openDay?.is_deload ? (
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
      {!openDay?.is_rest && openDay?.template_id ? <MusicLaunch /> : null}

      {/*
        Keyed by the date, not by the weekday.

        The panel keeps live state — which sets are ticked, what rest each one
        is on — and reads a stored resume point for the day it is showing.
        Without a key, moving from Monday to Tuesday would reuse the mounted
        instance and its ticks, and the storage read would land a moment later
        on top of a panel that had already shown somebody else's workout as
        half done.

        It was the weekday index, which was enough while there was one week. It
        is not now: this Monday and last Monday are both `0`, so stepping back a
        week would have kept the mounted panel and shown one Monday's ticks
        against the other Monday's date. The date string is unique across every
        week the arrows can reach.
      */}
      <DayPlan
        key={dStr}
        dateStr={dStr}
        template={openTpl}
        isRest={!!openDay?.is_rest}
        sessions={(sessions ?? []).filter((sn) => localDateStr(new Date(sn.date_time)) === dStr)}
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
              {/*
                Build one, from here.

                This sheet used to offer the workouts you had already saved and
                nothing else, so an empty account met "Chưa lưu buổi tập nào —
                tạo một cái trước đã": a dead end that names the thing to do and
                gives you no way to do it. The builder is one row up now, and it
                carries the day with it — `assignDay` — so saving lands the
                workout on the day you were looking at instead of dropping you
                back here to pick it a second time.
              */}
              <Pressable
                style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerRowPressed]}
                onPress={() => {
                  const day = picking;
                  if (day === null) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPicking(null);
                  router.push({ pathname: '/workout-builder', params: { assignDay: String(day) } });
                }}>
                <View style={styles.pickerRowInner}>
                  <Icon icon={Plus} size={16} color={colors.primary} strokeWidth={2.5} />
                  <Text style={styles.pickerNew}>{i18n.nPlanNewWorkout}</Text>
                </View>
              </Pressable>

              <View style={styles.pickerSep} />

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
                A failed read is not "you have no workouts".

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
    </>
  );
}

const styles = StyleSheet.create({
  // ── which week ──
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  /* Still drawn, still 32pt, just faded — a button that disappears at the end
     of the range takes the label with it as the row re-centres. */
  navBtnOff: { opacity: 0.3 },
  weekLabel: { ...type.footnote, fontWeight: '600', color: colors.foreground, minWidth: 130, textAlign: 'center' },

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
  /* Making a workout and choosing one are two different acts, so a line
     between them rather than a fourth row that looks like the other three. */
  pickerSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
    marginVertical: 2,
  },
  pickerNew: { ...type.body, color: colors.primary, fontWeight: '600' },
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
