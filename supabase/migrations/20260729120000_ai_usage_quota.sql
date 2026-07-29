-- Per-user daily ceilings on the AI functions.
--
-- The five edge functions call a paid gateway (Lovable credits). Nothing
-- previously limited how often one account could do that: the gateway's own
-- 429 is Lovable protecting Lovable, not this project protecting its bill.
--
-- The counter is a table rather than in-memory state because edge function
-- instances are ephemeral and there are many of them; only the database sees
-- every call.

CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  kind TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, kind)
);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- Read-only to the owner. Every write goes through claim_ai_call below, so
-- there is deliberately no INSERT/UPDATE/DELETE policy: a client that could
-- write this table could reset its own quota.
CREATE POLICY "Users can view own ai usage" ON public.ai_usage
  FOR SELECT USING (auth.uid() = user_id);

/**
 * Take one call off today's allowance. Returns false when it is spent.
 *
 * The ceilings live here, not in the edge function's arguments — otherwise a
 * caller invoking the RPC directly could pass their own limit. As written,
 * calling it by hand only burns the caller's own quota.
 *
 * SECURITY DEFINER because the table has no write policy; `search_path` is
 * pinned so the body cannot be redirected through a shadowing schema.
 */
CREATE OR REPLACE FUNCTION public.claim_ai_call(p_kind TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_limit INTEGER;
  v_calls INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Generous enough that no real user meets them, low enough that a script
  -- cannot run up a bill. Raise deliberately, with usage to point at.
  v_limit := CASE p_kind
    WHEN 'ai-coach'         THEN 60
    WHEN 'scan-food'        THEN 40
    WHEN 'ai-meal-suggest'  THEN 30
    WHEN 'ai-smart-nudges'  THEN 30
    WHEN 'ai-weekly-review' THEN 10
    ELSE 20
  END;

  INSERT INTO public.ai_usage (user_id, day, kind, calls)
  VALUES (v_uid, (now() AT TIME ZONE 'utc')::date, p_kind, 1)
  ON CONFLICT (user_id, day, kind)
    DO UPDATE SET calls = public.ai_usage.calls + 1
  RETURNING calls INTO v_calls;

  RETURN v_calls <= v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_call(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_ai_call(TEXT) TO authenticated;
