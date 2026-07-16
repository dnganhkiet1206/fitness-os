import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useDailyLog, useProfile, useTodayMeals } from '@/hooks/useTodayData';
import { useTodayWater } from '@/hooks/use-water';
import { supabase } from '@/integrations/supabase/client';
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
      return { workouts: w.count ?? 0, meals: m.count ?? 0 };
    },
  });
}

export function useMascotSettings() {
  const [enabled, setEnabledState] = useState(true);
  const [selectedId, setSelectedIdState] = useState(DEFAULT_MASCOT_ID);

  useEffect(() => {
    AsyncStorage.getItem(ENABLED_KEY).then((v) => {
      if (v != null) setEnabledState(v === '1');
    });
    AsyncStorage.getItem(SELECTED_KEY).then((v) => {
      if (v) setSelectedIdState(v);
    });
  }, []);

  const setEnabled = (v: boolean) => {
    setEnabledState(v);
    AsyncStorage.setItem(ENABLED_KEY, v ? '1' : '0').catch(() => {});
  };
  const setSelectedId = (id: string) => {
    setSelectedIdState(id);
    AsyncStorage.setItem(SELECTED_KEY, id).catch(() => {});
  };

  return { enabled, setEnabled, selectedId, setSelectedId };
}

/**
 * Context-aware reminder: picks the most useful nudge from today's real
 * data. Returns null when the mascot has nothing worth saying.
 */
export function useMascotMessage(): string | null {
  const i18n = useI18n();
  const { data: log } = useDailyLog();
  const { data: meals } = useTodayMeals();
  const { data: waterMl } = useTodayWater();
  const { data: profile } = useProfile();

  return useMemo(() => {
    const hour = new Date().getHours();
    const sleepLogged = log?.sleep_duration_min != null && Number(log.sleep_duration_min) > 0;
    const mealCount = meals?.length ?? 0;
    const waterTarget = Number(profile?.water_target_ml) || 2500;
    const waterPct = ((waterMl ?? 0) / waterTarget) * 100;
    const workedOut = Number(log?.workout_count ?? 0) > 0;

    if (hour >= 6 && hour < 11 && !sleepLogged) return i18n.nMascotSleep;
    if (hour >= 11 && mealCount === 0) return i18n.nMascotMeal;
    if (hour >= 14 && waterPct < 50) return i18n.nMascotWater;
    if (hour >= 16 && hour < 21 && !workedOut) return i18n.nMascotWorkout;
    if (mealCount > 0 && (sleepLogged || workedOut)) return i18n.nMascotPraise;
    return i18n.nMascotHello;
  }, [i18n, log, meals, waterMl, profile]);
}

export function useMascot() {
  const settings = useMascotSettings();
  const { data: stats } = useUnlockStats();
  const message = useMascotMessage();

  const unlockStats = stats ?? { workouts: 0, meals: 0 };
  const selected = getMascot(settings.selectedId);
  // If the chosen character is somehow locked (fresh install), fall back
  const mascot = isUnlocked(selected, unlockStats) ? selected : getMascot(DEFAULT_MASCOT_ID);

  const catalog = MASCOTS.map((m) => ({
    ...m,
    unlocked: isUnlocked(m, unlockStats),
  }));

  return { ...settings, mascot, catalog, unlockStats, message };
}
