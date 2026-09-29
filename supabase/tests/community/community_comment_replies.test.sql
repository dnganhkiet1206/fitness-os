-- Trả lời một tầng và nhắc @handle (#30). Người dùng riêng; cả tệp trong một
-- giao dịch ROLLBACK để không để lại bình luận / thông báo nào làm lệch phép
-- đếm của bộ khác (#163 đã đo được chuyện đó).
-- Lệnh ghi và phép kiểm luôn là HAI câu lệnh; câu ghi "không được" không có
-- WHERE đọc cột (#14).
\set ON_ERROR_STOP 1
BEGIN;
\set A '''e1e1e1e1-0000-0000-0000-000000000031'''
\set B '''e2e2e2e2-0000-0000-0000-000000000032'''
\set C '''e3e3e3e3-0000-0000-0000-000000000033'''
\set X '''e4e4e4e4-0000-0000-0000-000000000034'''
INSERT INTO auth.users VALUES (:A), (:B), (:C), (:X);
INSERT INTO community_profiles (user_id, handle, display_name) VALUES
  (:A, 'rp_an', 'An'), (:B, 'rp_binh', 'Bình'), (:C, 'rp.chi', 'Chi'), (:X, 'rp_xa', 'Xa');
-- X chặn B.
INSERT INTO community_blocks (blocker_id, blocked_id) VALUES (:X, :B);
INSERT INTO community_posts (id, author_id, kind, payload) VALUES
  ('e0000000-0000-0000-0000-0000000000a1', :A, 'workout', '{}'),
  ('e0000000-0000-0000-0000-0000000000a2', :A, 'workout', '{}');

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.anon() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;
-- Thông báo của MỘT người về MỘT bình luận, theo loại.
CREATE OR REPLACE FUNCTION pg_temp.n(u text, c text, k text) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM community_notifications WHERE user_id = u::uuid AND comment_id = c::uuid AND kind = k $$;
CREATE OR REPLACE FUNCTION pg_temp.all_n(u text, c text) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM community_notifications WHERE user_id = u::uuid AND comment_id = c::uuid $$;

-- B bình luận gốc trên bài của A.
SELECT pg_temp.who(:B); SET ROLE authenticated;
INSERT INTO community_comments (id, post_id, body) VALUES ('ec000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000a1', 'Gốc của Bình');
RESET ROLE;

-- ── R1: C trả lời B → một tầng, B nhận `reply`, A (chủ bài) nhận `comment` ──
SELECT pg_temp.who(:C); SET ROLE authenticated;
INSERT INTO community_comments (id, post_id, parent_id, body) VALUES ('ec000000-0000-0000-0000-0000000000c2', 'e0000000-0000-0000-0000-0000000000a1', 'ec000000-0000-0000-0000-0000000000c1', 'Trả lời Bình');
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT parent_id FROM community_comments WHERE id = 'ec000000-0000-0000-0000-0000000000c2') = 'ec000000-0000-0000-0000-0000000000c1', 'R1 câu trả lời không gắn vào gốc';
  ASSERT pg_temp.n('e2e2e2e2-0000-0000-0000-000000000032', 'ec000000-0000-0000-0000-0000000000c2', 'reply') = 1, 'R1 người được trả lời không nhận reply';
  ASSERT pg_temp.n('e1e1e1e1-0000-0000-0000-000000000031', 'ec000000-0000-0000-0000-0000000000c2', 'comment') = 1, 'R1 chủ bài không còn nhận comment';
END $$;

-- ── R2: trả lời một câu trả lời → gắn vào GỐC, không thành hai tầng ──
SELECT pg_temp.who(:A); SET ROLE authenticated;
INSERT INTO community_comments (id, post_id, parent_id, body) VALUES ('ec000000-0000-0000-0000-0000000000c3', 'e0000000-0000-0000-0000-0000000000a1', 'ec000000-0000-0000-0000-0000000000c2', 'Trả lời Chi');
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT parent_id FROM community_comments WHERE id = 'ec000000-0000-0000-0000-0000000000c3') = 'ec000000-0000-0000-0000-0000000000c1', 'R2 trả lời câu trả lời thành hai tầng';
  -- Người được trả lời là tác giả của CÂU được bấm "Trả lời" dưới nó? Không:
  -- một tầng, nên cha là gốc — B nhận reply.
  ASSERT pg_temp.n('e2e2e2e2-0000-0000-0000-000000000032', 'ec000000-0000-0000-0000-0000000000c3', 'reply') = 1, 'R2 tác giả gốc không nhận reply';
END $$;

-- ── R3: cha ở bài khác → từ chối, không có dòng nào ──
SELECT pg_temp.who(:C); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_comments (id, post_id, parent_id, body) VALUES ('ec000000-0000-0000-0000-0000000000c9', 'e0000000-0000-0000-0000-0000000000a2', 'ec000000-0000-0000-0000-0000000000c1', 'Lạc bài')$q$) = '22023', 'R3 trả lời chéo bài không bị từ chối đúng mã'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM community_comments WHERE id = 'ec000000-0000-0000-0000-0000000000c9'), 'R3 để lại dòng trả lời chéo bài'; END $$;

-- ── R4: chủ bài trả lời bình luận của chính... người khác, và chủ bài LÀ tác
--        giả gốc: một thông báo duy nhất, loại reply ──
SELECT pg_temp.who(:A); SET ROLE authenticated;
INSERT INTO community_comments (id, post_id, body) VALUES ('ec000000-0000-0000-0000-0000000000d1', 'e0000000-0000-0000-0000-0000000000a1', 'Gốc của An');
RESET ROLE;
SELECT pg_temp.who(:B); SET ROLE authenticated;
INSERT INTO community_comments (id, post_id, parent_id, body) VALUES ('ec000000-0000-0000-0000-0000000000d2', 'e0000000-0000-0000-0000-0000000000a1', 'ec000000-0000-0000-0000-0000000000d1', 'Trả lời An');
RESET ROLE;
DO $$ BEGIN
  ASSERT pg_temp.all_n('e1e1e1e1-0000-0000-0000-000000000031', 'ec000000-0000-0000-0000-0000000000d2') = 1, 'R4 chủ bài kiêm người được trả lời nhận hơn một thông báo';
  ASSERT pg_temp.n('e1e1e1e1-0000-0000-0000-000000000031', 'ec000000-0000-0000-0000-0000000000d2', 'reply') = 1, 'R4 thông báo duy nhất phải là reply';
END $$;

-- ── R5: tự trả lời mình → không báo cho mình ──
-- Ghi qua errcode(): một lượt báo cho chính mình không lặng lẽ thành thông báo
-- — nó đụng CHECK user_id <> actor_id của #13 và làm HỎNG lệnh ghi. Nhãn này
-- phải nói ra điều đó, chứ không để một cú ném dừng cả tệp (đo ở b_cases R5).
SELECT pg_temp.who(:B); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_comments (id, post_id, parent_id, body) VALUES ('ec000000-0000-0000-0000-0000000000d3', 'e0000000-0000-0000-0000-0000000000a1', 'ec000000-0000-0000-0000-0000000000c1', 'Bổ sung của Bình')$q$) = 'ok', 'R5 tự trả lời mình bị từ chối (trigger định báo cho chính người viết)'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.all_n('e2e2e2e2-0000-0000-0000-000000000032', 'ec000000-0000-0000-0000-0000000000d3') = 0, 'R5 tự trả lời mình mà có thông báo'; END $$;

-- ── R6: không trả lời được một người đã chặn mình (X chặn B) ──
SELECT pg_temp.who(:X); SET ROLE authenticated;
INSERT INTO community_comments (id, post_id, body) VALUES ('ec000000-0000-0000-0000-0000000000e1', 'e0000000-0000-0000-0000-0000000000a1', 'Gốc của Xa');
RESET ROLE;
SELECT pg_temp.who(:B); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_comments (id, post_id, parent_id, body) VALUES ('ec000000-0000-0000-0000-0000000000e2', 'e0000000-0000-0000-0000-0000000000a1', 'ec000000-0000-0000-0000-0000000000e1', 'Qua chặn')$q$) = 'P0002', 'R6 trả lời qua cặp chặn không bị từ chối'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM community_comments WHERE id = 'ec000000-0000-0000-0000-0000000000e2'), 'R6 để lại dòng trả lời qua cặp chặn'; END $$;

-- ── M1: nhắc handle có thật viết CHỮ HOA (handle có dấu chấm); handle không có
--        thật thì không. Mỗi dạng một bình luận riêng — gộp chung thì phá một
--        dạng vẫn xanh nhờ dạng kia (đo khi viết b_cases). ──
SELECT pg_temp.who(:B); SET ROLE authenticated;
INSERT INTO community_comments (id, post_id, body) VALUES ('ec000000-0000-0000-0000-0000000000f1', 'e0000000-0000-0000-0000-0000000000a2', 'Hỏi @RP.Chi với @khong_co_ai nhé');
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM community_comment_mentions WHERE comment_id = 'ec000000-0000-0000-0000-0000000000f1') = 1, 'M1 phải đúng một lượt nhắc (Chi viết chữ hoa có; handle không có thật thì không)';
  ASSERT EXISTS (SELECT 1 FROM community_comment_mentions WHERE comment_id = 'ec000000-0000-0000-0000-0000000000f1' AND user_id = 'e3e3e3e3-0000-0000-0000-000000000033'), 'M1 lượt nhắc không trỏ vào Chi';
  ASSERT pg_temp.n('e3e3e3e3-0000-0000-0000-000000000033', 'ec000000-0000-0000-0000-0000000000f1', 'mention') = 1, 'M1 người được nhắc không nhận mention';
END $$;

-- ── M1b: dấu chấm cuối câu không thuộc handle; hai lần nhắc một người là một ──
SELECT pg_temp.who(:B); SET ROLE authenticated;
INSERT INTO community_comments (id, post_id, body) VALUES ('ec000000-0000-0000-0000-0000000000f5', 'e0000000-0000-0000-0000-0000000000a2', '@rp.chi xem giúp, cảm ơn @rp.chi.');
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM community_comment_mentions WHERE comment_id = 'ec000000-0000-0000-0000-0000000000f5') = 1, 'M1b hai lần nhắc Chi phải là đúng một lượt nhắc';
  ASSERT pg_temp.all_n('e3e3e3e3-0000-0000-0000-000000000033', 'ec000000-0000-0000-0000-0000000000f5') = 1, 'M1b hai lần nhắc một người mà có hơn một thông báo';
END $$;
SELECT pg_temp.who(:B); SET ROLE authenticated;
INSERT INTO community_comments (id, post_id, body) VALUES ('ec000000-0000-0000-0000-0000000000f6', 'e0000000-0000-0000-0000-0000000000a2', 'Cảm ơn @rp.chi.');
RESET ROLE;
DO $$ BEGIN ASSERT EXISTS (SELECT 1 FROM community_comment_mentions WHERE comment_id = 'ec000000-0000-0000-0000-0000000000f6'), 'M1b "@rp.chi." cuối câu không nhận ra Chi (dấu chấm bị tính vào handle)'; END $$;

-- ── M2: nhắc người đã chặn mình, và nhắc chính mình → không gì cả ──
SELECT pg_temp.who(:B); SET ROLE authenticated;
INSERT INTO community_comments (id, post_id, body) VALUES ('ec000000-0000-0000-0000-0000000000f2', 'e0000000-0000-0000-0000-0000000000a2', '@rp_xa @rp_binh');
RESET ROLE;
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM community_comment_mentions WHERE comment_id = 'ec000000-0000-0000-0000-0000000000f2'), 'M2 nhắc qua cặp chặn hoặc nhắc chính mình mà vẫn có lượt nhắc';
  ASSERT pg_temp.all_n('e4e4e4e4-0000-0000-0000-000000000034', 'ec000000-0000-0000-0000-0000000000f2') = 0, 'M2 người đã chặn nhận thông báo';
END $$;

-- ── M3: nhắc chủ bài → chủ bài vẫn MỘT thông báo (comment), lượt nhắc vẫn có ──
SELECT pg_temp.who(:C); SET ROLE authenticated;
INSERT INTO community_comments (id, post_id, body) VALUES ('ec000000-0000-0000-0000-0000000000f3', 'e0000000-0000-0000-0000-0000000000a2', 'Đúng không @rp_an?');
RESET ROLE;
DO $$ BEGIN
  ASSERT pg_temp.all_n('e1e1e1e1-0000-0000-0000-000000000031', 'ec000000-0000-0000-0000-0000000000f3') = 1, 'M3 chủ bài được nhắc nhận hai thông báo cho một bình luận';
  ASSERT EXISTS (SELECT 1 FROM community_comment_mentions WHERE comment_id = 'ec000000-0000-0000-0000-0000000000f3'), 'M3 lượt nhắc chủ bài bị mất (liên kết @ sẽ không vẽ được)';
END $$;

-- ── M4: không ai ghi tay được lượt nhắc hay thông báo loại mới; anon không đọc ──
SELECT pg_temp.who(:C); SET ROLE authenticated;
DO $$ BEGIN
  ASSERT pg_temp.errcode($q$INSERT INTO community_comment_mentions (comment_id, user_id) VALUES ('ec000000-0000-0000-0000-0000000000c1', 'e1e1e1e1-0000-0000-0000-000000000031')$q$) <> 'ok', 'M4 client tự ghi được lượt nhắc';
  ASSERT pg_temp.errcode($q$INSERT INTO community_notifications (user_id, actor_id, kind, post_id, comment_id) VALUES ('e1e1e1e1-0000-0000-0000-000000000031', 'e3e3e3e3-0000-0000-0000-000000000033', 'mention', 'e0000000-0000-0000-0000-0000000000a2', 'ec000000-0000-0000-0000-0000000000f3')$q$) <> 'ok', 'M4 client tự ghi được thông báo mention';
END $$;
RESET ROLE;
SELECT pg_temp.anon(); SET ROLE anon;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT 1 FROM community_comment_mentions$q$) <> 'ok', 'M4 anon đọc được lượt nhắc'; END $$;
RESET ROLE;

-- ── M5: người đọc bị chặn với người được nhắc thì không thấy lượt nhắc ──
-- X chặn B; bình luận f3 của C nhắc An. Thêm một bình luận của C nhắc B.
SELECT pg_temp.who(:C); SET ROLE authenticated;
INSERT INTO community_comments (id, post_id, body) VALUES ('ec000000-0000-0000-0000-0000000000f4', 'e0000000-0000-0000-0000-0000000000a2', 'Chào @rp_binh');
RESET ROLE;
SELECT pg_temp.who(:X); SET ROLE authenticated;
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM community_comment_mentions WHERE comment_id = 'ec000000-0000-0000-0000-0000000000f4'), 'M5 người đã chặn B vẫn thấy lượt nhắc B'; END $$;
RESET ROLE;
SELECT pg_temp.who(:A); SET ROLE authenticated;
DO $$ BEGIN ASSERT EXISTS (SELECT 1 FROM community_comment_mentions WHERE comment_id = 'ec000000-0000-0000-0000-0000000000f4'), 'M5 người không chặn ai lại không thấy lượt nhắc'; END $$;
RESET ROLE;

-- ── D1: bình luận bị ẩn → reply/mention đi theo; xoá gốc → câu trả lời và bộ đếm đi theo ──
UPDATE community_comments SET hidden = true WHERE id = 'ec000000-0000-0000-0000-0000000000f1';
DO $$ BEGIN ASSERT pg_temp.all_n('e3e3e3e3-0000-0000-0000-000000000033', 'ec000000-0000-0000-0000-0000000000f1') = 0, 'D1 bình luận bị ẩn mà mention còn'; END $$;
DO $$
DECLARE before integer;
BEGIN
  SELECT comment_count INTO before FROM community_posts WHERE id = 'e0000000-0000-0000-0000-0000000000a1';
  -- c1 có ba câu trả lời: c2, c3, d3.
  DELETE FROM community_comments WHERE id = 'ec000000-0000-0000-0000-0000000000c1';
  ASSERT NOT EXISTS (SELECT 1 FROM community_comments WHERE id IN ('ec000000-0000-0000-0000-0000000000c2', 'ec000000-0000-0000-0000-0000000000c3', 'ec000000-0000-0000-0000-0000000000d3')), 'D1 xoá gốc mà câu trả lời còn';
  ASSERT (SELECT comment_count FROM community_posts WHERE id = 'e0000000-0000-0000-0000-0000000000a1') = before - 4, 'D1 xoá gốc có ba câu trả lời mà bộ đếm không trừ đúng 4';
  ASSERT pg_temp.all_n('e2e2e2e2-0000-0000-0000-000000000032', 'ec000000-0000-0000-0000-0000000000c2') = 0, 'D1 xoá gốc mà reply của câu trả lời còn';
END $$;

\echo 'TẤT CẢ 13 KỊCH BẢN TRẢ LỜI VÀ NHẮC (#30) ĐÚNG'
ROLLBACK;
