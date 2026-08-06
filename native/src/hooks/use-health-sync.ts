import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/lib/toast';
import { useInvalidateToday } from '@/hooks/useTodayData';
import { supabase } from '@/integrations/supabase/client';
import {
  getLatestBiometrics,
  getTodayActiveEnergy,
  getTodayExerciseMinutes,
  getTodaySteps,
  isHealthKitAvailable,
  requestHealthPermissions,
} from '@/lib/health';
import { recomputeDailyLog } from '@/lib/daily-log-service';
import { localDateStr } from '@/lib/local-date';

/**
 * Pulls today's steps + latest biometrics from Apple Health and writes
 * them to the same tables the web app uses (biometric_samples inserts,
 * daily_logs.steps upsert), then refreshes the Today queries.
 */
export function useHealthSync() {
  const { user } = useAuth();
  const invalidate = useInvalidateToday();
  const queryClient = useQueryClient();
  const i18n = useI18n();

  const sync = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in');

      const granted = await requestHealthPermissions();
      if (!granted) throw new Error('Health access was not granted');

      const [bio, steps, activeKcal, exerciseMin] = await Promise.all([
        getLatestBiometrics(),
        getTodaySteps(),
        getTodayActiveEnergy(),
        getTodayExerciseMinutes(),
      ]);
      if (!bio && steps == null && activeKcal == null && exerciseMin == null) {
        throw new Error('No health data found — open the Health app to confirm data exists');
      }

      if (bio) {
        const { error } = await supabase.from('biometric_samples').insert({
          user_id: user.id,
          hr_bpm: bio.hr_bpm,
          hrv_rmssd_ms: bio.hrv_rmssd_ms,
          spo2_pct: bio.spo2_pct,
          resp_rate_rpm: bio.resp_rate_rpm,
          source: bio.source,
          date_time: bio.date_time,
          confidence: bio.confidence,
        });
        if (error) throw error;
      }

      /*
        Only the fields Health actually answered.

        `active_kcal` and `active_minutes` join `steps` here, and this is the
        only writer of any of the three — `recomputeDailyLog` upserts a fixed
        list of columns that does not include them, so a meal saved after a
        sync cannot wipe the rings, and a sync cannot wipe the readiness score.
        One writer per column, deliberately.

        A metric Health had nothing for is left out of the object rather than
        written as 0. Sending zero would overwrite this morning's real sync the
        moment a later one runs without permission for that type, and "you
        burned 0 calories today" is a much more confident statement than "I do
        not know".
      */
      const measured: { steps?: number; active_kcal?: number; active_minutes?: number } = {};
      if (steps != null) measured.steps = steps;
      if (activeKcal != null) measured.active_kcal = activeKcal;
      if (exerciseMin != null) measured.active_minutes = exerciseMin;

      if (Object.keys(measured).length > 0) {
        const dateStr = localDateStr();
        const { data: existing } = await supabase
          .from('daily_logs')
          .select('id')
          .eq('user_id', user.id)
          .eq('date', dateStr)
          .maybeSingle();
        if (existing) {
          await supabase.from('daily_logs').update(measured).eq('id', existing.id);
        } else {
          await supabase.from('daily_logs').insert({ user_id: user.id, date: dateStr, ...measured });
        }
      }

      // New HRV/RHR should flow into today's readiness score (web parity)
      if (bio) await recomputeDailyLog(user.id, localDateStr());

      return { steps, bio };
    },
    onSuccess: () => {
      invalidate();
      // Steps screen + biometrics history read their own keys
      queryClient.invalidateQueries({ queryKey: ['steps_history', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['biometric_history', user?.id] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.success(i18n.nHealthSynced);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { available: isHealthKitAvailable(), sync };
}
