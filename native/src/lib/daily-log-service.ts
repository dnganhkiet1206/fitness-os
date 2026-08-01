import { supabase } from '@/integrations/supabase/client';
import { localDayRangeISO } from './local-date';
import { computeReadiness } from './readiness-engine';
import type { ReadinessInput } from './types';

/**
 * Rebuild one day's `daily_logs` row from everything it is derived from.
 *
 * ── the reads run together ──
 *
 * There are eleven of them and they used to run one after another, each waiting
 * on the last for no reason: none of them takes an input from any other. On a
 * phone at a hundred-and-fifty milliseconds a round trip that is most of two
 * seconds, and every caller `await`s this before touching the query cache — so
 * deleting a food from the diary, saving a workout, logging sleep, all of them
 * sat there looking broken while eleven independent queries queued politely.
 *
 * They are one `Promise.all` now. The wall time is the slowest single query
 * rather than the sum of all of them, and nothing else about the computation
 * changes: everything that reads these results still runs after all of them
 * have landed, in the same order, on the same values.
 *
 * The upsert stays where it is. It genuinely depends on all eleven.
 */
export async function recomputeDailyLog(userId: string, date: string) {
  // Local-day window as UTC instants for timestamptz columns
  const day = localDayRangeISO(date);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 28);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [
    { data: meals },
    { data: workouts },
    { data: sleeps },
    { data: supplements },
    { data: intakes },
    { data: bio },
    { data: profile },
    { data: bioHistory },
    { data: load7d },
    { data: load28d },
    { data: sleepLogs7d },
  ] = await Promise.all([
    // 1. Nutrition from meal_entries
    supabase
      .from('meal_entries')
      .select('total_kcal, total_protein_g, total_carbs_g, total_fat_g, total_fiber_g')
      .eq('user_id', userId)
      .gte('date_time', day.start)
      .lt('date_time', day.end),
    // 2. Training from workout_sessions
    supabase
      .from('workout_sessions')
      .select('volume_load')
      .eq('user_id', userId)
      .gte('date_time', day.start)
      .lt('date_time', day.end),
    // 3. Sleep from sleep_logs (sleep ending on this date)
    supabase
      .from('sleep_logs')
      .select('bedtime, waketime, quality, light_min, deep_min, rem_min')
      .eq('user_id', userId)
      .gte('waketime', day.start)
      .lt('waketime', day.end)
      .limit(1)
      .order('waketime', { ascending: false }),
    // 4. Supplements adherence — planned, then taken
    supabase.from('supplements').select('id').eq('user_id', userId),
    supabase
      .from('supplement_intake_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('taken', true)
      .gte('date_time', day.start)
      .lt('date_time', day.end),
    // 5. Readiness inputs: today's biometrics, the sleep target, and history
    supabase
      .from('biometric_samples')
      .select('hr_bpm, hrv_rmssd_ms')
      .eq('user_id', userId)
      .gte('date_time', day.start)
      .lt('date_time', day.end)
      .order('date_time', { ascending: false })
      .limit(1),
    supabase.from('profiles').select('sleep_target_hours').eq('user_id', userId).single(),
    supabase
      .from('biometric_samples')
      .select('hrv_rmssd_ms, hr_bpm, date_time')
      .eq('user_id', userId)
      .gte('date_time', thirtyDaysAgo.toISOString())
      .order('date_time', { ascending: true }),
    supabase
      .from('workout_sessions')
      .select('volume_load')
      .eq('user_id', userId)
      .gte('date_time', sevenDaysAgo.toISOString()),
    supabase
      .from('workout_sessions')
      .select('volume_load')
      .eq('user_id', userId)
      .gte('date_time', thirtyDaysAgo.toISOString()),
    supabase
      .from('sleep_logs')
      .select('bedtime, waketime')
      .eq('user_id', userId)
      .gte('waketime', sevenDaysAgo.toISOString()),
  ]);

  const kcal = meals?.reduce((s, m) => s + Number(m.total_kcal), 0) ?? 0;
  const protein_g = meals?.reduce((s, m) => s + Number(m.total_protein_g), 0) ?? 0;
  const carbs_g = meals?.reduce((s, m) => s + Number(m.total_carbs_g), 0) ?? 0;
  const fat_g = meals?.reduce((s, m) => s + Number(m.total_fat_g), 0) ?? 0;
  const fiber_g = meals?.reduce((s, m) => s + Number(m.total_fiber_g), 0) ?? 0;

  const workout_count = workouts?.length ?? 0;
  const volume_load = workouts?.reduce((s, w) => s + Number(w.volume_load), 0) ?? 0;

  const sleep = sleeps?.[0];
  let sleep_duration_min = 0;
  let sleep_quality = 0;
  if (sleep) {
    const bed = new Date(sleep.bedtime).getTime();
    const wake = new Date(sleep.waketime).getTime();
    sleep_duration_min = Math.round((wake - bed) / 60000);
    sleep_quality = sleep.quality ?? 5;
  }

  const supplement_planned = supplements?.length ?? 0;
  const supplement_taken = intakes?.length ?? 0;

  let readiness_score: number | null = null;
  let readiness_status: string | null = null;
  let readiness_explain = '';
  let readiness_recommendation = '';
  let acwr: number | null = null;

  const sleepTargetMin = (profile?.sleep_target_hours ?? 8) * 60;

  const hrvHistory = (bioHistory ?? []).filter(b => b.hrv_rmssd_ms != null).map(b => Number(b.hrv_rmssd_ms));
  const rhrHistory = (bioHistory ?? []).filter(b => b.hr_bpm != null).map(b => Number(b.hr_bpm));

  const trainingLoad7d = load7d?.reduce((s, w) => s + Number(w.volume_load), 0) ?? 0;
  const trainingLoad28d = load28d?.reduce((s, w) => s + Number(w.volume_load), 0) ?? 0;

  let sleepDebt7d = 0;
  if (sleepLogs7d && sleepLogs7d.length > 0) {
    const totalSleep = sleepLogs7d.reduce((s, sl) => {
      return s + (new Date(sl.waketime).getTime() - new Date(sl.bedtime).getTime()) / 60000;
    }, 0);
    const avgSleep = totalSleep / sleepLogs7d.length;
    sleepDebt7d = Math.max(0, sleepTargetMin - avgSleep);
  }

  // Check if enough data for readiness (at least 3 days of any logs)
  const hasEnoughData = (bioHistory && bioHistory.length >= 3) || (sleepLogs7d && sleepLogs7d.length >= 3);

  if (hasEnoughData) {
    const input: ReadinessInput = {
      hrv_today: bio?.[0]?.hrv_rmssd_ms ? Number(bio[0].hrv_rmssd_ms) : null,
      rhr_today: bio?.[0]?.hr_bpm ? Number(bio[0].hr_bpm) : undefined,
      sleep_min_lastnight: sleep_duration_min,
      sleep_target_min: sleepTargetMin,
      sleep_debt_7d_min: sleepDebt7d,
      training_load_7d: trainingLoad7d,
      training_load_28d: trainingLoad28d,
      soreness_today: undefined,
      illness_flag: false,
      pain_flag_max: undefined,
      hrv_history_28d: hrvHistory,
      rhr_history_28d: rhrHistory,
    };

    const result = computeReadiness(input);
    readiness_score = result.score;
    readiness_status = result.status;
    // Store language-neutral tokens; the UI localizes them at render so the
    // readiness text follows the user's language, not the compute-time one.
    readiness_explain = result.explainToken;
    readiness_recommendation = result.recommendationKey;
    acwr = result.acwr;
  }

  // 6. Upsert daily_log
  const { error } = await supabase
    .from('daily_logs')
    .upsert({
      user_id: userId,
      date,
      kcal,
      protein_g,
      carbs_g,
      fat_g,
      fiber_g,
      sleep_duration_min,
      sleep_quality,
      workout_count,
      volume_load,
      supplement_taken,
      supplement_planned,
      readiness_score,
      readiness_status,
      readiness_explain,
      readiness_recommendation,
      acwr,
    }, { onConflict: 'user_id,date' });

  if (error) console.error('recomputeDailyLog error:', error);
  return { error };
}
