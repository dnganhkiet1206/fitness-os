-- Chống spam phía đăng bài (20261007235000): trần 10 bài / 30 bình luận mỗi
-- giờ, và tạm khoá đăng do đội kiểm duyệt đặt. Người dùng riêng (aa…).
\set ON_ERROR_STOP 1
\set SP '''aa000000-0000-0000-0000-0000000000a1'''
\set CM '''aa000000-0000-0000-0000-0000000000a2'''
\set BAD '''aa000000-0000-0000-0000-0000000000b1'''
\set MOD '''aa000000-0000-0000-0000-0000000000c1'''
\set MOD2 '''aa000000-0000-0000-0000-0000000000c2'''
\set USR '''aa000000-0000-0000-0000-0000000000d1'''
\set P '''aaa00000-0000-0000-0000-000000000001'''
INSERT INTO auth.users (id) VALUES (:SP), (:CM), (:BAD), (:MOD), (:MOD2), (:USR);
INSERT INTO community_profiles (user_id, handle, display_name) VALUES
  (:SP, 'pl.spam', 'Spam'), (:CM, 'pl.comments', 'Comments'), (:BAD, 'pl.bad', 'Bad'),
  (:MOD, 'pl.mod', 'Mod'), (:MOD2, 'pl.mod2', 'Mod 2'), (:USR, 'pl.user', 'User');
INSERT INTO app_roles (user_id, role) VALUES (:MOD, 'moderator'), (:MOD2, 'moderator');
INSERT INTO community_posts (id, author_id, kind, payload, caption, created_at) VALUES (:P, :USR, 'workout', '{}', 'bài để bình luận', now() - interval '3 hours');

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
CREATE OR REPLACE FUNCTION pg_temp.post(u text, n integer) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.errcode(format($q$INSERT INTO community_posts (author_id, kind, payload, caption) VALUES (%L, 'workout', '{}', 'bài %s')$q$, u, n)) $$;
CREATE OR REPLACE FUNCTION pg_temp.comment(u text, n integer) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.errcode(format($q$INSERT INTO community_comments (post_id, author_id, body) VALUES ('aaa00000-0000-0000-0000-000000000001', %L, 'câu %s')$q$, u, n)) $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

-- ── trần bài: 10 mỗi giờ ──
-- Bài thật sinh ra qua hàm share_* chạy với quyền chủ hàm; trigger không phân
-- biệt đường nào — đếm theo author_id.
DO $$ BEGIN FOR i IN 1..10 LOOP
  ASSERT pg_temp.post('aa000000-0000-0000-0000-0000000000a1', i) = 'ok', 'PL1 bài thứ ' || i || ' trong giờ bị chặn (trần là 10)';
END LOOP; END $$;
DO $$ BEGIN ASSERT pg_temp.post('aa000000-0000-0000-0000-0000000000a1', 11) = '54000', 'PL2 bài thứ 11 trong một giờ vẫn đăng được'; END $$;
-- Bài cũ hơn 60 phút không tính: dời mười bài ra khỏi cửa sổ thì đăng lại được.
UPDATE community_posts SET created_at = now() - interval '61 minutes' WHERE author_id = 'aa000000-0000-0000-0000-0000000000a1';
DO $$ BEGIN ASSERT pg_temp.post('aa000000-0000-0000-0000-0000000000a1', 12) = 'ok', 'PL3 bài cũ hơn một giờ vẫn bị đếm vào trần'; END $$;

-- ── trần bình luận: 30 mỗi giờ, qua đúng đường của app (INSERT dưới RLS) ──
SELECT pg_temp.who(:CM); SET ROLE authenticated;
DO $$ BEGIN FOR i IN 1..30 LOOP
  ASSERT pg_temp.comment('aa000000-0000-0000-0000-0000000000a2', i) = 'ok', 'PL4 bình luận thứ ' || i || ' trong giờ bị chặn (trần là 30)';
END LOOP; END $$;
DO $$ BEGIN ASSERT pg_temp.comment('aa000000-0000-0000-0000-0000000000a2', 31) = '54000', 'PL5 bình luận thứ 31 trong một giờ vẫn gửi được'; END $$;
RESET ROLE;

-- ── đội kiểm duyệt không bị trần ──
DO $$ BEGIN FOR i IN 1..11 LOOP
  ASSERT pg_temp.post('aa000000-0000-0000-0000-0000000000c1', i) = 'ok', 'PL6 người kiểm duyệt bị trần bài ở bài thứ ' || i;
END LOOP; END $$;

-- ── tạm khoá ──
SELECT pg_temp.who(:USR); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT public.mod_restrict('aa000000-0000-0000-0000-0000000000b1', 24, 'spam')$q$) = '42501', 'PL7 người thường khoá được người khác'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_restrictions (user_id, until, created_by) VALUES ('aa000000-0000-0000-0000-0000000000b1', now() + interval '1 day', 'aa000000-0000-0000-0000-0000000000d1')$q$) <> 'ok', 'PL8 client ghi thẳng được bảng khoá'; END $$;
RESET ROLE;
SELECT pg_temp.who(:MOD); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT public.mod_restrict('aa000000-0000-0000-0000-0000000000b1', 24, '   ')$q$) = '22023', 'PL9 khoá mà không có lý do'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT public.mod_restrict('aa000000-0000-0000-0000-0000000000b1', 721, 'spam')$q$) = '22023', 'PL10 khoá quá 30 ngày'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT public.mod_restrict('aa000000-0000-0000-0000-0000000000c2', 24, 'thử')$q$) = '22023', 'PL11 khoá được một người trong đội kiểm duyệt'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT public.mod_restrict('aa000000-0000-0000-0000-0000000000c1', 24, 'thử')$q$) = '22023', 'PL12 tự khoá được chính mình'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT public.mod_restrict('aa000000-0000-0000-0000-0000000000b1', 24, 'rải link quảng cáo')$q$) = 'ok', 'PL13 người kiểm duyệt không khoá được'; END $$;
DO $$ BEGIN ASSERT (public.mod_user_restriction('aa000000-0000-0000-0000-0000000000b1')->>'reason') = 'rải link quảng cáo', 'PL14 màn kiểm duyệt không đọc được lý do khoá'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT until BETWEEN now() + interval '23 hours 59 minutes' AND now() + interval '24 hours 1 minute'
  FROM community_restrictions WHERE user_id = 'aa000000-0000-0000-0000-0000000000b1'), 'PL15 hạn khoá không phải 24 giờ'; END $$;
DO $$ BEGIN ASSERT EXISTS (SELECT 1 FROM moderation_audit_log WHERE action = 'RESTRICT_USER' AND target_id = 'aa000000-0000-0000-0000-0000000000b1'
  AND actor_id = 'aa000000-0000-0000-0000-0000000000c1' AND reason = 'rải link quảng cáo' AND (metadata->>'hours')::int = 24), 'PL16 khoá không ghi nhật ký kiểm duyệt'; END $$;

-- Người bị khoá: không đăng bài, không bình luận — nhưng vẫn thích được.
SELECT pg_temp.who(:BAD); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.comment('aa000000-0000-0000-0000-0000000000b1', 1) = 'CR001', 'PL17 người bị khoá vẫn bình luận được'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_likes (post_id, user_id) VALUES ('aaa00000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-0000000000b1')$q$) = 'ok', 'PL18 khoá đăng mà chặn cả lượt thích'; END $$;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_restrictions) = 1, 'PL19 người bị khoá không đọc được dòng khoá của mình (app không nói được đến bao giờ)'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.post('aa000000-0000-0000-0000-0000000000b1', 1) = 'CR001', 'PL20 người bị khoá vẫn đăng bài được'; END $$;
SELECT pg_temp.who(:USR); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_restrictions) = 0, 'PL21 người khác đọc được ai đang bị khoá'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT public.mod_user_restriction('aa000000-0000-0000-0000-0000000000b1')$q$) = '42501', 'PL22 người thường hỏi được trạng thái khoá của người khác'; END $$;
RESET ROLE;

-- Hết hạn thì tự hết: không cần ai gỡ.
UPDATE community_restrictions SET until = now() - interval '1 minute' WHERE user_id = 'aa000000-0000-0000-0000-0000000000b1';
DO $$ BEGIN ASSERT pg_temp.post('aa000000-0000-0000-0000-0000000000b1', 2) = 'ok', 'PL23 khoá đã hết hạn mà vẫn chặn đăng'; END $$;

-- Gỡ khoá trước hạn: ghi nhật ký; gỡ người không bị khoá thì báo.
SELECT pg_temp.who(:MOD); SET ROLE authenticated;
SELECT public.mod_restrict('aa000000-0000-0000-0000-0000000000b1', 2, 'lần hai');
SELECT public.mod_unrestrict('aa000000-0000-0000-0000-0000000000b1', 'nhầm');
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT public.mod_unrestrict('aa000000-0000-0000-0000-0000000000b1', 'lần nữa')$q$) = '22023', 'PL24 gỡ khoá một người không bị khoá mà không báo'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT EXISTS (SELECT 1 FROM moderation_audit_log WHERE action = 'UNRESTRICT_USER' AND target_id = 'aa000000-0000-0000-0000-0000000000b1' AND reason = 'nhầm'), 'PL25 gỡ khoá không ghi nhật ký'; END $$;
DO $$ BEGIN ASSERT pg_temp.post('aa000000-0000-0000-0000-0000000000b1', 3) = 'ok', 'PL26 gỡ khoá rồi mà vẫn không đăng được'; END $$;

-- Hàm trigger không cấp cho client.
DO $$ BEGIN ASSERT NOT has_function_privilege('authenticated', 'public.community_posting_guard()', 'EXECUTE'), 'PL27 client gọi thẳng được hàm cửa đăng bài'; END $$;
DO $$ BEGIN ASSERT NOT has_function_privilege('anon', 'public.mod_restrict(uuid, integer, text)', 'EXECUTE'), 'PL28 anon gọi được mod_restrict'; END $$;

\echo TẤT CẢ 28 KỊCH BẢN CHỐNG SPAM ĐĂNG BÀI ĐÚNG
