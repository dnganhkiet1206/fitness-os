-- ════════════════════════════════════════════════════════════════════════════
-- Thưởng Koa — server tự kiểm hình dạng khoá `ch:` và bỏ khoá `w:` (round 3,
-- AUD-02 / R3-SEC-01).
--
-- `claim_quest_reward` đã có: giá do server quyết (`reward_amount_for`), khoá
-- một lần mỗi `(user_id, ref_key)`, trần 800 xu / ngày, khoá cố vấn theo người.
-- Còn hở hai chỗ, cả hai cho một client sửa đổi lấy đầy trần 800 xu MỖI NGÀY mà
-- không làm gì:
--
-- 1. `w:<bất kỳ>` — nhận MỌI đuôi (`w:a`, `w:b`, …), mỗi đuôi một lần thưởng
--    tuần. App native không còn tạo khoá này (thưởng tuần là `ch:…:koa_week`);
--    nó là di sản RN. Bỏ: trả NULL → 'unknown reward'.
-- 2. `ch:<hạng>:<thứ Hai>:<khoá>` — hạng, ngày và khoá đều do client chọn:
--    nhận thử thách đồng (25) với giá bạch kim (120), và đổi đuôi `<khoá>` để
--    nhận lại vô hạn. Server biết đủ để tự kiểm, vì app chọn thử thách của tuần
--    bằng một công thức tất định (`WeeklyChallenges.pick`, `pickChallengesForWeek`
--    của RN): `YYYYMMDD % 8`, ba thử thách liền nhau trong bể 8 thử thách, mỗi
--    thử thách một hạng cố định. Thêm `koa_week` (hạng bạc, `KoaWeek.rewardTier`).
--
-- Luật mới cho `ch:`: đúng 4 phần; ngày là thứ Hai (ISO), không quá 15 ngày
-- trước và không sau ngày mai (UTC — tuần tính theo giờ máy, nên chừa ±1 ngày);
-- khoá thuộc ba thử thách của ĐÚNG tuần ấy hoặc là `koa_week`; hạng trùng hạng
-- cố định của khoá. Mỗi (tuần, khoá) chỉ còn một ref_key hợp lệ → một lần.
--
-- Không kiểm "đã làm xong thật" (đếm buổi tập, đạm…): số liệu ấy cũng do client
-- ghi, kiểm trên chúng chỉ đổi chỗ tin client. Ghi ở REMAINING_RISKS (R3-SEC-02).
--
-- Bể thử thách PHẢI khớp `apps/ios/.../Mascot/WeeklyChallenges.swift` (`pool`).
-- Đổi bể bên app mà không đổi ở đây thì thử thách mới bị từ chối — test
-- `rpc_reward_keys.test.sql` ghim cả bể lẫn thứ tự.
-- ════════════════════════════════════════════════════════════════════════════

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
  v_today DATE := (now() AT TIME ZONE 'UTC')::date;
  -- `WeeklyChallenges.pool`, đúng thứ tự (thứ tự quyết định xoay vòng)
  v_pool TEXT[] := ARRAY['workouts_5','workouts_3','protein_7','steps_50k','sleep_7','log_7','calories_5','water_7'];
  v_tiers TEXT[] := ARRAY['silver','bronze','gold','silver','silver','gold','silver','silver'];
  v_n INTEGER;
  v_i INTEGER;
  v_tier TEXT;
BEGIN
  IF p_ref_key IS NULL OR p_ref_key = '' THEN RETURN NULL; END IF;

  IF p_ref_key = 'welcome' THEN
    RETURN (SELECT coins FROM public.reward_prices WHERE reward_key = 'welcome');
  END IF;

  IF p_ref_key LIKE 'd:%' THEN
    v_parts := string_to_array(p_ref_key, ':');
    IF array_length(v_parts, 1) <> 3 THEN RETURN NULL; END IF;
    IF v_parts[2] !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN NULL; END IF;
    BEGIN
      v_date := v_parts[2]::date;
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
    IF v_date > v_today + 1 THEN RETURN NULL; END IF;
    IF v_date < v_today - 2 THEN RETURN NULL; END IF;
    IF v_parts[3] = 'streak' THEN
      RETURN (SELECT coins FROM public.reward_prices WHERE reward_key = 'streak:max');
    END IF;
    RETURN (SELECT coins FROM public.reward_prices WHERE reward_key = 'quest:' || v_parts[3]);
  END IF;

  IF p_ref_key LIKE 'ch:%' THEN
    v_parts := string_to_array(p_ref_key, ':');
    IF array_length(v_parts, 1) <> 4 THEN RETURN NULL; END IF;
    IF v_parts[3] !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN NULL; END IF;
    BEGIN
      v_date := v_parts[3]::date;
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
    IF extract(isodow FROM v_date) <> 1 THEN RETURN NULL; END IF;
    IF v_date > v_today + 1 OR v_date < v_today - 15 THEN RETURN NULL; END IF;
    v_key := v_parts[4];
    IF v_key = 'koa_week' THEN
      v_tier := 'silver';
    ELSE
      v_n := (to_char(v_date, 'YYYYMMDD')::bigint % 8)::int;
      v_tier := NULL;
      FOR v_i IN 0..2 LOOP
        IF v_pool[((v_n + v_i) % 8) + 1] = v_key THEN
          v_tier := v_tiers[((v_n + v_i) % 8) + 1];
        END IF;
      END LOOP;
      IF v_tier IS NULL THEN RETURN NULL; END IF;
    END IF;
    IF v_parts[2] <> v_tier THEN RETURN NULL; END IF;
    RETURN (SELECT coins FROM public.reward_prices WHERE reward_key = 'challenge:' || v_tier);
  END IF;

  -- `w:` (thưởng tuần kiểu RN) đã bỏ: đuôi tự do = nhận lại vô hạn. Rơi xuống NULL.

  IF p_ref_key LIKE 'set:%' THEN
    RETURN (SELECT coins FROM public.reward_prices WHERE reward_key = p_ref_key);
  END IF;

  -- khám phá app, một lần: `x:<việc>` (không thêm dấu `:` nào nữa)
  IF p_ref_key LIKE 'x:%' THEN
    v_key := substring(p_ref_key from 3);
    IF v_key = '' OR position(':' in v_key) > 0 THEN RETURN NULL; END IF;
    RETURN (SELECT coins FROM public.reward_prices WHERE reward_key = 'explore:' || v_key);
  END IF;

  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.reward_amount_for(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reward_amount_for(TEXT) TO authenticated, service_role;
