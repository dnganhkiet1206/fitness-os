import { useQuery } from '@tanstack/react-query';

import { useAppSettings } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
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
 * `PersistQueryClientProvider` keeps it for 24 hours across launches. Between
 * them, opening the assistant five times in a day costs one request. The key
 * carries the date, so tomorrow misses the cache and asks again — no
 * invalidation to remember.
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
  const date = localDateStr();

  return useQuery({
    queryKey: ['smart_nudges', user?.id, date, lang],
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
