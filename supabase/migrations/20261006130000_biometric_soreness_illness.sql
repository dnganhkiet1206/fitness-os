-- Morning check-in: soreness + illness for the readiness engine.
--
-- `readiness-engine.ts` has always had three branches for these — soreness > 6
-- shaves the load score, illness caps the total at 35, pain >= 7 caps it at 45 —
-- but `daily-log-service.ts` hardcoded `soreness_today: undefined`,
-- `illness_flag: false`, `pain_flag_max: undefined`, so no user could ever
-- reach them. Somebody with the flu could get a green readiness score.
--
-- These two columns let the morning biometric check-in ask (optionally) and
-- feed the branches that were already there.

ALTER TABLE public.biometric_samples
  ADD COLUMN soreness_1_10 NUMERIC,
  ADD COLUMN illness_flag BOOLEAN NOT NULL DEFAULT false;
