import { recomputeDailyLog } from '@/lib/daily-log-service';
import { touchedDays, type SyncedDaysInput } from '@/lib/health-days';
import { supabase } from '@/integrations/supabase/client';

/**
 * Everything a health sync writes to `daily_logs`, and the order it must happen in.
 *
 * ── why this is a file and not the tail of the hook (BUG-105) ──
 *
 * The same reason `step-days.ts` and `health-days.ts` sit apart from
 * `use-health-sync`: the hook imports React, `AppState` and the HealthKit
 * module, so nothing in it can be loaded in Node — and this is exactly the kind
 * of rule that is wrong in a way reading it does not reveal.
 * `tools/workout-sync-integrity.mjs` runs the function below against a real
 * PostgreSQL cluster with the health-column writes forced to fail, which is the
 * only way to prove the ordering rather than assert it.
 *
 * ── the bug this exists for ──
 *
 * The sync wrote `workout_sessions` first, then two `daily_logs` upserts for
 * its own columns, each `if (error) throw error`, and only then the recompute
 * loop. So a failure in either health-column write — an RLS refusal, a dropped
 * connection on the Nth request of the sequence, a constraint — threw **after
 * the workout rows were already on the server** and **before** anything rebuilt
 * their days.
 *
 * The two proxies the app uses for *"did this person work out?"* then disagree,
 * permanently. Measured on PostgreSQL 16.13 with a workout nine days old:
 *
 *     bảng workout_sessions : 1
 *     daily_logs.workout_count : null
 *     chuỗi ngày tính ngày này : không
 *
 * And nothing repairs it: `getRecentWorkouts()` imports **seven days**, so on
 * the next sync that workout is no longer in the import list, `touchedDays`
 * never names its day again, and the day stays missing from the streak for
 * ever — while `useCheckAwards`, the weekly challenges and the assistant's
 * `daysSinceWorkout`, which count `workout_sessions` rows directly, all say the
 * workout happened.
 *
 * ── the two rules ──
 *
 * **A health-column failure cannot cancel the rebuild.** `steps`,
 * `active_kcal` and `active_minutes` belong to the sync; whether they landed
 * has nothing to do with whether a workout happened. The failure is *kept*, not
 * dropped, and re-thrown at the end — the same shape `use-extras` uses for the
 * weekly challenges, where one bad row must not take four good ones with it and
 * the error is still reported afterwards.
 *
 * **One failed day does not take the other days with it.** Each rebuild is its
 * own sequence of reads plus one compare-and-set against a single
 * `(user_id, date)` row, with no shared transaction — so day A failing says
 * nothing about day B. Chain S's per-day CAS guarantee is untouched by
 * rebuilding them independently.
 *
 * What this deliberately does **not** do is stop failing. Everything
 * recoverable is recovered first, and then anything still broken is thrown, so
 * the mutation's `onError` still fires and the person is still told.
 */
export interface HealthSyncWrite extends SyncedDaysInput {
  userId: string;
  /** local date string for the day the sync ran */
  today: string;
  /** only the columns Health actually answered; empty when it answered none */
  measured: { steps?: number; active_kcal?: number; active_minutes?: number };
  /** finished days from `dailyStepsFrom`; never includes today */
  stepDays: readonly { date: string; steps: number }[];
}

export async function writeHealthSync(input: HealthSyncWrite): Promise<void> {
  const { userId, today, measured, stepDays } = input;
  const failures: string[] = [];

  /*
  ── one statement, because the three it replaces could not be made safe ──

  This was: `select('id').maybeSingle()`, then `update` if a row came
     back, `insert` if one did not. Four faults in eight lines, and the
     database already had a verb that has none of them.

  1. **A failed lookup was read as "there is no row."** The `error` was
     destructured away, so a dropped connection, a timeout or an RLS
     refusal all arrived as `existing === undefined` — and the branch that
     takes is `insert`, against a table carrying `UNIQUE (user_id, date)`.
     The insert is then refused for a reason that has nothing to do with
     the truth, and the day's steps are gone. Exactly the class Chain A
     found in the offline weight replay.

  2. **Neither write was checked either.** Three statements, zero of them
     reporting. The mutation went on to `onSuccess` and showed
     *"Đã đồng bộ"* over a day nothing had been written to.

  3. **Read-then-write is a race with itself.** There are three live sync
     mutations — the auto one, Today's, and the Health card's — and two
     can be in flight at once. Both select, both find nothing, both
     insert; one wins and one hits the unique constraint. The losing one
     is the silent failure in (2).

  4. And `update(...).eq('id', existing.id)` names a row by an id read a
     round trip earlier, which is the shape that goes wrong the day
     anything else can delete a day's row.

  `upsert` on the natural key answers all four: one statement, no read,
     no id, no window between them, and the conflict is resolved by the
     database rather than by a guess. It writes only the columns named in
     the payload, so the "one writer per column" rule this comment block
     already relies on is untouched — `recomputeDailyLog` keeps its own
     list and neither can wipe the other's.
  */
  if (Object.keys(measured).length > 0) {
    const { error } = await supabase
      .from('daily_logs')
      .upsert({ user_id: userId, date: today, ...measured }, { onConflict: 'user_id,date' });
    if (error) {
      console.warn('health sync (today):', error.message);
      failures.push('hôm nay');
    }
  }

  if (stepDays.length > 0) {
    const { error } = await supabase.from('daily_logs').upsert(
      stepDays.map((d) => ({ user_id: userId, date: d.date, steps: d.steps })),
      { onConflict: 'user_id,date' },
    );
    if (error) {
      console.warn('health sync (step backfill):', error.message);
      failures.push('bù bước chân');
    }
  }

  /* Sorted oldest-first by `touchedDays`, so the day a person is most likely to
     be looking at is rebuilt last and wins any race with itself. */
  for (const day of touchedDays(input, today)) {
    try {
      await recomputeDailyLog(userId, day);
    } catch (e) {
      console.warn(`health sync (rebuild ${day}):`, (e as Error).message);
      failures.push(`dựng lại ${day}`);
    }
  }

  /*
    ── the parts that failed, without the words PostgreSQL chose ──

    These lines used to be `${error.message}`, so the aggregate carried strings
    like *duplicate key value violates unique constraint
    "daily_logs_user_id_date_key"* — and because this is an `Error` the app
    constructed rather than one Supabase threw, `error-copy.ts` correctly reads
    it as a sentence written for a person and shows it verbatim. That is the one
    way raw SQL could still reach a toast after the boundary went in.

    What a reader can use is *which part* did not land, so that is what is kept.
    The underlying message is still worth having for whoever is debugging, and
    it goes to the console rather than to the person holding the phone.
  */
  if (failures.length > 0) {
    throw new Error(`Đồng bộ sức khoẻ chưa xong — ${failures.join('; ')}`);
  }
}
