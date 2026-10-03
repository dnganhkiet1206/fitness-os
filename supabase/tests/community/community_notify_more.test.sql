-- Thông báo lưu bài / thử buổi tập / mốc thử thách, cài đặt thông báo, tắt
-- bình luận (20261007120000). Người dùng riêng; không phụ thuộc bộ khác.
-- Lệnh ghi và phép kiểm luôn là HAI câu lệnh (xem community_privacy.test.sql, V4).
\set ON_ERROR_STOP 1
\set A '''7a7a7a7a-0000-0000-0000-000000000071'''
\set B '''7b7b7b7b-0000-0000-0000-000000000072'''
\set C '''7c7c7c7c-0000-0000-0000-000000000073'''
\set N '''7d7d7d7d-0000-0000-0000-000000000074'''
INSERT INTO auth.users VALUES (:A), (:B), (:C), (:N);
-- N không có hồ sơ cộng đồng.
INSERT INTO community_profiles (user_id, handle, display_name) VALUES (:A, 'nm_a', 'A'), (:B, 'nm_b', 'B'), (:C, 'nm_c', 'C');
INSERT INTO community_posts (id, author_id, kind, payload) VALUES
  ('7e000000-0000-0000-0000-0000000000a1', :A, 'workout', '{}'),
  ('7e000000-0000-0000-0000-0000000000a2', :A, 'progress', '{}');

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.anon() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;
CREATE OR REPLACE FUNCTION pg_temp.n(u text, k text) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM community_notifications WHERE user_id = u::uuid AND kind = k $$;

-- ── lưu bài ──
SELECT pg_temp.who(:B); SET ROLE authenticated;
INSERT INTO community_saves (post_id) VALUES ('7e000000-0000-0000-0000-0000000000a1');
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.n('7a7a7a7a-0000-0000-0000-000000000071', 'save') = 1, 'NM1 lưu bài không sinh thông báo cho tác giả'; END $$;
SELECT pg_temp.who(:B); SET ROLE authenticated;
DELETE FROM community_saves WHERE post_id = '7e000000-0000-0000-0000-0000000000a1';
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.n('7a7a7a7a-0000-0000-0000-000000000071', 'save') = 0, 'NM2 bỏ lưu mà thông báo còn'; END $$;
-- Lưu bài của chính mình: không báo. Không có hồ sơ: không báo.
SELECT pg_temp.who(:A); SET ROLE authenticated;
INSERT INTO community_saves (post_id) VALUES ('7e000000-0000-0000-0000-0000000000a1');
RESET ROLE;
SELECT pg_temp.who(:N); SET ROLE authenticated;
INSERT INTO community_saves (post_id) VALUES ('7e000000-0000-0000-0000-0000000000a1');
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.n('7a7a7a7a-0000-0000-0000-000000000071', 'save') = 0, 'NM3 tự lưu / người không hồ sơ sinh thông báo'; END $$;

-- ── thử buổi tập ──
SELECT pg_temp.who(:B); SET ROLE authenticated;
INSERT INTO community_post_tries (post_id, user_id) VALUES ('7e000000-0000-0000-0000-0000000000a1', '7b7b7b7b-0000-0000-0000-000000000072');
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.n('7a7a7a7a-0000-0000-0000-000000000071', 'try') = 1, 'NM4 thử buổi tập không sinh thông báo'; END $$;
-- Thử lần hai: khoá chính chặn, vẫn một thông báo.
SELECT pg_temp.who(:B); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_post_tries (post_id, user_id) VALUES ('7e000000-0000-0000-0000-0000000000a1', '7b7b7b7b-0000-0000-0000-000000000072')$q$) = '23505', 'NM5 thử hai lần mà không bị khoá chính chặn'; END $$;
-- Ghi thay người khác: bị chặn.
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_post_tries (post_id, user_id) VALUES ('7e000000-0000-0000-0000-0000000000a1', '7c7c7c7c-0000-0000-0000-000000000073')$q$) = '42501', 'NM6 ghi được lượt thử thay người khác'; END $$;
-- Bài không phải buổi tập: bị chặn.
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_post_tries (post_id, user_id) VALUES ('7e000000-0000-0000-0000-0000000000a2', '7b7b7b7b-0000-0000-0000-000000000072')$q$) = '42501', 'NM7 thử được bài tiến trình'; END $$;
-- Người khác không đọc được lượt thử của B.
SELECT pg_temp.who(:C); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_post_tries) = 0, 'NM8 đọc được lượt thử của người khác'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.n('7a7a7a7a-0000-0000-0000-000000000071', 'try') = 1, 'NM9 lượt thử bị chặn vẫn sinh thông báo'; END $$;
-- anon không ghi được.
SELECT pg_temp.anon(); SET ROLE anon;
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_post_tries (post_id, user_id) VALUES ('7e000000-0000-0000-0000-0000000000a1', '7b7b7b7b-0000-0000-0000-000000000072')$q$) = '42501', 'NM10 anon ghi được lượt thử'; END $$;
RESET ROLE;

-- ── cài đặt thông báo ──
SELECT pg_temp.who(:A); SET ROLE authenticated;
INSERT INTO community_settings (user_id, notify_saves, notify_likes) VALUES ('7a7a7a7a-0000-0000-0000-000000000071', false, true);
RESET ROLE;
SELECT pg_temp.who(:C); SET ROLE authenticated;
INSERT INTO community_saves (post_id) VALUES ('7e000000-0000-0000-0000-0000000000a1');
INSERT INTO community_likes (post_id) VALUES ('7e000000-0000-0000-0000-0000000000a1');
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.n('7a7a7a7a-0000-0000-0000-000000000071', 'save') = 0, 'NS1 tắt thông báo lưu bài mà vẫn nhận'; END $$;
DO $$ BEGIN ASSERT pg_temp.n('7a7a7a7a-0000-0000-0000-000000000071', 'like') = 1, 'NS2 tắt một nhóm làm mất nhóm khác'; END $$;
-- Lưu bài vẫn được ghi: tắt thông báo không phải chặn hành động.
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_saves WHERE user_id = '7c7c7c7c-0000-0000-0000-000000000073') = 1, 'NS3 tắt thông báo làm hỏng việc lưu bài'; END $$;
-- Người khác không sửa được cài đặt của A.
SELECT pg_temp.who(:C); SET ROLE authenticated;
UPDATE community_settings SET notify_saves = true;
RESET ROLE;
DO $$ BEGIN ASSERT NOT (SELECT notify_saves FROM community_settings WHERE user_id = '7a7a7a7a-0000-0000-0000-000000000071'), 'NS4 người khác bật lại được cài đặt của A'; END $$;

-- ── mốc thử thách ──
INSERT INTO community_challenges (id, title, target, starts_on, ends_on) VALUES
  ('7f000000-0000-0000-0000-0000000000c1', 'nm milestone', 4, current_date - 10, current_date + 10);
SELECT pg_temp.who(:B); SET ROLE authenticated;
INSERT INTO community_challenge_members (challenge_id, user_id, offset_min) VALUES ('7f000000-0000-0000-0000-0000000000c1', '7b7b7b7b-0000-0000-0000-000000000072', 420);
RESET ROLE;
INSERT INTO workout_sessions (user_id, date_time) VALUES (:B, now() - interval '3 days');
DO $$ BEGIN ASSERT pg_temp.n('7b7b7b7b-0000-0000-0000-000000000072', 'challenge_milestone') = 0, 'NC1 một ngày / bốn đã báo mốc'; END $$;
INSERT INTO workout_sessions (user_id, date_time) VALUES (:B, now() - interval '2 days');
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_notifications WHERE user_id = '7b7b7b7b-0000-0000-0000-000000000072' AND kind = 'challenge_milestone' AND milestone = 50 AND actor_id IS NULL) = 1, 'NC2 hai ngày / bốn chưa báo mốc 50%'; END $$;
-- Hai buổi CÙNG một ngày không đếm hai lần, và mốc 50% không báo lần hai.
INSERT INTO workout_sessions (user_id, date_time) VALUES (:B, now() - interval '2 days' + interval '1 minute');
DO $$ BEGIN ASSERT pg_temp.n('7b7b7b7b-0000-0000-0000-000000000072', 'challenge_milestone') = 1, 'NC3 mốc 50% báo hai lần'; END $$;
INSERT INTO workout_sessions (user_id, date_time) VALUES (:B, now() - interval '1 day'), (:B, now());
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_notifications WHERE user_id = '7b7b7b7b-0000-0000-0000-000000000072' AND kind = 'challenge_milestone' AND milestone = 100) = 1, 'NC4 đủ bốn ngày chưa báo mốc 100%'; END $$;
-- Buổi tập của người KHÔNG tham gia: không có gì.
INSERT INTO workout_sessions (user_id, date_time) VALUES (:C, now());
DO $$ BEGIN ASSERT pg_temp.n('7c7c7c7c-0000-0000-0000-000000000073', 'challenge_milestone') = 0, 'NC5 người không tham gia nhận mốc'; END $$;
-- Mốc chỉ người ấy đọc được.
SELECT pg_temp.who(:C); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_notifications WHERE kind = 'challenge_milestone') = 0, 'NC6 đọc được mốc của người khác'; END $$;
RESET ROLE;
-- Tắt thông báo thử thách thì mốc không ghi — và buổi tập vẫn lưu được.
INSERT INTO community_settings (user_id, notify_challenges) VALUES (:C, false);
INSERT INTO community_challenge_members (challenge_id, user_id) VALUES ('7f000000-0000-0000-0000-0000000000c1', :C);
INSERT INTO workout_sessions (user_id, date_time) VALUES (:C, now() - interval '1 day');
DO $$ BEGIN ASSERT pg_temp.n('7c7c7c7c-0000-0000-0000-000000000073', 'challenge_milestone') = 0, 'NC7 tắt thông báo thử thách mà vẫn nhận mốc'; END $$;
DO $$ BEGIN ASSERT (SELECT count(*) FROM workout_sessions WHERE user_id = '7c7c7c7c-0000-0000-0000-000000000073') = 2, 'NC8 buổi tập không được lưu'; END $$;
-- Độ lệch ngoài dải bị chặn.
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_challenge_members (challenge_id, user_id, offset_min) VALUES ('7f000000-0000-0000-0000-0000000000c1', '7a7a7a7a-0000-0000-0000-000000000071', 5000)$q$) = '23514', 'NC9 offset_min ngoài dải lọt'; END $$;

-- ── tắt bình luận ──
SELECT pg_temp.who(:B); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT community_set_comments_off('7e000000-0000-0000-0000-0000000000a1', true)$q$) = 'P0002', 'NK1 tắt được bình luận trên bài người khác'; END $$;
RESET ROLE;
SELECT pg_temp.who(:A); SET ROLE authenticated;
SELECT community_set_comments_off('7e000000-0000-0000-0000-0000000000a1', true);
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT community_set_comments_off('7e000000-0000-0000-0000-0000000000a1', NULL)$q$) = '22023', 'NK2 p_off NULL lọt'; END $$;
-- Tác giả vẫn bình luận được trên bài của mình.
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_comments (post_id, body) VALUES ('7e000000-0000-0000-0000-0000000000a1', 'ghi chú của tác giả')$q$) = 'ok', 'NK5 tác giả không bình luận được trên bài của mình khi đã tắt'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT comments_off FROM community_posts WHERE id = '7e000000-0000-0000-0000-0000000000a1'), 'NK3 tác giả không tắt được bình luận'; END $$;
SELECT pg_temp.who(:B); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_comments (post_id, body) VALUES ('7e000000-0000-0000-0000-0000000000a1', 'chen vao')$q$) = '42501', 'NK4 bình luận được trên bài đã tắt bình luận'; END $$;
RESET ROLE;
-- Bật lại thì người khác bình luận được.
SELECT pg_temp.who(:A); SET ROLE authenticated;
SELECT community_set_comments_off('7e000000-0000-0000-0000-0000000000a1', false);
RESET ROLE;
SELECT pg_temp.who(:B); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_comments (post_id, body) VALUES ('7e000000-0000-0000-0000-0000000000a1', 'mở lại rồi')$q$) = 'ok', 'NK6 bật lại mà vẫn không bình luận được'; END $$;
RESET ROLE;
SELECT pg_temp.anon(); SET ROLE anon;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT community_set_comments_off('7e000000-0000-0000-0000-0000000000a1', true)$q$) = '42501', 'NK7 anon gọi được community_set_comments_off'; END $$;
RESET ROLE;

-- ── thành tích cộng đồng ──
-- A có: a1 (workout, công khai, B đã thử), a2 (progress, công khai), và thêm
-- một bài chỉ-người-theo-dõi + một bài đang ẩn.
INSERT INTO community_posts (id, author_id, kind, payload, visibility, like_count) VALUES
  ('7e000000-0000-0000-0000-0000000000a3', :A, 'workout', '{}', 'followers', 7);
INSERT INTO community_posts (id, author_id, kind, payload, hidden, like_count) VALUES
  ('7e000000-0000-0000-0000-0000000000a4', :A, 'workout', '{}', true, 11);
UPDATE community_posts SET like_count = 2 WHERE id = '7e000000-0000-0000-0000-0000000000a1';
SELECT pg_temp.who(:C); SET ROLE authenticated;
DO $$ DECLARE r record; BEGIN
  SELECT * INTO r FROM community_user_stats('7a7a7a7a-0000-0000-0000-000000000071');
  ASSERT r.posts = 2, format('ST1 người lạ phải thấy 2 bài (công khai, không ẩn), ra %s', r.posts);
  ASSERT r.likes = 2, format('ST2 lượt thích đếm cả bài không được thấy: %s', r.likes);
  ASSERT r.tries = 1, format('ST3 số người đã thử phải là 1, ra %s', r.tries);
END $$;
RESET ROLE;
-- Theo dõi thì thấy cả bài chỉ-người-theo-dõi; bài ẩn thì không.
INSERT INTO community_follows (follower_id, followee_id) VALUES (:C, :A);
SELECT pg_temp.who(:C); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT posts FROM community_user_stats('7a7a7a7a-0000-0000-0000-000000000071')) = 3, 'ST4 người theo dõi không thấy bài chỉ-người-theo-dõi trong số đếm'; END $$;
RESET ROLE;
-- Chính mình thấy cả bài đang ẩn.
SELECT pg_temp.who(:A); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT posts FROM community_user_stats('7a7a7a7a-0000-0000-0000-000000000071')) = 4, 'ST5 chủ hồ sơ không thấy đủ bài của mình'; END $$;
RESET ROLE;
-- Chặn nhau: không hàng nào.
INSERT INTO community_blocks (blocker_id, blocked_id) VALUES (:A, :B);
SELECT pg_temp.who(:B); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_user_stats('7a7a7a7a-0000-0000-0000-000000000071')) = 0, 'ST6 người bị chặn vẫn đọc được thành tích'; END $$;
RESET ROLE;
SELECT pg_temp.anon(); SET ROLE anon;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT * FROM community_user_stats('7a7a7a7a-0000-0000-0000-000000000071')$q$) = '42501', 'ST7 anon đọc được thành tích'; END $$;
RESET ROLE;

\echo 'TẤT CẢ 37 KỊCH BẢN THÔNG BÁO MỚI, CÀI ĐẶT THÔNG BÁO VÀ TẮT BÌNH LUẬN ĐÚNG'
