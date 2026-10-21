-- Đổi lịch riêng một ngày (#527 GĐ1, 20261020140000) — chạy THẬT, chỉ ở máy / CI,
-- không đụng project nào. Một giao dịch rồi ROLLBACK.
--
-- App gửi mỗi hàng bằng `upsert(onConflict: 'user_id,date')` (PostgREST →
-- INSERT … ON CONFLICT (user_id, date) DO UPDATE). Các kịch bản dưới đây là đúng
-- câu ấy, chạy bằng quyền người dùng thật (authenticated + RLS):
--   D1 dời T4 → T5: hai hàng; GỬI LẠI cùng hai câu (mất phản hồi, app chết giữa
--      lượt) vẫn là hai hàng, cùng nội dung — không trùng, không hàng thứ ba.
--   D2 đổi thành nghỉ rồi gửi lại: một hàng.
--   D3 ngày nghỉ không mang buổi; dời từ / tới chính nó — CHECK chặn (23514).
--   D4 B không thấy / không sửa được hàng của A (RLS).
--   D5 xoá mẫu: hàng mang buổi đi theo (CASCADE); hàng nghỉ đã chọn ở lại.
\set ON_ERROR_STOP 1
BEGIN;
\set A '''da000000-0000-4000-8000-00000000000a'''
\set B '''db000000-0000-4000-8000-00000000000b'''
INSERT INTO auth.users (id) VALUES (:A), (:B);

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

SET ROLE service_role;
INSERT INTO workout_templates (id, user_id, name) VALUES
  ('7d000000-0000-4000-8000-00000000000a', :A, 'Chest của A'),
  ('7d000000-0000-4000-8000-00000000000b', :B, 'Chest của B');
INSERT INTO plan_day_overrides (user_id, date, is_rest) VALUES (:A, '2026-10-21', true);
RESET ROLE;

SELECT pg_temp.who('db000000-0000-4000-8000-00000000000b'); SET ROLE authenticated;

-- D1: dời T4 (21/10) → T5 (22/10), rồi gửi lại y hệt.
DO $$
DECLARE
  move_from text := $q$INSERT INTO plan_day_overrides (user_id, date, template_id, is_rest, moved_to)
    VALUES ('db000000-0000-4000-8000-00000000000b', '2026-10-21', NULL, true, '2026-10-22')
    ON CONFLICT (user_id, date) DO UPDATE SET template_id = EXCLUDED.template_id, is_rest = EXCLUDED.is_rest,
      moved_from = EXCLUDED.moved_from, moved_to = EXCLUDED.moved_to$q$;
  move_to text := $q$INSERT INTO plan_day_overrides (user_id, date, template_id, is_rest, moved_from)
    VALUES ('db000000-0000-4000-8000-00000000000b', '2026-10-22', '7d000000-0000-4000-8000-00000000000b', false, '2026-10-21')
    ON CONFLICT (user_id, date) DO UPDATE SET template_id = EXCLUDED.template_id, is_rest = EXCLUDED.is_rest,
      moved_from = EXCLUDED.moved_from, moved_to = EXCLUDED.moved_to$q$;
  n int;
BEGIN
  ASSERT pg_temp.errcode(move_from) = 'ok' AND pg_temp.errcode(move_to) = 'ok', 'D1 B không dời được buổi của mình';
  ASSERT pg_temp.errcode(move_from) = 'ok' AND pg_temp.errcode(move_to) = 'ok', 'D1 gửi lại bị lỗi';
  SELECT count(*) INTO n FROM plan_day_overrides;
  ASSERT n = 2, format('D1 gửi lại phải vẫn là 2 hàng của B, được %s', n);
  ASSERT (SELECT is_rest AND template_id IS NULL AND moved_to = '2026-10-22' FROM plan_day_overrides WHERE date = '2026-10-21'),
    'D1 ngày gốc phải là nghỉ, ghi lại nơi buổi đi tới';
  ASSERT (SELECT NOT is_rest AND template_id = '7d000000-0000-4000-8000-00000000000b' AND moved_from = '2026-10-21'
          FROM plan_day_overrides WHERE date = '2026-10-22'), 'D1 ngày đích phải nhận đúng buổi';
END $$;

-- D2: đổi T6 (23/10) thành nghỉ, gửi lại.
DO $$
DECLARE
  rest text := $q$INSERT INTO plan_day_overrides (user_id, date, is_rest) VALUES ('db000000-0000-4000-8000-00000000000b', '2026-10-23', true)
    ON CONFLICT (user_id, date) DO UPDATE SET template_id = EXCLUDED.template_id, is_rest = EXCLUDED.is_rest$q$;
  n int;
BEGIN
  ASSERT pg_temp.errcode(rest) = 'ok' AND pg_temp.errcode(rest) = 'ok', 'D2 đổi thành nghỉ / gửi lại bị lỗi';
  SELECT count(*) INTO n FROM plan_day_overrides WHERE date = '2026-10-23';
  ASSERT n = 1, format('D2 phải là 1 hàng, được %s', n);
END $$;

-- D3: ràng buộc.
DO $$ DECLARE e text := pg_temp.errcode($q$INSERT INTO plan_day_overrides (user_id, date, template_id, is_rest) VALUES ('db000000-0000-4000-8000-00000000000b', '2026-10-24', '7d000000-0000-4000-8000-00000000000b', true)$q$); BEGIN
  ASSERT e = '23514', format('D3 ngày nghỉ mang buổi phải bị CHECK chặn — cần 23514, được %s', e); END $$;
DO $$ DECLARE e text := pg_temp.errcode($q$INSERT INTO plan_day_overrides (user_id, date, is_rest, moved_from) VALUES ('db000000-0000-4000-8000-00000000000b', '2026-10-25', false, '2026-10-25')$q$); BEGIN
  ASSERT e = '23514', format('D3 dời từ chính nó phải bị CHECK chặn — cần 23514, được %s', e); END $$;

-- D4: hàng của A vô hình và không sửa được với B.
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM plan_day_overrides WHERE user_id = 'da000000-0000-4000-8000-00000000000a';
  ASSERT n = 0, format('D4 B thấy %s hàng của A', n);
  UPDATE plan_day_overrides SET is_rest = false WHERE user_id = 'da000000-0000-4000-8000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, format('D4 B sửa được %s hàng của A', n);
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT is_rest FROM plan_day_overrides WHERE user_id = 'da000000-0000-4000-8000-00000000000a'), 'D4 hàng của A bị đổi';
END $$;

-- D5: xoá mẫu của B → ngày nhận buổi đi theo; ngày nghỉ đã chọn ở lại.
SELECT pg_temp.who('db000000-0000-4000-8000-00000000000b'); SET ROLE authenticated;
DELETE FROM workout_templates WHERE id = '7d000000-0000-4000-8000-00000000000b';
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM plan_day_overrides WHERE date = '2026-10-22'), 'D5 hàng mang buổi phải đi theo mẫu đã xoá';
  ASSERT EXISTS (SELECT 1 FROM plan_day_overrides WHERE date = '2026-10-21' AND is_rest), 'D5 ngày nghỉ đã chọn phải ở lại';
END $$;
RESET ROLE;

\echo 'ĐỔI LỊCH THEO NGÀY: D1–D5 xanh'
ROLLBACK;
