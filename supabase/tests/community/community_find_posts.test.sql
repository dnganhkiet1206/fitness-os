-- Tìm bài viết theo chú thích + tên, không phân biệt dấu (người làm C).
-- Người dùng riêng (id fefefefe…); không phụ thuộc bộ khác.
--
-- Cả bộ nằm trong MỘT giao dịch rồi ROLLBACK: theo thứ tự tên tệp nó chạy
-- TRƯỚC nền móng (`find` < `foundation`), và nền móng đếm mọi bài thấy được —
-- ba mươi mấy bài để lại ở đây sẽ làm đỏ nó.
--
-- Theo #14/#21: kịch bản quyền hỏi has_function_privilege, và mỗi kịch bản
-- "không được thấy X" có một đối chứng chứng minh X khớp khi được phép thấy
-- (P10–P12 đứng TRƯỚC P4 vì thế).
\set ON_ERROR_STOP 1
BEGIN;
\pset ME '''fefefefe-0000-0000-0000-000000000101'''
\pset NEU '''fefefefe-0000-0000-0000-000000000108'''
\pset HID '''fefefefe-0000-0000-0000-000000000107'''
INSERT INTO auth.users SELECT ('fefefefe-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid FROM generate_series(1, 8) g;

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
-- Vai anon, ĐÚNG như Supabase: không sub, role anon (#14, #21).
CREATE OR REPLACE FUNCTION pg_temp.anon() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false) $$;

INSERT INTO community_profiles (user_id, handle, display_name) VALUES
  ('fefefefe-0000-0000-0000-000000000101', 'fp_me',   'Người xem'),
  ('fefefefe-0000-0000-0000-000000000102', 'fp_pub',  'Đăng công khai'),
  ('fefefefe-0000-0000-0000-000000000103', 'fp_fol',  'Tôi theo dõi'),      -- bài chỉ-người-theo-dõi, ME theo dõi
  ('fefefefe-0000-0000-0000-000000000104', 'fp_nof',  'Không theo dõi'),    -- bài chỉ-người-theo-dõi, ME không theo dõi
  ('fefefefe-0000-0000-0000-000000000105', 'fp_bl',   'Bị tôi chặn'),
  ('fefefefe-0000-0000-0000-000000000106', 'fp_br',   'Chặn tôi'),
  ('fefefefe-0000-0000-0000-000000000107', 'fp_hid',  'Bài bị ẩn'),
  ('fefefefe-0000-0000-0000-000000000108', 'fp_neu',  'Người thứ ba');      -- đối chứng: theo dõi fp_nof, không dính chặn
INSERT INTO community_blocks (blocker_id, blocked_id) VALUES
  ('fefefefe-0000-0000-0000-000000000101', 'fefefefe-0000-0000-0000-000000000105'),
  ('fefefefe-0000-0000-0000-000000000106', 'fefefefe-0000-0000-0000-000000000101');
INSERT INTO community_follows (follower_id, followee_id) VALUES
  ('fefefefe-0000-0000-0000-000000000101', 'fefefefe-0000-0000-0000-000000000103'),
  ('fefefefe-0000-0000-0000-000000000108', 'fefefefe-0000-0000-0000-000000000104');

-- Mã ngắn cho từng bài, để so bằng CHUỖI MÃ chứ không bằng tên (thứ tự sắp của
-- tên có dấu phụ thuộc collation của cụm).
CREATE TEMP TABLE fp (code text, id uuid, author text, kind text, title text, caption text, vis text, hidden boolean, age interval);
INSERT INTO fp VALUES
  ('p01', 'fefefefe-0000-0000-0000-000000000201', '102', 'workout',  'Buổi sáng bận rộn', 'Chạy bộ công viên',      'public',    false, '1 hour'),
  ('p02', 'fefefefe-0000-0000-0000-000000000202', '102', 'progress', 'Sáng thứ hai',      '',                      'public',    false, '2 hours'),
  ('p03', 'fefefefe-0000-0000-0000-000000000203', '102', 'recipe',   'Bữa sáng đủ chất',   '',                      'public',    false, '3 hours'),
  ('p04', 'fefefefe-0000-0000-0000-000000000204', '103', 'progress', 'Sáng thứ ba',       '',                      'followers', false, '4 hours'),
  ('p05', 'fefefefe-0000-0000-0000-000000000205', '104', 'workout',  'Sáng thứ tư',       '',                      'followers', false, '5 hours'),
  ('p06', 'fefefefe-0000-0000-0000-000000000206', '105', 'workout',  'Sáng cuối tuần',    '',                      'public',    false, '6 hours'),
  ('p07', 'fefefefe-0000-0000-0000-000000000207', '106', 'workout',  'Sáng chủ nhật',     '',                      'public',    false, '7 hours'),
  ('p08', 'fefefefe-0000-0000-0000-000000000208', '107', 'workout',  'Sáng mưa',          '',                      'public',    true,  '8 hours'),
  ('p09', 'fefefefe-0000-0000-0000-000000000209', '101', 'workout',  'Sáng nắng',         '',                      'public',    true,  '9 hours'),
  ('p10', 'fefefefe-0000-0000-0000-000000000210', '102', 'workout',  '100% sức',          '',                      'public',    false, '10 hours'),
  ('p11', 'fefefefe-0000-0000-0000-000000000211', '102', 'workout',  'x_y đặc biệt',      '',                      'public',    false, '11 hours'),
  ('p12', 'fefefefe-0000-0000-0000-000000000212', '102', 'workout',  'Hoàng hôn',         'Buổi chiều chạy dài',   'public',    false, '12 hours'),
  ('p13', 'fefefefe-0000-0000-0000-000000000213', '102', 'workout',  '1000 calo',         '',                      'public',    false, '13 hours'),
  ('p14', 'fefefefe-0000-0000-0000-000000000214', '102', 'workout',  'Xay sinh tố',       '',                      'public',    false, '14 hours');
-- 35 bài "Nhật ký N" cho trần 30; s01 mới nhất.
INSERT INTO fp SELECT 's' || lpad(g::text, 2, '0'), ('fefefefe-0000-0000-0000-0000000003' || lpad(g::text, 2, '0'))::uuid, '102', 'workout', 'Nhật ký ' || g, '', 'public', false, (g || ' days')::interval FROM generate_series(1, 35) g;
INSERT INTO community_posts (id, author_id, kind, payload, caption, visibility, hidden, created_at)
SELECT id, ('fefefefe-0000-0000-0000-000000000' || author)::uuid, kind, jsonb_build_object('title', title), caption, vis, hidden, now() - age FROM fp;
-- Tên + chú thích đã gập, tính dưới postgres: `community_fold` đóng với
-- authenticated, và P13 cần lọc NGOÀI hàm đang bị thử. Hai cột riêng (không
-- nối chuỗi): một truy vấn khớp ở RANH GIỚI nối ("ron chay" giữa tên và chú
-- thích) thì hàm thật không ra mà drift nối chuỗi lại ra — lệch giả.
ALTER TABLE fp ADD COLUMN folded_cap text;
ALTER TABLE fp ADD COLUMN folded_title text;
UPDATE fp SET folded_cap = community_fold(caption), folded_title = community_fold(title);
GRANT SELECT ON fp TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.found(q text) RETURNS text LANGUAGE sql AS $$ SELECT coalesce(string_agg(fp.code, ',' ORDER BY fp.code), '') FROM community_find_posts(q) r JOIN fp ON fp.id = r.post_id $$;
-- P13: tập bài mà RLS cho vai hiện tại thấy, lọc tên/chú thích như hàm (tiền tố
-- của một từ, trên HAI trường riêng như hàm), trừ tập hàm trả — và ngược lại.
-- Rỗng cả hai chiều là khớp. `drift` KHÔNG phải SECURITY DEFINER: RLS trên
-- `community_posts` phải có hiệu lực trong CTE `rls`, nếu không một policy
-- trôi (P13/P13b) là vô hình.
CREATE OR REPLACE FUNCTION pg_temp.drift(q text) RETURNS text LANGUAGE sql AS $$
  WITH rls AS (
    SELECT p.id FROM community_posts p JOIN fp ON fp.id = p.id
    WHERE p.kind IN ('workout', 'progress') AND (
      fp.folded_cap LIKE q || '%' OR fp.folded_cap LIKE '% ' || q || '%'
      OR fp.folded_title LIKE q || '%' OR fp.folded_title LIKE '% ' || q || '%'
    )
  ), fn AS (
    SELECT r.post_id AS id FROM community_find_posts(q) r JOIN fp ON fp.id = r.post_id
  )
  SELECT coalesce(string_agg(x, ','), '') FROM (
    SELECT 'RLS có mà hàm không: ' || fp.code AS x FROM (SELECT id FROM rls EXCEPT SELECT id FROM fn) d JOIN fp USING (id)
    UNION ALL
    SELECT 'hàm có mà RLS không: ' || fp.code FROM (SELECT id FROM fn EXCEPT SELECT id FROM rls) d JOIN fp USING (id)
  ) z
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

SELECT pg_temp.who(:ME); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.found('s') = '', format('P1 một ký tự đã trả kết quả: %s', pg_temp.found('s')); END $$;
DO $$ BEGIN ASSERT pg_temp.found('chay') = 'p01,p12', format('P2 "chay" (từ giữa chú thích) phải ra p01,p12 — ra %s', pg_temp.found('chay')); END $$;
DO $$ BEGIN ASSERT pg_temp.found('ang') = '', format('P3 "ang" nằm GIỮA chữ "sáng", không phải đầu một từ — ra %s', pg_temp.found('ang')); END $$;
RESET ROLE;
-- ── đối chứng, TRƯỚC P4 ──
SELECT pg_temp.who(:NEU); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.found('sang') LIKE '%p06,p07%', format('P10 ĐỐI CHỨNG: người không dính chặn phải thấy p06, p07 — ra %s', pg_temp.found('sang')); END $$;
DO $$ BEGIN ASSERT pg_temp.found('sang') LIKE '%p05%', format('P11 ĐỐI CHỨNG: người theo dõi tác giả phải thấy bài chỉ-người-theo-dõi p05 — ra %s', pg_temp.found('sang')); END $$;
RESET ROLE;
SELECT pg_temp.who(:HID); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.found('sang') LIKE '%p08%', format('P12 ĐỐI CHỨNG: tác giả phải thấy bài bị ẩn của chính mình (p08) — ra %s', pg_temp.found('sang')); END $$;
RESET ROLE;
-- ── người xem ──
SELECT pg_temp.who(:ME); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.found('sang') = 'p01,p02,p04,p09', format('P4 "sang" phải ra p01,p02,p04,p09 — ra %s', pg_temp.found('sang')); END $$;
-- P4 gói trong nó: bài workout (p01, p02) và tiến trình (p04) ra, bài công thức
-- (p03) KHÔNG ra — phân đoạn "Bài viết" và "Công thức" không giao nhau; bài
-- chỉ-theo-dõi của người mình theo dõi có (p04) còn của người khác không (p05),
-- không người mình chặn (p06) hay chặn mình (p07), không bài bị ẩn của người
-- khác (p08), có bài bị ẩn của mình (p09).
DO $$ BEGIN ASSERT pg_temp.found('sáng') = pg_temp.found('sang') AND pg_temp.found('  SÁNG ') = pg_temp.found('sang'), 'P5 gõ có dấu, chữ hoa, thừa khoảng trắng phải ra như "sang"'; END $$;
DO $$ BEGIN ASSERT pg_temp.found('100%') = 'p10', format('P6 "%%" phải là chữ, không phải ký tự đại diện — ra %s', pg_temp.found('100%')); END $$;
DO $$ BEGIN ASSERT pg_temp.found('x_') = 'p11', format('P7 "_" phải là chữ, không phải ký tự đại diện — ra %s', pg_temp.found('x_')); END $$;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_find_posts('nhat ky')) = 30, 'P8 phải có trần 30 bài'; END $$;
DO $$ BEGIN ASSERT (SELECT fp.code FROM community_find_posts('nhat ky') WITH ORDINALITY r(post_id, n) JOIN fp ON fp.id = r.post_id ORDER BY r.n LIMIT 1) = 's01', 'P9 bài mới nhất phải đứng đầu'; END $$;
RESET ROLE;
-- ── P13: hàm và policy đọc bài là HAI bản sao của một luật ──
-- Người thứ ba TRƯỚC: RLS của `community_blocks` chỉ cho mỗi người thấy dòng
-- chặn của chính mình, nên một policy trôi theo kiểu "giấu ai dính một dòng
-- chặn" chỉ lệch ở góc nhìn của người bị chặn (P13b); trôi kiểu khác thì người
-- thứ ba thấy trước (P13).
SELECT pg_temp.who(:NEU); SET ROLE authenticated;
-- Không so 'nhat ky': 35 bài khớp mà hàm có trần 30, nên hai tập lệch đúng thiết kế.
DO $$ BEGIN ASSERT pg_temp.drift('sang') = '' AND pg_temp.drift('chay') = '', format('P13 hàm lệch policy đọc bài (người thứ ba): %s %s', pg_temp.drift('sang'), pg_temp.drift('chay')); END $$;
RESET ROLE;
SELECT pg_temp.who(:ME); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.drift('sang') = '', format('P13b hàm lệch policy đọc bài (người xem): %s', pg_temp.drift('sang')); END $$;
RESET ROLE;
-- ── quyền ──
-- P14: vai authenticated mà KHÔNG có sub (auth.uid() rỗng) — phải từ chối,
-- không trả bài công khai như cho một người vô danh.
SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'authenticated', false); SET ROLE authenticated;
DO $$ DECLARE refused boolean := false; BEGIN
  BEGIN
    PERFORM * FROM community_find_posts('sang');
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  ASSERT refused, 'P14 không có auth.uid() mà hàm vẫn chạy';
END $$;
RESET ROLE;
DO $$ BEGIN ASSERT NOT has_function_privilege('anon', 'public.community_find_posts(text)', 'EXECUTE'), 'P15 anon gọi được tìm bài viết'; END $$;
DO $$ BEGIN ASSERT has_function_privilege('authenticated', 'public.community_find_posts(text)', 'EXECUTE'), 'P16 người đã đăng nhập không gọi được'; END $$;

\echo TẤT CẢ 17 KỊCH BẢN TÌM BÀI VIẾT ĐÚNG
ROLLBACK;
