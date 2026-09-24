-- ════════════════════════════════════════════════════════════════════════════
-- Bài RECIPE (#7) — kịch bản phân quyền và con số, chạy THẬT trên Postgres 16.
--
-- Tự đứng được: tệp này dựng lấy ba bảng bữa ăn mà stub chung chưa có, và
-- dùng ID/handle RIÊNG (e1…/f2…), nên chạy trước hay sau
-- `community_foundation.test.sql` trong cùng một cụm đều được.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
\set E '''e1e1e1e1-0000-0000-0000-00000000000e'''
\set F '''f2f2f2f2-0000-0000-0000-00000000000f'''
\set G '''a7a7a7a7-0000-0000-0000-00000000007a'''

-- ── ba bảng bữa ăn, đúng cột của migration gốc `20260212040248_…` ──
-- `IF NOT EXISTS`: stub chung một ngày nào đó có thể tự có chúng.
CREATE TABLE IF NOT EXISTS public.food_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL, brand text DEFAULT '', serving_g numeric NOT NULL DEFAULT 100,
  kcal numeric NOT NULL DEFAULT 0, protein_g numeric NOT NULL DEFAULT 0,
  carbs_g numeric NOT NULL DEFAULT 0, fat_g numeric NOT NULL DEFAULT 0,
  fiber_g numeric NOT NULL DEFAULT 0, tags text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.meal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date_time timestamptz NOT NULL DEFAULT now(), meal_type text NOT NULL DEFAULT 'snack',
  total_kcal numeric NOT NULL DEFAULT 0, total_protein_g numeric NOT NULL DEFAULT 0,
  total_carbs_g numeric NOT NULL DEFAULT 0, total_fat_g numeric NOT NULL DEFAULT 0,
  total_fiber_g numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.meal_entry_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_entry_id uuid REFERENCES public.meal_entries(id) ON DELETE CASCADE NOT NULL,
  food_item_id uuid REFERENCES public.food_items(id) ON DELETE SET NULL,
  food_name text NOT NULL DEFAULT '', servings numeric NOT NULL DEFAULT 1,
  kcal numeric NOT NULL DEFAULT 0, protein_g numeric NOT NULL DEFAULT 0,
  carbs_g numeric NOT NULL DEFAULT 0, fat_g numeric NOT NULL DEFAULT 0,
  fiber_g numeric NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO auth.users VALUES (:E), (:F), (:G);
INSERT INTO community_profiles (user_id, handle, display_name) VALUES (:E, 'annie.le', 'Annie Le'), (:F, 'recipe.f', 'F');
-- :G CỐ Ý không có hồ sơ cộng đồng.

-- Món trong kho của E: ức gà 100g/khẩu phần, cơm 100g/khẩu phần.
INSERT INTO food_items (id, user_id, name, serving_g, kcal, protein_g, carbs_g, fat_g) VALUES
  ('f00d0001-0000-0000-0000-000000000001', :E, 'Ức gà', 100, 165, 31, 0, 4),
  ('f00d0002-0000-0000-0000-000000000002', :E, 'Cơm trắng', 100, 130, 3, 28, 0);

-- Bữa 1 (E) — nhất quán: tổng của bữa ĐÚNG BẰNG tổng các dòng. Số trên mỗi
-- dòng ĐÃ nhân với servings, như app ghi.
INSERT INTO meal_entries (id, user_id, meal_type, total_kcal, total_protein_g, total_carbs_g, total_fat_g)
VALUES ('3ea10001-0000-0000-0000-000000000001', :E, 'lunch', 642, 64, 68, 17);
INSERT INTO meal_entry_items (id, meal_entry_id, food_item_id, food_name, servings, kcal, protein_g, carbs_g, fat_g, created_at) VALUES
  ('17e00001-0000-0000-0000-000000000001', '3ea10001-0000-0000-0000-000000000001', 'f00d0001-0000-0000-0000-000000000001', 'Ức gà',     1.8, 297, 56,  0,  7, now() - interval '3 min'),
  ('17e00002-0000-0000-0000-000000000002', '3ea10001-0000-0000-0000-000000000001', 'f00d0002-0000-0000-0000-000000000002', 'Cơm trắng', 2,   260,  6, 56,  0, now() - interval '2 min'),
  -- dòng GÕ TAY, không trỏ tới món nào: không được bịa khối lượng
  ('17e00003-0000-0000-0000-000000000003', '3ea10001-0000-0000-0000-000000000001', NULL,                                   'Bơ',        1,    85,  2, 12, 10, now() - interval '1 min');

-- Bữa 2 (E) — LỆCH: tổng của bữa là 999 nhưng các dòng chỉ cộng ra 300.
-- Xảy ra thật khi một dòng bị sửa khẩu phần mà tổng chưa được tính lại.
INSERT INTO meal_entries (id, user_id, meal_type, total_kcal, total_protein_g, total_carbs_g, total_fat_g)
VALUES ('3ea10002-0000-0000-0000-000000000002', :E, 'dinner', 999, 99, 99, 99);
INSERT INTO meal_entry_items (meal_entry_id, food_name, servings, kcal, protein_g, carbs_g, fat_g)
VALUES ('3ea10002-0000-0000-0000-000000000002', 'Phở', 1, 300, 20, 40, 6);

-- Bữa 3 (E) — RỖNG.
INSERT INTO meal_entries (id, user_id, meal_type) VALUES ('3ea10003-0000-0000-0000-000000000003', :E, 'snack');

-- Bữa 4 (F) — của NGƯỜI KHÁC.
INSERT INTO meal_entries (id, user_id, meal_type, total_kcal) VALUES ('3ea10004-0000-0000-0000-000000000004', :F, 'breakfast', 400);
INSERT INTO meal_entry_items (meal_entry_id, food_name, kcal) VALUES ('3ea10004-0000-0000-0000-000000000004', 'Yến mạch', 400);

-- Bữa 6 (E) — bữa KIỂM SOÁT cho các chốt đầu vào (R16–R18): có món, chưa chia
-- sẻ, của chính E. Bản đầu cho R16 dùng bữa 2 (đã chia sẻ ở R12) và R17/R18
-- dùng bữa 3 (rỗng), nên ba kịch bản ấy nhận 22023/23505 từ một chốt KHÁC: phép
-- thử ngược gỡ chốt tên/visibility mà cả ba vẫn xanh. Ở bữa này, 22023 chỉ còn
-- một nguồn là chính chốt đang được đo — và R18b chứng minh điều đó bằng cách
-- đăng được nó với tham số hợp lệ.
INSERT INTO meal_entries (id, user_id, meal_type) VALUES ('3ea10006-0000-0000-0000-000000000006', :E, 'dinner');
INSERT INTO meal_entry_items (meal_entry_id, food_name, kcal) VALUES ('3ea10006-0000-0000-0000-000000000006', 'Canh chua', 150);

-- Bữa 5 (G) — của người CHƯA có hồ sơ cộng đồng.
INSERT INTO meal_entries (id, user_id, meal_type) VALUES ('3ea10005-0000-0000-0000-000000000005', :G, 'lunch');
INSERT INTO meal_entry_items (meal_entry_id, food_name, kcal) VALUES ('3ea10005-0000-0000-0000-000000000005', 'Cơm', 200);

CREATE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
-- Vai anon, ĐÚNG như Supabase: không sub, role anon. `who()` đặt sub ở cấp
-- phiên nên nó SỐNG SÓT qua RESET ROLE — thiếu dòng này, mọi `SET ROLE anon`
-- chạy với danh tính của người dùng cuối cùng (#14, #21).
CREATE OR REPLACE FUNCTION pg_temp.anon() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false) $$;
CREATE FUNCTION pg_temp.fails(stmt text) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN false; EXCEPTION WHEN others THEN RETURN true; END $$;
CREATE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

-- ── R1 · anon KHÔNG gọi được ──
--
-- Hỏi thẳng QUYỀN, không hỏi mã lỗi. Bản đầu viết `errcode(...) = '42501'`, và
-- phép thử ngược bắt được nó rỗng nghĩa: CẤP quyền cho anon rồi mà R1 vẫn
-- xanh. Vì với anon thì `auth.uid()` là null, nên thân hàm tự ném "not signed
-- in" với đúng mã 42501 — trùng mã với "permission denied". Hai đường, một mã,
-- nên so mã thì không phân biệt được lớp chặn nào đang làm việc.
--
-- `REVOKE … FROM anon` là lớp chặn Ở CỬA; câu "not signed in" là lớp chặn Ở
-- TRONG. Đòi cả hai, riêng từng cái.
DO $$ BEGIN ASSERT NOT has_function_privilege('anon', 'public.share_recipe(uuid, text, text, text)', 'EXECUTE'),
  'R1 anon gọi được share_recipe — REVOKE … FROM anon đã mất'; END $$;
DO $$ BEGIN ASSERT has_function_privilege('authenticated', 'public.share_recipe(uuid, text, text, text)', 'EXECUTE'),
  'R1b người đã đăng nhập KHÔNG gọi được share_recipe — GRANT … TO authenticated đã mất'; END $$;

-- ── chia sẻ bữa của CHÍNH mình ──
SELECT pg_temp.who(:E); SET ROLE authenticated;
-- R2 · client INSERT thẳng một bài recipe — tức tự bịa số — phải bị chặn
DO $$ BEGIN ASSERT pg_temp.fails($q$INSERT INTO community_posts (author_id, kind, payload) VALUES (auth.uid(), 'recipe', '{"kcal":1}')$q$), 'R2 client INSERT thẳng được bài recipe (bịa số)'; END $$;
SELECT share_recipe('3ea10001-0000-0000-0000-000000000001', '  High Protein Chicken Bowl  ', 'Một bữa ăn đơn giản', 'public') AS post_e \gset
RESET ROLE; CREATE TEMP TABLE rids AS SELECT :'post_e'::uuid AS post_e; GRANT SELECT ON rids TO authenticated, anon; SET ROLE authenticated;

DO $$ DECLARE p jsonb := (SELECT payload FROM community_posts WHERE id = (SELECT post_e FROM rids)); BEGIN
  ASSERT (SELECT kind FROM community_posts WHERE id = (SELECT post_e FROM rids)) = 'recipe', 'R3 loại bài không phải recipe';
  ASSERT p->>'title' = 'High Protein Chicken Bowl', 'R4 tên món không được cắt khoảng trắng';
  -- R5 · SỐ TRÊN THẺ KHỚP ĐÚNG BỮA: kcal/protein/carbs/fat = tổng các dòng = tổng của bữa
  ASSERT (p->>'kcal')::numeric = 642 AND (p->>'protein')::numeric = 64
     AND (p->>'carbs')::numeric = 68 AND (p->>'fat')::numeric = 17, 'R5 macro trên thẻ không khớp bữa (642 / 64 / 68 / 17)';
  ASSERT (p->>'ingredientCount')::int = 3 AND jsonb_array_length(p->'ingredients') = 3, 'R6 số nguyên liệu';
  ASSERT p->'ingredients'->0->>'name' = 'Ức gà' AND p->'ingredients'->1->>'name' = 'Cơm trắng', 'R7 thứ tự nguyên liệu';
  -- R8 · khối lượng: servings × serving_g, KHÔNG nhân thêm cho kcal
  ASSERT (p->'ingredients'->0->>'grams')::numeric = 180 AND (p->'ingredients'->0->>'kcal')::numeric = 297, 'R8 ức gà phải là 180g · 297 kcal';
  ASSERT (p->'ingredients'->1->>'grams')::numeric = 200, 'R9 cơm phải là 200g';
  -- R10 · dòng gõ tay: KHÔNG bịa khối lượng
  ASSERT p->'ingredients'->2->'grams' = 'null'::jsonb, 'R10 dòng gõ tay bị bịa khối lượng';
  ASSERT p->>'mealType' = 'lunch', 'R11 loại bữa';
  -- R11b · payload công khai KHÔNG mang giờ ăn: ai xem được bài cũng đọc được
  -- payload, và "ăn lúc 12:47 thứ Ba" là dữ liệu thói quen (A bắt ở #7).
  ASSERT NOT p ? 'eatenAt', 'R11b payload công khai mang giờ ăn (eatenAt)';
END $$;

-- R12 · bữa LỆCH: thẻ theo TỔNG CÁC DÒNG (300), không theo tổng của bữa (999)
SELECT share_recipe('3ea10002-0000-0000-0000-000000000002', 'Phở bò') AS post_e2 \gset
DO $$ BEGIN ASSERT (SELECT (payload->>'kcal')::numeric FROM community_posts WHERE source_id = '3ea10002-0000-0000-0000-000000000002') = 300,
  'R12 thẻ lấy tổng của bữa (999) thay vì tổng các dòng (300) — "Thêm vào bữa ăn" sẽ ghi 300, nên thẻ phải nói 300'; END $$;

DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT share_recipe('3ea10001-0000-0000-0000-000000000001', 'Lần hai')$q$) = '23505', 'R13 chia sẻ trùng một bữa'; END $$;
-- R14 · KHÔNG chia sẻ được bữa của NGƯỜI KHÁC — và nói "không thấy", không nói "không phải của bạn"
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT share_recipe('3ea10004-0000-0000-0000-000000000004', 'Của F')$q$) = 'P0002', 'R14 chia sẻ được bữa của NGƯỜI KHÁC'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT share_recipe('3ea10003-0000-0000-0000-000000000003', 'Rỗng')$q$) = '22023', 'R15 bữa rỗng vẫn đăng được'; END $$;
-- R16–R18 · chốt đầu vào, trên bữa KIỂM SOÁT 6 — đúng MỘT mã, không "hoặc".
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT share_recipe('3ea10006-0000-0000-0000-000000000006', '   ')$q$) = '22023', 'R16 tên món trống lọt qua'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode(format($q$SELECT share_recipe('3ea10006-0000-0000-0000-000000000006', %L)$q$, repeat('a', 81))) = '22023', 'R17 tên món quá 80 ký tự lọt qua'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT share_recipe('3ea10006-0000-0000-0000-000000000006', 'X', '', 'everyone')$q$) = '22023', 'R18 visibility lạ lọt qua'; END $$;
-- R18b · ĐỐI CHỨNG: cùng bữa ấy, tham số hợp lệ (80 ký tự đúng mép, visibility
-- 'followers') thì đăng được. Không có dòng này, ba kịch bản trên xanh cả khi
-- bữa 6 hỏng vì một lý do chẳng liên quan gì tới tên hay visibility.
DO $$ BEGIN ASSERT pg_temp.errcode(format($q$SELECT share_recipe('3ea10006-0000-0000-0000-000000000006', %L, '', 'followers')$q$, repeat('a', 80))) = 'ok',
  'R18b bữa kiểm soát không đăng được với tham số hợp lệ — R16–R18 không đo được gì'; END $$;
RESET ROLE;

-- R19 · người CHƯA có hồ sơ cộng đồng không đăng được
SELECT pg_temp.who(:G); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT share_recipe('3ea10005-0000-0000-0000-000000000005', 'Cơm')$q$) = 'P0001', 'R19 không có hồ sơ vẫn đăng được'; END $$;
RESET ROLE;

-- R20 · người KHÁC đọc được bài công khai, và thấy ĐÚNG số đã dựng
SELECT pg_temp.who(:F); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT (payload->>'kcal')::numeric FROM community_posts WHERE id = (SELECT post_e FROM rids)) = 642, 'R20 người khác không đọc được bài công khai'; END $$;
RESET ROLE;

\echo 'RECIPE: 23 KỊCH BẢN XANH'
