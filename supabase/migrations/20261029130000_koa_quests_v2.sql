/*
  Nhiệm vụ của Koa, ba loại (#527 phần 4; Kiệt duyệt 29/10 — mock "Phòng của Koa").

  1. Tập luyện: nhiệm vụ ngày mới `d:<ngày>:overload` — làm theo gợi ý tăng tải
     (ít nhất một bài nặng hơn / nhiều rep hơn lần trước của chính bài ấy). Chỉ cần
     giá `quest:overload`: `reward_amount_for` đã tra `quest:<khoá>` cho mọi `d:`.
     +3 Gains tính ở app từ chính dòng sổ này (Gains không có sổ riêng trên server).

  2. Khám phá app, một lần trọn đời: khoá `x:<việc>` → giá `explore:<việc>`. Bảy
     việc: ảnh tiến bộ, kể bằng giọng nói, ghi bữa bằng camera, quét mã vạch, bật
     lời nhắc, xem Tổng kết tuần, Hỏi Koa. `UNIQUE(user_id, ref_key)` giữ "một lần".

  3. Khoá `x:` nằm NGOÀI trần 800 xu / ngày (Kiệt chọn): mỗi khoá chỉ trả một lần
     trong đời tài khoản, tổng cả bảy là 195 xu, nên không có đường in xu qua đây;
     trần ngày vẫn giữ nguyên cho mọi khoá khác, và xu khám phá không ăn vào trần
     của các khoá khác.

  Như mọi nhiệm vụ hiện có, server không xác minh việc đã làm (xem
  `native/tools/economic-integrity.mjs`); khác biệt duy nhất của `x:` là trần ngày.
*/

INSERT INTO public.reward_prices (reward_key, coins) VALUES
  ('quest:overload', 20),
  ('explore:photo', 40),
  ('explore:voice', 25),
  ('explore:mealcam', 30),
  ('explore:barcode', 25),
  ('explore:reminder', 20),
  ('explore:review', 30),
  ('explore:askkoa', 25)
ON CONFLICT (reward_key) DO UPDATE SET coins = EXCLUDED.coins;

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
    IF v_date > (now() AT TIME ZONE 'UTC')::date + 1 THEN RETURN NULL; END IF;
    IF v_date < (now() AT TIME ZONE 'UTC')::date - 2 THEN RETURN NULL; END IF;
    IF v_parts[3] = 'streak' THEN
      RETURN (SELECT coins FROM public.reward_prices WHERE reward_key = 'streak:max');
    END IF;
    RETURN (SELECT coins FROM public.reward_prices WHERE reward_key = 'quest:' || v_parts[3]);
  END IF;

  IF p_ref_key LIKE 'ch:%' THEN
    v_parts := string_to_array(p_ref_key, ':');
    IF array_length(v_parts, 1) <> 4 THEN RETURN NULL; END IF;
    RETURN (SELECT coins FROM public.reward_prices WHERE reward_key = 'challenge:' || v_parts[2]);
  END IF;

  IF p_ref_key LIKE 'w:%' THEN
    v_key := substring(p_ref_key from 3);
    IF v_key = '' THEN RETURN NULL; END IF;
    RETURN (SELECT coins FROM public.reward_prices WHERE reward_key = 'weekly');
  END IF;

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

  RETURN v_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.reward_amount_for(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reward_amount_for(TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_quest_reward(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_quest_reward(TEXT, TEXT) TO authenticated, service_role;
