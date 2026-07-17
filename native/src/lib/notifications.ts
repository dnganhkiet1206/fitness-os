/**
 * Local notification reminders (water / supplements / bedtime / weigh-in /
 * workout). All scheduling is device-local — no push server. Daily reminders
 * use a repeating DAILY calendar trigger; the water reminder fans out into a
 * few daily triggers across a waking window so it nudges through the day.
 *
 * The native module only exists in a dev/production build. In Expo Go or on
 * web the guarded import degrades to no-ops instead of crashing.
 */
import { Platform } from 'react-native';

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

export type ReminderKey = 'water' | 'supplements' | 'bedtime' | 'weighIn' | 'workout';

export interface ReminderPrefs {
  water: { enabled: boolean; everyHours: number };
  supplements: { enabled: boolean; hour: number; minute: number };
  bedtime: { enabled: boolean; hour: number; minute: number };
  weighIn: { enabled: boolean; hour: number; minute: number };
  workout: { enabled: boolean; hour: number; minute: number };
}

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

// Water reminders fire through the waking day, on the hour, every N hours
const WATER_START_HOUR = 8;
const WATER_END_HOUR = 20;

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

function dailyTrigger(hour: number, minute: number): import('expo-notifications').DailyTriggerInput {
  return {
    type: Notifications!.SchedulableTriggerInputTypes.DAILY,
    hour,
    minute,
  };
}

/**
 * Clear every scheduled ASCND reminder and re-create the enabled ones from
 * the current prefs. Called whenever the user toggles or edits a reminder.
 */
export async function rescheduleReminders(prefs: ReminderPrefs, copy: ReminderCopy): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();

    const schedule = (title: string, body: string, hour: number, minute: number) =>
      Notifications!.scheduleNotificationAsync({
        content: { title, body },
        trigger: dailyTrigger(hour, minute),
      });

    if (prefs.water.enabled) {
      const step = Math.max(1, Math.round(prefs.water.everyHours));
      for (let h = WATER_START_HOUR; h <= WATER_END_HOUR; h += step) {
        await schedule(copy.water.title, copy.water.body, h, 0);
      }
    }
    if (prefs.supplements.enabled) {
      await schedule(copy.supplements.title, copy.supplements.body, prefs.supplements.hour, prefs.supplements.minute);
    }
    if (prefs.bedtime.enabled) {
      await schedule(copy.bedtime.title, copy.bedtime.body, prefs.bedtime.hour, prefs.bedtime.minute);
    }
    if (prefs.weighIn.enabled) {
      await schedule(copy.weighIn.title, copy.weighIn.body, prefs.weighIn.hour, prefs.weighIn.minute);
    }
    if (prefs.workout.enabled) {
      await schedule(copy.workout.title, copy.workout.body, prefs.workout.hour, prefs.workout.minute);
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
