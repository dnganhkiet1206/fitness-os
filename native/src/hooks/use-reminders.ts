import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { useI18n } from '@/hooks/use-app-settings';
import {
  DEFAULT_REMINDERS,
  hasNotificationPermission,
  notificationsAvailable,
  requestNotificationPermission,
  rescheduleReminders,
  type ReminderCopy,
  type ReminderPrefs,
} from '@/lib/notifications';

const PREFS_KEY = 'ascnd_reminders';

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
      if (granted) await rescheduleReminders(next, copy);
    },
    [permission, copy],
  );

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
