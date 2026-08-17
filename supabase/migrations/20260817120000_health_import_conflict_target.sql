-- The Apple Health sleep and workout import has never written a single row.
--
-- ── measured, not reasoned ──
--
-- Reproduced on PostgreSQL 16.13 built from the DDL in this directory. The
-- statement the app sends — PostgREST's rendering of
-- `.upsert(…, { onConflict: 'user_id,external_id' })` — is:
--
--     INSERT INTO public.sleep_logs (…)
--     VALUES (…)
--     ON CONFLICT (user_id, external_id) DO UPDATE SET …;
--
--     ERROR:  there is no unique or exclusion constraint matching the
--             ON CONFLICT specification
--
-- The only unique index on those columns is the **partial** one added by
-- `20260809120000_health_provenance.sql`:
--
--     CREATE UNIQUE INDEX sleep_logs_external_uidx
--       ON public.sleep_logs (user_id, external_id)
--       WHERE external_id IS NOT NULL;
--
-- Postgres will only infer a partial index as an ON CONFLICT arbiter when the
-- statement repeats a predicate that implies the index's own — written out in
-- full it succeeds:
--
--     ON CONFLICT (user_id, external_id) WHERE external_id IS NOT NULL DO …
--
-- and PostgREST's `on_conflict` parameter takes a **column list only**. There is
-- no way to send the predicate. So the arbiter can never be inferred, and every
-- one of these upserts fails, every time, for every user.
--
-- ── why nobody saw it ──
--
-- Neither call site checked its error. `use-health-sync.ts` awaited the upsert
-- and dropped the result, so the failure never became a rejected promise, never
-- reached `onError`, and never stopped the run: the sync went on to report
-- success and show "Đã đồng bộ".
--
-- The feature this migration's predecessor was written for — *"a sync that runs
-- twice must not produce two of everything"* — therefore produced none of
-- everything. Sleep from the Watch, the readiness score's 0.30-weighted term
-- with a source at last; workouts from the Watch, which `daysSinceWorkout` and
-- `workout_count` were both answering "no" to. Both landed nowhere.
--
-- ── the fix, and why a plain constraint keeps the old semantics exactly ──
--
-- The partial index was chosen so that hand-entered rows, which carry
-- `external_id IS NULL`, stay free to repeat — two naps in one day are two real
-- rows. A plain `UNIQUE (user_id, external_id)` keeps that property, because
-- Postgres treats NULLs as distinct in a unique index by default (`NULLS
-- DISTINCT`): any number of rows may hold NULL there.
--
-- Verified on the same instance, in one run:
--
--     partial index  + bare ON CONFLICT      → ERROR 42P10
--     plain UNIQUE   + bare ON CONFLICT      → INSERT 0 1, then INSERT 0 1
--                                              leaving ONE row, updated
--     plain UNIQUE   + two NULL external_id  → INSERT 0 2, both kept
--
-- so the constraint that can actually be inferred is also the constraint that
-- preserves what the partial one was for.
--
-- `tools/health-sync.mjs` now fails the build on any `onConflict` in the app
-- whose columns are not covered by a NON-partial unique constraint, so this
-- class cannot come back by writing a partial index somewhere new.

ALTER TABLE public.sleep_logs DROP CONSTRAINT IF EXISTS sleep_logs_user_external_key;
DROP INDEX IF EXISTS public.sleep_logs_external_uidx;
ALTER TABLE public.sleep_logs
  ADD CONSTRAINT sleep_logs_user_external_key UNIQUE (user_id, external_id);

ALTER TABLE public.workout_sessions DROP CONSTRAINT IF EXISTS workout_sessions_user_external_key;
DROP INDEX IF EXISTS public.workout_sessions_external_uidx;
ALTER TABLE public.workout_sessions
  ADD CONSTRAINT workout_sessions_user_external_key UNIQUE (user_id, external_id);

-- ── and the third table the same sync writes, which never got provenance ──
--
-- `20260809120000_health_provenance.sql` gave `sleep_logs` and
-- `workout_sessions` an `external_id` so a repeated import would be a no-op. It
-- did not give one to `biometric_samples`, which the same sync also writes — and
-- that write is a bare `.insert()` with no identity of any kind.
--
-- `useAutoHealthSync` runs on every foreground, throttled to fifteen minutes. So
-- an ordinary day of picking the phone up inserts dozens of rows carrying the
-- *same* two readings: Apple computes resting heart rate once a day, and HRV
-- SDNN a handful of times. Nothing about them changes between syncs.
--
-- What that costs is not storage. `daily-log-service.ts` builds
-- `hrv_history_28d` from every row in the window and `readiness-engine.ts`
-- scores today against it as a robust z-score, weighted 0.30 — the largest
-- single term. A baseline made mostly of one repeated value has almost no
-- median absolute deviation, and a small MAD is a divisor: it turns ordinary
-- day-to-day variation into extreme z-scores. The same duplication reaches
-- `rhr_history_28d`.
--
-- Same shape as its two neighbours, so the same answer: an id from the source,
-- and a constraint that can actually be inferred.
ALTER TABLE public.biometric_samples
  ADD COLUMN IF NOT EXISTS external_id text;

COMMENT ON COLUMN public.biometric_samples.external_id IS
  'Identity of the reading at its source — HealthKit sample uuid. NULL for rows a person typed, which stay free to repeat.';

ALTER TABLE public.biometric_samples DROP CONSTRAINT IF EXISTS biometric_samples_user_external_key;
ALTER TABLE public.biometric_samples
  ADD CONSTRAINT biometric_samples_user_external_key UNIQUE (user_id, external_id);
