-- Ví Koa ở server (round 3, AUD-28): số dư đúng, XP gom theo loại khoá, khoá đã nhận chỉ những
-- cái còn cần hỏi, chỉ sổ của chính người gọi, khoá ngày hỏng không làm hỏng cả lượt đọc.
-- Một giao dịch rồi ROLLBACK.
\set ON_ERROR_STOP 1
BEGIN;
\set W '''ee000000-0000-4000-8000-00000000000e'''
\set O '''ef000000-0000-4000-8000-00000000000f'''
INSERT INTO auth.users (id) VALUES (:W), (:O);

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

SET ROLE service_role;
INSERT INTO mascot_transactions (user_id, amount, reason, ref_key)
SELECT :W, 10, 'thử', 'd:' || ((now() AT TIME ZONE 'UTC')::date - i) || ':meal' FROM generate_series(0, 1499) i;  -- 1500 ngày bữa ăn
INSERT INTO mascot_transactions (user_id, amount, reason, ref_key) VALUES
  (:W, 300, 'thử', 'welcome'),
  (:W, 40, 'thử', 'x:photo'),
  (:W, 50, 'thử', 'ch:silver:' || ((now() AT TIME ZONE 'UTC')::date - 3) || ':koa_week'),
  (:W, 50, 'thử', 'ch:silver:2020-01-06:koa_week'),
  (:W, 25, 'thử', 'ch:bronze:2026-13-40:hong'),          -- khoá cũ, ngày hỏng
  (:W, -150, 'thử', 'freeze:00000000-0000-4000-8000-000000000001'),
  (:O, 999, 'thử', 'welcome');
RESET ROLE;

SELECT pg_temp.who('ee000000-0000-4000-8000-00000000000e'); SET ROLE authenticated;
CREATE TEMP TABLE w AS SELECT public.mascot_wallet() AS j;
RESET ROLE;

DO $$ DECLARE j jsonb := (SELECT j FROM w); BEGIN
  ASSERT (j->>'balance')::int = 1500 * 10 + 300 + 40 + 50 + 50 + 25 - 150,
    format('W1 số dư sai: %s', j->>'balance');
  ASSERT (SELECT (x->>'n')::int FROM jsonb_array_elements(j->'xp') x WHERE x->>'key' = 'd:2000-01-03:meal') = 1500,
    'W2 XP bữa ăn không gom đủ 1500 dòng (lượt đọc bị cắt?)';
  ASSERT (SELECT (x->>'n')::int FROM jsonb_array_elements(j->'xp') x WHERE x->>'key' = 'ch:silver:2000-01-03:xp') = 2,
    'W2 XP thử thách bạc không gom đủ 2 dòng';
  ASSERT jsonb_array_length(j->'claimed') < 20, format('W3 khoá đã nhận không gọn: %s', jsonb_array_length(j->'claimed'));
  ASSERT j->'claimed' ? 'welcome' AND j->'claimed' ? 'x:photo', 'W3 thiếu khoá một lần';
  ASSERT j->'claimed' ? ('d:' || (now() AT TIME ZONE 'UTC')::date || ':meal'), 'W3 thiếu khoá bữa ăn hôm nay';
  ASSERT NOT (j->'claimed' ? ('d:' || ((now() AT TIME ZONE 'UTC')::date - 30) || ':meal')), 'W3 khoá ngày cũ vẫn trả về';
  ASSERT NOT (j->'claimed' ? 'ch:silver:2020-01-06:koa_week'), 'W3 khoá tuần cũ vẫn trả về';
  ASSERT j->'claimed' ? 'ch:bronze:2026-13-40:hong', 'W4 khoá ngày hỏng làm mất dòng (phải coi như khoá một lần)';
END $$;

-- W5: người khác không thấy sổ của W; anon không gọi được.
SELECT pg_temp.who('ef000000-0000-4000-8000-00000000000f'); SET ROLE authenticated;
DO $$ BEGIN ASSERT (public.mascot_wallet()->>'balance')::int = 999, 'W5 ví của O lẫn sổ của W'; END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.mascot_wallet()', 'EXECUTE'), 'W5 anon gọi được mascot_wallet';
END $$;

\echo 'VÍ KOA Ở SERVER: W1–W5 xanh'
ROLLBACK;
