/*
  Dọn phòng Koa bằng xu (#527 phần 5; Kiệt duyệt 29/10).

  Phòng bám bụi khi người dùng vắng; dọn miễn phí bằng việc thật (một buổi tập, hay hai
  việc ghi trong ngày) — app tự tính từ dữ liệu đã có. Đường trả tiền: 30 xu, mỗi ngày
  một lần, khoá `clean:<ngày>` trong sổ xu (app đọc lại khoá này để biết đã dọn).

  Như `buy_streak_freeze`: khoá tư vấn theo người dùng, gọi lặp cùng ngày trả số dư mà
  không trừ lần hai, thiếu xu thì từ chối. Giá là hằng số ở đây vì đây không phải món
  trong tủ đồ (`shop_prices` chỉ chứa món mặc / phòng, `economy-authority.mjs` kiểm hai
  chiều); app đọc cùng số ở `KoaDust.cleanCoins`.
*/
CREATE OR REPLACE FUNCTION public.clean_koa_room(p_day DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  PRICE CONSTANT INTEGER := 30;
  v_balance INTEGER;
  v_ref TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  -- ngày địa phương của máy: trong một ngày quanh ngày UTC của server
  IF p_day IS NULL
     OR p_day > (now() AT TIME ZONE 'UTC')::date + 1
     OR p_day < (now() AT TIME ZONE 'UTC')::date - 1 THEN
    RAISE EXCEPTION 'bad day';
  END IF;

  v_ref := 'clean:' || p_day::text;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
    FROM public.mascot_transactions WHERE user_id = v_uid;

  -- đã dọn hôm ấy: không trừ lần hai
  IF EXISTS (SELECT 1 FROM public.mascot_transactions WHERE user_id = v_uid AND ref_key = v_ref) THEN
    RETURN v_balance;
  END IF;

  IF v_balance < PRICE THEN
    RAISE EXCEPTION 'insufficient coins';
  END IF;

  INSERT INTO public.mascot_transactions (user_id, amount, reason, ref_key)
    VALUES (v_uid, -PRICE, 'clean koa room', v_ref)
    ON CONFLICT (user_id, ref_key) DO NOTHING;

  RETURN v_balance - PRICE;
END;
$$;

REVOKE ALL ON FUNCTION public.clean_koa_room(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clean_koa_room(DATE) TO authenticated, service_role;
