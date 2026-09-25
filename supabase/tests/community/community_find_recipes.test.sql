-- Tìm công thức theo tên món, không phân biệt dấu (#43). Người dùng riêng
-- (id fdfdfdfd…); không phụ thuộc bộ khác.
--
-- Cả bộ nằm trong MỘT giao dịch rồi ROLLBACK: theo thứ tự tên tệp nó chạy
-- TRƯỚC nền móng (`find` < `foundation`), và nền móng đếm mọi bài thấy được —
-- ba mươi mấy bài công thức để lại ở đây sẽ làm đỏ nó.
--
-- Theo #14/#21: kịch bản quyền hỏi has_function_privilege, và mỗi kịch bản
-- "không được thấy X" có một đối chứng chứng minh X khớp khi được phép thấy
-- (F10–F12 đứng TRƯỚC F4 vì thế: phá lọc theo kiểu chỉ đối chứng thấy thì đối
-- chứng đỏ trước, phá kiểu chỉ F4 thấy thì đối chứng vẫn xanh).
\set ON_ERROR_STOP 1
BEGIN;
\set ME '''fdfdfdfd-0000-0000-0000-000000000101'''
\set NEU '''fdfdfdfd-0000-0000-0000-000000000108'''
\set HID '''fdfdfdfd-0000-0000-0000-000000000107'''
INSERT INTO auth.users SELECT ('fdfdfdfd-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid FROM generate_series(1, 8) g;

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
-- Vai anon, ĐÚNG như Supabase: không sub, role anon (#14, #21).
CREATE OR REPLACE FUNCTION pg_temp.anon() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false) $$;

INSERT INTO community_profiles (user_id, handle, display_name) VALUES
  ('fdfdfdfd-0000-0000-0000-000000000101', 'fr_me',   'Người xem'),
  ('fdfdfdfd-0000-0000-0000-000000000102', 'fr_pub',  'Đăng công khai'),
  ('fdfdfdfd-0000-0000-0000-000000000103', 'fr_fol',  'Tôi theo dõi'),      -- bài chỉ-người-theo-dõi, ME theo dõi
  ('fdfdfdfd-0000-0000-0000-000000000104', 'fr_nof',  'Không theo dõi'),    -- bài chỉ-người-theo-dõi, ME không theo dõi
  ('fdfdfdfd-0000-0000-0000-000000000105', 'fr_bl',   'Bị tôi chặn'),
  ('fdfdfdfd-0000-0000-0000-000000000106', 'fr_br',   'Chặn tôi'),
  ('fdfdfdfd-0000-0000-0000-000000000107', 'fr_hid',  'Bài bị ẩn'),
  ('fdfdfdfd-0000-0000-0000-000000000108', 'fr_neu',  'Người thứ ba');      -- đối chứng: theo dõi fr_nof, không dính chặn
INSERT INTO community_blocks (blocker_id, blocked_id) VALUES
  ('fdfdfdfd-0000-0000-0000-000000000101', 'fdfdfdfd-0000-0000-0000-000000000105'),
  ('fdfdfdfd-0000-0000-0000-000000000106', 'fdfdfdfd-0000-0000-0000-000000000101');
INSERT INTO community_follows (follower_id, followee_id) VALUES
  ('fdfdfdfd-0000-0000-0000-000000000101', 'fdfdfdfd-0000-0000-0000-000000000103'),
  ('fdfdfdfd-0000-0000-0000-000000000108', 'fdfdfdfd-0000-0000-0000-000000000104');

-- Mã ngắn cho từng bài, để so bằng CHUỖI MÃ chứ không bằng tên (thứ tự sắp của
-- tên có dấu phụ thuộc collation của cụm).
CREATE TEMP TABLE fr (code text, id uuid, author text, kind text, title text, vis text, hidden boolean, age interval);
INSERT INTO fr VALUES
  ('p01', 'fdfdfdfd-0000-0000-0000-000000000201', '102', 'recipe',  'Cơm gà áp chảo',   'public',    false, '1 hour'),
  ('p02', 'fdfdfdfd-0000-0000-0000-000000000202', '102', 'recipe',  'Gà nướng mật ong', 'public',    false, '2 hours'),
  ('p03', 'fdfdfdfd-0000-0000-0000-000000000203', '102', 'recipe',  'Salad cá ngừ',     'public',    false, '3 hours'),
  ('p04', 'fdfdfdfd-0000-0000-0000-000000000204', '102', 'workout', 'Gà buổi tập',      'public',    false, '4 hours'),
  ('p05', 'fdfdfdfd-0000-0000-0000-000000000205', '103', 'recipe',  'Gà hấp lá chanh',  'followers', false, '5 hours'),
  ('p06', 'fdfdfdfd-0000-0000-0000-000000000206', '104', 'recipe',  'Gà rán giòn',      'followers', false, '6 hours'),
  ('p07', 'fdfdfdfd-0000-0000-0000-000000000207', '105', 'recipe',  'Gà luộc',          'public',    false, '7 hours'),
  ('p08', 'fdfdfdfd-0000-0000-0000-000000000208', '106', 'recipe',  'Gà xào sả ớt',     'public',    false, '8 hours'),
  ('p09', 'fdfdfdfd-0000-0000-0000-000000000209', '107', 'recipe',  'Gà kho gừng',      'public',    true,  '9 hours'),
  ('p10', 'fdfdfdfd-0000-0000-0000-000000000210', '101', 'recipe',  'Gà tần thuốc bắc', 'public',    true,  '10 hours'),
  ('p11', 'fdfdfdfd-0000-0000-0000-000000000211', '102', 'recipe',  'Bánh 100% nếp',    'public',    false, '11 hours'),
  ('p12', 'fdfdfdfd-0000-0000-0000-000000000212', '102', 'recipe',  'Bánh 1000 lớp',    'public',    false, '12 hours'),
  ('p13', 'fdfdfdfd-0000-0000-0000-000000000213', '102', 'recipe',  'x_y chay',         'public',    false, '13 hours'),
  ('p14', 'fdfdfdfd-0000-0000-0000-000000000214', '102', 'recipe',  'Xay sinh tố',      'public',    false, '14 hours');
-- 35 bài "Súp bí đỏ N" cho trần 30; s01 mới nhất.
INSERT INTO fr SELECT 's' || lpad(g::text, 2, '0'), ('fdfdfdfd-0000-0000-0000-0000000003' || lpad(g::text, 2, '0'))::uuid, '102', 'recipe', 'Súp bí đỏ ' || g, 'public', false, (g || ' days')::interval FROM generate_series(1, 35) g;
INSERT INTO community_posts (id, author_id, kind, payload, visibility, hidden, created_at)
SELECT id, ('fdfdfdfd-0000-0000-0000-000000000' || author)::uuid, kind, jsonb_build_object('title', title), vis, hidden, now() - age FROM fr;
-- Tên đã gập, tính dưới postgres: `community_fold` đóng với authenticated, và
-- F13 cần lọc tên NGOÀI hàm đang bị thử.
ALTER TABLE fr ADD COLUMN folded text;
UPDATE fr SET folded = community_fold(title);
GRANT SELECT ON fr TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.found(q text) RETURNS text LANGUAGE sql AS $$ SELECT coalesce(string_agg(fr.code, ',' ORDER BY fr.code), '') FROM community_find_recipes(q) r JOIN fr ON fr.id = r.post_id $$;
-- F13: tập bài công thức mà RLS cho vai hiện tại thấy, lọc tên như hàm (tiền tố
-- của một từ), trừ tập hàm trả — và ngược lại. Rỗng cả hai chiều là khớp.
CREATE OR REPLACE FUNCTION pg_temp.drift(q text) RETURNS text LANGUAGE sql AS $$
  WITH rls AS (
    SELECT p.id FROM community_posts p JOIN fr ON fr.id = p.id
    WHERE p.kind = 'recipe' AND (fr.folded LIKE q || '%' OR fr.folded LIKE '% ' || q || '%')
  ), fn AS (
    SELECT r.post_id AS id FROM community_find_recipes(q) r JOIN fr ON fr.id = r.post_id
  )
  SELECT coalesce(string_agg(x, ','), '') FROM (
    SELECT 'RLS có mà hàm không: ' || fr.code AS x FROM (SELECT id FROM rls EXCEPT SELECT id FROM fn) d JOIN fr USING (id)
    UNION ALL
    SELECT 'hàm có mà RLS không: ' || fr.code FROM (SELECT id FROM fn EXCEPT SELECT id FROM rls) d JOIN fr USING (id)
  ) z
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

SELECT pg_temp.who(:ME); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.found('g') = '', format('F1 một ký tự đã trả kết quả: %s', pg_temp.found('g')); END $$;
DO $$ BEGIN ASSERT pg_temp.found('ap chao') = 'p01', format('F2 "ap chao" (từ giữa tên) phải ra p01 — ra %s', pg_temp.found('ap chao')); END $$;
DO $$ BEGIN ASSERT pg_temp.found('hao') = '', format('F3 "hao" nằm GIỮA chữ "chảo", không phải đầu một từ — ra %s', pg_temp.found('hao')); END $$;
RESET ROLE;
-- ── đối chứng, TRƯỚC F4 ──
SELECT pg_temp.who(:NEU); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.found('ga') LIKE '%p07,p08%', format('F10 ĐỐI CHỨNG: người không dính chặn phải thấy p07, p08 — ra %s', pg_temp.found('ga')); END $$;
DO $$ BEGIN ASSERT pg_temp.found('ga') LIKE '%p06%', format('F11 ĐỐI CHỨNG: người theo dõi tác giả phải thấy bài chỉ-người-theo-dõi p06 — ra %s', pg_temp.found('ga')); END $$;
RESET ROLE;
SELECT pg_temp.who(:HID); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.found('ga') LIKE '%p09%', format('F12 ĐỐI CHỨNG: tác giả phải thấy bài bị ẩn của chính mình (p09) — ra %s', pg_temp.found('ga')); END $$;
RESET ROLE;
-- ── người xem ──
SELECT pg_temp.who(:ME); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.found('ga') = 'p01,p02,p05,p10', format('F4 "ga" phải ra p01,p02,p05,p10 — ra %s', pg_temp.found('ga')); END $$;
-- F4 gói trong nó: không bài tập (p04), bài chỉ-theo-dõi của người mình theo
-- dõi có (p05) còn của người khác không (p06), không người mình chặn (p07) hay
-- chặn mình (p08), không bài bị ẩn của người khác (p09), có bài bị ẩn của mình (p10).
DO $$ BEGIN ASSERT pg_temp.found('gà') = pg_temp.found('ga') AND pg_temp.found('  GÀ ') = pg_temp.found('ga'), 'F5 gõ có dấu, chữ hoa, thừa khoảng trắng phải ra như "ga"'; END $$;
DO $$ BEGIN ASSERT pg_temp.found('100%') = 'p11', format('F6 "%%" phải là chữ, không phải ký tự đại diện — ra %s', pg_temp.found('100%')); END $$;
DO $$ BEGIN ASSERT pg_temp.found('x_') = 'p13', format('F7 "_" phải là chữ, không phải ký tự đại diện — ra %s', pg_temp.found('x_')); END $$;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_find_recipes('sup')) = 30, 'F8 phải có trần 30 bài'; END $$;
DO $$ BEGIN ASSERT (SELECT fr.code FROM community_find_recipes('sup') WITH ORDINALITY r(post_id, n) JOIN fr ON fr.id = r.post_id ORDER BY r.n LIMIT 1) = 's01', 'F9 bài mới nhất phải đứng đầu'; END $$;
RESET ROLE;
-- ── F13: hàm và policy đọc bài là HAI bản sao của một luật ──
-- Người thứ ba TRƯỚC: RLS của `community_blocks` chỉ cho mỗi người thấy dòng
-- chặn của chính mình, nên một policy trôi theo kiểu "giấu ai dính một dòng
-- chặn" chỉ lệch ở góc nhìn của người bị chặn (F13b); trôi kiểu khác thì người
-- thứ ba thấy trước (F13).
SELECT pg_temp.who(:NEU); SET ROLE authenticated;
-- Không so 'sup': 35 bài khớp mà hàm có trần 30, nên hai tập lệch đúng thiết kế.
DO $$ BEGIN ASSERT pg_temp.drift('ga') = '' AND pg_temp.drift('banh') = '', format('F13 hàm lệch policy đọc bài (người thứ ba): %s %s', pg_temp.drift('ga'), pg_temp.drift('banh')); END $$;
RESET ROLE;
SELECT pg_temp.who(:ME); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.drift('ga') = '', format('F13b hàm lệch policy đọc bài (người xem): %s', pg_temp.drift('ga')); END $$;
RESET ROLE;
-- ── quyền ──
-- F14: vai authenticated mà KHÔNG có sub (auth.uid() rỗng) — phải từ chối,
-- không trả bài công khai như cho một người vô danh.
SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'authenticated', false); SET ROLE authenticated;
DO $$ DECLARE refused boolean := false; BEGIN
  BEGIN
    PERFORM * FROM community_find_recipes('ga');
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  ASSERT refused, 'F14 không có auth.uid() mà hàm vẫn chạy';
END $$;
RESET ROLE;
DO $$ BEGIN ASSERT NOT has_function_privilege('anon', 'public.community_find_recipes(text)', 'EXECUTE'), 'F15 anon gọi được tìm công thức'; END $$;
DO $$ BEGIN ASSERT has_function_privilege('authenticated', 'public.community_find_recipes(text)', 'EXECUTE'), 'F16 người đã đăng nhập không gọi được'; END $$;
\echo TẤT CẢ 17 KỊCH BẢN TÌM CÔNG THỨC ĐÚNG
ROLLBACK;
