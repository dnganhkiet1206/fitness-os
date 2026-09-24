-- Hộp thông báo (#13). Người dùng riêng; không phụ thuộc bộ khác.
-- Lệnh ghi và phép kiểm luôn là HAI câu lệnh, và câu ghi "không được" không có
-- WHERE đọc cột (xem community_privacy.test.sql, V4).
\set ON_ERROR_STOP 1
\set P '''d1d1d1d1-0000-0000-0000-000000000011'''
\set L '''d2d2d2d2-0000-0000-0000-000000000012'''
\set M '''d3d3d3d3-0000-0000-0000-000000000013'''
\set K '''d4d4d4d4-0000-0000-0000-000000000014'''
INSERT INTO auth.users VALUES (:P), (:L), (:M), (:K);
-- M không có hồ sơ cộng đồng.
INSERT INTO community_profiles (user_id, handle, display_name) VALUES (:P, 'nt_p', 'P'), (:L, 'nt_l', 'L'), (:K, 'nt_k', 'K');
INSERT INTO community_posts (id, author_id, kind, payload) VALUES
  ('d0000000-0000-0000-0000-0000000000a1', :P, 'workout', '{}'),
  ('d0000000-0000-0000-0000-0000000000a2', :L, 'workout', '{}');

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
-- Vai anon, ĐÚNG như Supabase: không sub, role anon. `who()` đặt sub ở cấp
-- phiên nên nó SỐNG SÓT qua RESET ROLE — thiếu dòng này, mọi `SET ROLE anon`
-- chạy với danh tính của người dùng cuối cùng (#14, #21).
CREATE OR REPLACE FUNCTION pg_temp.anon() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;
CREATE OR REPLACE FUNCTION pg_temp.n(k text) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM community_notifications WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000011' AND kind = k $$;

-- ── không ai ghi tay được ──
SELECT pg_temp.who(:L); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_notifications (user_id, actor_id, kind) VALUES ('d1d1d1d1-0000-0000-0000-000000000011', 'd2d2d2d2-0000-0000-0000-000000000012', 'follow')$q$) <> 'ok', 'N1 client tự ghi được thông báo'; END $$;

-- ── thích ──
INSERT INTO community_likes (post_id) VALUES ('d0000000-0000-0000-0000-0000000000a1');
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.n('like') = 1, 'N2 thích không sinh thông báo'; END $$;
-- Thích – bỏ – thích: vẫn đúng MỘT dòng; bỏ thì dòng mất.
SELECT pg_temp.who(:L); SET ROLE authenticated;
DELETE FROM community_likes WHERE post_id = 'd0000000-0000-0000-0000-0000000000a1';
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.n('like') = 0, 'N3 bỏ thích mà thông báo còn'; END $$;
SELECT pg_temp.who(:L); SET ROLE authenticated;
INSERT INTO community_likes (post_id) VALUES ('d0000000-0000-0000-0000-0000000000a1');
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.n('like') = 1, 'N4 thích lại phải ra đúng một dòng'; END $$;

-- Tự thích bài mình: không báo.
SELECT pg_temp.who(:P); SET ROLE authenticated;
INSERT INTO community_likes (post_id) VALUES ('d0000000-0000-0000-0000-0000000000a1');
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.n('like') = 1, 'N5 tự thích bài mình sinh thông báo'; END $$;
-- Không có hồ sơ: không có tên để hiện, không báo.
SELECT pg_temp.who(:M); SET ROLE authenticated;
INSERT INTO community_likes (post_id) VALUES ('d0000000-0000-0000-0000-0000000000a1');
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.n('like') = 1, 'N6 người không có hồ sơ sinh thông báo'; END $$;

-- ── bình luận ──
SELECT pg_temp.who(:L); SET ROLE authenticated;
INSERT INTO community_comments (id, post_id, body) VALUES
  ('dc000000-0000-0000-0000-0000000000c1', 'd0000000-0000-0000-0000-0000000000a1', 'Hay!'),
  ('dc000000-0000-0000-0000-0000000000c2', 'd0000000-0000-0000-0000-0000000000a1', 'Tuần sau thử nhé');
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.n('comment') = 2, 'N7 mỗi bình luận một thông báo'; END $$;
SELECT pg_temp.who(:L); SET ROLE authenticated;
DELETE FROM community_comments WHERE id = 'dc000000-0000-0000-0000-0000000000c1';
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.n('comment') = 1, 'N8 xoá bình luận mà thông báo còn'; END $$;
-- Tự ẩn vì báo cáo (trigger autohide đặt hidden = true).
UPDATE community_comments SET hidden = true WHERE id = 'dc000000-0000-0000-0000-0000000000c2';
DO $$ BEGIN ASSERT pg_temp.n('comment') = 0, 'N9 bình luận bị ẩn mà thông báo còn'; END $$;

-- ── theo dõi ──
SELECT pg_temp.who(:L); SET ROLE authenticated;
INSERT INTO community_follows (followee_id) VALUES ('d1d1d1d1-0000-0000-0000-000000000011');
DELETE FROM community_follows WHERE followee_id = 'd1d1d1d1-0000-0000-0000-000000000011';
RESET ROLE;
-- Kiểm NGAY sau lượt bỏ: nếu chỉ đếm sau lượt theo dõi lại thì UNIQUE vẫn giữ
-- con số là 1 kể cả khi trigger dọn đã mất.
DO $$ BEGIN ASSERT pg_temp.n('follow') = 0, 'N10a bỏ theo dõi mà thông báo còn'; END $$;
SELECT pg_temp.who(:L); SET ROLE authenticated;
INSERT INTO community_follows (followee_id) VALUES ('d1d1d1d1-0000-0000-0000-000000000011');
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.n('follow') = 1, 'N10 theo dõi lại phải ra đúng một dòng'; END $$;

-- ── P thích bài của L: L có một thông báo, để kiểm "chỉ của mình" ──
SELECT pg_temp.who(:P); SET ROLE authenticated;
INSERT INTO community_likes (post_id) VALUES ('d0000000-0000-0000-0000-0000000000a2');
-- P chỉ thấy hộp của mình.
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_notifications WHERE user_id <> auth.uid()) = 0, 'N11 đọc được hộp của người khác'; END $$;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_notifications) = 2, 'N12 P phải thấy đúng 2 thông báo (thích + theo dõi)'; END $$;
-- Đánh dấu đã đọc: không sửa tay được (không có policy UPDATE)…
SELECT pg_temp.errcode($q$UPDATE community_notifications SET read_at = now()$q$);
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_notifications WHERE read_at IS NOT NULL) = 0, 'N13 sửa tay được thông báo'; END $$;
-- …chỉ qua RPC, và chỉ của mình.
SELECT pg_temp.who(:P); SET ROLE authenticated;
DO $$ BEGIN ASSERT community_mark_notifications_read() = 2, 'N14 RPC phải đánh dấu đúng 2 dòng của P'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT read_at FROM community_notifications WHERE user_id = 'd2d2d2d2-0000-0000-0000-000000000012') IS NULL, 'N15 RPC đánh dấu luôn hộp của người khác'; END $$;

-- ── chặn ──
-- P chặn L: thông báo cũ từ L biến khỏi hộp của P (thích còn trong bảng; theo
-- dõi bị trigger chặn gỡ, kéo thông báo theo).
SELECT pg_temp.who(:P); SET ROLE authenticated;
INSERT INTO community_blocks (blocked_id) VALUES ('d2d2d2d2-0000-0000-0000-000000000012');
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_notifications WHERE actor_id = 'd2d2d2d2-0000-0000-0000-000000000012') = 0, 'N16 vẫn thấy thông báo từ người mình đã chặn'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.n('like') = 1, 'N17 dòng thích phải còn trong bảng (RLS giấu, không xoá)'; END $$;
-- K bị P chặn; một lượt thích đi vòng qua RLS (vai postgres) vẫn không sinh
-- thông báo — chốt nằm ở chính trigger.
INSERT INTO community_blocks (blocker_id, blocked_id) VALUES ('d1d1d1d1-0000-0000-0000-000000000011', 'd4d4d4d4-0000-0000-0000-000000000014');
INSERT INTO community_likes (post_id, user_id) VALUES ('d0000000-0000-0000-0000-0000000000a1', 'd4d4d4d4-0000-0000-0000-000000000014');
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM community_notifications WHERE actor_id = 'd4d4d4d4-0000-0000-0000-000000000014'), 'N18 cặp đã chặn vẫn sinh thông báo'; END $$;

SELECT pg_temp.anon(); SET ROLE anon;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_notifications) = 0, 'N19 anon đọc được thông báo'; END $$;
RESET ROLE;
-- Hỏi QUYỀN, không hỏi mã lỗi: với anon `auth.uid()` là null nên thân hàm tự
-- ném 42501 — cấp quyền cho anon mà một phép so mã lỗi vẫn xanh (B bắt được
-- đúng dạng này ở R1 của Recipe).
DO $$ BEGIN ASSERT NOT has_function_privilege('anon', 'public.community_mark_notifications_read()', 'EXECUTE'), 'N20 anon gọi được RPC đánh dấu'; END $$;
DO $$ BEGIN ASSERT has_function_privilege('authenticated', 'public.community_mark_notifications_read()', 'EXECUTE'), 'N20b người đã đăng nhập KHÔNG gọi được RPC đánh dấu'; END $$;

-- Xoá tài khoản dọn cả hộp của mình lẫn thông báo mình đã gây ra.
DELETE FROM auth.users WHERE id = 'd1d1d1d1-0000-0000-0000-000000000011';
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM community_notifications WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000011' OR actor_id = 'd1d1d1d1-0000-0000-0000-000000000011'), 'N21 xoá tài khoản để lại thông báo'; END $$;
\echo TẤT CẢ 23 KỊCH BẢN THÔNG BÁO ĐÚNG
