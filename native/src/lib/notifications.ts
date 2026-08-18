/**
 * Local notification reminders (water / supplements / bedtime / weigh-in /
 * workout). All scheduling is device-local — no push server.
 *
 * What to schedule is decided by `@/lib/reminder-plan`, which is a pure module
 * so the rules can be run in a check; this file is the part that talks to the
 * OS. Reminders are dated one-shots rather than repeating alarms — see
 * `scheduleReminderPlan`.
 *
 * The native module only exists in a dev/production build. In Expo Go or on
 * web the guarded import degrades to no-ops instead of crashing.
 */
import { Platform } from 'react-native';

import type { PlannedReminder, ReminderPrefs } from '@/lib/reminder-plan';

type NotificationsModule = typeof import('expo-notifications');

let Notifications: NotificationsModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications') as NotificationsModule;
  // Show reminders even while the app is foregrounded
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {
  Notifications = null;
}

export type { ReminderKey, ReminderPrefs } from '@/lib/reminder-plan';

export const DEFAULT_REMINDERS: ReminderPrefs = {
  water: { enabled: false, everyHours: 2 },
  supplements: { enabled: false, hour: 9, minute: 0 },
  bedtime: { enabled: false, hour: 22, minute: 30 },
  weighIn: { enabled: false, hour: 7, minute: 0 },
  workout: { enabled: false, hour: 17, minute: 0 },
};

/** Copy for each reminder in the active language. */
export interface ReminderCopy {
  water: { title: string; body: string };
  supplements: { title: string; body: string };
  bedtime: { title: string; body: string };
  weighIn: { title: string; body: string };
  workout: { title: string; body: string };
}

export function notificationsAvailable(): boolean {
  return Notifications != null && Platform.OS === 'ios';
}

/** Ask for permission; returns whether it's granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!Notifications) return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const res = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
    return res.granted;
  } catch {
    return false;
  }
}

export async function hasNotificationPermission(): Promise<boolean> {
  if (!Notifications) return false;
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/**
 * Lay down exactly the reminders in a plan, and nothing else.
 *
 * ── one-shot dates, not repeating alarms ──
 *
 * A `DAILY` trigger fires forever without asking anything, which is what made
 * the workout reminder arrive on rest days and the weigh-in arrive the morning
 * after a weigh-in. iOS runs no code of ours at fire time, so the only way a
 * reminder can be conditional is for it not to be scheduled — which means dated
 * one-shots, rebuilt whenever the app learns something.
 *
 * `planReminders` decides which; this only schedules them. The split is what
 * lets the rules be run in `tools/reminders.mjs` against real dates.
 *
 * Cancelling everything first is unchanged and still correct: these are the
 * only notifications the app schedules, and a plan is a complete statement of
 * what should be pending.
 */
/**
 * One writer at a time.
 *
 * ── the duplication this exists for ──
 *
 * `scheduleReminderPlan` is *cancel everything, then add them back one at a
 * time*, with an `await` on every step. Two overlapping calls interleave as
 * cancel → cancel → add×n → add×n, and both sets survive. Measured through the
 * real function, five runs out of five:
 *
 *     plan 56 · pending 112   (56 duplicates)
 *
 * Two callers is not hypothetical: `useReminderSync()` runs on Today and the
 * Reminders screen mounts `useReminders()` of its own on top of it, so both are
 * live whenever that screen is open.
 *
 * The queue is here rather than in the hook because this module is the one that
 * owns the OS: a rule kept at the call sites is a rule the next call site does
 * not know about.
 */
let queue: Promise<unknown> = Promise.resolve();
function serialised<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  /* The chain must not stay rejected, or every later write is skipped. */
  queue = next.then(() => undefined, () => undefined);
  return next;
}

/** What actually reached the OS. `requested > scheduled` means the tail is not pending. */
export interface ScheduleOutcome {
  requested: number;
  scheduled: number;
  /** false when the native module is absent (Expo Go, web) — nothing was attempted */
  supported: boolean;
}

export async function scheduleReminderPlan(
  plan: PlannedReminder[],
  copy: ReminderCopy,
): Promise<ScheduleOutcome> {
  const api = Notifications;
  if (!api) return { requested: plan.length, scheduled: 0, supported: false };
  return serialised(async () => {
    let scheduled = 0;
    try {
      await api.cancelAllScheduledNotificationsAsync();
    } catch {
      /* Nothing was laid down, so nothing is claimed. */
      return { requested: plan.length, scheduled: 0, supported: true };
    }
    for (const item of plan) {
      const text = copy[item.key];
      try {
        await api.scheduleNotificationAsync({
          content: { title: text.title, body: text.body },
          trigger: {
            type: api.SchedulableTriggerInputTypes.DATE,
            date: item.at,
          },
        });
        scheduled += 1;
      } catch {
        /*
          ── one refusal used to end the whole plan ──

          The loop was inside a single `try` with an empty `catch`, so the first
          rejection — the OS at its pending cap, a date the platform will not
          take — abandoned every remaining reminder without a word. Measured
          with a centre that refuses from the twentieth request: 19 of 56
          pending, silently.

          Carrying on means the refusal costs one reminder instead of all of
          them, and the count going back is what lets the caller notice at all.
        */
      }
    }
    return { requested: plan.length, scheduled, supported: true };
  });
}

export async function cancelAllReminders(): Promise<void> {
  const api = Notifications;
  if (!api) return;
  await serialised(async () => {
    try {
      await api.cancelAllScheduledNotificationsAsync();
    } catch {
      // ignore
    }
  });
}
