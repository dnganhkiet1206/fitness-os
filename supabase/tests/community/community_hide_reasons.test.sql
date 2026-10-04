-- Lý do ẩn gộp và yêu cầu xem lại (#26). Người dùng riêng; cả tệp trong một
-- giao dịch ROLLBACK (#163). Lệnh ghi và phép kiểm là HAI câu lệnh; câu ghi
-- "không được" đi qua errcode(), không có WHERE đọc cột (#14).
\set ON_ERROR_STOP 1
BEGIN;
\set A '''f1f1f1f1-0000-0000-0000-000000000026'''
\set B '''f2f2f2f2-0000-0000-0000-000000000026'''
\set C '''f3f3f3f3-0000-0000-0000-000000000026'''
\set D '''f4f4f4f4-0000-0000-0000-000000000026'''
INSERT INTO auth.users VALUES (:A), (:B), (:C), (:D);
-- Người dùng của bộ này là tài khoản hoạt động: một buổi tập gần đây là
-- "đóng góp" theo luật báo cáo đáng tin (20261007220000), nên báo cáo của
-- họ được tính vào ngưỡng tự ẩn như trước.
INSERT INTO workout_sessions (user_id) VALUES (:A), (:B), (:C), (:D);
INSERT INTO community_profiles (user_id, handle, display_name) VALUES
  (:A, 'hr_an', 'An'), (:B, 'hr_binh', 'Bình'), (:C, 'hr_chi', 'Chi'), (:D, 'hr_dung', 'Dũng');
-- a1: bị ẩn (2 spam + 1 harassment). a2: một báo cáo, KHÔNG ẩn. a3: ẩn, hoà ba
-- lý do. b1: bài của B, bị ẩn.
INSERT INTO community_posts (id, author_id, kind, payload) VALUES
  ('f0000000-0000-0000-0000-0000000000a1', :A, 'workout', '{}'),
  ('f0000000-0000-0000-0000-0000000000a2', :A, 'workout', '{}'),
  ('f0000000-0000-0000-0000-0000000000a3', :A, 'workout', '{}'),
  ('f0000000-0000-0000-0000-0000000000b1', :B, 'workout', '{}');

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.anon() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

-- Báo cáo qua đúng đường của client (policy INSERT), để trigger tự ẩn chạy thật.
SELECT pg_temp.who(:B); SET ROLE authenticated;
INSERT INTO community_reports (post_id, reason) VALUES ('f0000000-0000-0000-0000-0000000000a1', 'spam');
INSERT INTO community_reports (post_id, reason) VALUES ('f0000000-0000-0000-0000-0000000000a2', 'spam');
INSERT INTO community_reports (post_id, reason) VALUES ('f0000000-0000-0000-0000-0000000000a3', 'spam');
RESET ROLE;
SELECT pg_temp.who(:C); SET ROLE authenticated;
INSERT INTO community_reports (post_id, reason, note) VALUES ('f0000000-0000-0000-0000-0000000000a1', 'spam', 'Tên người báo: Chi');
INSERT INTO community_reports (post_id, reason) VALUES ('f0000000-0000-0000-0000-0000000000a3', 'inappropriate');
INSERT INTO community_reports (post_id, reason) VALUES ('f0000000-0000-0000-0000-0000000000b1', 'spam');
RESET ROLE;
SELECT pg_temp.who(:D); SET ROLE authenticated;
INSERT INTO community_reports (post_id, reason) VALUES ('f0000000-0000-0000-0000-0000000000a1', 'harassment');
INSERT INTO community_reports (post_id, reason) VALUES ('f0000000-0000-0000-0000-0000000000a3', 'harassment');
INSERT INTO community_reports (post_id, reason) VALUES ('f0000000-0000-0000-0000-0000000000b1', 'spam');
RESET ROLE;
SELECT pg_temp.who(:A); SET ROLE authenticated;
INSERT INTO community_reports (post_id, reason) VALUES ('f0000000-0000-0000-0000-0000000000b1', 'spam');
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT hidden FROM community_posts WHERE id = 'f0000000-0000-0000-0000-0000000000a1'), 'tự kiểm: a1 phải bị ẩn sau ba báo cáo';
  ASSERT NOT (SELECT hidden FROM community_posts WHERE id = 'f0000000-0000-0000-0000-0000000000a2'), 'tự kiểm: a2 một báo cáo không được ẩn';
END $$;

-- ── H1: tác giả thấy lý do gộp của bài đang ẩn: 3 người, phần lớn spam ──
SELECT pg_temp.who(:A); SET ROLE authenticated;
CREATE TEMP TABLE h_a AS SELECT * FROM community_my_hidden_reasons();
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT reporters FROM h_a WHERE post_id = 'f0000000-0000-0000-0000-0000000000a1') = 3, 'H1 số người báo cáo sai';
  ASSERT (SELECT top_reason FROM h_a WHERE post_id = 'f0000000-0000-0000-0000-0000000000a1') = 'spam', 'H1 lý do phổ biến nhất sai';
  ASSERT NOT (SELECT review_requested FROM h_a WHERE post_id = 'f0000000-0000-0000-0000-0000000000a1'), 'H1 chưa yêu cầu mà báo đã yêu cầu';
  -- H2: bài KHÔNG ẩn không có trong danh sách; bài của người khác cũng không.
  ASSERT NOT EXISTS (SELECT 1 FROM h_a WHERE post_id = 'f0000000-0000-0000-0000-0000000000a2'), 'H2 bài không ẩn lọt vào danh sách';
  ASSERT NOT EXISTS (SELECT 1 FROM h_a WHERE post_id = 'f0000000-0000-0000-0000-0000000000b1'), 'H2 bài ẩn của NGƯỜI KHÁC lọt vào danh sách của A';
  ASSERT (SELECT count(*) FROM h_a) = 2, 'H2 A phải có đúng hai mục đang ẩn (a1, a3)';
  -- H3: hoà một-một-một → lý do theo thứ tự cố định, harassment trước.
  ASSERT (SELECT top_reason FROM h_a WHERE post_id = 'f0000000-0000-0000-0000-0000000000a3') = 'harassment', 'H3 hoà lý do không theo thứ tự cố định';
END $$;

-- ── H4: không lộ ai báo cáo — hàm KHÔNG trả cột nào ngoài các cột gộp ──
-- 20261007130000 thêm `removed` và `review_upheld`: hai cờ về CHÍNH bài của
-- người gọi, không nói gì về người báo cáo. Danh sách được ghim lại ở đây để
-- một cột thứ tám phải đi qua đúng câu hỏi này.
DO $$ BEGIN
  ASSERT (SELECT array_to_string(proargnames, ',') FROM pg_proc WHERE proname = 'community_my_hidden_reasons')
         = 'post_id,comment_id,reporters,top_reason,review_requested,removed,review_upheld', 'H4 hàm trả thêm cột — có thể lộ người báo cáo hay ghi chú';
END $$;

-- ── H2 (chiều kia): người khác gọi thì chỉ thấy của chính họ (B thấy b1, không thấy a1) ──
SELECT pg_temp.who(:B); SET ROLE authenticated;
CREATE TEMP TABLE h_b AS SELECT * FROM community_my_hidden_reasons();
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM h_b) = 1, 'H2 B phải thấy đúng một mục (b1)';
  ASSERT (SELECT post_id FROM h_b) = 'f0000000-0000-0000-0000-0000000000b1', 'H2 B thấy mục không phải của mình';
END $$;

-- ── V1: tác giả yêu cầu xem lại bài đang ẩn → một dòng open; bài VẪN ẩn ──
SELECT pg_temp.who(:A); SET ROLE authenticated;
SELECT community_request_review(p_post_id => 'f0000000-0000-0000-0000-0000000000a1');
CREATE TEMP TABLE v1 AS SELECT * FROM community_my_hidden_reasons();
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM community_review_requests WHERE post_id = 'f0000000-0000-0000-0000-0000000000a1' AND status = 'open' AND requester_id = 'f1f1f1f1-0000-0000-0000-000000000026') = 1, 'V1 không có đúng một yêu cầu open';
  ASSERT (SELECT hidden FROM community_posts WHERE id = 'f0000000-0000-0000-0000-0000000000a1'), 'V1 yêu cầu xem lại TỰ BỎ ẩn';
  ASSERT (SELECT review_requested FROM v1 WHERE post_id = 'f0000000-0000-0000-0000-0000000000a1'), 'V1 đã yêu cầu mà lý do gộp không báo';
END $$;

-- ── V2: lần hai → 23505, vẫn một dòng ──
SELECT pg_temp.who(:A); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT community_request_review(p_post_id => 'f0000000-0000-0000-0000-0000000000a1')$q$) = '23505', 'V2 yêu cầu lần hai không bị từ chối 23505'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_review_requests WHERE post_id = 'f0000000-0000-0000-0000-0000000000a1') = 1, 'V2 có hơn một yêu cầu'; END $$;

-- ── V3: bài người khác / bài không ẩn → cùng một mã P0002, không dòng nào ──
SELECT pg_temp.who(:C); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT community_request_review(p_post_id => 'f0000000-0000-0000-0000-0000000000b1')$q$) = 'P0002', 'V3 yêu cầu xem lại bài của người khác không bị từ chối P0002'; END $$;
RESET ROLE;
SELECT pg_temp.who(:A); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT community_request_review(p_post_id => 'f0000000-0000-0000-0000-0000000000a2')$q$) = 'P0002', 'V3 yêu cầu xem lại bài KHÔNG ẩn không bị từ chối P0002'; END $$;
-- V4: không đúng một đích → 22023.
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT community_request_review()$q$) = '22023', 'V4 không đích nào không bị từ chối 22023'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT community_request_review('f0000000-0000-0000-0000-0000000000a3', gen_random_uuid())$q$) = '22023', 'V4 hai đích không bị từ chối 22023'; END $$;
-- V5: INSERT thẳng vào bảng → 42501 (không có quyền ghi cho client).
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_review_requests (requester_id, post_id) VALUES ('f1f1f1f1-0000-0000-0000-000000000026', 'f0000000-0000-0000-0000-0000000000a3')$q$) = '42501', 'V5 client INSERT thẳng vào bảng yêu cầu'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$UPDATE community_review_requests SET status = 'restored'$q$) = '42501', 'V5 client tự đặt status'; END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM community_review_requests WHERE post_id IN ('f0000000-0000-0000-0000-0000000000b1', 'f0000000-0000-0000-0000-0000000000a2', 'f0000000-0000-0000-0000-0000000000a3')) = 0, 'V3–V5 có dòng lọt vào';
  ASSERT (SELECT status FROM community_review_requests WHERE post_id = 'f0000000-0000-0000-0000-0000000000a1') = 'open', 'V5 status bị đổi';
END $$;

-- ── V6: RLS — B không đọc được yêu cầu của A; A đọc được của mình ──
SELECT pg_temp.who(:B); SET ROLE authenticated;
CREATE TEMP TABLE v6b AS SELECT * FROM community_review_requests;
RESET ROLE;
SELECT pg_temp.who(:A); SET ROLE authenticated;
CREATE TEMP TABLE v6a AS SELECT * FROM community_review_requests;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM v6b) = 0, 'V6 B đọc được yêu cầu xem lại của A';
  ASSERT (SELECT count(*) FROM v6a) = 1, 'V6 A không đọc được yêu cầu của chính mình';
END $$;

-- ── V7: anon không gọi được hai hàm ──
SELECT pg_temp.anon(); SET ROLE anon;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT * FROM community_my_hidden_reasons()$q$) = '42501', 'V7 anon gọi được lý do gộp'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT community_request_review(p_post_id => 'f0000000-0000-0000-0000-0000000000a3')$q$) = '42501', 'V7 anon gọi được yêu cầu xem lại'; END $$;
RESET ROLE;

-- ── C1: bình luận bị ẩn cũng có lý do gộp và yêu cầu xem lại được ──
SELECT pg_temp.who(:A); SET ROLE authenticated;
INSERT INTO community_comments (id, post_id, body) VALUES ('fc000000-0000-0000-0000-0000000000c1', 'f0000000-0000-0000-0000-0000000000a2', 'Bình luận của An');
RESET ROLE;
SELECT pg_temp.who(:B); SET ROLE authenticated;
INSERT INTO community_reports (comment_id, reason) VALUES ('fc000000-0000-0000-0000-0000000000c1', 'misleading');
RESET ROLE;
SELECT pg_temp.who(:C); SET ROLE authenticated;
INSERT INTO community_reports (comment_id, reason) VALUES ('fc000000-0000-0000-0000-0000000000c1', 'misleading');
RESET ROLE;
SELECT pg_temp.who(:D); SET ROLE authenticated;
INSERT INTO community_reports (comment_id, reason) VALUES ('fc000000-0000-0000-0000-0000000000c1', 'other');
RESET ROLE;
SELECT pg_temp.who(:A); SET ROLE authenticated;
CREATE TEMP TABLE c1 AS SELECT * FROM community_my_hidden_reasons();
SELECT community_request_review(p_comment_id => 'fc000000-0000-0000-0000-0000000000c1');
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT reporters FROM c1 WHERE comment_id = 'fc000000-0000-0000-0000-0000000000c1') = 3, 'C1 số người báo cáo bình luận sai';
  ASSERT (SELECT top_reason FROM c1 WHERE comment_id = 'fc000000-0000-0000-0000-0000000000c1') = 'misleading', 'C1 lý do bình luận sai';
  ASSERT (SELECT count(*) FROM community_review_requests WHERE comment_id = 'fc000000-0000-0000-0000-0000000000c1') = 1, 'C1 yêu cầu xem lại bình luận không được ghi';
END $$;

-- ── C2: người khác yêu cầu xem lại bình luận của A → P0002 ──
SELECT pg_temp.who(:B); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT community_request_review(p_comment_id => 'fc000000-0000-0000-0000-0000000000c1')$q$) = 'P0002', 'C2 yêu cầu xem lại bình luận của người khác không bị từ chối P0002'; END $$;
RESET ROLE;
-- ── C3: bình luận KHÔNG ẩn của chính mình → P0002, và không có trong lý do gộp ──
SELECT pg_temp.who(:A); SET ROLE authenticated;
INSERT INTO community_comments (id, post_id, body) VALUES ('fc000000-0000-0000-0000-0000000000c2', 'f0000000-0000-0000-0000-0000000000a2', 'Bình luận không ai báo');
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT community_request_review(p_comment_id => 'fc000000-0000-0000-0000-0000000000c2')$q$) = 'P0002', 'C3 yêu cầu xem lại bình luận KHÔNG ẩn không bị từ chối P0002'; END $$;
CREATE TEMP TABLE c3 AS SELECT * FROM community_my_hidden_reasons();
RESET ROLE;
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM c3 WHERE comment_id = 'fc000000-0000-0000-0000-0000000000c2'), 'C3 bình luận không ẩn lọt vào lý do gộp';
  ASSERT (SELECT count(*) FROM community_review_requests WHERE comment_id = 'fc000000-0000-0000-0000-0000000000c2') = 0, 'C3 có dòng lọt vào';
END $$;

\echo 'LÝ DO ẨN + YÊU CẦU XEM LẠI ĐÚNG (#26)'
ROLLBACK;
