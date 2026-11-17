-- Báo cáo chỉ trên nội dung mình đọc được (20261117170000, Devin #924 SEC):
-- không đọc được đích thì không báo cáo được (42501) — nếu không, biết ID là
-- đọc được trích đoạn 160 ký tự qua `community_my_reports()`. Trích đoạn trong
-- "Báo cáo của tôi" cũng chỉ trả khi người gọi đọc được đích lúc gọi.
-- Người dùng riêng (d5…).
\set ON_ERROR_STOP 1
\set AU '''d5000000-0000-0000-0000-0000000000a1'''
\set FA '''d5000000-0000-0000-0000-0000000000a2'''
\set R '''d5000000-0000-0000-0000-0000000000b1'''
\set FL '''d5000000-0000-0000-0000-0000000000b2'''
\set NF '''d5000000-0000-0000-0000-0000000000b3'''
\set BK '''d5000000-0000-0000-0000-0000000000b4'''
\set KB '''d5000000-0000-0000-0000-0000000000b5'''
\set CM '''d5000000-0000-0000-0000-0000000000b6'''
\set RB '''d5000000-0000-0000-0000-0000000000b7'''
\set RX '''d5000000-0000-0000-0000-0000000000b8'''
INSERT INTO auth.users (id) VALUES (:AU), (:FA), (:R), (:FL), (:NF), (:BK), (:KB), (:CM), (:RB), (:RX);
INSERT INTO community_profiles (user_id, handle, display_name) VALUES
  (:AU, 'rg.au', 'Tác giả'), (:FA, 'rg.fa', 'Người Follower'), (:R, 'rg.r', 'Người Báo'),
  (:FL, 'rg.fl', 'Người Theo Dõi'), (:NF, 'rg.nf', 'Người Lạ'), (:BK, 'rg.bk', 'Người Bị Chặn'),
  (:KB, 'rg.kb', 'Người Chặn'), (:CM, 'rg.cm', 'Người Bình Luận'), (:RB, 'rg.rb', 'Người Báo Bình Luận'),
  (:RX, 'rg.rx', 'Người RPC');
INSERT INTO community_posts (id, author_id, kind, payload, caption, visibility) VALUES
  ('d5a00000-0000-0000-0000-000000000001', :AU, 'workout', '{}', 'bài công khai', 'public'),
  ('d5a00000-0000-0000-0000-000000000002', :FA, 'workout', '{}', 'bài chỉ follower', 'followers'),
  ('d5a00000-0000-0000-0000-000000000004', :AU, 'workout', '{}', 'bài cho RPC', 'public');
INSERT INTO community_posts (id, author_id, kind, payload, caption, visibility, hidden) VALUES
  ('d5a00000-0000-0000-0000-000000000003', :AU, 'workout', '{}', 'bài đã ẩn', 'public', true);
INSERT INTO community_comments (id, post_id, author_id, body) VALUES
  ('d5c00000-0000-0000-0000-000000000001', 'd5a00000-0000-0000-0000-000000000001', :CM, 'bình luận thường'),
  ('d5c00000-0000-0000-0000-000000000002', 'd5a00000-0000-0000-0000-000000000002', :CM, 'bình luận trên bài follower'),
  ('d5c00000-0000-0000-0000-000000000005', 'd5a00000-0000-0000-0000-000000000001', :CM, 'bình luận cho RB');
INSERT INTO community_comments (id, post_id, author_id, body, hidden) VALUES
  ('d5c00000-0000-0000-0000-000000000003', 'd5a00000-0000-0000-0000-000000000001', :CM, 'bình luận đã ẩn', true);
INSERT INTO community_follows (follower_id, followee_id) VALUES (:FL, :FA);
INSERT INTO community_blocks (blocker_id, blocked_id) VALUES (:AU, :BK), (:KB, :AU), (:CM, :RB);

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.anon() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;
CREATE OR REPLACE FUNCTION pg_temp.try_post(u text, post text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.who(u);
  EXECUTE 'SET LOCAL ROLE authenticated';
  RETURN pg_temp.errcode('INSERT INTO community_reports (post_id, reason) VALUES (''' || post || ''', ''spam'')');
END $$;
CREATE OR REPLACE FUNCTION pg_temp.try_comment(u text, c text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.who(u);
  EXECUTE 'SET LOCAL ROLE authenticated';
  RETURN pg_temp.errcode('INSERT INTO community_reports (comment_id, reason) VALUES (''' || c || ''', ''spam'')');
END $$;
CREATE OR REPLACE FUNCTION pg_temp.try_user(u text, target text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.who(u);
  EXECUTE 'SET LOCAL ROLE authenticated';
  RETURN pg_temp.errcode('INSERT INTO community_reports (reported_user_id, reason) VALUES (''' || target || ''', ''spam'')');
END $$;

-- ── hàm kiểm: bài không tồn tại / không có đích ──
-- (Trong khối DO $$, psql không thay biến :X nên dùng UUID chữ — như các bộ
-- report_trust / admin.)
DO $$ BEGIN
  ASSERT NOT public.community_post_readable_by('d5000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000'), 'RG0 bài không tồn tại mà đọc được';
  ASSERT public.community_report_target_readable('d5000000-0000-0000-0000-0000000000b1', NULL, NULL), 'RG0b báo cáo người (không có đích bài/bình luận) bị chặn';
END $$;

-- ── báo cáo bài ──
DO $$ BEGIN
  ASSERT pg_temp.try_post('d5000000-0000-0000-0000-0000000000b1', 'd5a00000-0000-0000-0000-000000000001') = 'ok', 'RG1 báo cáo bài công khai đọc được không chèn được';
  ASSERT pg_temp.try_post('d5000000-0000-0000-0000-0000000000b3', 'd5a00000-0000-0000-0000-000000000002') = '42501', 'RG2 người không theo dõi vẫn báo cáo được bài chỉ-follower';
  ASSERT pg_temp.try_post('d5000000-0000-0000-0000-0000000000b2', 'd5a00000-0000-0000-0000-000000000002') = 'ok', 'RG3 người theo dõi không báo cáo được bài chỉ-follower';
  ASSERT pg_temp.try_post('d5000000-0000-0000-0000-0000000000b4', 'd5a00000-0000-0000-0000-000000000001') = '42501', 'RG4 người bị tác giả chặn vẫn báo cáo được bài của tác giả';
  ASSERT pg_temp.try_post('d5000000-0000-0000-0000-0000000000b5', 'd5a00000-0000-0000-0000-000000000001') = '42501', 'RG5 người đã chặn tác giả vẫn báo cáo được bài của tác giả';
  ASSERT pg_temp.try_post('d5000000-0000-0000-0000-0000000000b1', 'd5a00000-0000-0000-0000-000000000003') = '42501', 'RG6 vẫn báo cáo được bài đã bị ẩn';
  ASSERT pg_temp.try_post('d5000000-0000-0000-0000-0000000000a1', 'd5a00000-0000-0000-0000-000000000003') = 'ok', 'RG7 tác giả không báo cáo được bài đã ẩn của chính mình';
END $$;

-- ── báo cáo bình luận ──
DO $$ BEGIN
  ASSERT pg_temp.try_comment('d5000000-0000-0000-0000-0000000000b1', 'd5c00000-0000-0000-0000-000000000001') = 'ok', 'RG8 báo cáo bình luận trên bài đọc được không chèn được';
  ASSERT pg_temp.try_comment('d5000000-0000-0000-0000-0000000000b3', 'd5c00000-0000-0000-0000-000000000002') = '42501', 'RG9 vẫn báo cáo được bình luận trên bài chỉ-follower mà mình không theo dõi';
  ASSERT pg_temp.try_comment('d5000000-0000-0000-0000-0000000000b1', 'd5c00000-0000-0000-0000-000000000003') = '42501', 'RG10 vẫn báo cáo được bình luận đã bị ẩn';
  ASSERT pg_temp.try_comment('d5000000-0000-0000-0000-0000000000b7', 'd5c00000-0000-0000-0000-000000000005') = '42501', 'RG11 vẫn báo cáo được bình luận của người đã chặn mình';
END $$;

-- ── báo cáo người: không lộ nội dung nên vẫn qua ──
DO $$ BEGIN
  ASSERT pg_temp.try_user('d5000000-0000-0000-0000-0000000000b1', 'd5000000-0000-0000-0000-0000000000a1') = 'ok', 'RG12 báo cáo một người không chèn được';
END $$;

-- ── trích đoạn trong "Báo cáo của tôi": đọc được thì có, mất quyền đọc thì rỗng ──
DO $$ BEGIN
  ASSERT pg_temp.try_post('d5000000-0000-0000-0000-0000000000b8', 'd5a00000-0000-0000-0000-000000000004') = 'ok', 'RG13 báo cáo bài cho RPC không chèn được';
END $$;
SELECT pg_temp.who(:RX); SET ROLE authenticated;
DO $$ DECLARE e text; BEGIN
  SELECT r->>'excerpt' INTO e FROM jsonb_array_elements(public.community_my_reports()) r WHERE r->>'target_id' = 'd5a00000-0000-0000-0000-000000000004';
  ASSERT e = 'bài cho RPC', format('RG13 trích đoạn bài đọc được phải là caption, ra %s', e);
END $$;
RESET ROLE;
-- Tác giả chặn người báo SAU khi báo cáo: hàng vẫn còn (lý do + trạng thái),
-- nhưng trích đoạn phải rỗng.
INSERT INTO community_blocks (blocker_id, blocked_id) VALUES (:AU, :RX);
SELECT pg_temp.who(:RX); SET ROLE authenticated;
DO $$ DECLARE e text; BEGIN
  SELECT r->>'excerpt' INTO e FROM jsonb_array_elements(public.community_my_reports()) r WHERE r->>'target_id' = 'd5a00000-0000-0000-0000-000000000004';
  ASSERT e = '', format('RG14 trích đoạn bài không còn đọc được phải rỗng, ra %s', e);
END $$;
RESET ROLE;

-- ── trích đoạn báo cáo người là display_name (không đổi) ──
SELECT pg_temp.who(:R); SET ROLE authenticated;
DO $$ DECLARE e text; BEGIN
  SELECT r->>'excerpt' INTO e FROM jsonb_array_elements(public.community_my_reports()) r WHERE r->>'target_type' = 'user';
  ASSERT e = 'Tác giả', format('RG15 trích đoạn báo cáo người phải là display_name, ra %s', e);
END $$;
RESET ROLE;
