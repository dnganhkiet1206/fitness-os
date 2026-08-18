-- `claim_ai_call` is the one client-reachable writer to `ai_usage`, and it
-- believed whatever it was handed.
--
-- ── what was measured ──
--
-- `ai_usage` deliberately has no INSERT policy for user tokens: the counter
-- that decides whether somebody may spend money on a model is not something
-- they may write. `claim_ai_call` is `SECURITY DEFINER` and `GRANT EXECUTE ...
-- TO authenticated`, so it is the way around that by design — for the six
-- server-chosen kinds. Its parameter was never checked.
--
-- On PostgreSQL 16.13, signed in as an ordinary user:
--
--     SELECT claim_ai_call('kind-tu-che-001');       → true
--     SELECT claim_ai_call(repeat('x', 100000));     → true
--
--     user_id | kind                     | kind_len | calls
--     A       | kind-tu-che-001          |       15 |     1
--     A       | xxxxxxxxxxxxxxxxxxxxxxxx |   100000 |     1
--
-- Each distinct string is a new row with its own fresh allowance, and each row
-- is as large as the caller cares to make it. A loop writes unbounded rows of
-- unbounded size into a table nothing else lets a client touch.
--
-- ── what this is not ──
--
-- It is **not** a quota bypass. Every edge function passes its own literal
-- (`claimCall(supabase, "ai-coach")`), so no invented kind buys a single model
-- call. The exposure is storage and write amplification, not inference cost.
--
-- ── the shape, and why not a whitelist ──
--
-- `ELSE 20` exists so a function added before its migration still has a
-- ceiling rather than none, and a hard-coded list of six names would take that
-- away. So the parameter is constrained to the shape a function name has —
-- lower-case letters, digits and hyphens, at most 40 characters — which leaves
-- the forward-compatible default intact and removes the unbounded row *size*.
--
-- Shape alone still leaves the row *count* free: `a-1`, `a-2`, `a-3` are all
-- well-formed. So a day may hold only so many counters for kinds this function
-- does not recognise — six, which is as many again as the app has today.
--
-- **The named kinds are never subject to that bound**, and getting this wrong
-- once is why it is spelled out. The first version counted every row, so
-- filling the day with six junk kinds locked the caller out of `ai-coach`
-- entirely — measured: `claim_ai_call('ai-coach')` → false, for the rest of the
-- day, from a request the caller made themselves. A ceiling on unknown names
-- must not become a way to switch off the known ones.
--
-- The count is read before the insert rather than inside it, so two requests
-- racing can create a row past the bound. That is the right trade: the
-- per-kind quota — the number that decides whether money is spent — stays one
-- atomic statement, and what is bounded here is only how many counters for
-- names nobody ships can exist.
--
-- Refusing rather than raising: `claimCall` reads `false` as "no quota, no AI",
-- which is the same failure-closed answer it already gives when the RPC errors.
-- A malformed kind is a bug in the caller, and the caller is us.

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

  -- The shape a function name has. Anything else never reaches the table.
  IF p_kind IS NULL OR p_kind !~ '^[a-z0-9-]{1,40}$' THEN
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
    WHEN 'ai-coach-memory'  THEN 20
    ELSE NULL
  END;

  -- A name this function does not know still gets a ceiling, but it may not
  -- multiply: only so many such counters may exist in one day. The named kinds
  -- above skip this entirely — see the note at the top about locking somebody
  -- out of `ai-coach` with junk.
  IF v_limit IS NULL THEN
    v_limit := 20;
    IF NOT EXISTS (
      SELECT 1 FROM public.ai_usage
       WHERE user_id = v_uid AND day = (now() AT TIME ZONE 'utc')::date AND kind = p_kind
    ) AND (
      SELECT count(*) FROM public.ai_usage
       WHERE user_id = v_uid
         AND day = (now() AT TIME ZONE 'utc')::date
         AND kind NOT IN ('ai-coach', 'scan-food', 'ai-meal-suggest',
                          'ai-smart-nudges', 'ai-weekly-review', 'ai-coach-memory')
    ) >= 6 THEN
      RETURN false;
    END IF;
  END IF;

  -- One statement, so the read and the increment cannot be separated. Measured
  -- on PostgreSQL 16.13: forty concurrent claims against a limit of ten return
  -- exactly ten `true` and thirty `false`.
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
