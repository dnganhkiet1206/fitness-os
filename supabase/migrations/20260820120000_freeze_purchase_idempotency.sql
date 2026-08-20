/*
  One lost response, two freezes, three hundred coins.

  ── what was measured ──

  `buy_streak_freeze()` takes no arguments and mints its own ledger key:

      INSERT INTO public.mascot_transactions (user_id, amount, reason, ref_key)
        VALUES (v_uid, -v_price, 'buy streak_freeze', 'freeze:' || gen_random_uuid());

  A fresh `ref_key` on every call is exactly what makes two calls two purchases.
  That is deliberate and, for two *deliberate* purchases, right: `buy:<item>` is
  unique on purpose and would refuse the second freeze anybody ever bought. What
  it also does is make a **retry** indistinguishable from a second purchase, and
  a client cannot tell "committed, answer lost" from "never happened".

  Against a cluster built from every migration in this directory, 100 runs from
  a 500-coin wallet:

      mua → mất phản hồi → thử lại     bal=200  debits=2  freezes=2   100/100
      thử lại ×5                        bal=200  debits=2  freezes=2

  The hold cap bounds it at two, and the person does end up holding the second
  freeze — so this is a P3 and not a mint. It is still one intention charged
  twice, on the only 150-coin item in the app.

  ── the fix, using the constraint that already exists ──

  The ledger has carried `UNIQUE(user_id, ref_key)` since 20260718120000, and
  that is precisely an idempotency key. It was not being used as one here only
  because the key was random. Give the caller a request id, put it in the key,
  and the existing unique index becomes the authority:

      ref_key = 'freeze:' || p_request_id

  `ON CONFLICT DO NOTHING` plus `FOUND` then tells the function whether it is
  the call that actually bought something. If it is not, it returns the balance
  and touches nothing — no second debit, no second freeze row. No new table, no
  new column, no second idempotency domain to keep in step with the first.

  ── the old signature stays, and stays as it was ──

  Same reasoning as 20260819120000: an app build already on somebody's phone
  goes on calling the zero-argument form until they update. Dropping it would
  turn "you were charged twice for one tap" into "buying is broken", which is
  worse. It keeps its current behaviour — a fresh id per call, so a retry from
  an old client still double-charges — and there is no way to fix that from this
  side, because an old client sends nothing that could identify the intention.
  Recorded rather than papered over.

  ── what is deliberately NOT changed ──

  The advisory lock (20260815120000), the `FREEZE_MAX` cap of two, the price
  lookup from `shop_prices`, the balance floor, and the atomic debit-plus-freeze
  are all untouched, and all of them were measured working before this edit:
  100 concurrent buys against a 150-coin wallet produced exactly one purchase in
  20 of 20 runs, 149 coins produced none in 50 of 50, and the debit and the
  freeze row have never once been observed apart.

  `use_streak_freeze` is untouched. Consuming a freeze is not a purchase and has
  its own idempotency — the partial unique index on (user_id, used_on) — which
  100 concurrent callers on one day did not dent.
*/

/**
 * Buy a freeze, once per request id.
 *
 * @param p_request_id a stable id for **one intention**. The caller keeps it
 *   across retries of that intention and makes a new one for the next purchase;
 *   see `useBuyFreeze`. Two calls with the same id are one purchase, whatever
 *   happened to the answer in between.
 */
CREATE OR REPLACE FUNCTION public.buy_streak_freeze(p_request_id UUID)
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
  v_ref TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'missing request id';
  END IF;

  SELECT price INTO v_price FROM public.shop_prices WHERE item_key = 'streak_freeze';
  IF v_price IS NULL THEN
    RAISE EXCEPTION 'unknown item streak_freeze';
  END IF;

  v_ref := 'freeze:' || p_request_id::text;

  -- Same lock as 20260815120000, taken before the holdings count as well as the
  -- balance: both are read-decide-write.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  /* Asked and answered already? Converge, and say what the balance is.

     Checked INSIDE the lock and BEFORE the cap, on purpose: a retry of a
     purchase that has already gone through must not be refused for `freeze
     limit` just because the purchase it is retrying is the one that filled the
     drawer. */
  IF EXISTS (SELECT 1 FROM public.mascot_transactions
              WHERE user_id = v_uid AND ref_key = v_ref) THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_balance
      FROM public.mascot_transactions WHERE user_id = v_uid;
    RETURN v_balance;
  END IF;

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

  INSERT INTO public.mascot_transactions (user_id, amount, reason, ref_key)
    VALUES (v_uid, -v_price, 'buy streak_freeze', v_ref)
    ON CONFLICT (user_id, ref_key) DO NOTHING;

  /* The debit is the gate: if the row was already there, this call bought
     nothing and must not create a freeze either.

     ── and this branch is currently unreachable, which is said rather than
        assumed ──

     The advisory lock is taken *before* the EXISTS check above, so two callers
     carrying the same request id are serialised and the second one always
     returns there. Deleting these five lines therefore changes nothing that can
     be measured — a break-test that removed them left the whole suite green,
     which is the proof of unreachability rather than a rule without teeth.

     Kept anyway, and this is the reason: it is unreachable *because of the
     lock*, not because of anything in this block. Remove the lock — as
     break-test 5 does — and this becomes the only thing standing between a
     conflicting debit and a freeze nobody paid for. A guard whose premise is
     one line above it is worth the five lines. */
  IF NOT FOUND THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_balance
      FROM public.mascot_transactions WHERE user_id = v_uid;
    RETURN v_balance;
  END IF;

  INSERT INTO public.streak_freezes (user_id) VALUES (v_uid);

  RETURN v_balance - v_price;
END;
$$;

/*
  The zero-argument form, unchanged in behaviour.

  Kept for builds already installed, which send nothing that could identify an
  intention — so this cannot be made idempotent, and pretending otherwise by
  inventing an id here would be the same bug with a longer stack. It delegates
  so the price, the cap, the lock and the atomicity have exactly one definition.
*/
CREATE OR REPLACE FUNCTION public.buy_streak_freeze()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.buy_streak_freeze(gen_random_uuid());
END;
$$;

REVOKE ALL ON FUNCTION public.buy_streak_freeze(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buy_streak_freeze(UUID) TO authenticated;
