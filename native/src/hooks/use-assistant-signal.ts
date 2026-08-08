import { useMemo } from 'react';

import { useDailyLog, useProfile, useRecentWorkouts } from '@/hooks/useTodayData';
import type { AssistantSignal } from '@/lib/assistant-suggestions';
import { calorieTargetFor, macroTargetsFor } from '@/lib/macro-targets';
import { daysSince } from '@/lib/training-card';

/**
 * Today, in the shape `suggestionsFor` reads.
 *
 * ── why this is a hook and not four lines at each call site ──
 *
 * Two screens ask for the same suggestions now: the Health Assistant's coach
 * card offers them as entry points, and the coach itself offers them as
 * openers on an empty chat. Those have to be the *same* four. A card that
 * says "Tôi ngủ chưa đủ" opening a chat that suggests something else is the
 * bridge visibly not connecting to the thing it bridges to.
 *
 * Built by hand in one screen and copied to the other, they would agree until
 * the first time somebody adjusted a threshold in one of them — and nothing
 * would fail, because both halves would still be perfectly valid code
 * producing perfectly plausible chips.
 *
 * `useDailyLog` and `useProfile` are React Query reads that both screens make
 * anyway, so this costs a cache hit rather than a request.
 *
 * ── the object is memoised, and that is not a micro-optimisation ──
 *
 * This used to return a fresh object literal on every render, which is fine
 * until somebody downstream writes `useMemo(() => briefFor(signal), [signal])`
 * — and that is exactly what the assistant screen does for the briefing, the
 * chips and the chart analysis. A new object every render means every one of
 * those dependencies changes every render, so all three recompute anyway while
 * *looking* memoised. That is worse than no `useMemo` at all: the cost is
 * unchanged and the code now says it was dealt with.
 *
 * The three query results are stable references between refetches, so keying
 * on them gives a signal that changes when the day's data changes and not
 * otherwise. `macroTargetsFor` moved inside for the same reason — it was
 * running on every render to produce the same number.
 */
export function useAssistantSignal(): AssistantSignal {
  const { data: dailyLog } = useDailyLog();
  const { data: profile } = useProfile();
  const { data: workouts } = useRecentWorkouts();

  return useMemo(() => {
    const macros = macroTargetsFor(profile);

    /* `daysSince` counts calendar days rather than milliseconds, so a session
       logged last night and one logged 25 hours ago across a clock change both
       come out right — the same trap `weekDates` was rebuilt to avoid.

       `null` rather than a large number when nothing is logged: "you have not
       trained in 9999 days" is a sentence, and a wrong one. */
    const last = workouts?.[0]?.date_time;

    return {
      name: typeof profile?.name === 'string' ? profile.name.trim() : '',
      daysSinceWorkout: last ? daysSince(String(last)) : null,
      readiness: dailyLog?.readiness_score != null ? Math.round(Number(dailyLog.readiness_score)) : null,
      status: (dailyLog?.readiness_status as 'green' | 'yellow' | 'red' | null) ?? null,
      acwr: dailyLog?.acwr != null ? Number(dailyLog.acwr) : null,
      sleepMin: Number(dailyLog?.sleep_duration_min) || 0,
      kcal: Math.round(Number(dailyLog?.kcal) || 0),
      kcalTarget: calorieTargetFor(profile),
      proteinG: Number(dailyLog?.protein_g) || 0,
      proteinTarget: macros.protein,
      steps: Number(dailyLog?.steps) || 0,
    };
  }, [dailyLog, profile, workouts]);
}
