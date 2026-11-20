-- KOA-T01 (audit Koa 17/11, K-01, P0): nhận thưởng trùng phải phân biệt được.
--
-- Trước: `INSERT … ON CONFLICT DO NOTHING; RETURN v_amount` — khoá đã nhận vẫn trả đủ số xu,
-- nên cả 4 đường nhận ở app (nhiệm vụ ngày, tuần Koa, bộ sưu tập, thử thách tuần) mừng lại
-- khi thử lại / máy khác / cài lại app. Trần ngày còn kiểm TRƯỚC khi chèn, nên một khoá đã
-- nhận có thể bị từ chối oan "daily reward ceiling reached" khi gần trần.
--
-- Sau (giữ nguyên chữ ký và kiểu trả INTEGER, app cũ vẫn chạy):
--   * khoá đã có → trả 0 ngay, không kiểm trần (giá thật luôn > 0: reward_prices CHECK coins > 0,
--     nên 0 chỉ có nghĩa "đã nhận rồi");
--   * hai lượt chạy đua cùng khoá (khoá tư vấn đã tuần tự hoá theo người, nhưng phòng hờ):
--     lượt chèn hụt (ROW_COUNT = 0) cũng trả 0.
-- Thứ tự lên: migration này trước, app sau (app mới coi 0 là "đã nhận"; app cũ thấy 0 thì
-- chỉ mừng "+0" — không có người dùng thật, chấp nhận được).
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
  v_rows INTEGER;
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

  -- đã nhận rồi: 0, và không đụng trần ngày (KOA-T01)
  IF EXISTS (SELECT 1 FROM public.mascot_transactions WHERE user_id = v_uid AND ref_key = p_ref_key) THEN
    RETURN 0;
  END IF;

  -- khoá khám phá (`x:`) một lần trọn đời: ngoài trần ngày, và không tính vào trần
  IF p_ref_key NOT LIKE 'x:%' THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_today
      FROM public.mascot_transactions
     WHERE user_id = v_uid
       AND amount > 0
       AND COALESCE(ref_key, '') NOT LIKE 'x:%'
       AND created_at >= date_trunc('day', now());

    IF v_today + v_amount > MAX_PER_DAY THEN
      RAISE EXCEPTION 'daily reward ceiling reached';
    END IF;
  END IF;

  INSERT INTO public.mascot_transactions (user_id, amount, reason, ref_key)
    VALUES (v_uid, v_amount, p_reason, p_ref_key)
    ON CONFLICT (user_id, ref_key) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN 0;
  END IF;

  RETURN v_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_quest_reward(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_quest_reward(TEXT, TEXT) TO authenticated, service_role;
