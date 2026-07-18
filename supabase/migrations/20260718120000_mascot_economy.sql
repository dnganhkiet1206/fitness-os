-- Mascot room economy: coin ledger + owned items.
-- Balance = SUM(amount); UNIQUE(user_id, ref_key) makes every earn/spend
-- idempotent (claiming the same daily quest twice is a no-op).

CREATE TABLE public.mascot_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  ref_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, ref_key)
);

CREATE INDEX idx_mascot_tx_user ON public.mascot_transactions(user_id, created_at DESC);

ALTER TABLE public.mascot_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own mascot transactions" ON public.mascot_transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own mascot transactions" ON public.mascot_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
-- no UPDATE/DELETE policies: the ledger is append-only

CREATE TABLE public.mascot_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  equipped BOOLEAN NOT NULL DEFAULT false,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, item_key)
);

ALTER TABLE public.mascot_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own mascot inventory" ON public.mascot_inventory
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own mascot inventory" ON public.mascot_inventory
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own mascot inventory" ON public.mascot_inventory
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own mascot inventory" ON public.mascot_inventory
  FOR DELETE USING (auth.uid() = user_id);
