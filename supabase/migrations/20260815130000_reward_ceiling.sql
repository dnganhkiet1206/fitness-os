/*
  The reward ceiling was below three rewards the app actually grants.

  ── what was wrong ──

  `earn_mascot_coins` refuses any single claim over `MAX_PER_CLAIM`, which was
  120. Three grants in the app ask for more:

      welcome gift      300   src/app/mascot-room.tsx
      Runner Set bonus  180   COLLECTIONS in src/lib/mascot-room.ts
      dev faucet        500   src/app/mascot-room.tsx  (now __DEV__ only)

  `useClaimReward` only swallows errors containing 'duplicate', so all three
  raised. The welcome gift is the one that matters: a new account is meant to
  open the Koa room holding 300 coins, and the cheapest item in the shop is 60.
  Instead the claim failed, silently, and the room opened at **zero** — a shop
  full of things and no way to afford any of them, on the first visit.

  It has been invisible because `TEST_UNLOCK_ALL` short-circuits the whole
  economy into AsyncStorage and never calls this function. Turning that flag off
  for release is what makes it appear, which is the worst possible timing.

  ── why raise the ceiling rather than shrink the rewards ──

  This ceiling is not a game-balance knob. It exists because the ledger takes no
  client inserts: a POST with `amount: 999999` once unlocked the whole shop, and
  the RPC's job is to bound what a forged call can mint. The bound should
  therefore sit at the largest grant the design actually has — 300 — not below
  it, where it silently vetoes the app's own rewards.

  Idempotency is what stops a legitimate grant repeating: `UNIQUE(user_id,
  ref_key)` means the welcome gift pays once per account no matter how many
  times it is claimed.

  ── the daily ceiling had to move too, and this is the arithmetic ──

  MAX_PER_DAY was 400, justified in the original comment as "five daily quests
  (75) plus a streak bonus (25) plus a challenge (120) — 220, so 400 leaves
  room". That sum predates two of the grants above. A real maximal day now:

      welcome gift                                    300
      five daily quests (10+25+15+15+10)               75
      streak bonus (capped)                            25
      one platinum weekly challenge                   120
      one completed collection (Runner, the largest)  180
                                                    -----
                                                      700

  So the old 400 would have failed a first day that simply went well — and
  failed it *after* the welcome gift had been counted, so the user would lose
  the quests they had actually earned. 800 restores the same kind of headroom
  the original number had.

  ── why a separate migration from 20260815120000 ──

  Same reasoning as that file's own header: `CREATE OR REPLACE` in a new
  migration is correct whether or not the previous one has been applied
  somewhere, and editing an applied migration in place changes nothing on the
  server because the runner will not re-run it. That failure would be silent —
  the ceiling would stay at 120 and the welcome gift would keep failing — which
  is exactly the class of bug this round is about.

  Only the two constants change. The body is otherwise identical to
  20260815120000, advisory lock included.
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
  -- The largest single grant the design has: the welcome gift.
  MAX_PER_CLAIM CONSTANT INTEGER := 300;
  -- A maximal first day is 700; see the arithmetic in this file's header.
  MAX_PER_DAY   CONSTANT INTEGER := 800;
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
