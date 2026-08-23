import { useMemo } from 'react';

import { useWeightHistory, useWorkoutSessions } from '@/hooks/use-fitness-data';
import { useExercises } from '@/hooks/use-library';
import { exerciseKey } from '@/lib/personal-record';
import { performancesFrom, type ExercisePerformance } from '@/lib/exercise-performance';
import { insightsFrom, type ExerciseInsight } from '@/lib/exercise-trend';

/**
 * Exercise Intelligence, wired to the data the app already fetches.
 *
 * ── it adds no queries ──
 *
 * All three inputs are queries that exist and are already used elsewhere:
 * `useWorkoutSessions` (the Today widgets and the week panel), `useWeightHistory`
 * (the Progress screen) and `useLibrary` (the exercise list and the builder).
 * React Query hands back the same cached results, so opening this screen after
 * any of those costs nothing.
 *
 * The one thing it does change is the window: sessions are asked for over
 * `INSIGHT_DAYS` rather than the default fortnight, because a trend over two
 * weeks is two or three sessions of any given movement and the engine would
 * return INSUFFICIENT_DATA for almost everything.
 */

/**
 * How far back the engine looks.
 *
 * Ninety days. `TREND_WINDOW` is six sessions of one movement, and somebody
 * training a lift once or twice a week needs six to nine weeks to produce six
 * of them; ninety days leaves room for a holiday inside that without the window
 * coming up short. It is also the point past which a comparison stops being
 * about this training block — `exercise-trend.ts` makes the same argument for
 * why the window is six sessions rather than all of them.
 */
export const INSIGHT_DAYS = 90;

export interface ExerciseInsights {
  insights: ExerciseInsight[];
  performances: ExercisePerformance[];
  loading: boolean;
  /**
   * True when a query failed, as distinct from an account with no workouts in
   * it. The screen has to be able to tell those apart: one says "log a workout"
   * and the other says "could not load", and showing the first for the second
   * tells somebody their training is missing.
   */
  failed: boolean;
}

export function useExerciseInsights(days: number = INSIGHT_DAYS): ExerciseInsights {
  const sessions = useWorkoutSessions(days);
  const weights = useWeightHistory(days);
  const library = useExercises();

  const declaredKinds = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const e of library.data ?? []) {
      const key = exerciseKey(e.name);
      /* Keyed by name, because that is what a logged set carries — most sets
         have no exercise id at all. Where two library rows share a name (a
         seeded one and the user's own copy), the user's own wins: it is the one
         they edited. */
      if (!key) continue;
      const kind = (e as { exercise_kind?: unknown }).exercise_kind;
      if (kind == null) continue;
      if (out[key] === undefined || e.user_id) out[key] = kind;
    }
    return out;
  }, [library.data]);

  const weighIns = useMemo(
    () => (weights.data ?? []).map((w) => ({ date: w.date, value: w.value })),
    [weights.data],
  );

  const performances = useMemo(
    () => performancesFrom(sessions.data ?? [], { weighIns, declaredKinds }),
    [sessions.data, weighIns, declaredKinds],
  );

  const insights = useMemo(() => insightsFrom(performances), [performances]);

  return {
    insights,
    performances,
    /* The library and the weigh-ins are enrichment: without them the engine
       still reads every loaded movement, so the screen is not held back for
       them. Sessions are the subject, so it is held back for those. */
    loading: sessions.isLoading,
    failed: sessions.isError,
  };
}
