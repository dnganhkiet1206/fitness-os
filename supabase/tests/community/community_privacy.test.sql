-- Quyền riêng tư (#11). Người dùng riêng; không phụ thuộc bộ khác.
-- Lệnh ghi và phép kiểm luôn là HAI câu lệnh (xem community_challenges.test.sql).
\set ON_ERROR_STOP 1
\set X '''a1a1a1a1-0000-0000-0000-00000000000b'''
\set Y '''b2b2b2b2-0000-0000-0000-00000000000c'''
\set Z '''c3c3c3c3-0000-0000-0000-00000000000d'''
INSERT INTO auth.users VALUES (:X), (:Y), (:Z);
INSERT INTO community_profiles (user_id, handle, display_name) VALUES (:X, 'pv_x', 'X'), (:Y, 'pv_y', 'Y'), (:Z, 'pv_z', 'Z');
INSERT INTO community_posts (author_id, kind, payload) VALUES (:X, 'workout', '{}'), (:X, 'workout', '{}'), (:Y, 'workout', '{}');
INSERT INTO community_follows (follower_id, followee_id) VALUES (:X, :Y);

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
-- Vai anon, ĐÚNG như Supabase: không sub, role anon. `who()` đặt sub ở cấp
-- phiên nên nó SỐNG SÓT qua RESET ROLE — thiếu dòng này, mọi `SET ROLE anon`
-- chạy với danh tính của người dùng cuối cùng (#14, #21).
CREATE OR REPLACE FUNCTION pg_temp.anon() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

-- ── cài đặt: chỉ của mình ──
SELECT pg_temp.who(:Y); SET ROLE authenticated;
INSERT INTO community_settings (default_visibility) VALUES ('followers');
RESET ROLE;

SELECT pg_temp.who(:X); SET ROLE authenticated;
INSERT INTO community_settings DEFAULT VALUES;
DO $$ BEGIN ASSERT (SELECT default_visibility FROM community_settings WHERE user_id = auth.uid()) = 'public', 'V1 mặc định phải là public'; END $$;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_settings) = 1, 'V2 đọc được cài đặt của người khác'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_settings (user_id) VALUES ('c3c3c3c3-0000-0000-0000-00000000000d')$q$) <> 'ok', 'V3 tạo được cài đặt cho người khác'; END $$;
-- KHÔNG có WHERE: một câu UPDATE đọc cột (WHERE, RETURNING) thì Postgres áp
-- cả policy SELECT, và dòng của Y đã bị giấu từ đó — V4 sẽ xanh kể cả khi
-- policy UPDATE mở toang (phép thử ngược bắt được, 24/09). Không WHERE thì
-- chỉ còn policy UPDATE đứng giữa X và dòng của Y.
SELECT pg_temp.errcode($q$UPDATE community_settings SET default_visibility = 'public'$q$);
DO $$ BEGIN ASSERT pg_temp.errcode($q$UPDATE community_settings SET default_visibility = 'secret'$q$) <> 'ok', 'V5 giá trị hiển thị lạ lọt qua'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$UPDATE community_settings SET user_id = 'c3c3c3c3-0000-0000-0000-00000000000d'$q$) <> 'ok', 'V6 chuyển được dòng cài đặt sang người khác'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT default_visibility FROM community_settings WHERE user_id = 'b2b2b2b2-0000-0000-0000-00000000000c') = 'followers', 'V4 sửa được cài đặt của người khác'; END $$;

-- ── chặn / bỏ chặn ──
-- X chặn Y (gỡ quan hệ theo dõi), Y chặn X, Z chặn X.
SELECT pg_temp.who(:X); SET ROLE authenticated; INSERT INTO community_blocks (blocked_id) VALUES ('b2b2b2b2-0000-0000-0000-00000000000c'); RESET ROLE;
SELECT pg_temp.who(:Y); SET ROLE authenticated; INSERT INTO community_blocks (blocked_id) VALUES ('a1a1a1a1-0000-0000-0000-00000000000b'); RESET ROLE;
SELECT pg_temp.who(:Z); SET ROLE authenticated; INSERT INTO community_blocks (blocked_id) VALUES ('a1a1a1a1-0000-0000-0000-00000000000b'); RESET ROLE;

SELECT pg_temp.who(:X); SET ROLE authenticated;
-- Danh sách đã chặn chỉ là người MÌNH chặn; không lộ ai đã chặn mình.
DO $$ BEGIN ASSERT (SELECT array_agg(blocked_id::text) FROM community_blocks) = ARRAY['b2b2b2b2-0000-0000-0000-00000000000c'], 'V7 thấy được ai đã chặn mình'; END $$;
-- Bỏ chặn mọi thứ mình thấy: chỉ dòng của mình mất.
SELECT pg_temp.errcode($q$DELETE FROM community_blocks$q$);
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM community_blocks WHERE blocker_id = 'a1a1a1a1-0000-0000-0000-00000000000b') = 0, 'V8 bỏ chặn không gỡ được dòng của mình';
  ASSERT (SELECT count(*) FROM community_blocks WHERE blocked_id = 'a1a1a1a1-0000-0000-0000-00000000000b') = 2, 'V9 bỏ chặn gỡ luôn dòng NGƯỜI KHÁC chặn mình';
  -- Bỏ chặn không tự khôi phục theo dõi đã bị gỡ khi chặn.
  ASSERT NOT EXISTS (SELECT 1 FROM community_follows WHERE follower_id = 'a1a1a1a1-0000-0000-0000-00000000000b'), 'V10 bỏ chặn tự khôi phục theo dõi';
END $$;

-- ── xoá mọi bài của mình ──
-- KHÔNG có WHERE, cùng lý do với V4: bản đầu viết `WHERE author_id =
-- auth.uid()`, và chính mệnh đề ấy đã loại bài của Y — mở toang policy DELETE
-- của community_posts mà V12 vẫn xanh (#14). V12 là kịch bản DUY NHẤT canh
-- "xoá được bài của người khác", nên chỉ policy được đứng giữa X và bài của Y.
SELECT pg_temp.who(:X); SET ROLE authenticated;
SELECT pg_temp.errcode($q$DELETE FROM community_posts$q$);
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM community_posts WHERE author_id = 'a1a1a1a1-0000-0000-0000-00000000000b') = 0, 'V11 không xoá được bài của mình';
  ASSERT (SELECT count(*) FROM community_posts WHERE author_id = 'b2b2b2b2-0000-0000-0000-00000000000c') = 1, 'V12 xoá lây sang bài người khác';
  ASSERT EXISTS (SELECT 1 FROM community_profiles WHERE user_id = 'a1a1a1a1-0000-0000-0000-00000000000b'), 'V13 xoá bài xoá luôn hồ sơ';
END $$;

SELECT pg_temp.anon(); SET ROLE anon;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_settings) = 0, 'V14 anon đọc được cài đặt'; END $$;
RESET ROLE;

-- Xoá tài khoản dọn cài đặt.
DELETE FROM auth.users WHERE id = 'b2b2b2b2-0000-0000-0000-00000000000c';
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM community_settings WHERE user_id = 'b2b2b2b2-0000-0000-0000-00000000000c'), 'V15 xoá tài khoản để lại cài đặt'; END $$;
\echo TẤT CẢ 15 KỊCH BẢN QUYỀN RIÊNG TƯ ĐÚNG
