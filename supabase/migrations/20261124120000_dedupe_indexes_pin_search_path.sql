-- Dọn index trùng + ghim search_path cho hai hàm trigger (audit Supabase 24/11, #527).
--
-- Thấy gì: dựng cả 100 migration lên một cụm Postgres 16 tạm và hỏi catalog —
-- 15 cặp index trên CÙNG cột, cùng opclass, cùng điều kiện (migration cũ tạo
-- một bản, migration sau tạo lại dưới tên khác). Mỗi bản thừa làm mỗi lần ghi
-- (nhật ký ngày, buổi tập, bữa ăn…) cập nhật thêm một cây B và tốn chỗ, mà
-- planner không cần cả hai: B-tree quét được hai chiều, nên (user_id, date_time)
-- và (user_id, date_time DESC) phục vụ như nhau.
--
-- Giữ bản nào: với unique, giữ CONSTRAINT `*_key` — `ON CONFLICT (user_id, date)`
-- của app chỉ dùng danh sách cột, không dùng tên. Với index thường, giữ bản DESC
-- (khớp ORDER BY … DESC của app).
--
-- An toàn khi production lệch repo: mỗi lần bỏ chỉ chạy khi bản GIỮ LẠI có mặt,
-- hợp lệ và phủ đúng các cột ấy (unique thì bản giữ cũng phải unique). Thiếu thì
-- bỏ qua và báo NOTICE — không bảng nào mất ràng buộc unique vì tên index ở
-- server khác ở repo.
--
-- Không đụng `community_fold`: advisor của Supabase cũng báo nó thiếu
-- search_path, nhưng nó là hàm SQL IMMUTABLE nằm trong index tìm kiếm. Đặt
-- `SET search_path` cho hàm SQL làm Postgres thôi inline nó — mọi truy vấn tìm
-- kiếm phải gọi hàm từng dòng. Thân hàm chỉ dùng lower/translate/coalesce của
-- pg_catalog, nên search_path không đổi được nghĩa của nó.

CREATE OR REPLACE FUNCTION pg_temp.drop_dup(tbl_name text, drop_name text, keep_name text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  tbl oid := to_regclass(tbl_name);
  d oid := to_regclass(format('public.%I', drop_name));
  k oid := to_regclass(format('public.%I', keep_name));
  con text;
BEGIN
  -- Bảng chưa có (một bộ test chỉ áp một nửa migration) → không có gì để dọn.
  IF tbl IS NULL OR d IS NULL THEN
    RAISE NOTICE 'dedupe: % không có — bỏ qua', drop_name;
    RETURN;
  END IF;
  IF k IS NULL OR k = d OR NOT EXISTS (
    SELECT 1 FROM pg_index kd JOIN pg_index dd ON dd.indexrelid = d
    WHERE kd.indexrelid = k AND kd.indrelid = tbl AND dd.indrelid = tbl
      AND kd.indisvalid
      AND kd.indkey::text = dd.indkey::text
      AND kd.indclass::text = dd.indclass::text
      AND coalesce(kd.indpred::text, '') = coalesce(dd.indpred::text, '')
      AND kd.indexprs IS NULL AND dd.indexprs IS NULL
      AND (kd.indisunique OR NOT dd.indisunique)
  ) THEN
    RAISE NOTICE 'dedupe: bản giữ % không có / không khớp — KHÔNG bỏ %', keep_name, drop_name;
    RETURN;
  END IF;
  SELECT conname INTO con FROM pg_constraint WHERE conindid = d AND conrelid = tbl;
  IF con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', tbl::regclass, con);
  ELSE
    EXECUTE format('DROP INDEX public.%I', drop_name);
  END IF;
END $$;

-- unique trùng: giữ constraint `*_key`
SELECT pg_temp.drop_dup('public.daily_logs',        'daily_logs_user_date_unique',     'daily_logs_user_id_date_key');
SELECT pg_temp.drop_dup('public.daily_logs',        'idx_daily_logs_user_date',        'daily_logs_user_id_date_key');
SELECT pg_temp.drop_dup('public.weekly_reviews',    'weekly_reviews_user_week_unique', 'weekly_reviews_user_id_week_start_date_key');
SELECT pg_temp.drop_dup('public.weight_logs',       'idx_weight_logs_user_date',       'weight_logs_user_date_unique');
SELECT pg_temp.drop_dup('public.awards',            'awards_user_key_unique',          'awards_user_id_award_key_key');
SELECT pg_temp.drop_dup('public.body_measurements', 'idx_body_measurements_user_date', 'body_measurements_user_id_date_key');
SELECT pg_temp.drop_dup('public.exercise_media',    'idx_exercise_media_exercise',     'exercise_media_exercise_id_position_key');

-- index thường trùng: giữ bản DESC
SELECT pg_temp.drop_dup('public.meal_entries',           'idx_meal_entries_user_date',      'idx_meal_entries_user_datetime');
SELECT pg_temp.drop_dup('public.workout_sessions',       'idx_workout_sessions_user_date',  'idx_workout_sessions_user_datetime');
SELECT pg_temp.drop_dup('public.sleep_logs',             'idx_sleep_logs_user_date',        'idx_sleep_logs_user_bedtime');
SELECT pg_temp.drop_dup('public.biometric_samples',      'idx_biometric_samples_user_date', 'idx_biometric_samples_user_datetime');
SELECT pg_temp.drop_dup('public.supplement_intake_logs', 'idx_supplement_intake_user_date', 'idx_supplement_intake_user_datetime');
SELECT pg_temp.drop_dup('public.scan_history',           'idx_scan_history_user_date',      'idx_scan_history_user');
SELECT pg_temp.drop_dup('public.community_posts',        'community_posts_author_idx',      'community_posts_author_created_idx');

-- Hai hàm trigger chỉ dùng RAISE / so sánh: search_path rỗng không đổi gì, và
-- từ nay không ai chen được một schema lên trước pg_catalog.
-- (Có mặt mới ghim: một bộ test chỉ áp nửa lõi, hàm thứ hai thuộc nửa cộng đồng.)
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.mascot_inventory_item_is_fixed()', 'public.moderation_audit_immutable()'] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = %L', f, '');
    END IF;
  END LOOP;
END $$;
