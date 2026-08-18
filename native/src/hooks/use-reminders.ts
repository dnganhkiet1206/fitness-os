import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

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
import { planReminders, planSignature, type PlannedReminder, type ReminderContext } from '@/lib/reminder-plan';
import { onUserScopedReset } from '@/lib/user-scoped-reset';

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

/*
  ── the switches are one person's answer, and there were two copies of it ──

  `prefs` was `useState` inside `useReminders`, and `useReminders` is mounted
  **twice**: `useReminderSync()` runs on Today, and the Reminders screen mounts
  its own on top of it — a pushed route leaves the tab underneath mounted. Each
  copy loaded the stored value once, at its own mount, and neither ever saw the
  other's edit. Both then wrote the one global OS schedule.

  Re-enacted against the real planner and a notification centre that records
  what it holds:

      1. Today mounted, all reminders off        → 0 pending
      2. Reminders screen: bedtime ON            → 7 pending
      3. a shared query updates, Today re-syncs  → 0 pending

  Step 3 is Today's instance rebuilding from the prefs it read at *its* mount,
  which still say bedtime is off. The switch is on, the stored preference is
  on, and the OS holds nothing. Nothing on any screen says so.

  So the answer lives in one place, the module-scope store this codebase uses
  for exactly this — and, like the others, it registers its reset with
  `user-scoped-reset` so the value does not outlive the account that gave it
  (Chain E: deleting the key never reached the `let`).
*/
let prefsState: ReminderPrefs = DEFAULT_REMINDERS;
let hydrated = false;
let settled = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function hydratePrefs(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    prefsState = merge(raw ? JSON.parse(raw) : null);
  } catch {
    prefsState = DEFAULT_REMINDERS;
  } finally {
    settled = true;
    emit();
  }
}

function subscribePrefs(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Back to the state a fresh launch has — the latch goes too, or the next
    account never reads its own switches either. */
onUserScopedReset(() => {
  prefsState = DEFAULT_REMINDERS;
  hydrated = false;
  settled = false;
  emit();
});

function writePrefs(next: ReminderPrefs): void {
  prefsState = next;
  emit();
  AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
}

/**
 * Lay the plan down, and only then claim it was laid down.
 *
 * ── the signature used to be written first ──
 *
 * Both call sites did `setItem(PLAN_KEY, signature)` and *then* asked the OS,
 * and the OS call swallowed every failure. So the record said "this plan is
 * pending" whatever happened, and the next sync compares against that record
 * and returns early. One refusal therefore meant no reminder was ever
 * rescheduled again — not until some *other* change altered the plan.
 *
 * Measured through the real function against a centre that refuses from the
 * twentieth request: 19 of 56 pending, and the signature claiming all 56.
 *
 * Writing it afterwards, and only on a complete result, turns that into a
 * retry: the next sync sees a signature that does not match, and tries again.
 * A partial write is left unrecorded on purpose — it is not the plan.
 */
async function commitPlan(plan: PlannedReminder[], copy: ReminderCopy): Promise<void> {
  const outcome = await scheduleReminderPlan(plan, copy);
  if (!outcome.supported) return;
  if (outcome.scheduled !== outcome.requested) return;
  await AsyncStorage.setItem(PLAN_KEY, planSignature(plan)).catch(() => {});
}

/**
 * Reminder preferences + OS scheduling. Persists to AsyncStorage and
 * re-schedules local notifications whenever prefs change.
 */
export function useReminders() {
  const i18n = useI18n();
  /* One store, however many instances of this hook are mounted. */
  const prefs = useSyncExternalStore(subscribePrefs, () => prefsState);
  const loaded = useSyncExternalStore(subscribePrefs, () => settled);
  const [permission, setPermission] = useState(false);

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
      await hydratePrefs();
      setPermission(await hasNotificationPermission());
    })();
  }, []);

  /** Persist + reschedule; requests permission the first time anything turns on. */
  const apply = useCallback(
    async (next: ReminderPrefs) => {
      writePrefs(next);

      const anyOn = Object.values(next).some((r) => r.enabled);
      let granted = permission;
      if (anyOn && !granted) {
        granted = await requestNotificationPermission();
        setPermission(granted);
      }
      if (granted) {
        const plan = planReminders(next, ctx);
        await commitPlan(plan, copy);
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
      await commitPlan(plan, copy);
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
