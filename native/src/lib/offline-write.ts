import type { QueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { recomputeDailyLog } from '@/lib/daily-log-service';
import { biometricRowToReplace, sleepRowToReplace } from './same-day-entry';
import { localDateStr } from '@/lib/local-date';
import { syncProfileWeight } from '@/lib/weight-sync';

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
/**
 * ── and its own primary key, minted at the tap ──
 *
 * Every write here that is an `INSERT` carries `rowId`: the value the row's
 * `id` column will take, chosen on this device before the row exists anywhere.
 *
 * It is what makes a replay safe. A queued write is retried whenever the
 * request fails — and "the request failed" includes the case where the server
 * committed the row and the reply never arrived, which is the ordinary shape of
 * walking out of signal range. Measured on PostgreSQL 16.13 with the app's own
 * statements, replaying once produced **two** rows for water, workouts, sleep
 * and biometrics: one 250 ml tap became 500 ml, one session was counted twice
 * by volume load, ACWR, readiness and the streak, and one night was slept
 * twice.
 *
 * `weight` and `measurement` are the two that were already safe, because both
 * upsert on a natural key (`user_id,date`). The other five had nothing, and the
 * meal was the worst of them — see `entryId`.
 *
 * `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` takes a supplied value
 * happily; the default only applies when the column is omitted. So no migration
 * is involved: the key already exists, it was simply being left to the server,
 * where it can never be the same twice.
 *
 * Required rather than optional, so a new call site cannot forget it and lose
 * the property silently — the one failure mode this whole file is written
 * against.
 */
export type OfflineWrite =
  | {
      kind: 'water';
      userId: string;
      rowId: string;
      amountMl: number;
      date: string;
      at: string;
    }
  | {
      kind: 'workout';
      userId: string;
      rowId: string;
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
        /* Minted at the tap like `entryId`, and for the same reason one level
           down: without it a replay that reaches the items statement inserts a
           second copy of every food. */
        id: string;
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
      rowId: string;
      dateTime: string;
      hrBpm: number | null;
      hrvSdnnMs: number | null;
      hrvRmssdMs: number | null;
      spo2Pct: number | null;
      respRateRpm: number | null;
      vo2maxMlkgmin: number | null;
    }
  | {
      /*
        Sleep and measurements were the last two day-affecting writes with no
        durable path. Both hung for ever when fired offline and were dropped on
        the next launch — the same failure `workout` and `weight` had, which is
        why those two are directly above.
      */
      kind: 'sleep';
      userId: string;
      rowId: string;
      bedtime: string;
      waketime: string;
      quality: number;
      deepMin: number;
      remMin: number;
      lightMin: number;
    }
  | {
      kind: 'measurement';
      userId: string;
      /* `YYYY-MM-DD`, and it is the conflict target — replaying twice updates
         the same row rather than making a second one for the same day. */
      date: string;
      fields: Record<string, number | null>;
    };

/** The one key every durable write is filed under. */
export const OFFLINE_WRITE_KEY = ['offline-write'] as const;

/**
 * `INSERT … ON CONFLICT (id) DO NOTHING`, which is what a replay needs.
 *
 * The row already carries the id this device chose, so a conflict on it can
 * only mean *this exact write already landed* — never somebody else's row, and
 * never a different write of ours. Doing nothing is then the correct answer,
 * and it is the difference between a retry being a no-op and a retry being a
 * second workout.
 *
 * `ignoreDuplicates` rather than an update, because these are records of things
 * that happened rather than settings: the second copy of an event carries no
 * new information, and overwriting would let a stale queued copy clobber an
 * edit made since. (`weight` and `measurement` are the two that genuinely are
 * corrections, and both deliberately upsert on their natural key instead.)
 *
 * RLS is untouched by this. `ON CONFLICT DO NOTHING` is still an INSERT, so the
 * `WITH CHECK (auth.uid() = user_id)` policy fires exactly as before — measured
 * on PostgreSQL 16.13: all seven operations replayed under a second account are
 * refused with 42501.
 */
const IDEMPOTENT = { onConflict: 'id', ignoreDuplicates: true } as const;

/**
 * A queued write reached a session that is not the one that made it.
 *
 * Its own class rather than a message, for the same reason
 * `DailyLogRebuildError` is one: `permanentFailure` has to decide on it, and a
 * decision keyed on the wording of a string breaks the first time somebody
 * rewords the string — silently, in the direction of sending one account's
 * writes under another account's token four times before giving up.
 */
export class WrongAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WrongAccountError';
  }
}

/**
 * A queued record this build cannot execute.
 *
 * ── the two things that used to happen instead ──
 *
 * The queue is written by one build of the app and replayed by whichever build
 * is installed when the signal comes back. Those are not always the same build:
 * a TestFlight rollback, a phone restored from a backup, or simply a `kind` that
 * existed for a release and was renamed.
 *
 * **A kind this build has never heard of reported success.** The `switch` below
 * is exhaustive over the union, so TypeScript is satisfied and there was no
 * `default`. A persisted `kind` outside the union therefore fell out of the
 * bottom, `applyOfflineWrite` returned `undefined`, and React Query marked the
 * mutation **resolved**. Driven through the real client with the real
 * registration:
 *
 *     kind: 'telepathy'  →  status: success, statements sent: 0
 *
 * The person's write was destroyed and the app recorded it as done. That is the
 * worst available outcome: a loud failure would at least have left the write in
 * the queue to try again.
 *
 * **And a structurally broken record was retried as weather.** `variables`
 * missing, `null`, or a string all reach the body and throw a `TypeError`,
 * which `permanentFailure` did not recognise — so a record that can never
 * execute was sent three more times over seven seconds of backoff, holding the
 * serialised queue behind it while it waited.
 *
 * Both are the same gap: nothing distinguished *"this failed"* from *"this can
 * never run"*.
 */
export class UnusableWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnusableWriteError';
  }
}

/** Every `kind` this build knows how to replay. */
const KNOWN_KINDS = [
  'water', 'workout', 'weight', 'meal', 'sleep', 'measurement', 'biometrics',
] as const;

/**
 * Is this thing off the disk a write this build can perform?
 *
 * Deliberately shallow: it checks the two fields every branch below depends on
 * before it can do anything at all — who it belongs to, and what it is. The
 * per-kind fields are not checked here because the database checks them, and
 * `permanentFailure` already reads its refusals (`23502`, `23514`, `22P02`) as
 * permanent. Duplicating the column list here would be a second schema to keep
 * in step with the first.
 */
function unusableReason(w: unknown): string | null {
  if (typeof w !== 'object' || w === null) return `queued record is ${w === null ? 'null' : typeof w}`;
  const rec = w as { kind?: unknown; userId?: unknown };
  if (typeof rec.userId !== 'string' || rec.userId === '') return 'queued record has no userId';
  if (typeof rec.kind !== 'string') return 'queued record has no kind';
  if (!(KNOWN_KINDS as readonly string[]).includes(rec.kind)) {
    return `queued record is a '${rec.kind}', which this build cannot replay`;
  }
  return null;
}

/**
 * Failures that will never succeed no matter how many times they are sent.
 *
 * ── why retrying these is not merely wasteful ──
 *
 * `retry: 3` treated every failure as weather. A queued write refused by RLS —
 * which is what happens the moment it is replayed under a different account —
 * was sent four times over seven seconds of backoff before being dropped, and a
 * row rejected by a check constraint did the same. The retries cannot change
 * the answer; all they do is delay the point at which the write is discarded,
 * while holding the rest of the queue behind them.
 *
 * The codes are PostgREST's, forwarded from PostgreSQL:
 *
 *   · `42501` — row-level security refused the row. Permanent for this session.
 *   · `23505` — unique violation. With `IDEMPOTENT` above this should no longer
 *     occur for our own replays, and if it does it means a genuinely different
 *     row is already there.
 *   · `23503` — foreign key. The thing it points at does not exist.
 *   · `23514` / `23502` — check constraint, not-null. The values are wrong.
 *   · `22P02` / `22007` — malformed input. A queued write from an older app
 *     version whose shape no longer parses lands here.
 *   · `PGRST…` — PostgREST's own schema-level refusals (unknown column,
 *     unusable conflict target). A schema drift, not a network blip.
 *
 * Everything else — no response at all, a 5xx, a timeout — is weather, and is
 * exactly what the retries exist for.
 */
export function permanentFailure(error: unknown): boolean {
  /* A different account will not become the right one by asking again. */
  if (error instanceof WrongAccountError) return true;
  /* Nor will a record this build cannot read become readable by asking again —
     and while it waits, the shared scope holds every write behind it. */
  if (error instanceof UnusableWriteError) return true;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== 'string') return false;
  return (
    code.startsWith('PGRST') ||
    ['42501', '42703', '23505', '23503', '23514', '23502', '22P02', '22007'].includes(code)
  );
}

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
  /*
    ── is this a write at all ──

    First, because everything below reads fields off it, and what arrives here
    came out of JSON written by some build of this app — not necessarily this
    one. See `UnusableWriteError`.
  */
  const unusable = unusableReason(w);
  if (unusable) throw new UnusableWriteError(unusable);

  /*
    ── whose write is this ──

    Every row below carries `user_id: w.userId`, and the database is what
    enforces it: measured on PostgreSQL 16.13, all eight statements replayed
    under a second account are refused with 42501, because every policy is
    `WITH CHECK (auth.uid() = user_id)`. That is the authorization, it is
    server-side, and this check does not replace it.

    What this adds is a refusal with a name. A queued write can only reach the
    wrong session through a bug — signing out clears the mutation cache
    (`clearPersistedCache` calls `queryClient.clear()`, which empties both
    caches) — but "can only happen through a bug" is a description of every bug
    before it happens. Without this the symptom would be a bare 42501 from a
    table nobody is looking at, in a code path that belongs to no screen.

    `getSession()` reads the in-memory session and does not go to the network,
    so this costs nothing on the ordinary path.
  */
  const { data } = await supabase.auth.getSession();
  const signedIn = data.session?.user?.id;
  if (signedIn !== w.userId) {
    throw new WrongAccountError(
      `queued ${w.kind} belongs to ${w.userId}, session is ${signedIn ?? 'signed out'}`,
    );
  }

  switch (w.kind) {
    case 'water': {
      const { error } = await supabase.from('water_logs').upsert(
        {
          id: w.rowId,
          user_id: w.userId,
          amount_ml: w.amountMl,
          date: w.date,
          logged_at: w.at,
        },
        IDEMPOTENT,
      );
      if (error) throw error;
      return;
    }
    case 'workout': {
      const { error } = await supabase.from('workout_sessions').upsert(
        {
          id: w.rowId,
          user_id: w.userId,
          date_time: w.dateTime,
          sets: w.sets as never,
          volume_load: w.volumeLoad,
          template_id: w.templateId,
          template_name: w.templateName,
          session_rpe: w.sessionRpe,
        },
        IDEMPOTENT,
      );
      if (error) throw error;
      /* The rebuild travels with the insert. A queue of bare inserts would
         replay the row and leave the readiness score derived from a day that
         no longer matches it — and nothing about that looks wrong. */
      await rebuildAfterReplay(w.userId, localDateStr(new Date(w.dateTime)));
      return;
    }
    case 'weight': {
      /*
        ── upsert, because the online twin does and the column is unique ──

        This was `.insert()` while `useLogWeight` — the same write, made with
        signal — has always been `.upsert(…, { onConflict: 'user_id,date' })`.
        `weight_logs` carries `UNIQUE (user_id, date)`
        (`20260212044110_….sql:14`), so the two verbs are not two spellings of
        one thing: against a day that already has a row the insert is *rejected*.

        Both ways of reaching that are ordinary:

          · weigh in at breakfast with signal, correct the number later in the
            day without any — the queued correction is refused on reconnect;
          · correct a typo twice while still offline — the first queued write
            lands and the second is refused, so the number that survives is the
            one that was wrong.

        And nothing says so. The write resumes inside `resumePausedMutations`,
        which belongs to no screen, so the rejection is an unhandled mutation
        error and the weigh-in is simply not there. Weight feeds the BMI band,
        the chart's scale and `adaptiveTDEE`'s fourteen-day regression, so the
        surviving wrong number is not inert.

        A replay cannot overwrite a *newer* reading for the same date, because
        there is no way in the app to enter a weight for a past date — the only
        row an upsert here can land on is one for its own day, which is exactly
        the row it is meant to correct.
      */
      const { error } = await supabase.from('weight_logs').upsert(
        {
          user_id: w.userId,
          weight_kg: w.kg,
          date: w.date,
        },
        { onConflict: 'user_id,date' },
      );
      if (error) throw error;
      /* Same rule as the online path: the profile's current weight is what
         every target is computed from, and a weigh-in that only lands in
         `weight_logs` leaves it stale. `syncProfileWeight` carries the date, so
         a queued Tuesday weight replayed on Friday does not overwrite Friday's. */
      await syncProfileWeight(w.userId, w.kg, w.date);
      return;
    }
    case 'meal': {
      /* The entry first, with the id minted at the tap, then its items against
         that id. Two statements, one intention — which is exactly why the queue
         carries named operations and not rows: replaying these as two
         independent inserts would put an entry with no food in it on somebody's
         day, and it would look like a bug in the meal screen. */
      /*
        ── and both statements ignore a duplicate, which is what made this the
        worst of the seven ──

        `entryId` made the *entry* idempotent by primary key, and stopped there.
        The insert still threw on a repeat, and `throw` here means the items
        statement below never runs. Measured on PostgreSQL 16.13 with these two
        statements: server commits the entry, the reply is lost, the queue
        replays, the entry insert fails 23505 — and the day is left holding

            bua_an | mon_trong_bua | kcal_bua_an
                 1 |             0 |         520

        a 520 kcal breakfast with no food in it, permanently, plus a mutation
        that then errors and is dropped. Idempotent by key is not idempotent
        unless the repeat is also *allowed*.
      */
      const { error } = await supabase.from('meal_entries').upsert(
        {
          id: w.entryId,
          user_id: w.userId,
          date_time: w.dateTime,
          meal_type: w.mealType,
          total_kcal: w.totals.kcal,
          total_protein_g: w.totals.protein_g,
          total_carbs_g: w.totals.carbs_g,
          total_fat_g: w.totals.fat_g,
          total_fiber_g: w.totals.fiber_g,
        },
        IDEMPOTENT,
      );
      if (error) throw error;

      const { error: itemsErr } = await supabase
        .from('meal_entry_items')
        .upsert(
          w.items.map((it) => ({ ...it, meal_entry_id: w.entryId })),
          IDEMPOTENT,
        );
      if (itemsErr) throw itemsErr;

      /* The day the food was eaten, not the day the queue drained. */
      await rebuildAfterReplay(w.userId, localDateStr(new Date(w.dateTime)));
      return;
    }
    case 'sleep': {
      /*
        Phát lại một lần ghi cũng đi qua cùng luật "ghi lại là SỬA" như đường
        online — xem `lib/same-day-entry.ts`. Nếu không, một lần ghi soạn lúc
        offline sẽ luôn đẻ ra hàng mới, và người dùng sửa một đêm trong lúc
        mất mạng vẫn nhận về hai hàng cho đêm đó.

        Thay `rowId` bằng id của hàng cần sửa vẫn giữ nguyên tính idempotent
        của phép phát lại: `upsert` theo id, và id ấy cố định cho mỗi lần ghi.
      */
      const replaceId = await sleepRowToReplace(w.userId, w.bedtime, w.waketime);
      const { error } = await supabase.from('sleep_logs').upsert(
        {
          id: replaceId ?? w.rowId,
          user_id: w.userId,
          bedtime: w.bedtime,
          waketime: w.waketime,
          quality: w.quality,
          deep_min: w.deepMin,
          rem_min: w.remMin,
          light_min: w.lightMin,
        },
        IDEMPOTENT,
      );
      if (error) throw error;
      /* Sleep is the readiness score's second-largest term; a night that
         arrives without rebuilding its day is a night the score never sees. */
      await rebuildAfterReplay(w.userId, localDateStr(new Date(w.waketime)));
      return;
    }
    case 'measurement': {
      const { error } = await supabase
        .from('body_measurements')
        .upsert({ user_id: w.userId, date: w.date, ...w.fields }, { onConflict: 'user_id,date' });
      if (error) throw error;
      /* No rebuild: `daily_logs` carries no measurement field, so there is
         nothing about the day for this to change. */
      return;
    }
    case 'biometrics': {
      /*
        Cùng luật, và ở đây không có ca giấc-trưa nào: một bộ số sinh trắc là
        ảnh chụp của buổi sáng hôm đó, nên nhập lại trong ngày là sửa ảnh chụp.
        Hàng thừa không chỉ là một dòng dư — nó làm lệch median và MAD của nền
        28 ngày, tức là nền mà chính điểm HRV/nhịp nghỉ được chấm so với nó.
      */
      const replaceId = await biometricRowToReplace(w.userId, w.dateTime);
      const { error } = await supabase.from('biometric_samples').upsert(
        {
          id: replaceId ?? w.rowId,
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
        },
        IDEMPOTENT,
      );
      if (error) throw error;
      /* HRV is the readiness score's largest term. A reading that arrives
         without rebuilding its day is a reading the score never sees. */
      await rebuildAfterReplay(w.userId, localDateStr(new Date(w.dateTime)));
      return;
    }
  }

  /*
    Unreachable for the union above, and that is exactly why it is here: the
    `switch` is exhaustive over the *types*, and what comes off the disk is not
    typed. Falling out of the bottom used to mean `return undefined`, which
    React Query reads as a completed write. `KNOWN_KINDS` should have caught it
    already; if the two ever disagree, this is the side that refuses.
  */
  throw new UnusableWriteError(
    `queued record is a '${(w as { kind?: string }).kind}', which this build cannot replay`,
  );
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
    /*
      ── one at a time, in the order they were made ──

      `resumePausedMutations` fires every paused mutation inside one
      `Promise.all`, and an unscoped mutation's `canRun` returns `true`
      unconditionally — so the whole queue went to the server at once, and which
      one committed last was whichever the network happened to settle last.

      Two things depend on that order:

        · `weight` and `measurement` upsert on `(user_id, date)`. Correct a typo
          twice while offline and the number that survives is a coin toss —
          which is the same wrong-number-survives outcome the upsert was
          introduced to fix, arriving by a different route.
        · every rebuild here calls `recomputeDailyLog`, which is eleven reads
          followed by one upsert. Two writes for the same day rebuilding at once
          both read before either writes, and the day ends up counting one of
          them. Nothing looks wrong; the totals are simply short until something
          else writes to that day.

      A shared `scope.id` is TanStack's own answer: mutations sharing one run
      serially, in the order they entered the cache. It costs the parallelism,
      which was never worth anything here — this queue is a handful of writes
      draining once.
    */
    scope: { id: 'offline-write' },
    /*
      Weather is worth retrying; a refusal is not. See `permanentFailure`.
      Four attempts at a row RLS will never accept only delays the moment the
      write is discarded, and holds the queue behind it while it waits.
    */
    retry: (failureCount, error) => !permanentFailure(error) && failureCount < 3,
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
