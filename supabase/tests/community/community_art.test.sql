-- ════════════════════════════════════════════════════════════════════════════
-- Thư viện ảnh của app (#163) — kịch bản phân quyền, chạy THẬT trên Postgres 16.
--
-- Chủ dự án: người dùng không tải ảnh lên; mọi bài có một ảnh của thư viện do
-- app cấp; chỉ admin thêm ảnh. Tệp này đòi:
--   · người dùng thường không ghi được thư viện, anon không đọc được;
--   · chia sẻ với ảnh sai loại, ảnh đã tắt, ảnh không có thật hay không ảnh
--     thì bị từ chối, và KHÔNG để lại bài nào;
--   · ảnh bị tắt SAU khi bài đã đăng không làm bài ấy hỏng.
-- Tự đứng được: ID riêng (a8…/c8…), chạy trước hay sau tệp khác đều được.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
-- Cả tệp trong MỘT giao dịch, ROLLBACK ở cuối: tệp chạy theo thứ tự tên, TRƯỚC
-- bộ nền móng, và một bài công khai để lại làm lệch mọi phép đếm bài của nó
-- (đo được: "19 B phải thấy đúng 1 bài công khai").
BEGIN;
\set U '''a8a8a8a8-0000-0000-0000-0000000000a8'''
\set S '''c8c8c8c8-0000-0000-0000-0000000000c8'''
\set S2 '''c8c8c8c8-0000-0000-0000-0000000000c9'''
\set S3 '''c8c8c8c8-0000-0000-0000-0000000000ca'''
\set WA '''a1a1a1a1-0000-0000-0000-0000000000a1'''
\set WB '''a1a1a1a1-0000-0000-0000-0000000000a2'''
\set WOFF '''a1a1a1a1-0000-0000-0000-0000000000a3'''
\set RA '''a1a1a1a1-0000-0000-0000-0000000000a4'''
\set PA '''a1a1a1a1-0000-0000-0000-0000000000a5'''

INSERT INTO auth.users VALUES (:U);
INSERT INTO community_profiles (user_id, handle, display_name) VALUES (:U, 'art.u', 'Art U');
INSERT INTO workout_sessions (id, user_id, sets, template_name) VALUES
  (:S,  :U, '[{"exerciseName":"Bench Press","weight":60,"reps":8}]', 'Push'),
  (:S2, :U, '[{"exerciseName":"Squat","weight":80,"reps":5}]', 'Legs'),
  (:S3, :U, '[{"exerciseName":"Row","weight":50,"reps":10}]', 'Pull');

-- Thư viện: như admin (chủ bảng) thêm, không qua vai người dùng nào.
INSERT INTO community_art (id, kind, style, tags, path, alt_en, alt_vi, active) VALUES
  (:WA,   'workout',  'mono', '{push}', 'workout/mono-push.webp', 'Barbell on a dark bench', 'Thanh đòn trên ghế tối', true),
  (:WB,   'workout',  'neon', '{}',     'workout/neon.webp',      'Neon lines of a rack',    'Giá tạ nét neon',        true),
  (:WOFF, 'workout',  'old',  '{}',     'workout/old.webp',       'Retired art',             'Ảnh đã tắt',             false),
  (:RA,   'recipe',   'mono', '{}',     'recipe/mono.webp',       'A bowl, top down',        'Một bát, nhìn từ trên',  true),
  (:PA,   'progress', 'mono', '{}',     'progress/mono.webp',     'A rising line',           'Một đường đi lên',       true);

CREATE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.anon() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false) $$;
CREATE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

-- ── T1 · anon không đọc được thư viện: hỏi QUYỀN, và lệnh thật hỏng ──
DO $$ BEGIN ASSERT NOT has_table_privilege('anon', 'public.community_art', 'SELECT'),
  'T1 anon có quyền SELECT trên community_art'; END $$;
SELECT pg_temp.anon(); SET ROLE anon;
DO $$ BEGIN ASSERT pg_temp.errcode('SELECT 1 FROM community_art') = '42501',
  'T1 anon đọc được community_art'; END $$;
RESET ROLE;

-- ── T2 · người đã đăng nhập ĐỌC được, kể cả ảnh đã tắt (bài cũ còn trỏ vào) ──
SELECT pg_temp.who(:U); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_art) = 5,
  'T2 người dùng không đọc đủ thư viện (kể cả ảnh đã tắt)'; END $$;

-- ── T3 · và KHÔNG ghi được: chèn, sửa, xoá đều 42501 ──
DO $$ BEGIN
  ASSERT pg_temp.errcode($q$INSERT INTO community_art (kind, style, path, alt_en, alt_vi) VALUES ('workout','mine','workout/mine.webp','x','x')$q$) = '42501',
    'T3 người dùng chèn được ảnh vào thư viện';
  ASSERT pg_temp.errcode($q$UPDATE community_art SET active = true WHERE style = 'old'$q$) = '42501',
    'T3 người dùng bật lại được một ảnh đã tắt';
  ASSERT pg_temp.errcode($q$DELETE FROM community_art$q$) = '42501',
    'T3 người dùng xoá được thư viện';
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT NOT has_table_privilege('authenticated', 'public.community_art', 'INSERT,UPDATE,DELETE'),
    'T3 authenticated có quyền ghi trên community_art';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.community_art'::regclass AND polcmd <> 'r'),
    'T3 community_art có policy GHI — chỉ service_role được thêm ảnh';
END $$;

-- ── T4 · quyền gọi ba đường chia sẻ mới: anon không, authenticated có ──
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.share_workout_with_art(uuid, text, text, integer, uuid)',
    'public.share_recipe_with_art(uuid, text, text, text, uuid)',
    'public.share_progress_with_art(integer, boolean, boolean, uuid, text, text, uuid)'] LOOP
    ASSERT NOT has_function_privilege('anon', f, 'EXECUTE'), format('T4 anon gọi được %s', f);
    ASSERT has_function_privilege('authenticated', f, 'EXECUTE'), format('T4 authenticated không gọi được %s', f);
  END LOOP;
  ASSERT NOT has_function_privilege('authenticated', 'public.community_art_usable(uuid, text)', 'EXECUTE'),
    'T4 hàm kiểm ảnh nội bộ mở cho authenticated';
END $$;

-- ── T7 (danh mục) · bản cũ còn nguyên chữ ký, không bị thay: bản app đã cài
--    gọi nó ──
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.share_workout(uuid, text, text, integer)',
    'public.share_recipe(uuid, text, text, text)',
    'public.share_progress(integer, boolean, boolean, uuid, text, text)'] LOOP
    ASSERT to_regprocedure(f) IS NOT NULL AND has_function_privilege('authenticated', f, 'EXECUTE'),
      format('T7 %s không còn gọi được — bản app đã cài hỏng chia sẻ', f);
  END LOOP;
END $$;

-- ── T5 · chia sẻ với ảnh hợp lệ: bài mang đúng ảnh ──
SELECT pg_temp.who(:U); SET ROLE authenticated;
DO $$
DECLARE v uuid;
BEGIN
  v := share_workout_with_art('c8c8c8c8-0000-0000-0000-0000000000c8', '', 'public', NULL, 'a1a1a1a1-0000-0000-0000-0000000000a1');
  ASSERT (SELECT art_id FROM community_posts WHERE id = v) = 'a1a1a1a1-0000-0000-0000-0000000000a1',
    'T5 bài không mang ảnh vừa chọn';
  ASSERT (SELECT image_source FROM community_posts WHERE id = v) = 'library', 'T5 image_source không phải library';
END $$;

-- ── T6 · sai loại / đã tắt / không có thật / không ảnh → từ chối, KHÔNG có bài ──
DO $$
DECLARE before bigint := (SELECT count(*) FROM community_posts WHERE author_id = auth.uid());
BEGIN
  ASSERT pg_temp.errcode($q$SELECT share_workout_with_art('c8c8c8c8-0000-0000-0000-0000000000c9', '', 'public', NULL, 'a1a1a1a1-0000-0000-0000-0000000000a4')$q$) = '22023',
    'T6 chia sẻ buổi tập với ảnh CÔNG THỨC không bị từ chối (22023)';
  ASSERT pg_temp.errcode($q$SELECT share_workout_with_art('c8c8c8c8-0000-0000-0000-0000000000c9', '', 'public', NULL, 'a1a1a1a1-0000-0000-0000-0000000000a3')$q$) = '22023',
    'T6 chia sẻ với ảnh ĐÃ TẮT không bị từ chối (22023)';
  ASSERT pg_temp.errcode($q$SELECT share_workout_with_art('c8c8c8c8-0000-0000-0000-0000000000c9', '', 'public', NULL, '00000000-0000-0000-0000-00000000dead')$q$) = 'P0002',
    'T6 chia sẻ với ảnh KHÔNG CÓ THẬT không bị từ chối (P0002)';
  ASSERT pg_temp.errcode($q$SELECT share_workout_with_art('c8c8c8c8-0000-0000-0000-0000000000c9', '', 'public', NULL, NULL)$q$) = '22023',
    'T6 chia sẻ qua đường mới mà KHÔNG ảnh không bị từ chối (22023)';
  ASSERT (SELECT count(*) FROM community_posts WHERE author_id = auth.uid()) = before,
    'T6 một lần chia sẻ bị từ chối vẫn để lại bài';
END $$;

-- ── T7 · đường cũ (bản app cũ còn trên máy) vẫn chạy, bài không ảnh ──
DO $$
DECLARE v uuid;
BEGIN
  BEGIN
    v := share_workout('c8c8c8c8-0000-0000-0000-0000000000ca', '', 'public', NULL);
  EXCEPTION WHEN ambiguous_function THEN
    RAISE EXCEPTION 'T7 lời gọi 4 đối số của bản app cũ thành mơ hồ — p_art_id của bản mới không được có DEFAULT';
  END;
  ASSERT (SELECT art_id FROM community_posts WHERE id = v) IS NULL, 'T7 đường cũ gắn ảnh từ đâu ra';
END $$;
RESET ROLE;

-- ── T8 · trigger: mọi đường ghi, kể cả không qua RPC ──
DO $$
DECLARE p uuid := (SELECT id FROM community_posts WHERE source_id = 'c8c8c8c8-0000-0000-0000-0000000000c8');
BEGIN
  ASSERT pg_temp.errcode(format($q$UPDATE community_posts SET art_id = 'a1a1a1a1-0000-0000-0000-0000000000a5' WHERE id = %L$q$, p)) = '22023',
    'T8 gắn ảnh TIẾN TRÌNH vào bài buổi tập mà trigger không chặn';
  ASSERT pg_temp.errcode(format($q$UPDATE community_posts SET art_id = 'a1a1a1a1-0000-0000-0000-0000000000a3' WHERE id = %L$q$, p)) = '22023',
    'T8 gắn ảnh ĐÃ TẮT mà trigger không chặn';
  ASSERT pg_temp.errcode($q$INSERT INTO community_posts (author_id, kind, payload, art_id) VALUES ('a8a8a8a8-0000-0000-0000-0000000000a8', 'progress', '{}', 'a1a1a1a1-0000-0000-0000-0000000000a1')$q$) = '22023',
    'T8 chèn bài tiến trình mang ảnh buổi tập mà trigger không chặn';
  ASSERT pg_temp.errcode($q$INSERT INTO community_posts (author_id, kind, payload, image_source) VALUES ('a8a8a8a8-0000-0000-0000-0000000000a8', 'workout', '{}', 'user_upload')$q$) = '23514',
    'T8 image_source nhận giá trị ngoài library khi chưa có quyết định mở cho người dùng đăng ảnh';
END $$;

-- ── T9 · ảnh bị tắt SAU khi bài đã đăng: bài vẫn đọc và sửa được ──
UPDATE community_art SET active = false WHERE id = :WA;
DO $$
DECLARE p uuid := (SELECT id FROM community_posts WHERE source_id = 'c8c8c8c8-0000-0000-0000-0000000000c8');
BEGIN
  ASSERT pg_temp.errcode(format($q$UPDATE community_posts SET caption = 'sửa chú thích' WHERE id = %L$q$, p)) = 'ok',
    'T9 tắt một ảnh làm bài đã đăng với ảnh ấy không sửa nổi';
  ASSERT (SELECT art_id FROM community_posts WHERE id = p) = 'a1a1a1a1-0000-0000-0000-0000000000a1',
    'T9 bài mất ảnh khi ảnh bị tắt';
END $$;
SELECT pg_temp.who(:U); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_posts p JOIN community_art a ON a.id = p.art_id
                    WHERE p.source_id = 'c8c8c8c8-0000-0000-0000-0000000000c8') = 1,
  'T9 người dùng không đọc được ảnh (đã tắt) của bài mình'; END $$;
RESET ROLE;

-- ── T10 · xoá một ảnh bài đang trỏ vào: bị chặn (RESTRICT), không lặng lẽ mất ảnh ──
DO $$ BEGIN ASSERT pg_temp.errcode($q$DELETE FROM community_art WHERE id = 'a1a1a1a1-0000-0000-0000-0000000000a1'$q$) = '23503',
  'T10 xoá được ảnh mà một bài đang trỏ vào — tắt (active=false), đừng xoá'; END $$;

ROLLBACK;
\echo 'TẤT CẢ 10 KỊCH BẢN THƯ VIỆN ẢNH (#163) ĐÚNG'
