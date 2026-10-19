-- Thư viện món ăn và bài tập (20261018120000_food_exercise_library.sql): seed đủ,
-- đúng 3 thứ tiếng, tìm được bỏ dấu; món / bài chung ai cũng đọc được nhưng không
-- ai sửa được.
\set ON_ERROR_STOP 1
\set A '''a1a1a1a1-0000-0000-0000-0000000000a1'''
INSERT INTO auth.users VALUES (:A) ON CONFLICT DO NOTHING;

-- ── Seed đủ, mỗi hàng có tên 3 thứ tiếng ──
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM food_items WHERE source = 'usda_sr_legacy') >= 230, 'F1 thiếu món USDA';
  ASSERT (SELECT count(*) FROM food_items WHERE source = 'ascnd_recipe' AND is_estimate) >= 150, 'F2 thiếu món Việt ước tính';
  ASSERT NOT EXISTS (SELECT 1 FROM food_items WHERE source IS NOT NULL
    AND (coalesce(name_vi, '') = '' OR coalesce(name_en, '') = '' OR coalesce(name_es, '') = ''
      OR coalesce(portion_vi, '') = '' OR coalesce(search_text, '') = '')), 'F3 món seed thiếu tên / phần ăn / chữ tìm';
  ASSERT NOT EXISTS (SELECT 1 FROM food_items WHERE source IS NOT NULL AND (kcal < 0 OR serving_g <= 0)), 'F4 số âm / phần ăn 0';
  ASSERT NOT EXISTS (SELECT 1 FROM food_items WHERE source IS NOT NULL AND user_id IS NOT NULL), 'F5 món seed phải là món chung';
  ASSERT (SELECT count(*) FROM exercises WHERE source = 'free_exercise_db') >= 870, 'E1 thiếu bài tập';
  ASSERT NOT EXISTS (SELECT 1 FROM exercises WHERE source IS NOT NULL
    AND (coalesce(name_vi, '') = '' OR coalesce(name_es, '') = '' OR coalesce(search_text, '') = '')), 'E2 bài seed thiếu tên / chữ tìm';
  ASSERT NOT EXISTS (SELECT 1 FROM exercises WHERE source IS NOT NULL
    AND muscle_group NOT IN ('chest','back','shoulders','biceps','triceps','legs','glutes','calves','abs','cardio')), 'E3 nhóm cơ ngoài 10 khoá của app';
  ASSERT NOT EXISTS (SELECT 1 FROM exercises WHERE source IS NOT NULL
    AND exercise_kind IS NOT NULL AND exercise_kind NOT IN ('compound','isolation','bodyweight','timed')), 'E4 loại bài sai';
  -- Không trùng tên với 10 bài mẫu cũ (tên là khoá lịch sử tập).
  ASSERT (SELECT count(*) FROM exercises WHERE user_id IS NULL AND lower(name) = 'romanian deadlift') = 1, 'E5 bài mẫu bị nhân đôi';
  ASSERT (SELECT name_vi FROM exercises WHERE user_id IS NULL AND name = 'Bench Press') = 'Đẩy ngực tạ đòn', 'E6 bài mẫu cũ chưa có tên vi';
END $$;

-- ── Tìm bỏ dấu, theo cả 3 thứ tiếng ──
DO $$ BEGIN
  ASSERT EXISTS (SELECT 1 FROM food_items WHERE search_text LIKE '%pho bo%'), 'S1 "pho bo" không ra phở bò';
  ASSERT EXISTS (SELECT 1 FROM food_items WHERE search_text LIKE '%beef pho%'), 'S2 tên tiếng Anh không tìm được';
  ASSERT EXISTS (SELECT 1 FROM food_items WHERE search_text LIKE '%huevo%'), 'S3 tên tiếng Tây Ban Nha không tìm được';
  ASSERT EXISTS (SELECT 1 FROM exercises WHERE search_text LIKE '%day nguc%'), 'S4 bài tập không tìm được bỏ dấu';
END $$;

-- ── Ai cũng đọc được món chung; không ai sửa được ──
CREATE TEMP TABLE before_kcal AS SELECT id, kcal FROM food_items WHERE source IS NOT NULL;
GRANT SELECT ON before_kcal TO authenticated;
CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;
SELECT pg_temp.who(:A); SET ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM food_items WHERE source = 'ascnd_recipe') >= 150, 'R1 người dùng không thấy món chung';
  ASSERT (SELECT count(*) FROM exercises WHERE source = 'free_exercise_db') >= 870, 'R2 người dùng không thấy bài chung';
END $$;
-- Lệnh ghi không WHERE (xem chú thích ở ai_coach_data.test.sql); kiểm dưới vai postgres.
UPDATE food_items SET kcal = 0;
UPDATE exercises SET name_vi = 'x';
RESET ROLE;
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM food_items f JOIN before_kcal b USING (id) WHERE f.kcal <> b.kcal), 'R3 người dùng sửa được món chung';
  ASSERT NOT EXISTS (SELECT 1 FROM exercises WHERE source IS NOT NULL AND name_vi = 'x'), 'R4 người dùng sửa được bài chung';
END $$;
