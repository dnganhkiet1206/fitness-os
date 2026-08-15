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
 *
 * **Ticking a supplement is also not here, and that is a decision rather than
 * an omission.** It looks like the easiest one on the list — a single insert —
 * and it is the only one that is two-way. `useToggleSupplement` inserts on tick
 * and deletes on un-tick, and a queue holding only the insert gets the common
 * offline sequence exactly backwards: tick, notice the mistake, un-tick, and
 * the delete finds no row to remove while the insert replays regardless. The
 * pill ends up marked as taken because the person changed their mind about it.
 *
 * Queuing it properly means queuing the un-tick too, against a row whose id
 * does not exist yet. That is a real design, not a line of code, and half of it
 * is worse than none: the current behaviour fails visibly offline, which is
 * recoverable, where the half-built one would silently record something untrue.
 */

/**
 * ── every operation carries its own clock ──
 *
 * Not one of these lets the database stamp the time. `meal_entries.date_time`
 * defaults to `now()`, which is correct to the millisecond when the insert
 * happens as you tap and wrong by however long the queue waited when it does
 * not. Breakfast logged at eight in a basement, replayed at six in the evening,
 * arrives as dinner — and replayed after midnight it arrives on the wrong day,
 * where `recomputeDailyLog` then rebuilds a day the meal was never part of.
 *
 * So the moment is captured where it is known, at the tap, and travels with the
 * intention. Same reason `date` is a string here rather than something derived
 * on the other side: `localDateStr` on the replaying device would answer for
 * the replay day, not the logged one.
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
  | { kind: 'weight'; userId: string; kg: number; date: string }
  | {
      kind: 'meal';
      userId: string;
      /*
        Minted on this side, before the row exists anywhere.

        The online path inserts the entry, reads the id back with
        `.select('id').single()`, and uses it for the item rows. There is no id
        to read back when the write has not happened yet — and a queue that
        replayed "insert entry, then insert items" as two independent
        intentions would lose the link between them entirely.

        `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` takes a supplied value
        happily; the default only applies when the column is omitted. Minting it
        here also makes the whole operation idempotent by primary key, which a
        server-generated id could never be.
      */
      entryId: string;
      dateTime: string;
      mealType: string;
      totals: { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };
      items: {
        food_item_id: string | null;
        food_name: string;
        servings: number;
        kcal: number;
        protein_g: number;
        carbs_g: number;
        fat_g: number;
        fiber_g: number;
      }[];
    }
  | {
      kind: 'biometrics';
      userId: string;
      dateTime: string;
      hrBpm: number | null;
      hrvSdnnMs: number | null;
      hrvRmssdMs: number | null;
      spo2Pct: number | null;
      respRateRpm: number | null;
      vo2maxMlkgmin: number | null;
    };

/** The one key every durable write is filed under. */
export const OFFLINE_WRITE_KEY = ['offline-write'] as const;

/**
 * Rebuild the day a replayed write belongs to, without letting a failed rebuild
 * undo a write that already landed.
 *
 * ── why this one place swallows, when nothing else does ──
 *
 * `recomputeDailyLog` throws now: a day that cannot be rebuilt must say so
 * rather than leave a quiet wrong number in the table every other feature reads.
 * Everywhere in the app that is right, because the caller is a live mutation
 * with an `onError` and the person is holding the phone.
 *
 * Here it is not. By the time this runs, the insert above has **already
 * succeeded** on the server. Letting the rebuild's failure reject
 * `applyOfflineWrite` marks the whole queued write as failed — and the only
 * repair for a failed queued write is to run it again, which would insert the
 * meal a second time. A duplicated meal is worse than a day that is briefly
 * behind: one is wrong data the person has to find and delete, the other
 * corrects itself the next time anything writes to that day.
 *
 * So the failure is recorded and the write is allowed to stand. This is the
 * only call site in the app that does that, and this comment is the reason.
 */
async function rebuildAfterReplay(userId: string, date: string) {
  try {
    await recomputeDailyLog(userId, date);
  } catch (e) {
    console.error('offline replay: day not rebuilt —', (e as Error).message);
  }
}

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
      await rebuildAfterReplay(w.userId, localDateStr(new Date(w.dateTime)));
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
    case 'meal': {
      /* The entry first, with the id minted at the tap, then its items against
         that id. Two statements, one intention — which is exactly why the queue
         carries named operations and not rows: replaying these as two
         independent inserts would put an entry with no food in it on somebody's
         day, and it would look like a bug in the meal screen. */
      const { error } = await supabase.from('meal_entries').insert({
        id: w.entryId,
        user_id: w.userId,
        date_time: w.dateTime,
        meal_type: w.mealType,
        total_kcal: w.totals.kcal,
        total_protein_g: w.totals.protein_g,
        total_carbs_g: w.totals.carbs_g,
        total_fat_g: w.totals.fat_g,
        total_fiber_g: w.totals.fiber_g,
      });
      if (error) throw error;

      const { error: itemsErr } = await supabase
        .from('meal_entry_items')
        .insert(w.items.map((it) => ({ ...it, meal_entry_id: w.entryId })));
      if (itemsErr) throw itemsErr;

      /* The day the food was eaten, not the day the queue drained. */
      await rebuildAfterReplay(w.userId, localDateStr(new Date(w.dateTime)));
      return;
    }
    case 'biometrics': {
      const { error } = await supabase.from('biometric_samples').insert({
        user_id: w.userId,
        source: 'manual',
        confidence: 0.7,
        date_time: w.dateTime,
        hr_bpm: w.hrBpm,
        hrv_sdnn_ms: w.hrvSdnnMs,
        hrv_rmssd_ms: w.hrvRmssdMs,
        spo2_pct: w.spo2Pct,
        resp_rate_rpm: w.respRateRpm,
        vo2max_mlkgmin: w.vo2maxMlkgmin,
      });
      if (error) throw error;
      /* HRV is the readiness score's largest term. A reading that arrives
         without rebuilding its day is a reading the score never sees. */
      await rebuildAfterReplay(w.userId, localDateStr(new Date(w.dateTime)));
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
    /*
      ── the refresh has to be a default too ──

      Every call site declares its own `onSuccess` to invalidate what it
      changed, and every one of those is lost the moment the app restarts.
      TanStack's persistence guide is explicit about why: *"When persisting to
      an external storage, only the state of mutations is persisted, as
      functions cannot be serialized."* That is the same sentence that makes
      `mutationFn` a default here — it applies to the callbacks equally, and it
      is easy to fix one and forget the other.

      What that looks like without this: a meal logged in a basement, the app
      killed, opened again the next morning. The write resumes and lands
      correctly on the server. Nothing on screen moves, because the component
      that would have invalidated the day's totals no longer exists and never
      did in this process. `staleTime` is a minute, so a mounted query usually
      refetches and covers it — but only if the refetch happens *after* the
      write, and on a cold start the two race. Lose that race and the person is
      looking at a day that is missing the meal they can see in their history.

      Invalidating everything rather than a list of keys. This runs only when a
      queued write actually lands, which is rare, and only *active* queries
      refetch — the rest are simply marked stale. A hand-written key list would
      be the cheaper version and would go out of date the first time an
      operation is added to the union above, silently, in the one code path
      nobody exercises by hand.

      `onSettled` rather than `onSuccess` so a write that finally gives up also
      refreshes. A resumed mutation that exhausts its retries has changed
      nothing on the server, and the screen should be showing what the server
      says rather than whatever it was hoping for.
    */
    onSettled: () => {
      void client.invalidateQueries();
    },
  });
}
