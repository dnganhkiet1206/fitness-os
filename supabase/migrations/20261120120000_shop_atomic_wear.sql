-- KOA-T18 / KOA-T19 (audit Koa 17/11, P1): mua và mặc đồ Koa nguyên khối.
--
-- Trước:
--   * `buy_mascot_item` kiểm "đã có" TRƯỚC khoá tư vấn, chèn không ON CONFLICT: hai lượt mua
--     cùng lúc → lượt sau nổ unique_violation (23505) thô, app không hiểu được là "đã có".
--   * Mua xong mặc món mới (equipped = true) nhưng món cùng chỗ (mũ cũ…) do app tắt bằng một
--     UPDATE riêng, lỗi thì nuốt → hai món cùng chỗ đều đang mặc.
--   * Mặc / cởi là hai UPDATE rời nhau từ app, cái thứ hai bỏ kết quả → máy và server lệch.
-- Sau:
--   * `buy_mascot_item`: khoá TRƯỚC khi kiểm, bắt unique_violation → 'already owned'.
--   * `buy_and_wear_mascot_item(p_item_key, p_unequip)`: mua + mặc + cởi các món cùng chỗ
--     trong MỘT giao dịch.
--   * `set_mascot_worn(p_on, p_off)`: đặt cả nhóm trong MỘT giao dịch; trả false khi `p_on`
--     không có trong tủ (như 0 hàng của đường cũ).
-- Nhóm chỗ mặc do app tính (`MascotShop.conflictingKeys`) — server chỉ đặt đúng các khoá app
-- gửi, và chỉ trên hàng của chính người gọi. Hàng cũ đang mặc hai món một chỗ: không sửa ở
-- đây; lần mặc / mua kế tiếp của chỗ ấy tự đưa về một món.

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

  -- Khoá TRƯỚC khi kiểm (KOA-T18): lượt mua thứ hai chờ lượt đầu xong rồi mới thấy "đã có".
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  IF EXISTS (SELECT 1 FROM public.mascot_inventory WHERE user_id = v_uid AND item_key = p_item_key) THEN
    RAISE EXCEPTION 'already owned';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
    FROM public.mascot_transactions WHERE user_id = v_uid;

  IF v_balance < v_price THEN
    RAISE EXCEPTION 'insufficient coins';
  END IF;

  BEGIN
    INSERT INTO public.mascot_transactions (user_id, amount, reason, ref_key)
      VALUES (v_uid, -v_price, 'buy ' || p_item_key, 'buy:' || p_item_key);
    INSERT INTO public.mascot_inventory (user_id, item_key, equipped)
      VALUES (v_uid, p_item_key, true);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'already owned';
  END;

  RETURN v_balance - v_price;
END;
$$;

CREATE OR REPLACE FUNCTION public.buy_and_wear_mascot_item(p_item_key TEXT, p_unequip TEXT[] DEFAULT '{}')
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_left INTEGER;
BEGIN
  v_left := public.buy_mascot_item(p_item_key);
  UPDATE public.mascot_inventory
     SET equipped = false
   WHERE user_id = v_uid
     AND item_key = ANY(COALESCE(p_unequip, '{}'))
     AND item_key <> p_item_key;
  RETURN v_left;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_mascot_worn(p_on TEXT, p_off TEXT[] DEFAULT '{}')
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_found BOOLEAN := true;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  IF p_on IS NOT NULL THEN
    UPDATE public.mascot_inventory SET equipped = true WHERE user_id = v_uid AND item_key = p_on;
    v_found := FOUND;
  END IF;
  UPDATE public.mascot_inventory
     SET equipped = false
   WHERE user_id = v_uid
     AND item_key = ANY(COALESCE(p_off, '{}'))
     AND item_key IS DISTINCT FROM p_on;
  RETURN v_found;
END;
$$;

REVOKE ALL ON FUNCTION public.buy_mascot_item(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_mascot_item(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.buy_and_wear_mascot_item(TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_and_wear_mascot_item(TEXT, TEXT[]) TO authenticated;
REVOKE ALL ON FUNCTION public.set_mascot_worn(TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_mascot_worn(TEXT, TEXT[]) TO authenticated;
