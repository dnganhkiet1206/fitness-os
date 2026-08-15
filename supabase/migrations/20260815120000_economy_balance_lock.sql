/*
  Both purchase functions were a syntax error, on every call.

  ── what was wrong ──

  `buy_mascot_item` (20260810120000) and `buy_streak_freeze` (20260814120000)
  each read the wallet like this:

      SELECT COALESCE(SUM(amount), 0) INTO v_balance
        FROM public.mascot_transactions WHERE user_id = v_uid FOR UPDATE;

  PostgreSQL refuses that outright:

      ERROR:  FOR UPDATE is not allowed with aggregate functions

  A locking clause needs to name individual rows to lock, and an aggregate has
  thrown those away by the time there is a result. So the function raised at
  that line — before the balance was ever compared, before either INSERT. Every
  purchase in the app failed: the whole 39-item shop and the streak freeze.

  This was not a "waiting on deploy" problem. The SQL could not have worked once
  deployed either.

  ── why the lock was there, and why it never did that job ──

  The comment above those lines said the lock stopped two concurrent purchases
  from both reading the same balance and both deciding it was enough.

  `FOR UPDATE` would not have done that even if the syntax were legal. It locks
  rows that already exist; it does not stop a *new* row being inserted, and new
  rows are exactly what a concurrent purchase adds. Two buyers would each lock
  the same historical ledger rows, each see the same balance, and each insert a
  fresh debit. The lock was decorative.

  What actually needs serialising is the whole read-decide-write sequence for
  one user. `pg_advisory_xact_lock` does that directly: the second transaction
  blocks at the lock until the first commits, then sums a ledger that already
  contains the first debit. The lock is released with the transaction, so
  nothing leaks on a raise.

  The key is `hashtextextended(uid::text, 0)` — the advisory lock space is
  bigint and the user id is a UUID. Collisions between two different users are
  possible in principle and harmless in practice: the cost of a collision is one
  purchase briefly waiting for an unrelated purchase, not a wrong balance.

  (Duplicate *ownership* is a separate guarantee and already belongs to the
  UNIQUE constraint on `mascot_inventory` — that is what makes buying the same
  item twice impossible, and it is untouched here.)

  ── why a new migration rather than editing the two old files ──

  Editing in place is only correct if those files have never been applied
  anywhere. That is unknowable from here — production has not had them, but a
  dev project may well have. `CREATE OR REPLACE FUNCTION` is correct in both
  cases: it defines the function where it is missing and replaces the broken
  body where it is present.

  Everything else about the two functions — the signature, the checks, their
  order, the ref_key shapes, the return value — is unchanged. The only edit is
  the two lines that read the balance.
*/

CREATE OR REPLACE FUNCTION public.buy_mascot_item(p_item_key TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_price INTEGER;
  v_balance INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  SELECT price INTO v_price FROM public.shop_prices WHERE item_key = p_item_key;
  IF v_price IS NULL THEN
    RAISE EXCEPTION 'unknown item %', p_item_key;
  END IF;

  IF EXISTS (SELECT 1 FROM public.mascot_inventory WHERE user_id = v_uid AND item_key = p_item_key) THEN
    RAISE EXCEPTION 'already owned';
  END IF;

  -- Serialise read-decide-write for this user. Held until the transaction
  -- ends, so a second purchase sums a ledger that already has the first debit.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
    FROM public.mascot_transactions WHERE user_id = v_uid;

  IF v_balance < v_price THEN
    RAISE EXCEPTION 'insufficient coins';
  END IF;

  INSERT INTO public.mascot_transactions (user_id, amount, reason, ref_key)
    VALUES (v_uid, -v_price, 'buy ' || p_item_key, 'buy:' || p_item_key);

  INSERT INTO public.mascot_inventory (user_id, item_key, equipped)
    VALUES (v_uid, p_item_key, true);

  RETURN v_balance - v_price;
END;
$$;

/*
  `earn_mascot_coins` has the same shape, found by the rule written for the two
  above rather than by reading it.

  It is not a syntax error — there is no locking clause here, so it runs. But it
  sums today's credits, compares that to MAX_PER_DAY, and then inserts: a
  read-decide-write on the same ledger. Two claims in flight both read 390 and
  both insert, and a ceiling that two callers can both pass is not a ceiling.

  Concurrent claims are not hypothetical in this app — rewards are granted from
  a focus effect on the Today screen and from the challenge progress path at the
  same time.

  Same lock, same key, so a claim and a purchase also serialise against each
  other. One lock per user, always taken before the read, so there is no order
  to get wrong and nothing to deadlock against.
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
DECLARE
  v_uid UUID := auth.uid();
  v_today INTEGER;
  MAX_PER_CLAIM CONSTANT INTEGER := 120;
  MAX_PER_DAY   CONSTANT INTEGER := 400;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > MAX_PER_CLAIM THEN
    RAISE EXCEPTION 'reward out of range';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  SELECT COALESCE(SUM(amount), 0) INTO v_today
    FROM public.mascot_transactions
   WHERE user_id = v_uid
     AND amount > 0
     AND created_at >= date_trunc('day', now());

  IF v_today + p_amount > MAX_PER_DAY THEN
    RAISE EXCEPTION 'daily reward ceiling reached';
  END IF;

  INSERT INTO public.mascot_transactions (user_id, amount, reason, ref_key)
    VALUES (v_uid, p_amount, p_reason, p_ref_key)
    ON CONFLICT (user_id, ref_key) DO NOTHING;

  RETURN p_amount;
END;
$$;

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

  -- Same lock, taken before the holdings count as well as the balance: the cap
  -- below is a read-decide-write too, and two freezes bought at once would
  -- otherwise both see one held and both insert a second.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  SELECT count(*) INTO v_held
    FROM public.streak_freezes
    WHERE user_id = v_uid AND used_on IS NULL;
  IF v_held >= 2 THEN
    RAISE EXCEPTION 'freeze limit';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
    FROM public.mascot_transactions WHERE user_id = v_uid;

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
