-- Two different HRV metrics were being stored in one column, and the readiness
-- score weights that column at 30%.
--
-- ── what was happening ──
--
-- `native/src/lib/health.ts` reads Apple's
-- `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` and writes the result into
-- `biometric_samples.hrv_rmssd_ms`. The manual entry screen
-- (`log-biometrics.tsx`) writes the *same* column from a field labelled
-- "HRV RMSSD (ms)".
--
-- SDNN and RMSSD are not the same quantity and do not convert into each other.
-- SDNN over a short recording is the spread of the whole beat-to-beat series;
-- RMSSD is the beat-to-beat difference, and it is the one most consumer straps
-- report. For one person at one moment the two numbers differ substantially.
-- Apple publishes only SDNN through HealthKit, so anybody who both syncs their
-- Watch and has ever typed a reading from another device has a column holding
-- two incompatible series.
--
-- ── why it matters more than a mislabelled field ──
--
-- `daily-log-service.ts:142` builds `hrv_history_28d` from every value in that
-- column regardless of where it came from, and `readiness-engine.ts` scores
-- today's HRV as a robust z-score against that baseline — weighted 0.30, the
-- largest single term in the score.
--
-- A baseline built from two different metrics is bimodal, which inflates its
-- MAD and flattens the z-score toward zero, so real changes in recovery stop
-- moving the number. Worse, the day somebody switches from typing readings to
-- syncing their Watch, their readiness jumps or drops for a reason that has
-- nothing to do with their body.
--
-- ── the fix ──
--
-- One column per metric. The backfill moves the Apple-sourced rows into the
-- column that describes what they actually are; rows from any other source are
-- left where they are, because those are the ones somebody typed into a field
-- labelled RMSSD.
ALTER TABLE public.biometric_samples
  ADD COLUMN IF NOT EXISTS hrv_sdnn_ms numeric;

COMMENT ON COLUMN public.biometric_samples.hrv_sdnn_ms IS
  'HRV as SDNN, in ms. What Apple HealthKit publishes. Never mix with hrv_rmssd_ms in one baseline.';
COMMENT ON COLUMN public.biometric_samples.hrv_rmssd_ms IS
  'HRV as RMSSD, in ms. Manual entry and straps that report RMSSD. Never mix with hrv_sdnn_ms in one baseline.';

UPDATE public.biometric_samples
   SET hrv_sdnn_ms = hrv_rmssd_ms,
       hrv_rmssd_ms = NULL
 WHERE source = 'apple_health'
   AND hrv_rmssd_ms IS NOT NULL;

-- ── where a row came from, and whether we have already imported it ──
--
-- Sleep and workouts are about to arrive from HealthKit alongside rows people
-- entered by hand, and a sync that runs twice must not produce two of
-- everything. `external_id` is the identifier the source gives the record —
-- HealthKit's sample UUID — so re-importing is a no-op rather than a duplicate.
--
-- Partial unique indexes: the constraint applies only to rows that came from
-- somewhere with an id of its own. Hand-entered rows all have NULL there and
-- must stay free to repeat, because two naps in one day are two real rows.
ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_id text;

-- ── time in bed is not time asleep ──
--
-- `daily-log-service.ts:127` computes the night's length as `waketime -
-- bedtime`, which is the only thing it could do with what the table held.
-- Typed in by hand that is a fair approximation: people report the hours they
-- were asleep.
--
-- HealthKit is more precise than that, and the precision is the point. It
-- records the awake stretches inside a night, so a person who was in bed nine
-- hours and asleep seven and a half would be credited with nine. Sleep is
-- weighted 0.30 in the readiness score, the same as HRV, so an hour and a half
-- of reading in bed would arrive as recovery.
--
-- NULL for hand-entered rows, which keeps the existing computation for them
-- exactly as it was.
ALTER TABLE public.sleep_logs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS asleep_min integer;

COMMENT ON COLUMN public.sleep_logs.asleep_min IS
  'Minutes actually asleep, excluding awake and in-bed stages. NULL when unknown, in which case waketime - bedtime is the best available answer.';

CREATE UNIQUE INDEX IF NOT EXISTS workout_sessions_external_uidx
  ON public.workout_sessions (user_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sleep_logs_external_uidx
  ON public.sleep_logs (user_id, external_id)
  WHERE external_id IS NOT NULL;

COMMENT ON COLUMN public.workout_sessions.source IS
  'manual | apple_health. Apple sessions carry no sets and volume_load 0, so they raise workout_count without touching ACWR.';
COMMENT ON COLUMN public.sleep_logs.source IS
  'manual | apple_health.';
