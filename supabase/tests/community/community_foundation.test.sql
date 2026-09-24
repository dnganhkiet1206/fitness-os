\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
\set C '''cccccccc-0000-0000-0000-000000000003'''
\set D '''dddddddd-0000-0000-0000-000000000004'''
INSERT INTO auth.users VALUES (:A),(:B),(:C),(:D);
-- thư viện: một bài chung, một bài tự tạo của A
INSERT INTO exercises (id, user_id, name) VALUES ('11111111-0000-0000-0000-000000000001', NULL, 'Incline DB Press'), ('22222222-0000-0000-0000-000000000002', :A, 'My Custom Press');
INSERT INTO workout_sessions (id, user_id, template_name, volume_load, pr_detected, sets) VALUES
 ('5e55a000-0000-0000-0000-000000000001', :A, 'Push Day', 12840, true, '[
   {"exerciseId":"11111111-0000-0000-0000-000000000001","exerciseName":"Incline DB Press","weight":20,"reps":12,"warmup":true},
   {"exerciseId":"11111111-0000-0000-0000-000000000001","exerciseName":"Incline DB Press","weight":24,"reps":10},
   {"exerciseId":"11111111-0000-0000-0000-000000000001","exerciseName":"Incline DB Press","weight":24,"reps":8},
   {"exerciseId":"22222222-0000-0000-0000-000000000002","exerciseName":"My Custom Press","weight":50,"reps":10}]'),
 ('5e55a000-0000-0000-0000-000000000002', :A, NULL, 0, false, '[{"exerciseName":"Plank","weight":0,"reps":1}]'),
 ('5e55b000-0000-0000-0000-000000000003', :B, 'Leg Day', 9000, false, '[{"exerciseName":"Squat","weight":80,"reps":5}]');

CREATE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE FUNCTION pg_temp.fails(stmt text) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN false; EXCEPTION WHEN others THEN RETURN true; END $$;
CREATE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

-- ── hồ sơ ──
SELECT pg_temp.who(:A); SET ROLE authenticated;
INSERT INTO community_profiles (user_id, handle, display_name, is_official) VALUES (:A, 'minh.tran', 'Minh Tran', true);
DO $$ BEGIN ASSERT (SELECT is_official FROM community_profiles WHERE handle='minh.tran') = false, '1 người thường tự gắn được dấu xác minh khi tạo'; END $$;
UPDATE community_profiles SET is_official = true WHERE user_id = auth.uid();
DO $$ BEGIN ASSERT (SELECT is_official FROM community_profiles WHERE handle='minh.tran') = false, '2 người thường tự gắn được dấu xác minh khi sửa'; END $$;
DO $$ BEGIN ASSERT pg_temp.fails($q$INSERT INTO community_profiles (user_id, handle, display_name) VALUES ('bbbbbbbb-0000-0000-0000-000000000002','fake','Fake')$q$), '3 tạo được hồ sơ cho người khác'; END $$;
DO $$ BEGIN ASSERT pg_temp.fails($q$UPDATE community_profiles SET handle='Bad Handle!' WHERE user_id=auth.uid()$q$), '4 handle sai định dạng lọt qua'; END $$;
RESET ROLE;
-- dashboard (vai trò postgres) gắn được dấu cho tài khoản chính thức
UPDATE community_profiles SET is_official = true WHERE handle = 'minh.tran';
DO $$ BEGIN ASSERT (SELECT is_official FROM community_profiles WHERE handle='minh.tran'), '37 dashboard không gắn được dấu xác minh'; END $$;
UPDATE community_profiles SET is_official = false WHERE handle = 'minh.tran';
SELECT pg_temp.who(:B); SET ROLE authenticated; INSERT INTO community_profiles (user_id, handle, display_name) VALUES (:B, 'linh', 'Linh'); RESET ROLE;
SELECT pg_temp.who(:C); SET ROLE authenticated; INSERT INTO community_profiles (user_id, handle, display_name) VALUES (:C, 'chi', 'Chi'); RESET ROLE;
SELECT pg_temp.who(:D); SET ROLE authenticated; INSERT INTO community_profiles (user_id, handle, display_name) VALUES (:D, 'duc', 'Duc'); RESET ROLE;

-- ── chia sẻ ──
SELECT pg_temp.who(:A); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.fails($q$INSERT INTO community_posts (author_id, kind, payload) VALUES (auth.uid(), 'workout', '{"volumeKg":999999}')$q$), '5 client INSERT thẳng được bài (bịa số)'; END $$;
SELECT share_workout('5e55a000-0000-0000-0000-000000000001', 'Finally got my incline up', 'public', 45) AS post_a \gset
RESET ROLE; CREATE TEMP TABLE ids AS SELECT :'post_a'::uuid AS post_a; GRANT SELECT ON ids TO authenticated, anon; SET ROLE authenticated;
DO $$ DECLARE p jsonb; BEGIN
  SELECT payload INTO p FROM community_posts WHERE source_id = '5e55a000-0000-0000-0000-000000000001';
  ASSERT p->>'title' = 'Push Day', '6 tiêu đề';
  ASSERT (p->>'volumeKg')::numeric = 12840, '7 volume';
  ASSERT (p->>'pr')::boolean, '8 cờ PR';
  ASSERT (p->>'minutes')::int = 45, '9 phút';
  ASSERT jsonb_array_length(p->'exercises') = 2, '10 số bài tập';
  ASSERT (p->'exercises'->0->>'weight')::numeric = 24 AND (p->'exercises'->0->>'reps')::int = 10, '11 set nặng nhất (24x10, không phải set khởi động 20x12, không phải 24x8)';
  ASSERT (p->'exercises'->0->>'sets')::int = 2, '12 set khởi động bị đếm';
  ASSERT (p->'exercises'->0->>'library')::boolean = true, '13 bài thư viện';
  ASSERT (p->'exercises'->1->>'library')::boolean = false, '14 bài tự tạo bị coi là thư viện';
END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT share_workout('5e55a000-0000-0000-0000-000000000001')$q$) = '23505', '15 chia sẻ trùng một buổi'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT share_workout('5e55b000-0000-0000-0000-000000000003')$q$) = 'P0002', '16 chia sẻ được buổi tập của NGƯỜI KHÁC'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT share_workout('5e55a000-0000-0000-0000-000000000002', '', 'public', 9999)$q$) = 'ok', '17 buổi không tên'; END $$;
DO $$ BEGIN ASSERT (SELECT payload->'minutes' FROM community_posts WHERE source_id='5e55a000-0000-0000-0000-000000000002') = 'null'::jsonb, '18 phút ngoài 1..600 không bị gạt'; END $$;
-- bài chỉ cho người theo dõi
DELETE FROM community_posts WHERE source_id='5e55a000-0000-0000-0000-000000000002';
SELECT share_workout('5e55a000-0000-0000-0000-000000000002', 'followers only', 'followers') AS post_f \gset
RESET ROLE;

-- ── người xem ──
SELECT pg_temp.who(:B); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_posts) = 1, '19 B phải thấy đúng 1 bài công khai, không thấy bài chỉ-người-theo-dõi'; END $$;
INSERT INTO community_likes (post_id) VALUES (:'post_a');
INSERT INTO community_comments (post_id, body) VALUES (:'post_a', 'Nice!');
INSERT INTO community_follows (followee_id) VALUES (:A);
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_posts) = 2, '20 theo dõi rồi mà chưa thấy bài chỉ-người-theo-dõi'; END $$;
-- Lệnh ghi và phép kiểm là HAI câu lệnh — xem ghi chú cùng tên ở
-- community_challenges.test.sql: gộp trong một AND thì phép đếm có thể chạy
-- trước lệnh ghi và kịch bản xanh mà không đo gì.
SELECT pg_temp.fails($q$UPDATE community_posts SET like_count = 9999$q$);
DO $$ BEGIN ASSERT (SELECT max(like_count) FROM community_posts) < 9999, '21 người xem sửa được bộ đếm'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT like_count FROM community_posts WHERE caption LIKE 'Finally%') = 1 AND (SELECT comment_count FROM community_posts WHERE caption LIKE 'Finally%') = 1, '22 bộ đếm trigger'; END $$;

-- ── chặn hai chiều ──
SELECT pg_temp.who(:A); SET ROLE authenticated; INSERT INTO community_blocks (blocked_id) VALUES (:B); RESET ROLE;
SELECT pg_temp.who(:B); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_posts) = 0, '23 người BỊ chặn vẫn thấy bài của người chặn'; END $$;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_follows WHERE follower_id = auth.uid()) = 0, '24 chặn không gỡ quan hệ theo dõi'; END $$;
DO $$ BEGIN ASSERT pg_temp.fails($q$INSERT INTO community_follows (followee_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001')$q$), '25 theo dõi lại được người đã chặn mình'; END $$;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_blocks) = 0, '26 người bị chặn đọc được dòng chặn'; END $$;
RESET ROLE;

-- ── báo cáo → tự ẩn ──
SELECT pg_temp.who(:C); SET ROLE authenticated; INSERT INTO community_reports (post_id, reason) VALUES (:'post_a', 'spam');
-- 27 báo cáo một NGƯỜI có thật (A), không phải một bài không tồn tại: bản đầu
-- dùng post_id '00000000-…' nên lệnh chèn hỏng vì khoá ngoại dù chốt
-- `status = 'open'` có hay không — gỡ chốt ấy mà 27 vẫn xanh (#14).
DO $$ BEGIN ASSERT pg_temp.fails($q$INSERT INTO community_reports (reported_user_id, reason, status) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'spam', 'actioned')$q$), '27 tự đóng báo cáo được'; END $$;
-- 27b ĐỐI CHỨNG: cùng dòng ấy với status mặc định thì chèn được — nên 27 đỏ
-- chỉ có thể vì `status`. Xoá lại ngay để 31 vẫn đếm đúng một báo cáo của C.
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_reports (reported_user_id, reason) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'spam')$q$) = 'ok', '27b báo cáo một người hợp lệ không chèn được — 27 không đo được gì'; END $$;
RESET ROLE;
DELETE FROM community_reports WHERE reported_user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.who(:D); SET ROLE authenticated; INSERT INTO community_reports (post_id, reason) VALUES (:'post_a', 'spam'); RESET ROLE;
DO $$ BEGIN ASSERT (SELECT hidden FROM community_posts WHERE id = (SELECT post_a FROM ids)) = false, '28 hai báo cáo đã ẩn — ngưỡng là ba'; END $$;
-- B bị A chặn nhưng vẫn báo cáo được bài (id đã biết); đây là người thứ ba
SELECT pg_temp.who(:B); SET ROLE authenticated; INSERT INTO community_reports (post_id, reason) VALUES (:'post_a', 'spam'); RESET ROLE;
DO $$ BEGIN ASSERT (SELECT hidden FROM community_posts WHERE id = (SELECT post_a FROM ids)), '29 ba người báo cáo mà chưa ẩn'; END $$;
SELECT pg_temp.who(:C); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_posts WHERE id = (SELECT post_a FROM ids)) = 0, '30 bài đã ẩn vẫn hiện với người khác'; END $$;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_reports) = 1, '31 đọc được báo cáo của người khác'; END $$;
RESET ROLE;
SELECT pg_temp.who(:A); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_posts WHERE id = (SELECT post_a FROM ids)) = 1, '32 tác giả không thấy bài bị ẩn của chính mình'; END $$;
DELETE FROM community_posts WHERE id = :'post_a';
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_comments) = 0 AND (SELECT count(*) FROM community_likes) = 0, '33 xoá bài không dọn thích/bình luận'; END $$;

-- ── anon ──
-- 34 hỏi thẳng QUYỀN. Bản đầu gọi hàm dưới vai anon và đòi nó hỏng — nhưng
-- `request.jwt.claim.sub` còn là A từ trước, nên kết quả tuỳ vào việc bài của
-- A đã bị xoá hay chưa, không tuỳ vào REVOKE (#14; cùng dạng R1 của Recipe).
DO $$ BEGIN ASSERT NOT has_function_privilege('anon', 'public.share_workout(uuid, text, text, integer)', 'EXECUTE'), '34 anon gọi được share_workout'; END $$;
-- 35 cần một bài CÔNG KHAI còn sống: bản đầu đếm lúc bài công khai duy nhất đã
-- bị xoá (dòng xoá post_a ở trên), nên mở policy đọc cho anon mà 35 vẫn xanh.
SELECT pg_temp.who(:A); SET ROLE authenticated;
SELECT share_workout('5e55a000-0000-0000-0000-000000000001', 'again', 'public') AS post_pub \gset
RESET ROLE; CREATE TEMP TABLE pub AS SELECT :'post_pub'::uuid AS id;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_posts WHERE id = (SELECT id FROM pub) AND visibility = 'public' AND NOT hidden) = 1, '35b không có bài công khai nào để anon thử đọc — 35 không đo được gì'; END $$;
SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false);
SET ROLE anon;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_posts) = 0, '35 anon đọc được bài'; END $$;
RESET ROLE;

-- ── xoá tài khoản ──
DELETE FROM auth.users WHERE id = :A;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_profiles WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0 AND (SELECT count(*) FROM community_posts) = 0, '36 xoá tài khoản để lại dữ liệu cộng đồng'; END $$;
\echo TẤT CẢ 39 KỊCH BẢN ĐÚNG
