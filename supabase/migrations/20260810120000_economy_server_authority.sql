-- The shop was priced by the client, and the ledger was writable by the client.
--
-- ── the two scenarios this closes ──
--
-- Both need nothing but a normal account and curl. The anon key ships inside
-- the app binary and the access token is in the device keychain; neither is a
-- secret from the person holding the phone.
--
--   1. Mint money.
--        POST /rest/v1/mascot_transactions
--        { "user_id": "<own uid>", "amount": 999999, "ref_key": "x" }
--      Balance is SUM(amount), so the whole shop — 39 items, 8530 coins —
--      unlocks for the price of one request.
--
--   2. Skip paying altogether.
--        POST /rest/v1/mascot_inventory
--        { "user_id": "<own uid>", "item_key": "stage_champion" }
--      `useBuyItem` inserts the inventory row *first* and the spend row
--      second, so even the honest client hands over the item and then asks for
--      payment. Anything that interrupts it between the two statements is a
--      free item, no attacker required.
--
-- Prices also came from the client: `amount: -item.price` was whatever the
-- caller sent.
--
-- ── what replaces it ──
--
-- Owning costs money, so owning moves behind a function. Equipping is free and
-- stays where it is: you can only equip something you already own, and a
-- trigger stops an UPDATE from turning one item into another.

-- ── prices live in the database ──
--
-- Seeded from `native/src/lib/mascot-room.ts`, which stays the catalogue the UI
-- reads — names, art and rarity have no business in SQL. Only the number that
-- must not be client-supplied moves. `tools/economy-authority.mjs` fails if the
-- two ever disagree, because two prices for one hat is worse than either.
CREATE TABLE IF NOT EXISTS public.shop_prices (
  item_key TEXT PRIMARY KEY,
  price INTEGER NOT NULL CHECK (price > 0)
);

ALTER TABLE public.shop_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can read prices" ON public.shop_prices
  FOR SELECT TO authenticated USING (true);
-- deliberately no write policy: the price list is not user data

INSERT INTO public.shop_prices (item_key, price) VALUES
    ('head_band', 80),
    ('head_cap', 100),
    ('head_beanie', 150),
    ('head_phones', 200),
    ('face_shades', 60),
    ('face_goggles', 80),
    ('face_mask', 60),
    ('face_heart', 150),
    ('face_vr', 350),
    ('top_tank', 100),
    ('top_tee', 80),
    ('top_hoodie', 180),
    ('top_jersey', 160),
    ('bottom_short', 80),
    ('bottom_jogger', 100),
    ('bottom_legging', 150),
    ('bottom_camo', 160),
    ('shoes_sneaker', 100),
    ('shoes_runner', 200),
    ('shoes_glow', 350),
    ('shoes_wing', 650),
    ('back_backpack', 100),
    ('back_hydro', 180),
    ('back_cape', 400),
    ('hand_bottle', 60),
    ('hand_dumbbell', 80),
    ('hand_towel', 60),
    ('hand_rope', 140),
    ('hand_trophy', 400),
    ('head_santa', 150),
    ('top_xmas', 180),
    ('head_khanxep', 150),
    ('top_aodai', 350),
    ('head_witch', 160),
    ('top_ghost', 180),
    ('back_dragonwing', 800),
    ('stage_night', 300),
    ('stage_sunset', 500),
    ('stage_champion', 800)
ON CONFLICT (item_key) DO UPDATE SET price = EXCLUDED.price;

-- ── the ledger stops taking dictation ──
DROP POLICY IF EXISTS "Users can insert own mascot transactions" ON public.mascot_transactions;
DROP POLICY IF EXISTS "Users can insert own mascot inventory" ON public.mascot_inventory;
DROP POLICY IF EXISTS "Users can delete own mascot inventory" ON public.mascot_inventory;

/**
 * Buy an item: price, balance and both rows, in one statement nobody can
 * interrupt halfway.
 *
 * Returns the balance left, or raises. The item key is the only thing the
 * caller supplies — the price is looked up, the balance is computed from the
 * ledger, and the two writes are in one transaction, so the "own it now, pay
 * later" window the client had does not exist here.
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

  -- Locked so two requests in flight cannot both read the same balance and
  -- both decide it is enough.
  SELECT COALESCE(SUM(amount), 0) INTO v_balance
    FROM public.mascot_transactions WHERE user_id = v_uid FOR UPDATE;

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

/**
 * Credit a reward.
 *
 * ── what this does and does not prove ──
 *
 * It does **not** re-derive whether the quest was really completed. That logic
 * lives in `mascot-room.ts` and reimplementing it here would be a second source
 * of truth for every reward in the app — a bigger and more permanent hazard
 * than the one being closed.
 *
 * What it does is bound the damage. The amount is clamped to a per-claim
 * ceiling and a per-day ceiling, so the worst a forged call achieves is
 * claiming a reward it had not earned yet — not minting a balance. The
 * `UNIQUE(user_id, ref_key)` already makes each claim once-only.
 *
 * The ceilings are the honest maxima of the existing economy: the largest
 * single reward is a platinum challenge at 120, and a maximal day is the five
 * daily quests (75) plus a streak bonus (25) plus a challenge (120) — 220, so
 * 400 leaves room without leaving the door open.
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

/**
 * Equipping stays a plain UPDATE, because it is free — you can only wear what
 * you already own. What the trigger stops is the UPDATE being used to turn a
 * cheap item into an expensive one, which would be the same theft by another
 * route.
 */
CREATE OR REPLACE FUNCTION public.mascot_inventory_item_is_fixed()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.item_key IS DISTINCT FROM OLD.item_key THEN
    RAISE EXCEPTION 'item_key cannot be changed';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mascot_inventory_no_swap ON public.mascot_inventory;
CREATE TRIGGER mascot_inventory_no_swap
  BEFORE UPDATE ON public.mascot_inventory
  FOR EACH ROW EXECUTE FUNCTION public.mascot_inventory_item_is_fixed();

-- ── entitlements, before there is anything to steal ──
--
-- Subscriptions are not built yet. This table exists now so that the flag has
-- nowhere tempting to land when they are: `profiles` carries a client UPDATE
-- policy, so an `is_pro` column there would be one REST call away from a free
-- upgrade for anybody who reads the app's own network traffic.
--
-- Readable by its owner, written by nobody with a user token. The only writer
-- is a webhook running as service_role — the store telling the server what was
-- purchased, verified against the store's own receipt. A client that can write
-- this table is a client that can grant itself the product.
CREATE TABLE IF NOT EXISTS public.entitlements (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'plus', 'max')),
  -- what the store said, kept so a support question can be answered
  store TEXT,
  store_txn_id TEXT,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own entitlement" ON public.entitlements
  FOR SELECT USING (auth.uid() = user_id);
-- deliberately no INSERT/UPDATE/DELETE policy for any user role

/** The caller's tier, trusted because the caller cannot write it. */
CREATE OR REPLACE FUNCTION public.current_tier()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT tier FROM public.entitlements
      WHERE user_id = auth.uid()
        AND (expires_at IS NULL OR expires_at > now())),
    'free');
$$;
