-- Khoá ngoại tới dòng CHA của người khác (#149). Người dùng riêng; một giao
-- dịch rồi ROLLBACK, không để lại gì cho bộ khác.
--
-- Postgres kiểm khoá ngoại bằng quyền chủ bảng, không qua RLS. Policy của
-- supplement_intake_logs / workout_sessions / routine_days chỉ hỏi
-- `auth.uid() = user_id`, và policy của meal_entry_items / meal_plan_items hỏi
-- chủ của BỮA / KẾ HOẠCH cha, không hỏi thực phẩm được trỏ tới. Nên B tạo được
-- một dòng CỦA B trỏ vào supplement / template / thực phẩm RIÊNG của A, nếu
-- biết UUID — A xoá dòng cha thì dòng của B bị xoá theo (CASCADE) hay mất tham
-- chiếu (SET NULL), và share_recipe đọc serving_g của thực phẩm được trỏ tới.
--
-- Mỗi kịch bản "bị chặn" đi cùng một đối chứng "được phép" trên dòng của chính
-- mình hoặc thư viện chung — không thì nó xanh nhờ một policy chặn tất cả.
\set ON_ERROR_STOP 1
BEGIN;
\set A '''fa000000-0000-4000-8000-00000000000a'''
\set B '''fb000000-0000-4000-8000-00000000000b'''
INSERT INTO auth.users (id) VALUES (:A), (:B);

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

-- Dòng cha: của A, của B, và một thực phẩm chung.
SET ROLE service_role;
INSERT INTO supplements (id, user_id, name) VALUES
  ('5a000000-0000-4000-8000-00000000000a', :A, 'Creatine của A'),
  ('5b000000-0000-4000-8000-00000000000b', :B, 'Creatine của B');
INSERT INTO workout_templates (id, user_id, name) VALUES
  ('7a000000-0000-4000-8000-00000000000a', :A, 'Push của A'),
  ('7b000000-0000-4000-8000-00000000000b', :B, 'Push của B');
INSERT INTO food_items (id, user_id, name) VALUES
  ('fda00000-0000-4000-8000-00000000000a', :A, 'Món riêng của A'),
  ('fdb00000-0000-4000-8000-00000000000b', :B, 'Món riêng của B'),
  ('fdc00000-0000-4000-8000-00000000000c', NULL, 'Cơm trắng (chung)');
INSERT INTO meal_entries (id, user_id) VALUES ('3b000000-0000-4000-8000-00000000000b', :B);
INSERT INTO meal_plans (id, user_id) VALUES ('9b000000-0000-4000-8000-00000000000b', :B);
RESET ROLE;

SELECT pg_temp.who('fb000000-0000-4000-8000-00000000000b'); SET ROLE authenticated;
-- ── thực phẩm bổ sung ──
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO supplement_intake_logs (user_id, supplement_id) VALUES ('fb000000-0000-4000-8000-00000000000b', '5b000000-0000-4000-8000-00000000000b')$q$) = 'ok', 'F1 đối chứng: B không ghi được lần uống cho thực phẩm bổ sung CỦA MÌNH'; END $$;
DO $$ DECLARE e text := pg_temp.errcode($q$INSERT INTO supplement_intake_logs (user_id, supplement_id) VALUES ('fb000000-0000-4000-8000-00000000000b', '5a000000-0000-4000-8000-00000000000a')$q$); BEGIN
  ASSERT e = '42501', format('F2 B ghi được lần uống trỏ vào thực phẩm bổ sung của A — cần 42501, được %s', e); END $$;
DO $$ DECLARE e text := pg_temp.errcode($q$UPDATE supplement_intake_logs SET supplement_id = '5a000000-0000-4000-8000-00000000000a'$q$); BEGIN
  ASSERT e = '42501', format('F3 B chuyển được lần uống của mình sang thực phẩm bổ sung của A — cần 42501, được %s', e); END $$;
-- ── buổi tập / lịch tuần trỏ vào mẫu ──
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO workout_sessions (user_id, template_id) VALUES ('fb000000-0000-4000-8000-00000000000b', '7b000000-0000-4000-8000-00000000000b')$q$) = 'ok'
  AND pg_temp.errcode($q$INSERT INTO workout_sessions (user_id, template_id) VALUES ('fb000000-0000-4000-8000-00000000000b', NULL)$q$) = 'ok', 'F4 đối chứng: B không ghi được buổi tập theo mẫu của mình / không mẫu'; END $$;
DO $$ DECLARE e text := pg_temp.errcode($q$INSERT INTO workout_sessions (user_id, template_id) VALUES ('fb000000-0000-4000-8000-00000000000b', '7a000000-0000-4000-8000-00000000000a')$q$); BEGIN
  ASSERT e = '42501', format('F5 B ghi được buổi tập trỏ vào mẫu của A — cần 42501, được %s', e); END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO routine_days (user_id, day_of_week, template_id) VALUES ('fb000000-0000-4000-8000-00000000000b', 1, '7b000000-0000-4000-8000-00000000000b')$q$) = 'ok', 'F6 đối chứng: B không xếp được mẫu của mình vào lịch tuần'; END $$;
DO $$ DECLARE e text := pg_temp.errcode($q$INSERT INTO routine_days (user_id, day_of_week, template_id) VALUES ('fb000000-0000-4000-8000-00000000000b', 2, '7a000000-0000-4000-8000-00000000000a')$q$); BEGIN
  ASSERT e = '42501', format('F7 B xếp được mẫu của A vào lịch tuần của mình — cần 42501, được %s', e); END $$;
-- ── món trong bữa / kế hoạch trỏ vào thực phẩm ──
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO meal_entry_items (meal_entry_id, food_item_id) VALUES ('3b000000-0000-4000-8000-00000000000b', 'fdb00000-0000-4000-8000-00000000000b')$q$) = 'ok'
  AND pg_temp.errcode($q$INSERT INTO meal_entry_items (meal_entry_id, food_item_id) VALUES ('3b000000-0000-4000-8000-00000000000b', 'fdc00000-0000-4000-8000-00000000000c')$q$) = 'ok'
  AND pg_temp.errcode($q$INSERT INTO meal_entry_items (meal_entry_id, food_item_id) VALUES ('3b000000-0000-4000-8000-00000000000b', NULL)$q$) = 'ok', 'F8 đối chứng: B không ghi được món trỏ vào thực phẩm của mình / thư viện chung / không thực phẩm'; END $$;
DO $$ DECLARE e text := pg_temp.errcode($q$INSERT INTO meal_entry_items (meal_entry_id, food_item_id) VALUES ('3b000000-0000-4000-8000-00000000000b', 'fda00000-0000-4000-8000-00000000000a')$q$); BEGIN
  ASSERT e = '42501', format('F9 B ghi được món trỏ vào thực phẩm RIÊNG của A — cần 42501, được %s', e); END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO meal_plan_items (meal_plan_id, food_item_id) VALUES ('9b000000-0000-4000-8000-00000000000b', 'fdc00000-0000-4000-8000-00000000000c')$q$) = 'ok', 'F10 đối chứng: B không thêm được thực phẩm chung vào kế hoạch của mình'; END $$;
DO $$ DECLARE e text := pg_temp.errcode($q$INSERT INTO meal_plan_items (meal_plan_id, food_item_id) VALUES ('9b000000-0000-4000-8000-00000000000b', 'fda00000-0000-4000-8000-00000000000a')$q$); BEGIN
  ASSERT e = '42501', format('F11 B thêm được thực phẩm RIÊNG của A vào kế hoạch của mình — cần 42501, được %s', e); END $$;
RESET ROLE;

\echo 'KHOÁ NGOẠI TỚI DÒNG CHA: F1–F11 xanh'
ROLLBACK;
