-- `comment_count` đếm bình luận ĐANG HIỆN (#175). Người dùng riêng; cả tệp
-- trong một giao dịch ROLLBACK (#163). Lệnh ghi và phép kiểm là HAI câu lệnh
-- (#14). Ẩn đi qua đúng đường thật: ba báo cáo qua policy INSERT, để trigger
-- tự ẩn chạy.
\set ON_ERROR_STOP 1
BEGIN;
\set A '''c5c5c5c5-0000-0000-0000-000000000175'''
\set B '''c6c6c6c6-0000-0000-0000-000000000175'''
\set C '''c7c7c7c7-0000-0000-0000-000000000175'''
\set D '''c8c8c8c8-0000-0000-0000-000000000175'''
\set E '''c9c9c9c9-0000-0000-0000-000000000175'''
INSERT INTO auth.users VALUES (:A), (:B), (:C), (:D), (:E);
-- Người dùng của bộ này là tài khoản hoạt động: một buổi tập gần đây là
-- "đóng góp" theo luật báo cáo đáng tin (20261007220000), nên báo cáo của
-- họ được tính vào ngưỡng tự ẩn như trước.
INSERT INTO workout_sessions (user_id) VALUES (:A), (:B), (:C), (:D), (:E);
INSERT INTO community_profiles (user_id, handle, display_name) VALUES
  (:A, 'cc_an', 'An'), (:B, 'cc_binh', 'Bình'), (:C, 'cc_chi', 'Chi'), (:D, 'cc_dung', 'Dũng'), (:E, 'cc_em', 'Em');
INSERT INTO community_posts (id, author_id, kind, payload) VALUES
  ('cc000000-0000-0000-0000-0000000001a1', :A, 'workout', '{}');

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.anon() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false) $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;
CREATE OR REPLACE FUNCTION pg_temp.cnt() RETURNS integer LANGUAGE sql AS $$
  SELECT comment_count FROM community_posts WHERE id = 'cc000000-0000-0000-0000-0000000001a1' $$;
-- Ba người khác nhau báo cáo một bình luận → nó tự ẩn.
CREATE OR REPLACE FUNCTION pg_temp.hide(c text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE u text;
BEGIN
  FOREACH u IN ARRAY ARRAY['c7c7c7c7-0000-0000-0000-000000000175', 'c8c8c8c8-0000-0000-0000-000000000175', 'c9c9c9c9-0000-0000-0000-000000000175'] LOOP
    PERFORM pg_temp.who(u);
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO community_reports (comment_id, reason) VALUES (c::uuid, 'spam');
    EXECUTE 'RESET ROLE';
  END LOOP;
END $$;

-- B viết ba bình luận.
SELECT pg_temp.who(:B); SET ROLE authenticated;
INSERT INTO community_comments (id, post_id, body) VALUES
  ('cc000000-0000-0000-0000-0000000001c1', 'cc000000-0000-0000-0000-0000000001a1', 'một'),
  ('cc000000-0000-0000-0000-0000000001c2', 'cc000000-0000-0000-0000-0000000001a1', 'hai'),
  ('cc000000-0000-0000-0000-0000000001c3', 'cc000000-0000-0000-0000-0000000001a1', 'ba');
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.cnt() = 3, 'tự kiểm: ba bình luận phải đếm 3'; END $$;

-- ── CC1: bình luận tự ẩn → thẻ trừ 1 ──
SELECT pg_temp.hide('cc000000-0000-0000-0000-0000000001c1');
DO $$ BEGIN
  ASSERT (SELECT hidden FROM community_comments WHERE id = 'cc000000-0000-0000-0000-0000000001c1'), 'tự kiểm: c1 phải bị ẩn sau ba báo cáo';
  ASSERT pg_temp.cnt() = 2, format('CC1 bình luận bị ẩn mà thẻ vẫn đếm nó: %s', pg_temp.cnt());
END $$;

-- ── CC2: tác giả xoá bình luận ĐÃ ẩn → không trừ lần hai ──
SELECT pg_temp.who(:B); SET ROLE authenticated;
DELETE FROM community_comments WHERE id = 'cc000000-0000-0000-0000-0000000001c1';
RESET ROLE;
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM community_comments WHERE id = 'cc000000-0000-0000-0000-0000000001c1'), 'tự kiểm: B phải xoá được bình luận của mình';
  ASSERT pg_temp.cnt() = 2, format('CC2 xoá bình luận đã ẩn bị trừ lần hai: %s', pg_temp.cnt());
END $$;

-- ── CC3: dashboard bỏ ẩn → thẻ cộng lại ──
SELECT pg_temp.hide('cc000000-0000-0000-0000-0000000001c2');
DO $$ BEGIN ASSERT pg_temp.cnt() = 1, format('tự kiểm: c2 ẩn thì còn 1, ra %s', pg_temp.cnt()); END $$;
UPDATE community_comments SET hidden = false WHERE id = 'cc000000-0000-0000-0000-0000000001c2';
DO $$ BEGIN ASSERT pg_temp.cnt() = 2, format('CC3 bỏ ẩn mà thẻ không cộng lại: %s', pg_temp.cnt()); END $$;

-- ── CC4: đặt lại cùng giá trị `hidden` không đổi số; sửa cột khác cũng không ──
UPDATE community_comments SET hidden = false WHERE id = 'cc000000-0000-0000-0000-0000000001c2';
UPDATE community_comments SET body = 'hai (sửa)' WHERE id = 'cc000000-0000-0000-0000-0000000001c2';
DO $$ BEGIN ASSERT pg_temp.cnt() = 2, format('CC4 cập nhật không đổi hidden làm đổi số: %s', pg_temp.cnt()); END $$;

-- ── CC5: xoá bình luận ĐANG hiện vẫn trừ 1 như trước ──
SELECT pg_temp.who(:B); SET ROLE authenticated;
DELETE FROM community_comments WHERE id = 'cc000000-0000-0000-0000-0000000001c3';
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.cnt() = 1, format('CC5 xoá bình luận đang hiện mà không trừ: %s', pg_temp.cnt()); END $$;

-- ── CC6: thích/lưu vẫn đếm như cũ (hàm chung không bị đụng) ──
SELECT pg_temp.who(:C); SET ROLE authenticated;
INSERT INTO community_likes (post_id, user_id) VALUES ('cc000000-0000-0000-0000-0000000001a1', :C);
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT like_count FROM community_posts WHERE id = 'cc000000-0000-0000-0000-0000000001a1') = 1, 'CC6 thích không còn được đếm';
END $$;

\echo 'comment_count chỉ đếm bình luận đang hiện: TẤT CẢ 6 KỊCH BẢN ĐÚNG'
ROLLBACK;
