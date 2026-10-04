-- Báo cáo đáng tin (20261007220000): chỉ tài khoản ≥ 30 ngày VÀ có đóng góp
-- trong 30 ngày mới được tính vào ngưỡng tự ẩn; ai báo cáo cũng có công cụ cho
-- riêng mình (bài biến khỏi chỗ mình xem, tạm ẩn tác giả 30 ngày); tối đa 10
-- báo cáo mỗi 24 giờ. Người dùng riêng (a7…).
\set ON_ERROR_STOP 1
\set AU '''a7000000-0000-0000-0000-0000000000a1'''
\set OLD1 '''a7000000-0000-0000-0000-0000000000b1'''
\set OLD2 '''a7000000-0000-0000-0000-0000000000b2'''
\set OLD3 '''a7000000-0000-0000-0000-0000000000b3'''
\set NEW1 '''a7000000-0000-0000-0000-0000000000c1'''
\set NEW2 '''a7000000-0000-0000-0000-0000000000c2'''
\set NEW3 '''a7000000-0000-0000-0000-0000000000c3'''
\set IDLE '''a7000000-0000-0000-0000-0000000000d1'''
\set STALE '''a7000000-0000-0000-0000-0000000000d2'''
\set MOD '''a7000000-0000-0000-0000-0000000000e1'''
-- Tài khoản cũ (mặc định của stub: 400 ngày) và ba tài khoản MỚI (5 ngày).
INSERT INTO auth.users (id) VALUES (:AU), (:OLD1), (:OLD2), (:OLD3), (:IDLE), (:STALE), (:MOD);
INSERT INTO auth.users (id, created_at) VALUES (:NEW1, now() - interval '5 days'), (:NEW2, now() - interval '5 days'), (:NEW3, now() - interval '5 days');
INSERT INTO community_profiles (user_id, handle, display_name) VALUES
  (:AU, 'rt.author', 'Author'), (:OLD1, 'rt.old1', 'Old 1'), (:OLD2, 'rt.old2', 'Old 2'), (:OLD3, 'rt.old3', 'Old 3'),
  (:NEW1, 'rt.new1', 'New 1'), (:NEW2, 'rt.new2', 'New 2'), (:NEW3, 'rt.new3', 'New 3'),
  (:IDLE, 'rt.idle', 'Idle'), (:STALE, 'rt.stale', 'Stale'), (:MOD, 'rt.mod', 'Mod');
INSERT INTO app_roles (user_id, role) VALUES (:MOD, 'moderator');
-- Đóng góp trong 30 ngày, mỗi người một kiểu (để mỗi nguồn đều được đo).
INSERT INTO workout_sessions (user_id) VALUES (:OLD1), (:NEW1), (:NEW2), (:NEW3);
INSERT INTO community_posts (id, author_id, kind, payload, caption) VALUES
  ('a7a00000-0000-0000-0000-000000000001', :AU, 'workout', '{}', 'bài một'),
  ('a7a00000-0000-0000-0000-000000000002', :AU, 'workout', '{}', 'bài hai'),
  ('a7a00000-0000-0000-0000-000000000003', :AU, 'workout', '{}', 'bài ba'),
  ('a7a00000-0000-0000-0000-000000000004', :OLD3, 'workout', '{}', 'bài của old3');
INSERT INTO community_likes (post_id, user_id) VALUES ('a7a00000-0000-0000-0000-000000000003', :OLD2);
-- STALE: đóng góp cuối cùng là 45 ngày trước — không còn "trong 30 ngày".
INSERT INTO workout_sessions (user_id, date_time) VALUES (:STALE, now() - interval '45 days');

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.anon() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;
CREATE OR REPLACE FUNCTION pg_temp.report(u text, post text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.who(u);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO community_reports (post_id, reason) VALUES (post::uuid, 'spam');
END $$;

-- ── ai được tính ──
DO $$ BEGIN
  ASSERT public.community_reporter_eligible('a7000000-0000-0000-0000-0000000000b1'), 'RT1 tài khoản cũ có buổi tập gần đây phải đủ điều kiện';
  ASSERT public.community_reporter_eligible('a7000000-0000-0000-0000-0000000000b2'), 'RT2 tài khoản cũ có lượt thích gần đây phải đủ điều kiện';
  ASSERT NOT public.community_reporter_eligible('a7000000-0000-0000-0000-0000000000c1'), 'RT3 tài khoản 5 ngày tuổi (dù có đóng góp) được tính';
  ASSERT NOT public.community_reporter_eligible('a7000000-0000-0000-0000-0000000000d1'), 'RT4 tài khoản cũ không đóng góp gì được tính';
  ASSERT NOT public.community_reporter_eligible('a7000000-0000-0000-0000-0000000000d2'), 'RT5 đóng góp cuối 45 ngày trước vẫn được tính';
  ASSERT public.community_reporter_eligible('a7000000-0000-0000-0000-0000000000b3'), 'RT6 tài khoản cũ có bài đăng gần đây phải đủ điều kiện';
END $$;

-- ── ba tài khoản mới báo cáo: không tự ẩn ──
BEGIN; SELECT pg_temp.report(:NEW1, 'a7a00000-0000-0000-0000-000000000001'); COMMIT;
BEGIN; SELECT pg_temp.report(:NEW2, 'a7a00000-0000-0000-0000-000000000001'); COMMIT;
BEGIN; SELECT pg_temp.report(:NEW3, 'a7a00000-0000-0000-0000-000000000001'); COMMIT;
RESET ROLE;
DO $$ BEGIN ASSERT NOT (SELECT hidden FROM community_posts WHERE id = 'a7a00000-0000-0000-0000-000000000001'), 'RT7 ba tài khoản mới tạo ẩn được bài của người khác'; END $$;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_reports WHERE post_id = 'a7a00000-0000-0000-0000-000000000001' AND NOT counted) = 3, 'RT8 báo cáo của tài khoản mới không được ghi là không tính (vẫn phải VÀO hàng đợi)'; END $$;
-- Người kiểm duyệt vẫn thấy cả ba, và thấy chúng không được tính.
SELECT pg_temp.who(:MOD); SET ROLE authenticated;
DO $$ DECLARE q jsonb := (SELECT e FROM jsonb_array_elements(mod_reports()) e WHERE e->>'target_id' = 'a7a00000-0000-0000-0000-000000000001'); BEGIN
  ASSERT (q->>'report_count')::int = 3 AND (q->>'counted_count')::int = 0, format('RT9 hàng đợi phải có 3 báo cáo, 0 được tính: %s', q);
  ASSERT (SELECT bool_and(NOT (r->>'counted')::boolean) FROM jsonb_array_elements(mod_target('post', 'a7a00000-0000-0000-0000-000000000001')->'reports') r), 'RT10 chi tiết không nói báo cáo nào không được tính';
END $$;
RESET ROLE;

-- ── ba tài khoản đủ điều kiện: tự ẩn như trước ──
BEGIN; SELECT pg_temp.report(:OLD1, 'a7a00000-0000-0000-0000-000000000002'); COMMIT;
BEGIN; SELECT pg_temp.report(:OLD2, 'a7a00000-0000-0000-0000-000000000002'); COMMIT;
RESET ROLE;
DO $$ BEGIN ASSERT NOT (SELECT hidden FROM community_posts WHERE id = 'a7a00000-0000-0000-0000-000000000002'), 'RT11 hai báo cáo đã tự ẩn'; END $$;
-- Hai phiếu thật cộng một tài khoản mới: vẫn chưa đủ ba PHIẾU ĐƯỢC TÍNH.
BEGIN; SELECT pg_temp.report(:NEW1, 'a7a00000-0000-0000-0000-000000000002'); COMMIT;
RESET ROLE;
DO $$ BEGIN ASSERT NOT (SELECT hidden FROM community_posts WHERE id = 'a7a00000-0000-0000-0000-000000000002'), 'RT12 báo cáo không được tính vẫn góp vào ngưỡng'; END $$;
BEGIN; SELECT pg_temp.report(:OLD3, 'a7a00000-0000-0000-0000-000000000002'); COMMIT;
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT hidden FROM community_posts WHERE id = 'a7a00000-0000-0000-0000-000000000002'), 'RT13 ba tài khoản đủ điều kiện mà bài không tự ẩn'; END $$;

-- ── client không tự gắn cờ "được tính" ──
SELECT pg_temp.who(:IDLE); SET ROLE authenticated;
INSERT INTO community_reports (post_id, reason, counted) VALUES ('a7a00000-0000-0000-0000-000000000003', 'spam', true);
RESET ROLE;
DO $$ BEGIN ASSERT NOT (SELECT counted FROM community_reports WHERE reporter_id = 'a7000000-0000-0000-0000-0000000000d1'), 'RT14 client tự gắn được counted = true'; END $$;
-- Ghi và kiểm là HAI câu: trong một câu, Postgres có thể tính phép kiểm trước.
SELECT pg_temp.who(:IDLE); SET ROLE authenticated;
SELECT pg_temp.errcode($q$UPDATE community_reports SET counted = true WHERE reporter_id = auth.uid()$q$);
RESET ROLE;
DO $$ BEGIN ASSERT NOT (SELECT counted FROM community_reports WHERE reporter_id = 'a7000000-0000-0000-0000-0000000000d1'), 'RT15 client sửa được counted sau khi gửi'; END $$;
SELECT pg_temp.who(:IDLE); SET ROLE authenticated;

-- ── người báo không còn thấy bài vừa báo; người khác vẫn thấy ──
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM community_posts WHERE id = 'a7a00000-0000-0000-0000-000000000003'), 'RT16 người báo vẫn thấy bài vừa báo cáo'; END $$;
RESET ROLE;
SELECT pg_temp.who(:OLD1); SET ROLE authenticated;
DO $$ BEGIN ASSERT EXISTS (SELECT 1 FROM community_posts WHERE id = 'a7a00000-0000-0000-0000-000000000003'), 'RT17 báo cáo của một người làm bài biến mất với người khác'; END $$;
-- Ẩn của người khác: không đọc được.
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM community_post_hides WHERE user_id = 'a7000000-0000-0000-0000-0000000000d1'), 'RT18 đọc được danh sách ẩn của người khác'; END $$;
RESET ROLE;
-- Bỏ ẩn thì thấy lại.
SELECT pg_temp.who(:IDLE); SET ROLE authenticated;
DELETE FROM community_post_hides WHERE post_id = 'a7a00000-0000-0000-0000-000000000003';
DO $$ BEGIN ASSERT EXISTS (SELECT 1 FROM community_posts WHERE id = 'a7a00000-0000-0000-0000-000000000003'), 'RT19 bỏ ẩn mà vẫn không thấy bài'; END $$;
RESET ROLE;

-- ── tạm ẩn tác giả 30 ngày ──
SELECT pg_temp.who(:NEW2); SET ROLE authenticated;
INSERT INTO community_mutes (muted_id) VALUES (:AU);
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM community_posts WHERE author_id = 'a7000000-0000-0000-0000-0000000000a1'), 'RT20 tạm ẩn tác giả mà vẫn thấy bài của họ'; END $$;
DO $$ BEGIN ASSERT EXISTS (SELECT 1 FROM community_posts WHERE id = 'a7a00000-0000-0000-0000-000000000004'), 'RT21 tạm ẩn một tác giả làm mất bài của người khác'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_mutes (muted_id) VALUES (auth.uid())$q$) = '23514', 'RT22 tạm ẩn được chính mình'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_mutes (muted_id, until) VALUES ('a7000000-0000-0000-0000-0000000000b3', now() + interval '400 days')$q$) = '42501', 'RT23 tạm ẩn quá 30 ngày lọt qua'; END $$;
RESET ROLE;
-- Hết hạn thì bài hiện lại, không cần ai bấm gì.
UPDATE community_mutes SET until = now() - interval '1 minute' WHERE user_id = 'a7000000-0000-0000-0000-0000000000c2';
SELECT pg_temp.who(:NEW2); SET ROLE authenticated;
DO $$ BEGIN ASSERT EXISTS (SELECT 1 FROM community_posts WHERE id = 'a7a00000-0000-0000-0000-000000000003'), 'RT24 hết hạn tạm ẩn mà bài vẫn không hiện'; END $$;
RESET ROLE;
-- Tác giả bị tạm ẩn vẫn thấy bài của CHÍNH mình (luật chỉ lọc người xem).
SELECT pg_temp.who(:AU); SET ROLE authenticated;
-- Kể cả bài chính mình tự "ẩn" (bấm nhầm): bài của mình luôn thấy.
INSERT INTO community_post_hides (post_id) VALUES ('a7a00000-0000-0000-0000-000000000001');
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_posts WHERE author_id = auth.uid()) = 3, 'RT25 tác giả không thấy bài của chính mình'; END $$;
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM community_mutes), 'RT26 đọc được danh sách tạm ẩn của người khác'; END $$;
RESET ROLE;

-- ── tối đa 10 báo cáo mỗi 24 giờ ──
-- Bài nền đăng rải trong 11 giờ qua: từ 20261007235000 một người chỉ đăng được
-- 10 bài mỗi giờ, và trần ấy không phải thứ bộ này đo.
INSERT INTO community_posts (id, author_id, kind, payload, caption, created_at)
SELECT ('a7b00000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'a7000000-0000-0000-0000-0000000000a1', 'workout', '{}', 'loạt ' || i,
       now() - make_interval(hours => i)
FROM generate_series(1, 11) i;
DO $$ BEGIN
  FOR i IN 1..9 LOOP
    PERFORM pg_temp.who('a7000000-0000-0000-0000-0000000000b3');
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO community_reports (post_id, reason) VALUES (('a7b00000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'spam');
    EXECUTE 'RESET ROLE';
  END LOOP;
END $$;
SELECT pg_temp.who(:OLD3); SET ROLE authenticated;
-- OLD3 đã có 1 báo cáo (bài hai) + 9 = 10: báo cáo thứ 11 bị từ chối.
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_reports (post_id, reason) VALUES ('a7b00000-0000-0000-0000-000000000010', 'spam')$q$) = '54000', 'RT27 báo cáo thứ 11 trong 24 giờ lọt qua'; END $$;
RESET ROLE;
-- Qua 24 giờ thì báo cáo lại được.
UPDATE community_reports SET created_at = now() - interval '25 hours' WHERE reporter_id = 'a7000000-0000-0000-0000-0000000000b3';
SELECT pg_temp.who(:OLD3); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_reports (post_id, reason) VALUES ('a7b00000-0000-0000-0000-000000000010', 'spam')$q$) = 'ok', 'RT28 hết 24 giờ mà vẫn bị chặn báo cáo'; END $$;
RESET ROLE;

-- ── quyền ──
DO $$ BEGIN
  ASSERT NOT has_function_privilege('authenticated', 'public.community_reporter_eligible(uuid)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.community_reporter_eligible(uuid)', 'EXECUTE'), 'RT29 client gọi thẳng được hàm xét điều kiện';
  ASSERT NOT has_table_privilege('anon', 'public.community_post_hides', 'SELECT')
     AND NOT has_table_privilege('anon', 'public.community_mutes', 'SELECT'), 'RT30 anon có quyền trên bảng ẩn / tạm ẩn';
END $$;

-- Dọn: các bộ chạy sau đếm cả bảng.
DELETE FROM community_posts WHERE author_id::text LIKE 'a7000000-0000-0000-0000-%';
DELETE FROM auth.users WHERE id::text LIKE 'a7000000-0000-0000-0000-%';
DELETE FROM workout_sessions WHERE user_id::text LIKE 'a7000000-0000-0000-0000-%';

\echo 'TẤT CẢ 30 KỊCH BẢN BÁO CÁO ĐÁNG TIN ĐÚNG'
