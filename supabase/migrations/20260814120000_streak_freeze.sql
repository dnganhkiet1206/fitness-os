-- Streak freeze: one day off, bought in advance.
--
-- ── why the streak needed one ──
--
-- A streak with no forgiveness punishes exactly the wrong thing. The person it
-- breaks is not the one who stopped caring, it is the one who cared for
-- forty days and then had a flight, a fever, a funeral — and the day after a
-- broken streak is when people leave, because the thing they were protecting is
-- gone and starting from 1 is not the same as being at 40. Duolingo's freeze is
-- the single most effective retention item they have for that reason.
--
-- ── why it is a table and two functions ──
--
-- It is a *consumable*, and `mascot_inventory` cannot express one: it is unique
-- on (user, item) precisely so an outfit cannot be bought twice. So freezes get
-- rows of their own, and the two things that may happen to one — being bought
-- and being spent — are functions, because both have to be atomic against a
-- balance and against each other.
--
-- Nothing here takes a price, an amount or a count from the client. Same rule as
-- the rest of the economy: the client asks, the server decides.

CREATE TABLE IF NOT EXISTS public.streak_freezes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL = still in the drawer. A date = the day it was spent covering.
  used_on DATE
);

ALTER TABLE public.streak_freezes ENABLE ROW LEVEL SECURITY;

-- Readable, and nothing else. Every write goes through the SECURITY DEFINER
-- functions below, so a REST call cannot mint a freeze or un-spend one.
DROP POLICY IF EXISTS "streak freezes readable by owner" ON public.streak_freezes;
CREATE POLICY "streak freezes readable by owner"
  ON public.streak_freezes FOR SELECT
  USING (auth.uid() = user_id);

-- One freeze per day, enforced by the database rather than by the caller
-- remembering: two launches racing on the same morning must not spend two.
CREATE UNIQUE INDEX IF NOT EXISTS streak_freezes_one_per_day
  ON public.streak_freezes (user_id, used_on)
  WHERE used_on IS NOT NULL;

CREATE INDEX IF NOT EXISTS streak_freezes_unused
  ON public.streak_freezes (user_id)
  WHERE used_on IS NULL;

-- The price lives where every other price lives, so one table is the answer to
-- "what does this cost" and the app cannot show a different number.
INSERT INTO public.shop_prices (item_key, price)
  VALUES ('streak_freeze', 150)
  ON CONFLICT (item_key) DO UPDATE SET price = EXCLUDED.price;

/*
  How many may be held at once.

  Two, which is Duolingo's default, and the number is a design choice rather
  than a technical one: a stack deep enough to cover a weekend away, shallow
  enough that it cannot be hoarded into a streak that means nothing. Somebody
  with thirty freezes has a counter, not a habit.
*/
CREATE OR REPLACE FUNCTION public.buy_streak_freeze()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_price INTEGER;
  v_balance INTEGER;
  v_held INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  SELECT price INTO v_price FROM public.shop_prices WHERE item_key = 'streak_freeze';
  IF v_price IS NULL THEN
    RAISE EXCEPTION 'unknown item streak_freeze';
  END IF;

  SELECT count(*) INTO v_held
    FROM public.streak_freezes
    WHERE user_id = v_uid AND used_on IS NULL;
  IF v_held >= 2 THEN
    RAISE EXCEPTION 'freeze limit';
  END IF;

  -- Locked, so two requests in flight cannot both read the same balance and
  -- both decide it is enough.
  SELECT COALESCE(SUM(amount), 0) INTO v_balance
    FROM public.mascot_transactions WHERE user_id = v_uid FOR UPDATE;

  IF v_balance < v_price THEN
    RAISE EXCEPTION 'insufficient coins';
  END IF;

  -- A fresh ref_key per purchase, because this is the one thing in the economy
  -- that is *meant* to be bought more than once — `buy:<item>` is unique on
  -- purpose and would refuse the second freeze anybody ever bought.
  INSERT INTO public.mascot_transactions (user_id, amount, reason, ref_key)
    VALUES (v_uid, -v_price, 'buy streak_freeze', 'freeze:' || gen_random_uuid());

  INSERT INTO public.streak_freezes (user_id) VALUES (v_uid);

  RETURN v_balance - v_price;
END;
$$;

/*
  Spend one on a day.

  ── the date comes from the client, and that is not a mistake ──

  Days here are local days: `daily_logs.date` is written from the device's own
  calendar, because "did you log on Tuesday" is a question about the user's
  Tuesday and not about UTC. So the freeze has to be spent on a local date too,
  or the two would disagree for everybody east of London.

  What the server does not do is *trust* it. The window below is wide enough for
  any real timezone (UTC−12 to UTC+14 puts a device at most a day either side)
  and narrow enough that a forged date cannot resurrect a streak that died in
  March. Retroactive rescue is exactly what a freeze must not do.

  Returns false rather than raising when there is nothing to spend or the day is
  already covered: both are ordinary outcomes of an app that runs this check on
  every launch, and an exception would turn them into errors in a log.
*/
CREATE OR REPLACE FUNCTION public.use_streak_freeze(p_date DATE)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  IF p_date > CURRENT_DATE + 1 OR p_date < CURRENT_DATE - 3 THEN
    RAISE EXCEPTION 'freeze window';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.streak_freezes WHERE user_id = v_uid AND used_on = p_date
  ) THEN
    RETURN false;
  END IF;

  SELECT id INTO v_id
    FROM public.streak_freezes
    WHERE user_id = v_uid AND used_on IS NULL
    ORDER BY acquired_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

  IF v_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.streak_freezes SET used_on = p_date WHERE id = v_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.buy_streak_freeze() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.use_streak_freeze(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buy_streak_freeze() TO authenticated;
GRANT EXECUTE ON FUNCTION public.use_streak_freeze(DATE) TO authenticated;
