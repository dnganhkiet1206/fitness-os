-- Exercise Intelligence V1 — what kind of movement each exercise is.
--
-- ── why a column and not an inference ──
--
-- The trend engine reads a different number depending on the movement: an
-- estimated one-rep-max for a squat, tonnage for a curl, body-plus-belt for a
-- pull-up, seconds for a plank. `src/lib/exercise-kind.ts` can infer the last
-- two from the sets themselves — a movement mostly done at no external load is
-- bodyweight work, a set with a duration and no reps is a hold — but nothing in
-- a column of numbers distinguishes a curl from a row, and guessing decides
-- whether a one-rep-max estimate gets computed for a movement. That is a number
-- shown or withheld on the strength of a guess.
--
-- So where somebody has said what a movement is, that wins.
--
-- ── why it is nullable ──
--
-- Most logged sets carry no exercise id at all: `day-plan.tsx` writes
-- `exerciseId: ''` for every set it saves, and `log-workout.tsx` fills one in
-- only when a row was picked out of the library rather than typed. NULL is the
-- ordinary case, it means "nobody has said", and the engine infers. A default
-- would be a claim about every exercise ever created.

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS exercise_kind TEXT;

-- The four the engine knows how to run. A fifth would silently fall through to
-- inference, so it is refused at the door instead.
ALTER TABLE public.exercises
  DROP CONSTRAINT IF EXISTS exercises_exercise_kind_check;
ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_exercise_kind_check
  CHECK (exercise_kind IS NULL OR exercise_kind IN ('compound', 'isolation', 'bodyweight', 'timed'));

-- The seeded library, which is the only set of rows this migration can speak
-- for. A user's own exercises are left NULL: nobody has said what they are, and
-- filling that in from the name would be the guess this column exists to avoid.
--
-- `user_id IS NULL` is what marks a seeded row — see the RLS policy on this
-- table, which is what "shared exercises" means here.
UPDATE public.exercises SET exercise_kind = 'bodyweight'
  WHERE user_id IS NULL AND equipment = 'Bodyweight' AND exercise_kind IS NULL;

-- Exactly the rows the seed migration inserts, and no others. The first draft
-- also named Lateral Raise, Triceps Extension, Leg Curl, Leg Extension and
-- Cable Fly, none of which exist in this database — statements that read as
-- coverage and update nothing — while missing Lat Pulldown and Romanian
-- Deadlift, which do exist and would have been left with no kind at all.
UPDATE public.exercises SET exercise_kind = 'compound'
  WHERE user_id IS NULL AND exercise_kind IS NULL
    AND name IN ('Barbell Squat', 'Bench Press', 'Deadlift', 'Overhead Press',
                 'Barbell Row', 'Leg Press', 'Lat Pulldown', 'Romanian Deadlift');

UPDATE public.exercises SET exercise_kind = 'isolation'
  WHERE user_id IS NULL AND exercise_kind IS NULL
    AND name IN ('Dumbbell Curl');
