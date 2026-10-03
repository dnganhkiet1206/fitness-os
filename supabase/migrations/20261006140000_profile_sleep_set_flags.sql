-- Distinguish "the user chose this bedtime" from "the DB default".
--
-- `sleep_target_bedtime` / `sleep_target_waketime` default to '23:00' / '07:00',
-- and onboarding never asks for them — so every profile looked like somebody
-- who goes to bed at 23:00. The reminders screen then printed "Koa noticed you
-- go to bed at 23:00", inventing a habit the user never stated.
--
-- These flags are set only when the user actually saves the times in
-- edit-profile. The reminders screen gates its suggestions on them.

ALTER TABLE public.profiles
  ADD COLUMN sleep_target_bedtime_set BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN sleep_target_waketime_set BOOLEAN NOT NULL DEFAULT false;
