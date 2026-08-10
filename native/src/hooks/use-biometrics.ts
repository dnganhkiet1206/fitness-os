import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { useInvalidateToday } from '@/hooks/useTodayData';
import { supabase } from '@/integrations/supabase/client';
import { recomputeDailyLog } from '@/lib/daily-log-service';
import { localDateStr } from '@/lib/local-date';

export interface BiometricSample {
  id: string;
  date_time: string;
  source: string;
  hr_bpm: number | null;
  hrv_rmssd_ms: number | null;
  hrv_sdnn_ms: number | null;
  spo2_pct: number | null;
  vo2max_mlkgmin: number | null;
  resp_rate_rpm: number | null;
  confidence: number | null;
  notes: string | null;
}

export function useBiometricHistory(days = 14, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['biometric_history', user?.id, days],
    enabled: !!user && enabled,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await supabase
        .from('biometric_samples')
        .select('*')
        .eq('user_id', user!.id)
        .gte('date_time', since.toISOString())
        .order('date_time', { ascending: true });
      if (error) throw error;
      return (data ?? []) as BiometricSample[];
    },
  });
}

export interface BiometricInput {
  hr_bpm?: number | null;
  hrv_rmssd_ms?: number | null;
  hrv_sdnn_ms?: number | null;
  spo2_pct?: number | null;
  vo2max_mlkgmin?: number | null;
  resp_rate_rpm?: number | null;
}

export function useLogBiometrics() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: BiometricInput) => {
      const { error } = await supabase.from('biometric_samples').insert({
        user_id: user!.id,
        source: 'manual',
        confidence: 0.7,
        hr_bpm: values.hr_bpm ?? null,
        hrv_rmssd_ms: values.hrv_rmssd_ms ?? null,
        hrv_sdnn_ms: values.hrv_sdnn_ms ?? null,
        spo2_pct: values.spo2_pct ?? null,
        vo2max_mlkgmin: values.vo2max_mlkgmin ?? null,
        resp_rate_rpm: values.resp_rate_rpm ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['biometric_history', user?.id] });
    },
  });
}

/**
 * Remove a reading somebody typed wrong, and rebuild what it poisoned.
 *
 * ── why this is not a nice-to-have ──
 *
 * `hrv_history_28d` is the 28-day baseline the readiness score's largest term
 * is a robust z-score against. Typing 450 where 45 was meant does not produce a
 * wrong number for a day; it drags that baseline for four weeks, and because
 * the score still comes out between 0 and 100 there is nothing on screen that
 * looks broken. Until now there was no way to take it back — `.insert()` was
 * the only verb this table had from the app, and the biometrics screen drew a
 * chart with no rows to touch.
 *
 * ── which days are rebuilt ──
 *
 * The sample's own day, and today. Exactly the rule `useDeleteWorkoutSession`
 * follows and for the same reason: `recomputeDailyLog` rebuilds the day it is
 * handed, but the 28-day baseline is a window anchored at `new Date()`, so
 * deleting last Tuesday's typo changes *today's* score too. Rebuilding only
 * Tuesday would leave the Today screen showing a number derived from a reading
 * that no longer exists.
 *
 * The days in between are left alone, deliberately, following the decision
 * already recorded for workouts: a past day's readiness is a product of when it
 * was computed, and up to 27 rebuilds to restate history is a cost this app has
 * already decided not to pay.
 */
export function useDeleteBiometricSample() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidateToday = useInvalidateToday();
  return useMutation({
    mutationFn: async ({ id, date_time }: { id: string; date_time: string }) => {
      const { error } = await supabase
        .from('biometric_samples')
        .delete()
        .eq('id', id)
        .eq('user_id', user!.id);
      if (error) throw error;

      const day = localDateStr(new Date(date_time));
      await recomputeDailyLog(user!.id, day);
      const today = localDateStr();
      if (day !== today) await recomputeDailyLog(user!.id, today);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biometric_history', user?.id] });
      qc.invalidateQueries({ queryKey: ['today_biometrics', user?.id] });
      invalidateToday();
    },
  });
}
