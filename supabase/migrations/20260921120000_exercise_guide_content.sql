-- Guide content that knows what language it is in, and columns that do not
-- change meaning when somebody flips the app to English.
--
-- ── three problems, one migration, because they touch the same ten rows ──
--
-- The Phase 3 inventory of the shared library found:
--
--   1. `form_cues` is a `TEXT[]`. One array holds one language. The app ships
--      two (`AppLang = 'vi' | 'en'`) and the Guide's own headings are
--      translated, so an English user reads "Form cues" above "Vai ép xuống
--      ghế". There is nowhere to put the English.
--   2. `muscle_group` stores a DISPLAY LABEL, and which label depends on the
--      UI language at the moment the row was written: `exercises.tsx` fills
--      its picker from `i18n.muscleChest`, so the same shelf is stored as
--      `Ngực` or `Chest` depending on nothing to do with the exercise. The
--      seed adds a third spelling again (`Bắp tay trước` where the picker says
--      `Tay trước`, `Hamstring` where it says `Chân sau`).
--   3. `equipment` is free text with no vocabulary at all — no picker, no
--      normaliser, no alias map — and the Guide prints it verbatim.
--
-- ── why a relation and not `form_cues_en` ──
--
-- A column per language makes the schema grow sideways for ever, and every
-- reader has to know the full list of languages to ask a question. A row per
-- (exercise, locale) grows downwards, which is what rows are for, and the
-- reader asks for one locale and gets one answer.
--
-- ── what this migration REFUSES to do ──
--
-- It does not touch a single exercise row it cannot name. Production is not
-- visible from where this was written (the build environment cannot reach
-- Supabase), so every UPDATE here matches on an exact, case-folded literal
-- taken from a vocabulary that already exists in the app. A value nobody
-- recognises is LEFT ALONE — a user's `Kettlebell`, `Resistance band`, or a
-- muscle group in a language this app never shipped keeps its exact text. The
-- display layer falls back to printing the stored value, so an unrecognised
-- row looks exactly like it does today.
--
-- To see what was left behind, after running this:
--
--   SELECT muscle_group, count(*) FROM public.exercises
--    WHERE muscle_group <> '' AND muscle_group NOT IN
--      ('chest','back','legs','shoulders','biceps','triceps','abs','glutes',
--       'calves','cardio','back/legs')
--    GROUP BY 1 ORDER BY 2 DESC;
--
--   SELECT equipment, count(*) FROM public.exercises
--    WHERE coalesce(equipment,'') <> '' AND equipment NOT IN
--      ('barbell','bodyweight','cable','dumbbell','machine')
--    GROUP BY 1 ORDER BY 2 DESC;
--
-- Those two lists are the honest answer to "what is still localised in this
-- database", and they cannot be produced from the repository.

-- ═════════════════════════════════════════════════════════════════════════
-- 1 · the content relation
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.exercise_guide_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The exercise definition stays the parent and the identity. This table adds
  -- words to an exercise; it never creates one, and it cannot outlive one.
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,

  -- Exactly the languages the app can render. `AppLang` in `src/lib/i18n.ts`
  -- is `'vi' | 'en'`; a third locale here would be content nobody can read, so
  -- it is refused at the door rather than stored and ignored.
  locale TEXT NOT NULL CHECK (locale IN ('vi', 'en')),

  -- NOT NULL with an empty default, because empty and absent must not both be
  -- expressible. An empty array means "this exercise has no common mistakes
  -- written for it", which is a fact; NULL would be a second way of saying it.
  form_cues TEXT[] NOT NULL DEFAULT '{}',
  common_mistakes TEXT[] NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One row per exercise per language. Two rows would make "which English
  -- content" a question with no answer, and the Guide picks its row by locale
  -- alone.
  UNIQUE (exercise_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_exercise_guide_content_exercise
  ON public.exercise_guide_content (exercise_id);

ALTER TABLE public.exercise_guide_content ENABLE ROW LEVEL SECURITY;

-- Visible exactly when the parent exercise is visible. The rule about who may
-- see an exercise lives on `exercises` (shared rows have `user_id IS NULL`),
-- and repeating it here in a different shape is how the two drift apart.
DROP POLICY IF EXISTS "Users can view guide content for visible exercises"
  ON public.exercise_guide_content;
CREATE POLICY "Users can view guide content for visible exercises"
  ON public.exercise_guide_content FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.exercises e
     WHERE e.id = exercise_id
       AND (e.user_id IS NULL OR e.user_id = auth.uid())
  ));

-- Deliberately no INSERT/UPDATE/DELETE policy for clients.
--
-- Nothing in the app writes Guide content: the create form in `exercises.tsx`
-- sends `name`, `muscle_group`, `equipment` and `exercise_kind`, and there is
-- no screen that authors cues. Granting a write nobody performs is a hole with
-- no feature behind it. When a screen for it exists, the policy arrives with
-- it — scoped to the user's own exercises, which is a decision that belongs to
-- that change and not to this one. Deleting an exercise still removes its
-- content, through the foreign key rather than through a policy.

-- ═════════════════════════════════════════════════════════════════════════
-- 2 · the Vietnamese content that already exists moves in
-- ═════════════════════════════════════════════════════════════════════════
--
-- Every row that HAS content, not only the ten seeded ones. The seed is what
-- this repository can see, but a production row written by hand would be lost
-- by a migration that only named the ten — and this predicate cannot invent
-- content, because it copies what is there or copies nothing.
--
-- The existing columns stay. They are not read by the app after this change,
-- but dropping a column is not reversible and this migration is the first of
-- the pair, not the second.

INSERT INTO public.exercise_guide_content (exercise_id, locale, form_cues, common_mistakes)
SELECT e.id,
       'vi',
       coalesce(e.form_cues, '{}'),
       coalesce(e.common_mistakes, '{}')
  FROM public.exercises e
 WHERE coalesce(array_length(e.form_cues, 1), 0) > 0
    OR coalesce(array_length(e.common_mistakes, 1), 0) > 0
ON CONFLICT (exercise_id, locale) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════════
-- 3 · English for the ten shared exercises this repository can name
-- ═════════════════════════════════════════════════════════════════════════
--
-- TRANSLATION, not authorship. Each line below says the same thing its
-- Vietnamese original says, including the three statements the inventory
-- flagged as contested — `Đầu gối không vượt quá mũi chân`, `Đầu gối không
-- khóa`, `Tay rộng bằng vai`. Whether those are good coaching is a content
-- question with a content owner; changing them while moving them would settle
-- it by accident, in a migration, where nobody would look for the decision.
--
-- `common_mistakes` is left empty on purpose. It is empty today, and inventing
-- mistakes so the screen looks complete would put claims about people's bodies
-- into the product on no authority at all.
--
-- `user_id IS NULL` is what "shared" means here — see the SELECT policy on
-- `exercises`. A user's own exercise that happens to share a name is not
-- touched.

INSERT INTO public.exercise_guide_content (exercise_id, locale, form_cues)
SELECT e.id, 'en', v.cues
  FROM public.exercises e
  JOIN (VALUES
    ('Barbell Squat',     ARRAY['Keep your back straight',
                                'Knees not past your toes',
                                'Breathe in on the way down']),
    ('Bench Press',       ARRAY['Shoulders pinned to the bench',
                                'Lower the bar slowly',
                                'Breathe out as you press']),
    ('Deadlift',          ARRAY['Keep the bar close to your body',
                                'Drive your hips forward',
                                'Do not round your back']),
    ('Overhead Press',    ARRAY['Keep your core tight',
                                'Press straight up',
                                'Do not lean back']),
    ('Barbell Row',       ARRAY['Pull to your stomach',
                                'Keep your back parallel to the floor',
                                'Squeeze your shoulder blades']),
    ('Pull-up',           ARRAY['Pull your chest to the bar',
                                'Lower yourself slowly',
                                'Hands shoulder-width apart']),
    ('Dumbbell Curl',     ARRAY['Keep your elbows fixed in place',
                                'Do not swing your body']),
    ('Leg Press',         ARRAY['Feet shoulder-width apart',
                                'Do not lock your knees']),
    ('Lat Pulldown',      ARRAY['Pull to your chest',
                                'Lean back slightly',
                                'Squeeze your back']),
    ('Romanian Deadlift', ARRAY['Knees slightly bent',
                                'Push your hips back',
                                'Feel the stretch'])
  ) AS v(name, cues) ON v.name = e.name
 WHERE e.user_id IS NULL
ON CONFLICT (exercise_id, locale) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════════
-- 4 · muscle_group becomes a key instead of a label
-- ═════════════════════════════════════════════════════════════════════════
--
-- The canonical set is the one the app already has: `MuscleArtKey` in
-- `src/lib/muscle-group.ts`, which is the only vocabulary in this codebase
-- that carries BOTH a Vietnamese and an English label (`MUSCLE_LABEL`) and an
-- alias table for the spellings already in the data. Inventing a second set
-- would mean two taxonomies to keep in step.
--
--   chest · back · legs · shoulders · biceps · triceps · abs · glutes
--   calves · cardio
--
-- Two consequences worth naming rather than hiding:
--
--   · `Quads` and `Hamstrings` both fold into `legs`, because `MUSCLE_LABEL`
--     has no separate label for them and `muscleArtKeysFor` has always mapped
--     them that way. That loses a distinction the picker could express. The
--     alternative — adding `quads`/`hamstrings` keys — is the second taxonomy
--     this migration is told not to invent, and a split of `legs` is a product
--     decision that belongs with whatever screen needs it.
--   · `Lưng/Chân` on the deadlift is TWO muscles and both are true. It becomes
--     `back/legs`, which is the same two-value shape the seed already used and
--     which `muscleArtKeysFor` already splits on. A single key would file the
--     deadlift under one half and hide it from the other.
--
-- Every source spelling below is one this repository can point at: the seed
-- migration's own strings, the eleven picker labels in both languages
-- (`i18n.muscle*`), and the English `workout-builder.tsx` writes. Anything
-- else is left exactly as it is.

WITH canon(src, key) AS (VALUES
  -- the seed migration's spellings — 20260212040248_…sql:358
  ('chân', 'legs'), ('ngực', 'chest'), ('lưng', 'back'), ('vai', 'shoulders'),
  ('lưng/chân', 'back/legs'), ('bắp tay trước', 'biceps'), ('hamstring', 'legs'),
  ('bắp tay sau', 'triceps'), ('bắp chân', 'calves'), ('tim mạch', 'cardio'),
  -- the picker, Vietnamese — `i18n.muscle*`, vi
  ('tay trước', 'biceps'), ('tay sau', 'triceps'), ('chân trước', 'legs'),
  ('chân sau', 'legs'), ('mông', 'glutes'), ('bụng', 'abs'),
  ('toàn thân', 'cardio'),
  -- the picker, English — `i18n.muscle*`, en — and `workout-builder.tsx`
  ('chest', 'chest'), ('back', 'back'), ('shoulders', 'shoulders'),
  ('biceps', 'biceps'), ('triceps', 'triceps'), ('quads', 'legs'),
  ('hamstrings', 'legs'), ('glutes', 'glutes'), ('abs', 'abs'),
  ('full body', 'cardio'), ('fullbody', 'cardio'), ('cardio', 'cardio'),
  ('legs', 'legs'), ('calves', 'calves'), ('core', 'abs')
)
UPDATE public.exercises e
   SET muscle_group = c.key,
       updated_at = now()
  FROM canon c
 WHERE lower(btrim(e.muscle_group)) = c.src
   AND e.muscle_group <> c.key;

-- No CHECK constraint on this column, on purpose. A constraint would reject
-- every historical value this migration deliberately preserved, and the next
-- write to such a row — a rename, a kind being set — would fail on data the
-- user never chose to break.

-- ═════════════════════════════════════════════════════════════════════════
-- 5 · equipment becomes a key too, but only where a key is known
-- ═════════════════════════════════════════════════════════════════════════
--
-- The whole known vocabulary is the five values the seed uses. There is no
-- picker, so everything else in this column was typed by a person, and this
-- migration has no business deciding that `Kettlebell` or `Dây kháng lực`
-- means one of five things.
--
-- `dumbbells` and `db` are included because they are the same word — the sort
-- of drift free text produces — and because an exact match on them cannot hit
-- anything else. `body weight` likewise.

WITH canon(src, key) AS (VALUES
  ('barbell', 'barbell'),
  ('bodyweight', 'bodyweight'), ('body weight', 'bodyweight'),
  ('cable', 'cable'),
  ('dumbbell', 'dumbbell'), ('dumbbells', 'dumbbell'), ('db', 'dumbbell'),
  ('machine', 'machine')
)
UPDATE public.exercises e
   SET equipment = c.key,
       updated_at = now()
  FROM canon c
 WHERE lower(btrim(coalesce(e.equipment, ''))) = c.src
   AND e.equipment <> c.key;
