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
export async function scheduleReminderPlan(
  plan: PlannedReminder[],
  copy: ReminderCopy,
): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    for (const item of plan) {
      const text = copy[item.key];
      await Notifications.scheduleNotificationAsync({
        content: { title: text.title, body: text.body },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: item.at,
        },
      });
    }
  } catch {
    // scheduling failures are non-fatal — the toggle simply won't fire
  }
}

export async function cancelAllReminders(): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // ignore
  }
}
