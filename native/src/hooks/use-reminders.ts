import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { useI18n } from '@/hooks/use-app-settings';
import { useRoutineDays } from '@/hooks/use-library';
import { useSupplementChecklist } from '@/hooks/use-library';
import { useTodayWater } from '@/hooks/use-water';
import { useTodayWeight, useWorkoutSessions } from '@/hooks/use-fitness-data';
import { useProfile } from '@/hooks/useTodayData';
import { localDateStr } from '@/lib/local-date';
import {
  DEFAULT_REMINDERS,
  hasNotificationPermission,
  notificationsAvailable,
  requestNotificationPermission,
  scheduleReminderPlan,
  type ReminderCopy,
  type ReminderPrefs,
} from '@/lib/notifications';
import { planReminders, planSignature, type ReminderContext } from '@/lib/reminder-plan';

const PREFS_KEY = 'ascnd_reminders';
/** the signature of the plan last written to the OS — see the effect below */
const PLAN_KEY = 'ascnd_reminder_plan';

function merge(stored: Partial<ReminderPrefs> | null): ReminderPrefs {
  if (!stored) return DEFAULT_REMINDERS;
  return {
    water: { ...DEFAULT_REMINDERS.water, ...stored.water },
    supplements: { ...DEFAULT_REMINDERS.supplements, ...stored.supplements },
    bedtime: { ...DEFAULT_REMINDERS.bedtime, ...stored.bedtime },
    weighIn: { ...DEFAULT_REMINDERS.weighIn, ...stored.weighIn },
    workout: { ...DEFAULT_REMINDERS.workout, ...stored.workout },
  };
}

/**
 * Reminder preferences + OS scheduling. Persists to AsyncStorage and
 * re-schedules local notifications whenever prefs change.
 */
export function useReminders() {
  const i18n = useI18n();
  const [prefs, setPrefs] = useState<ReminderPrefs>(DEFAULT_REMINDERS);
  const [permission, setPermission] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const copy: ReminderCopy = {
    water: { title: i18n.nReminderWater, body: i18n.nReminderWaterBody },
    supplements: { title: i18n.nReminderSupplements, body: i18n.nReminderSupplementsBody },
    bedtime: { title: i18n.nReminderBedtime, body: i18n.nReminderBedtimeBody },
    weighIn: { title: i18n.nReminderWeighIn, body: i18n.nReminderWeighInBody },
    workout: { title: i18n.nReminderWorkout, body: i18n.nReminderWorkoutBody },
  };

  /*
    What today already knows, so a reminder about something already done is
    never laid down. Each of these is a query some other screen has already
    made, so it is read from the cache rather than fetched again.
  */
  const { data: routineDays } = useRoutineDays();
  const { data: sessions } = useWorkoutSessions(2);
  const { data: todayWeight } = useTodayWeight();
  const { data: supplements } = useSupplementChecklist();
  const { data: waterMl } = useTodayWater();
  const { data: profile } = useProfile();

  const ctx: ReminderContext = {
    workedOutToday: (sessions ?? []).some(
      (s) => localDateStr(new Date(s.date_time)) === localDateStr(),
    ),
    weighedToday: !!todayWeight,
    // An empty stack is "nothing to take", not "you forgot" — `every` on an
    // empty list is true, which is the reading wanted here.
    supplementsDone: (supplements ?? []).every((s) => s.taken),
    waterDone: (waterMl ?? 0) >= (Number(profile?.water_target_ml) || 2500),
    // `undefined` while the read is in flight means "not known", which the
    // planner treats as no information rather than as a week of rest days.
    trainingDays: routineDays
      ? routineDays.filter((d) => d.template_id && !d.is_rest).map((d) => d.day_of_week)
      : null,
  };

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PREFS_KEY);
        setPrefs(merge(raw ? JSON.parse(raw) : null));
      } catch {
        setPrefs(DEFAULT_REMINDERS);
      }
      setPermission(await hasNotificationPermission());
      setLoaded(true);
    })();
  }, []);

  /** Persist + reschedule; requests permission the first time anything turns on. */
  const apply = useCallback(
    async (next: ReminderPrefs) => {
      setPrefs(next);
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});

      const anyOn = Object.values(next).some((r) => r.enabled);
      let granted = permission;
      if (anyOn && !granted) {
        granted = await requestNotificationPermission();
        setPermission(granted);
      }
      if (granted) {
        const plan = planReminders(next, ctx);
        await AsyncStorage.setItem(PLAN_KEY, planSignature(plan)).catch(() => {});
        await scheduleReminderPlan(plan, copy);
      }
    },
    [permission, copy, ctx],
  );

  /*
    Keep the schedule true as the day is lived.

    Reminders are dated one-shots, so "already done" only stays respected if the
    plan is rebuilt when the facts change — you log the workout at seven and the
    five-o'clock nudge has to stop existing. Rescheduling means cancelling every
    pending notification and laying them all down again, so it is gated on the
    plan actually differing from the one last written, compared by signature.
  */
  useEffect(() => {
    if (!loaded || !permission) return;
    const plan = planReminders(prefs, ctx);
    const signature = planSignature(plan);
    (async () => {
      const last = await AsyncStorage.getItem(PLAN_KEY).catch(() => null);
      if (last === signature) return;
      await AsyncStorage.setItem(PLAN_KEY, signature).catch(() => {});
      await scheduleReminderPlan(plan, copy);
    })();
    // `copy` is rebuilt every render from `i18n`; including it would reschedule
    // on every render. The signature guard above is what makes that safe to
    // leave out — a language change alters no time, so no plan changes with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, permission, prefs, planSignature(planReminders(prefs, ctx))]);

  const toggle = useCallback(
    (key: keyof ReminderPrefs, enabled: boolean) => {
      apply({ ...prefs, [key]: { ...prefs[key], enabled } });
    },
    [prefs, apply],
  );

  const setTime = useCallback(
    (key: 'supplements' | 'bedtime' | 'weighIn' | 'workout', hour: number, minute: number) => {
      apply({ ...prefs, [key]: { ...prefs[key], hour, minute } });
    },
    [prefs, apply],
  );

  const setWaterInterval = useCallback(
    (everyHours: number) => {
      apply({ ...prefs, water: { ...prefs.water, everyHours } });
    },
    [prefs, apply],
  );

  return {
    prefs,
    loaded,
    permission,
    available: notificationsAvailable(),
    toggle,
    setTime,
    setWaterInterval,
  };
}

/**
 * Keep the reminder schedule true while the app is being used.
 *
 * `useReminders` rebuilds the plan whenever what it knows about today changes,
 * but it only does that while it is mounted — and it was mounted only on the
 * Reminders screen, which is the one screen nobody opens daily. So the schedule
 * was as fresh as the last time you went to look at it.
 *
 * Mounted on Today instead, where the app starts. It reads prefs, watches the
 * same six queries the rest of that screen already reads, and writes the OS
 * schedule when the plan differs from the one last written. It asks for nothing
 * and requests no permission — turning reminders on is still a decision made on
 * the Reminders screen.
 */
export function useReminderSync(): void {
  useReminders();
}
