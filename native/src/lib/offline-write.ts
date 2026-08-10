import type { QueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { recomputeDailyLog } from '@/lib/daily-log-service';
import { localDateStr } from '@/lib/local-date';

/**
 * Writes that survive a gym basement.
 *
 * ── the bug this exists for ──
 *
 * Measured and written up in `offline.ts`: with the server holding one 250ml
 * entry, the connection cut, a tap on +8 showed 16.5 oz and **nothing was
 * written** — not then, and not thirty seconds after reconnecting. The lying
 * half was fixed at the time (the optimistic patch is suppressed while
 * offline), so the app stopped showing water nobody drank. The writes still
 * vanished.
 *
 * That is a trust failure rather than an inconvenience. The two places people
 * log most are a gym and a kitchen, and one of those reliably has no signal.
 * "I recorded five sets and the app forgot them" is not a bug report somebody
 * files; it is a subscription somebody cancels.
 *
 * ── one operation, not thirty mutation functions ──
 *
 * React Query can only resume a paused mutation if it can find a `mutationFn`
 * after a restart, because functions are not serialisable — that is what
 * `setMutationDefaults` is for. The documented shape is one default per
 * mutation key, and the project's own log flagged the risk: about thirty call
 * sites, and a single wrong key stops that mutation resuming **silently**. The
 * TanStack discussions say the same thing in stronger words about apps with
 * twenty or more mutations.
 *
 * So there is exactly one key and one function here, and what varies is
 * *data*. An `OfflineWrite` is a plain object — no closures, no `supabase`
 * handle, no `user` captured from a hook — which is precisely the property that
 * makes it survive being written to AsyncStorage and read back by a process
 * that has forgotten everything.
 *
 * ── named operations, not raw table writes ──
 *
 * The queue could have carried `{ table, values }` and been shorter. It carries
 * intentions instead, because several of these are not one statement: logging a
 * workout also rebuilds the day's readiness, and a queue of raw inserts would
 * replay the insert and quietly skip the rebuild. Naming the operation keeps
 * the whole of it in one place, so what happens on reconnect is what would have
 * happened live.
 *
 * ── what is deliberately not queued ──
 *
 * Anything that cannot mean anything offline: AI calls, purchases, account
 * deletion, the shop. Queuing those would store an intention that is going to
 * fail or be stale by the time it runs. This is for *logging* — the writes
 * where the person already knows what happened and the app is only the paper.
 */

export type OfflineWrite =
  | { kind: 'water'; userId: string; amountMl: number; date: string; at: string }
  | {
      kind: 'workout';
      userId: string;
      dateTime: string;
      sets: unknown;
      volumeLoad: number;
      templateId: string | null;
      templateName: string | null;
      sessionRpe: number | null;
    }
  | { kind: 'weight'; userId: string; kg: number; date: string };

/** The one key every durable write is filed under. */
export const OFFLINE_WRITE_KEY = ['offline-write'] as const;

/**
 * Perform one queued intention.
 *
 * Runs identically whether it was fired live or resumed an hour later from
 * storage, which is the only way to be sure the offline path is not a second,
 * less-tested version of the online one.
 */
export async function applyOfflineWrite(w: OfflineWrite): Promise<void> {
  switch (w.kind) {
    case 'water': {
      const { error } = await supabase.from('water_logs').insert({
        user_id: w.userId,
        amount_ml: w.amountMl,
        date: w.date,
        logged_at: w.at,
      });
      if (error) throw error;
      return;
    }
    case 'workout': {
      const { error } = await supabase.from('workout_sessions').insert({
        user_id: w.userId,
        date_time: w.dateTime,
        sets: w.sets as never,
        volume_load: w.volumeLoad,
        template_id: w.templateId,
        template_name: w.templateName,
        session_rpe: w.sessionRpe,
      });
      if (error) throw error;
      /* The rebuild travels with the insert. A queue of bare inserts would
         replay the row and leave the readiness score derived from a day that
         no longer matches it — and nothing about that looks wrong. */
      await recomputeDailyLog(w.userId, localDateStr(new Date(w.dateTime)));
      return;
    }
    case 'weight': {
      const { error } = await supabase.from('weight_logs').insert({
        user_id: w.userId,
        weight_kg: w.kg,
        date: w.date,
      });
      if (error) throw error;
      return;
    }
  }
}

/**
 * Teach the client how to finish what it started.
 *
 * Called once, before the persisted cache is restored. Without this a paused
 * mutation comes back from storage with its variables intact and no function to
 * hand them to, and React Query drops it — which is indistinguishable, from the
 * outside, from the write never having been made.
 *
 * `retry` matters more than it looks. A mutation that begins while *online* and
 * loses the connection mid-flight only enters the paused state if it has
 * retries left; with `retry: 0` it fails outright and is gone. Walking out of
 * signal range mid-request is the exact situation this is for.
 */
export function registerOfflineWrites(client: QueryClient): void {
  client.setMutationDefaults([...OFFLINE_WRITE_KEY], {
    mutationFn: (variables: unknown) => applyOfflineWrite(variables as OfflineWrite),
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
  });
}
