import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { useInvalidateToday } from '@/hooks/useTodayData';
import { supabase } from '@/integrations/supabase/client';
import { recomputeDailyLog } from '@/lib/daily-log-service';
import { OFFLINE_WRITE_KEY, type OfflineWrite } from '@/lib/offline-write';
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

/**
 * A reading somebody typed, which reaches the score and survives no signal.
 *
 * Durable for the same reason the workout log is: these are taken first thing
 * in the morning, often from a strap, often before the phone has reconnected to
 * anything. Losing one is not losing a number — HRV is the readiness score's
 * largest term, so a morning that failed to save is a morning the score is
 * quietly built without.
 *
 * No `mutationFn`: the key finds the default registered in `offline-write`,
 * which is the only version that still exists after a restart.
 */
export function useLogBiometrics() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const invalidateToday = useInvalidateToday();
  const m = useMutation<void, Error, OfflineWrite>({
    mutationKey: [...OFFLINE_WRITE_KEY],
    /*
      Both refreshes live here rather than at the call site.

      The screen used to invalidate Today from a per-call `onSuccess`, which
      fires when the write lands — and never fires at all for a write the queue
      paused. Here it still fires when the write lands, including an hour later
      on replay, which is exactly when the readiness gauge has something new to
      show.
    */
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['biometric_history', user?.id] });
      invalidateToday();
    },
  });

  /*
    The call sites still pass the plain fields.

    ── the rebuild that was missing ──

    `applyOfflineWrite` rebuilds the day for this operation, and until now
    nothing did. `useDeleteBiometricSample` below rebuilt; the insert did not.
    That asymmetry was the wrong way round — deleting a reading is rare, and
    typing this morning's HRV is the whole point of the screen. Without it the
    numbers landed in `biometric_samples`, the history chart showed them, and
    readiness went on reporting yesterday's figure until something unrelated
    happened to rebuild the day.

    Nothing looked wrong. The reading was visibly saved; the score simply did
    not move, which reads as the score not caring rather than as a bug.
  */
  return {
    ...m,
    mutate: (values: BiometricInput, opts?: Parameters<typeof m.mutate>[1]) => {
      if (!user) return;
      m.mutate(
        {
          kind: 'biometrics',
          userId: user.id,
          /* There is no date picker here — a reading is always for now — but
             the moment is still captured at the tap rather than at replay. */
          dateTime: new Date().toISOString(),
          hrBpm: values.hr_bpm ?? null,
          hrvSdnnMs: values.hrv_sdnn_ms ?? null,
          hrvRmssdMs: values.hrv_rmssd_ms ?? null,
          spo2Pct: values.spo2_pct ?? null,
          respRateRpm: values.resp_rate_rpm ?? null,
          vo2maxMlkgmin: values.vo2max_mlkgmin ?? null,
        },
        /* Forwarded so the screen can still say what happened. These are
           per-call callbacks and are not persisted — which is correct: they
           only mean anything while the screen that asked is still there. */
        opts,
      );
    },
  };
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
