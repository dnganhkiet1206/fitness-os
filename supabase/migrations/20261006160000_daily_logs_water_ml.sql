-- Aggregate water into the daily log (P2-16).
--
-- `water_logs` holds every glass, but `daily_logs` — the table the dashboard,
-- the weekly review and the coach all read — never carried a water column, so
-- the most-logged habit in the app had no trend anywhere. This adds the
-- column; `recomputeDailyLog` fills it from `water_logs.amount_ml`.

ALTER TABLE public.daily_logs
  ADD COLUMN water_ml NUMERIC DEFAULT 0;
