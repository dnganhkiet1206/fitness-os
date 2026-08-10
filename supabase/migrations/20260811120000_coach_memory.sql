-- What the coach knows about you between conversations.
--
-- ── the gap this fills ──
--
-- `ai-coach` already receives seven days of logs, so it can see that you slept
-- badly and trained heavy. What it cannot see is anything you have ever *told*
-- it: that your left shoulder gives out on overhead press, that you do not eat
-- pork, that you train at six in the morning before work, that you are eight
-- weeks out from a race. Every conversation started from nothing and asked
-- again.
--
-- That is the difference between a chatbot with a database attached and
-- something worth paying for, and it is not a matter of taste — the retention
-- data on subscription fitness apps says lack of personalisation is the top
-- cancellation reason, and that the people who stay say the product feels like
-- it knows them.
--
-- ── why the client cannot write this table ──
--
-- These rows are pasted into the coach's **system prompt**. A client that could
-- insert here could write "ignore your safety rules" as a remembered fact and
-- have the server obediently prepend it above every reply. The app gives advice
-- about people's bodies; a self-service jailbreak is not a feature.
--
-- So: readable by the owner, deletable by the owner, written by nobody with a
-- user token. The extractor runs in an edge function on the service role.
--
-- ── deletable is not optional ──
--
-- The facts here are health facts somebody said out loud — an injury, a
-- diagnosis they mentioned in passing, a food they avoid for reasons they did
-- not explain. Personalisation is what earns the subscription and being able to
-- see and erase it is what earns the permission. A memory you cannot inspect is
-- surveillance with a friendly name.
CREATE TABLE IF NOT EXISTS public.coach_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What sort of thing this is. The four that change what a coach should say:
  --   constraint  — an injury, allergy, or hard limit ("no overhead pressing")
  --   preference  — a habit or dislike ("trains 6am", "vegetarian")
  --   goal        — what they are working towards, with its horizon
  --   context     — the circumstances ("home gym, dumbbells only")
  kind TEXT NOT NULL CHECK (kind IN ('constraint', 'preference', 'goal', 'context')),

  -- One self-contained sentence. Atomic and readable on its own: "left shoulder
  -- hurts on overhead press" rather than "it hurts", which is what the raw
  -- conversation says and which means nothing three weeks later.
  fact TEXT NOT NULL CHECK (length(fact) BETWEEN 3 AND 300),

  -- Temporal anchoring. A shoulder that hurt in March is not evidence about
  -- August, and a coach quoting it as current is worse than one that forgot.
  -- The prompt carries these dates so staleness is visible rather than implied.
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_confirmed TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The user's own words that produced it, so "why does it think that?" has an
  -- answer on the screen instead of in a log nobody can read.
  source_excerpt TEXT,

  UNIQUE (user_id, fact)
);

CREATE INDEX IF NOT EXISTS idx_coach_memory_user
  ON public.coach_memory (user_id, last_confirmed DESC);

ALTER TABLE public.coach_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own coach memory" ON public.coach_memory
  FOR SELECT USING (auth.uid() = user_id);

-- Forgetting is a user right, so DELETE is theirs.
CREATE POLICY "Users can delete own coach memory" ON public.coach_memory
  FOR DELETE USING (auth.uid() = user_id);

-- deliberately no INSERT or UPDATE policy: see the note above about the system
-- prompt. The extractor writes with the service role.

-- ── a ceiling, because this is pasted into every prompt ──
--
-- Unbounded memory is an unbounded prompt, which is an unbounded bill and a
-- coach that reads a hundred stale facts before answering "how much protein".
-- The oldest unconfirmed rows go first: a fact nobody has mentioned in months
-- is the one least likely to matter today.
CREATE OR REPLACE FUNCTION public.trim_coach_memory()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  MAX_FACTS CONSTANT INTEGER := 40;
BEGIN
  DELETE FROM public.coach_memory
   WHERE id IN (
     SELECT id FROM public.coach_memory
      WHERE user_id = NEW.user_id
      ORDER BY last_confirmed DESC
      OFFSET MAX_FACTS
   );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS coach_memory_trim ON public.coach_memory;
CREATE TRIGGER coach_memory_trim
  AFTER INSERT ON public.coach_memory
  FOR EACH ROW EXECUTE FUNCTION public.trim_coach_memory();
