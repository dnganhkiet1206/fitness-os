/*
  The ledger stopped taking dictation about *which* row to write. It never
  stopped taking dictation about *how much*.

  ── what was measured ──

  `earn_mascot_coins(p_ref_key, p_amount, p_reason)` bounds `p_amount` to
  [1, 300] and sums the day against 800. It never asks what `p_ref_key` is
  worth. Against a cluster rebuilt from every migration in this directory:

      DAILY_QUESTS says meal = 10 coins

      earn_mascot_coins('d:2026-08-19:meal', 10)   → ledger: … = 10
      earn_mascot_coins('d:2026-08-19:meal', 300)  → ledger: … = 300      ← lỗi
      earn_mascot_coins('d:2026-08-19:meal', 301)  → RAISED: out of range

  And `p_ref_key` is not checked at all. Every one of these was accepted and
  paid, in full, on a real cluster:

      d:2026-08-19:ghost      d:2026-08-19:        d:not-a-date:meal
      d:2099-01-01:meal       d:1970-01-01:meal    meal        ""

  So the ceiling is not a bound on forgery, it is the *price list* for it: 300
  a claim, 800 a day, on keys that name nothing.

  ── the asymmetry that shows this was an omission ──

  `buy_mascot_item`, added in 20260810120000 alongside the policy drop, takes
  only `p_item_key` and looks the price up from `shop_prices`. Its own header
  says so: *"The item key is the only thing the caller supplies — the price is
  looked up."* Spending got server authority; earning got a ceiling. XP is
  key-derived too (`xpForRefKey` in `lib/mascot-room.ts` reads the quest out of
  the ref_key), so XP cannot be inflated this way and coins can — which is the
  shape of an oversight rather than a decision.

  ── the fix, in the pattern this schema already uses ──

  `reward_prices`, a sibling of `shop_prices`: one row per reward the design
  has a *constant* for, and the function reads it. The client sends the ref_key
  and nothing else.

  `earn_mascot_coins` keeps its three-argument signature and **ignores
  `p_amount`**, delegating to the new function. That is deliberate and it is the
  more important half: an app build already installed on somebody's phone goes
  on calling the three-argument form for as long as they do not update, and a
  new function alone would leave every one of those clients on the old,
  forgeable path. Rewriting the body closes the hole for callers that already
  exist.

  ── the one amount the server cannot derive, said plainly ──

  `d:<date>:streak` pays `streakCoins(streak) = min(5 + streak*2, 25)`, which is
  a function of the person's history rather than a constant. Deriving it here
  means reimplementing the streak rule — `LOGGED_DAY_FILTER`, the 400-row
  window, and freeze coverage from `streak_freezes` — in a third place, and
  `use-mascot-room.ts` records that its two existing readers *"have already
  drifted apart twice"*. A third copy that drifts would pay the wrong bonus
  silently, which is a worse failure than the one being fixed.

  So the streak key is bounded by the maximum of its own function, 25, and that
  is recorded as a partial fix rather than dressed up as authority: forging it
  is worth 25 coins instead of 300. Everything with a constant is exact.

  ── what is now refused ──

  Unknown quest, unknown collection, unknown tier, malformed key, and a date
  outside the window below. The window is not "today":

    · **+1 day.** `questRefKey` uses the device's LOCAL date and this function
      sees UTC. At 20:59 in Los Angeles the local date is already a day behind
      UTC; in Kiritimati it is a day ahead. Refusing tomorrow-in-UTC would
      refuse this evening's quests for everybody east of the line.
    · **−2 days.** A claim that fails at half past eleven is retried by the
      client on its next reading, and that reading can be after midnight.
      Refusing yesterday would make a transient network failure into a
      permanent loss of coins somebody earned.
*/

CREATE TABLE IF NOT EXISTS public.reward_prices (
  reward_key TEXT PRIMARY KEY,
  coins INTEGER NOT NULL CHECK (coins > 0)
);

ALTER TABLE public.reward_prices ENABLE ROW LEVEL SECURITY;
-- Readable by anyone signed in (the room shows what a thing is worth); written
-- by nobody but a migration.
DROP POLICY IF EXISTS "Anyone can read reward prices" ON public.reward_prices;
CREATE POLICY "Anyone can read reward prices" ON public.reward_prices
  FOR SELECT USING (auth.uid() IS NOT NULL);

INSERT INTO public.reward_prices (reward_key, coins) VALUES
  -- DAILY_QUESTS, src/lib/mascot-room.ts
  ('quest:meal', 10),
  ('quest:workout', 25),
  ('quest:water', 15),
  ('quest:sleep', 15),
  ('quest:steps', 10),
  -- CHALLENGE_REWARD
  ('challenge:bronze', 25),
  ('challenge:silver', 50),
  ('challenge:gold', 80),
  ('challenge:platinum', 120),
  -- WEEKLY_BONUS_COINS
  ('weekly', 40),
  -- COLLECTIONS[].rewardCoins
  ('set:gym', 120),
  ('set:runner', 180),
  ('set:tet', 120),
  ('set:xmas', 120),
  ('set:halloween', 120),
  -- the first-visit purse, src/app/mascot-room.tsx
  ('welcome', 300),
  -- see the header: the ceiling of streakCoins(), not a derivation of it
  ('streak:max', 25)
ON CONFLICT (reward_key) DO UPDATE SET coins = EXCLUDED.coins;

/**
 * What one ref_key is worth, or NULL if it is not a reward this app grants.
 *
 * Split out so the rule can be read — and tested — on its own, without minting
 * anything. `tools/quest-lifecycle.mjs` calls it directly for the key shapes it
 * has to refuse.
 */
CREATE OR REPLACE FUNCTION public.reward_amount_for(p_ref_key TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parts TEXT[];
  v_date DATE;
  v_key TEXT;
BEGIN
  IF p_ref_key IS NULL OR p_ref_key = '' THEN RETURN NULL; END IF;

  -- welcome
  IF p_ref_key = 'welcome' THEN
    RETURN (SELECT coins FROM public.reward_prices WHERE reward_key = 'welcome');
  END IF;

  -- d:<YYYY-MM-DD>:<quest|streak>
  IF p_ref_key LIKE 'd:%' THEN
    v_parts := string_to_array(p_ref_key, ':');
    IF array_length(v_parts, 1) <> 3 THEN RETURN NULL; END IF;
    IF v_parts[2] !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN NULL; END IF;
    BEGIN
      v_date := v_parts[2]::date;
    EXCEPTION WHEN others THEN
      RETURN NULL;                      -- '2026-02-31' parses the regex, not the calendar
    END;
    -- See the header for why the window is +1/−2 rather than "today".
    IF v_date > (now() AT TIME ZONE 'UTC')::date + 1 THEN RETURN NULL; END IF;
    IF v_date < (now() AT TIME ZONE 'UTC')::date - 2 THEN RETURN NULL; END IF;
    IF v_parts[3] = 'streak' THEN
      RETURN (SELECT coins FROM public.reward_prices WHERE reward_key = 'streak:max');
    END IF;
    RETURN (SELECT coins FROM public.reward_prices WHERE reward_key = 'quest:' || v_parts[3]);
  END IF;

  -- ch:<tier>:<weekStart>:<challenge key>
  IF p_ref_key LIKE 'ch:%' THEN
    v_parts := string_to_array(p_ref_key, ':');
    IF array_length(v_parts, 1) <> 4 THEN RETURN NULL; END IF;
    RETURN (SELECT coins FROM public.reward_prices WHERE reward_key = 'challenge:' || v_parts[2]);
  END IF;

  -- w:<weekly_challenges row id>
  IF p_ref_key LIKE 'w:%' THEN
    v_key := substring(p_ref_key from 3);
    IF v_key = '' THEN RETURN NULL; END IF;
    RETURN (SELECT coins FROM public.reward_prices WHERE reward_key = 'weekly');
  END IF;

  -- set:<collection id>
  IF p_ref_key LIKE 'set:%' THEN
    RETURN (SELECT coins FROM public.reward_prices WHERE reward_key = p_ref_key);
  END IF;

  RETURN NULL;
END;
$$;

/**
 * Claim one reward. The caller names the event; the server prices it.
 *
 * Everything else — the advisory lock, the daily ceiling, the idempotent insert
 * on `UNIQUE(user_id, ref_key)` — is unchanged from 20260815130000, because all
 * of it was measured working: 100 concurrent claims of one key produced one row
 * in 100 of 100 runs, and ten concurrent actors against the ceiling landed on
 * exactly 800 in 30 of 30.
 */
CREATE OR REPLACE FUNCTION public.claim_quest_reward(
  p_ref_key TEXT,
  p_reason TEXT DEFAULT ''
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_amount INTEGER;
  v_today INTEGER;
  MAX_PER_DAY CONSTANT INTEGER := 800;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  v_amount := public.reward_amount_for(p_ref_key);
  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'unknown reward %', p_ref_key;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  SELECT COALESCE(SUM(amount), 0) INTO v_today
    FROM public.mascot_transactions
   WHERE user_id = v_uid
     AND amount > 0
     AND created_at >= date_trunc('day', now());

  IF v_today + v_amount > MAX_PER_DAY THEN
    RAISE EXCEPTION 'daily reward ceiling reached';
  END IF;

  INSERT INTO public.mascot_transactions (user_id, amount, reason, ref_key)
    VALUES (v_uid, v_amount, p_reason, p_ref_key)
    ON CONFLICT (user_id, ref_key) DO NOTHING;

  RETURN v_amount;
END;
$$;

/*
  The old signature, kept alive and made harmless.

  `p_amount` is accepted and **discarded**. Clients already on somebody's phone
  keep calling this until they update, and they are exactly the callers who
  cannot be fixed by shipping a new function. The argument stays in the
  signature so those calls still resolve; it stops being able to say anything.
*/
CREATE OR REPLACE FUNCTION public.earn_mascot_coins(
  p_ref_key TEXT,
  p_amount INTEGER,
  p_reason TEXT DEFAULT ''
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.claim_quest_reward(p_ref_key, p_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.reward_amount_for(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reward_amount_for(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_quest_reward(TEXT, TEXT) TO authenticated, service_role;
GRANT SELECT ON public.reward_prices TO anon, authenticated, service_role;
