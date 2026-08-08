import { useQuery } from '@tanstack/react-query';

import { useAppSettings } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useDailyLog } from '@/hooks/useTodayData';
import { EDGE_FUNCTIONS } from '@/lib/backend';
import { callEdge } from '@/lib/edge';
import { localDateStr } from '@/lib/local-date';

/**
 * Today's insight, computed once.
 *
 * ── it was a button on the dashboard ──
 *
 * `SmartTipsCard` called the edge function on tap and threw the result away
 * when the card unmounted, so the same day's tips were regenerated every time
 * you pressed it. That is a paid model call per press, and worse, it made the
 * tips feel like a slot machine: press again, get different advice about the
 * same unchanged day.
 *
 * "Insight of today" is the honest framing, and it dictates the caching. One
 * call per person per day, keyed by the local date, held until that date
 * changes. Pressing again gets you the same reading, because the day has not
 * moved.
 *
 * ── it survives a restart ──
 *
 * `staleTime: Infinity` keeps it for the session; the app's
 * `PersistQueryClientProvider` keeps it for 24 hours across launches. The key
 * carries the date, so tomorrow misses the cache and asks again — no
 * invalidation to remember.
 *
 * ── and it notices when the day changes under it ──
 *
 * Keyed on the date alone, the insight froze at whatever the day looked like
 * the first time you opened the page. Open the assistant at seven in the
 * morning with nothing logged and you got a reading of an empty day, held until
 * midnight — log a workout at six in the evening and it still said the same
 * thing. That is the cost of "once a day" charged at the worst moment, because
 * the first look of the day is exactly when there is least to look at.
 *
 * So the key also carries a **coarse stamp of today**: has a night been logged,
 * has anything been eaten, has a session been recorded. Three booleans, nothing
 * finer.
 *
 * Coarse is the whole point. `kcal` in the key would be a model call per meal;
 * three flags can change at most three times, so a day costs at most four
 * requests and usually one or two. And each flip is a moment where the advice
 * genuinely should change — the app now knows something about today it did not
 * know before.
 *
 * Un-logging flips a flag back, which lands on a key that is already cached, so
 * it costs nothing and shows the reading that matched that state.
 *
 * `useDailyLog` is a React Query read every screen here already makes, so the
 * stamp costs a cache hit rather than a request.
 *
 * ── it fails quietly, but it does fail ──
 *
 * An insight is a bonus rather than something the person asked for, so a
 * failure is not an alert. It still *fails* rather than resolving to an empty
 * list, because the section has to be able to say "không có gợi ý nào" only
 * when that is true — an error rendered as "nothing to suggest" is the app
 * quietly claiming it looked.
 */

export interface Nudge {
  type: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  icon: string;
}

/** Retried once: these are one call a day, and a cold edge function is common. */
const RETRY = 1;

export function useSmartNudges(enabled = true) {
  const { user } = useAuth();
  const { lang } = useAppSettings();
  const { data: log } = useDailyLog();
  const date = localDateStr();

  /* Booleans, deliberately — see the note above. Rendered as a short string so
     the key stays readable in devtools: "s-w" is a day with sleep and a
     session logged and nothing eaten yet. */
  const stamp =
    (Number(log?.sleep_duration_min) > 0 ? 's' : '-') +
    (Number(log?.kcal) > 0 ? 'm' : '-') +
    (Number(log?.workout_count) > 0 ? 'w' : '-');

  return useQuery({
    queryKey: ['smart_nudges', user?.id, date, lang, stamp],
    enabled: !!user && enabled,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24,
    retry: RETRY,
    queryFn: async () => {
      const res = await callEdge<{ nudges?: Nudge[] }>(EDGE_FUNCTIONS.smartNudges, { lang, date });
      if (!res.ok) throw new Error(res.failure);
      return res.data?.nudges ?? [];
    },
  });
}
