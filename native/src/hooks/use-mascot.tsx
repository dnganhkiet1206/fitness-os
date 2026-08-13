import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useDailyLog, useProfile, useTodayMeals } from '@/hooks/useTodayData';
import { useTodayWater } from '@/hooks/use-water';
import { supabase } from '@/integrations/supabase/client';
import { mascotLine, type MascotThing } from '@/lib/mascot-message';
import { DEFAULT_MASCOT_ID, getMascot, isUnlocked, MASCOTS } from '@/lib/mascots';

const ENABLED_KEY = 'ascnd_mascot_enabled';
const SELECTED_KEY = 'ascnd_mascot_selected';

/** Lifetime counters that drive character unlocks */
export function useUnlockStats() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['mascot_unlock_stats', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [w, m] = await Promise.all([
        supabase
          .from('workout_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id),
        supabase
          .from('meal_entries')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id),
      ]);
      if (w.error) throw w.error;
      if (m.error) throw m.error;
      return { workouts: w.count ?? 0, meals: m.count ?? 0 };
    },
  });
}

// Module-level store so every mounted instance (Today's mascot, the
// Settings picker, the unlock celebration) sees changes immediately —
// per-component useState copies would go stale across screens.
let settingsState = { enabled: true, selectedId: DEFAULT_MASCOT_ID };
const settingsListeners = new Set<() => void>();
let settingsHydrated = false;

function patchSettings(patch: Partial<typeof settingsState>) {
  settingsState = { ...settingsState, ...patch };
  settingsListeners.forEach((l) => l());
}

async function hydrateSettings() {
  if (settingsHydrated) return;
  settingsHydrated = true;
  try {
    const [e, s] = await Promise.all([
      AsyncStorage.getItem(ENABLED_KEY),
      AsyncStorage.getItem(SELECTED_KEY),
    ]);
    patchSettings({
      enabled: e != null ? e === '1' : true,
      selectedId: s || DEFAULT_MASCOT_ID,
    });
  } catch {
    // keep defaults
  }
}

export function useMascotSettings() {
  const snap = useSyncExternalStore(
    (cb) => {
      settingsListeners.add(cb);
      return () => settingsListeners.delete(cb);
    },
    () => settingsState,
  );

  useEffect(() => {
    hydrateSettings();
  }, []);

  const setEnabled = (v: boolean) => {
    patchSettings({ enabled: v });
    AsyncStorage.setItem(ENABLED_KEY, v ? '1' : '0').catch(() => {});
  };
  const setSelectedId = (id: string) => {
    patchSettings({ selectedId: id });
    AsyncStorage.setItem(SELECTED_KEY, id).catch(() => {});
  };

  return { ...snap, setEnabled, setSelectedId };
}

/**
 * What Koa says today.
 *
 * The decision is `mascotLine` in `lib/mascot-message.ts` — a pure function, so
 * the voice can be exercised across a whole matrix of days and hours without a
 * renderer (`tools/mascot-voice.mjs`). This hook only reads the day and turns
 * the decision into words.
 *
 * `null` hides the bubble, and it is returned for two different reasons: the
 * day could not be read at all, and there is genuinely nothing to say. Both are
 * better than a sentence — see the note in `mascot-message.ts` for what the old
 * ladder did with an unreadable day.
 */
export function useMascotMessage(): string | null {
  const i18n = useI18n();
  const { data: log, isSuccess: logOk } = useDailyLog();
  const { data: meals, isSuccess: mealsOk } = useTodayMeals();
  const { data: waterMl, isSuccess: waterOk } = useTodayWater();
  const { data: profile } = useProfile();

  return useMemo(() => {
    /* Every field goes to `null` together unless all three reads succeeded.
       Half a day is not a day: a failed meals query with a good water query
       would otherwise have Koa asking for the meal you already logged. */
    const read = logOk && mealsOk && waterOk;
    const waterTarget = Number(profile?.water_target_ml) || 2500;

    const line = mascotLine({
      hour: new Date().getHours(),
      sleepMin: read ? Number(log?.sleep_duration_min) || 0 : null,
      meals: read ? meals?.length ?? 0 : null,
      waterPct: read ? ((waterMl ?? 0) / waterTarget) * 100 : null,
      workouts: read ? Number(log?.workout_count ?? 0) : null,
    });

    const WIN: Record<MascotThing, string> = {
      sleep: i18n.nMascotWinSleep,
      meal: i18n.nMascotWinMeal,
      water: i18n.nMascotWinWater,
      workout: i18n.nMascotWinWorkout,
    };
    const GAP: Record<MascotThing, string> = {
      sleep: i18n.nMascotGapSleep,
      meal: i18n.nMascotGapMeal,
      water: i18n.nMascotGapWater,
      workout: i18n.nMascotGapWorkout,
    };
    /* The long-form ask, used only when there is nothing to acknowledge — it
       explains why the thing is worth logging, which is the right amount of
       words when it is the whole message. */
    const ASK: Record<MascotThing, string> = {
      sleep: i18n.nMascotSleep,
      meal: i18n.nMascotMeal,
      water: i18n.nMascotWater,
      workout: i18n.nMascotWorkout,
    };

    switch (line.kind) {
      case 'silent':
        return null;
      case 'ask':
        return ASK[line.gap];
      case 'notice':
        return i18n.nMascotThen.replace('{win}', WIN[line.win]).replace('{gap}', GAP[line.gap]);
      case 'praise':
        return i18n.nMascotPraise;
    }
  }, [i18n, log, meals, waterMl, profile, logOk, mealsOk, waterOk]);
}

/** happy | neutral | tired — what the figure mirrors, distinct from what it says. */
export type MascotMood = 'happy' | 'neutral' | 'tired';

export function useMascotMood(): MascotMood {
  const { data: log } = useDailyLog();
  const { data: meals } = useTodayMeals();

  return useMemo(() => {
    const hour = new Date().getHours();
    const mealCount = meals?.length ?? 0;
    const workedOut = Number(log?.workout_count ?? 0) > 0;
    if (mealCount > 0 && workedOut) return 'happy';
    if ((hour >= 12 && mealCount === 0) || (hour >= 18 && !workedOut)) return 'tired';
    return 'neutral';
  }, [log, meals]);
}

export function useMascot() {
  const settings = useMascotSettings();
  const { data: stats } = useUnlockStats();
  const message = useMascotMessage();
  const mood = useMascotMood();

  const unlockStats = stats ?? { workouts: 0, meals: 0 };
  const selected = getMascot(settings.selectedId);
  // If the chosen character is somehow locked (fresh install), fall back
  const mascot = isUnlocked(selected, unlockStats) ? selected : getMascot(DEFAULT_MASCOT_ID);

  const catalog = MASCOTS.map((m) => ({
    ...m,
    unlocked: isUnlocked(m, unlockStats),
  }));

  return { ...settings, mascot, catalog, unlockStats, message, mood };
}
