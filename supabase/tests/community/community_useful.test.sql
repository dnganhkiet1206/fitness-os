-- "Hữu ích tuần này" (20261007230000): điểm = thích + 2×người bình luận +
-- 3×lưu + 4×thử, CHỈ hành động của người khác; khối đọc qua RLS. Người dùng
-- riêng (a8…).
\set ON_ERROR_STOP 1
\set AU '''a8000000-0000-0000-0000-0000000000a1'''
\set U1 '''a8000000-0000-0000-0000-0000000000b1'''
\set U2 '''a8000000-0000-0000-0000-0000000000b2'''
\set V '''a8000000-0000-0000-0000-0000000000c1'''
\set MUTED '''a8000000-0000-0000-0000-0000000000d1'''
\set P1 '''a8a00000-0000-0000-0000-000000000001'''
\set P2 '''a8a00000-0000-0000-0000-000000000002'''
\set OLDP '''a8a00000-0000-0000-0000-000000000003'''
\set HIDP '''a8a00000-0000-0000-0000-000000000004'''
\set MUTP '''a8a00000-0000-0000-0000-000000000005'''
\set VP '''a8a00000-0000-0000-0000-000000000006'''
\set LOWP '''a8a00000-0000-0000-0000-000000000007'''
INSERT INTO auth.users (id) VALUES (:AU), (:U1), (:U2), (:V), (:MUTED);
INSERT INTO community_profiles (user_id, handle, display_name) VALUES
  (:AU, 'us.author', 'Author'), (:U1, 'us.u1', 'U1'), (:U2, 'us.u2', 'U2'), (:V, 'us.viewer', 'Viewer'), (:MUTED, 'us.muted', 'Muted');
INSERT INTO community_posts (id, author_id, kind, payload, caption, created_at) VALUES
  (:P1, :AU, 'workout', '{}', 'bài một', now() - interval '1 day'),
  (:P2, :AU, 'workout', '{}', 'bài hai', now() - interval '2 days'),
  (:OLDP, :AU, 'workout', '{}', 'bài cũ', now() - interval '9 days'),
  (:HIDP, :AU, 'workout', '{}', 'bài người xem đã ẩn', now() - interval '1 day'),
  (:MUTP, :MUTED, 'workout', '{}', 'bài của người bị tắt tiếng', now() - interval '1 day'),
  (:VP, :V, 'workout', '{}', 'bài của chính người xem', now() - interval '1 day'),
  (:LOWP, :AU, 'workout', '{}', 'bài ít điểm', now() - interval '1 day');

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
CREATE OR REPLACE FUNCTION pg_temp.score(p text) RETURNS integer LANGUAGE sql AS $$ SELECT useful_score FROM community_posts WHERE id = p::uuid $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

-- ── tác giả tự làm: không điểm nào ──
SELECT pg_temp.who(:AU); SET ROLE authenticated;
INSERT INTO community_likes (post_id, user_id) VALUES (:P1, :AU);
INSERT INTO community_saves (post_id, user_id) VALUES (:P1, :AU);
INSERT INTO community_post_tries (post_id) VALUES (:P1);
INSERT INTO community_comments (post_id, author_id, body) VALUES (:P1, :AU, 'của tôi'), (:P1, :AU, 'của tôi lần hai');
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.score('a8a00000-0000-0000-0000-000000000001') = 0, 'U1 tác giả tự thích/lưu/thử/bình luận mà bài có điểm hữu ích'; END $$;
DO $$ BEGIN ASSERT (SELECT like_count = 1 AND save_count = 1 AND try_count = 1 FROM community_posts WHERE id = 'a8a00000-0000-0000-0000-000000000001'), 'U2 bộ đếm hiển thị (kể cả lượt thử) phải đếm cả tác giả'; END $$;

-- ── người khác: thích 1, lưu 3, thử 4 ──
SELECT pg_temp.who(:U1); SET ROLE authenticated;
INSERT INTO community_likes (post_id, user_id) VALUES (:P1, :U1);
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.score('a8a00000-0000-0000-0000-000000000001') = 1, 'U3 một lượt thích của người khác phải là 1 điểm'; END $$;
SELECT pg_temp.who(:U1); SET ROLE authenticated;
INSERT INTO community_saves (post_id, user_id) VALUES (:P1, :U1);
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.score('a8a00000-0000-0000-0000-000000000001') = 4, 'U4 một lượt lưu phải là 3 điểm'; END $$;
SELECT pg_temp.who(:U1); SET ROLE authenticated;
INSERT INTO community_post_tries (post_id) VALUES (:P1);
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.score('a8a00000-0000-0000-0000-000000000001') = 8, 'U5 một lượt thử phải là 4 điểm'; END $$;
DO $$ BEGIN ASSERT (SELECT try_count FROM community_posts WHERE id = 'a8a00000-0000-0000-0000-000000000001') = 2, 'U6 try_count không đếm lượt thử'; END $$;

-- ── bình luận: mỗi NGƯỜI hai điểm, một lần ──
SELECT pg_temp.who(:U2); SET ROLE authenticated;
INSERT INTO community_comments (id, post_id, author_id, body) VALUES ('a8c00000-0000-0000-0000-000000000001', :P1, :U2, 'một');
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.score('a8a00000-0000-0000-0000-000000000001') = 10, 'U7 người bình luận đầu tiên phải là 2 điểm'; END $$;
SELECT pg_temp.who(:U2); SET ROLE authenticated;
INSERT INTO community_comments (id, post_id, author_id, body) VALUES ('a8c00000-0000-0000-0000-000000000002', :P1, :U2, 'hai'), ('a8c00000-0000-0000-0000-000000000003', :P1, :U2, 'ba');
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.score('a8a00000-0000-0000-0000-000000000001') = 10, 'U8 cùng một người bình luận thêm mà điểm vẫn tăng (spam bình luận đẩy được bài)'; END $$;
SELECT pg_temp.who(:U2); SET ROLE authenticated;
DELETE FROM community_comments WHERE id IN ('a8c00000-0000-0000-0000-000000000001', 'a8c00000-0000-0000-0000-000000000002');
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.score('a8a00000-0000-0000-0000-000000000001') = 10, 'U9 người ấy còn một câu mà điểm đã bị trừ'; END $$;
SELECT pg_temp.who(:U2); SET ROLE authenticated;
DELETE FROM community_comments WHERE id = 'a8c00000-0000-0000-0000-000000000003';
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.score('a8a00000-0000-0000-0000-000000000001') = 8, 'U10 xoá câu cuối cùng của người ấy mà điểm không trừ'; END $$;

-- ── bỏ thích / bỏ lưu: trừ lại, không âm ──
SELECT pg_temp.who(:U1); SET ROLE authenticated;
DELETE FROM community_likes WHERE post_id = :P1 AND user_id = :U1;
DELETE FROM community_saves WHERE post_id = :P1 AND user_id = :U1;
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.score('a8a00000-0000-0000-0000-000000000001') = 4, 'U11 bỏ thích + bỏ lưu không trừ đúng 4'; END $$;
-- tác giả bỏ thích bài mình: không chạm điểm (đã không cộng thì không trừ)
SELECT pg_temp.who(:AU); SET ROLE authenticated;
DELETE FROM community_likes WHERE post_id = :P1 AND user_id = :AU;
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.score('a8a00000-0000-0000-0000-000000000001') = 4, 'U12 tác giả bỏ thích bài mình mà điểm bị trừ'; END $$;

-- ── client không tự ghi điểm ──
SELECT pg_temp.who(:AU); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$UPDATE community_posts SET useful_score = 999 WHERE id = 'a8a00000-0000-0000-0000-000000000002'$q$) <> 'ok'
  OR (SELECT useful_score FROM community_posts WHERE id = 'a8a00000-0000-0000-0000-000000000002') = 0, 'U13 tác giả tự đặt được điểm hữu ích cho bài mình'; END $$;
DO $$ BEGIN ASSERT NOT has_function_privilege('authenticated', 'public.community_useful_bump()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.community_try_count_bump()', 'EXECUTE'), 'U14 client gọi thẳng được hàm trigger'; END $$;
RESET ROLE;

-- ── tính lại (backfill) cho ra đúng điểm của trigger ──
DO $$ BEGIN ASSERT NOT EXISTS (
  SELECT 1 FROM community_posts p WHERE p.id::text LIKE 'a8a%' AND p.useful_score <>
      (SELECT count(*) FROM community_likes x WHERE x.post_id = p.id AND x.user_id <> p.author_id)
    + 2 * (SELECT count(DISTINCT c.author_id) FROM community_comments c WHERE c.post_id = p.id AND c.author_id <> p.author_id)
    + 3 * (SELECT count(*) FROM community_saves x WHERE x.post_id = p.id AND x.user_id <> p.author_id)
    + 4 * (SELECT count(*) FROM community_post_tries x WHERE x.post_id = p.id AND x.user_id <> p.author_id)
), 'U15 điểm do trigger giữ lệch công thức tính lại'; END $$;

-- ── khối "Hữu ích tuần này" đọc qua RLS ──
-- Dựng điểm cho các bài còn lại bằng hành động thật của U1/U2.
SELECT pg_temp.who(:U1); SET ROLE authenticated;
INSERT INTO community_post_tries (post_id) VALUES (:P2), (:OLDP), (:HIDP), (:MUTP), (:VP);
INSERT INTO community_saves (post_id, user_id) VALUES (:P2, :U1), (:OLDP, :U1), (:HIDP, :U1), (:MUTP, :U1), (:VP, :U1);
INSERT INTO community_likes (post_id, user_id) VALUES (:LOWP, :U1);
RESET ROLE;
SELECT pg_temp.who(:U2); SET ROLE authenticated;
INSERT INTO community_post_tries (post_id) VALUES (:OLDP), (:HIDP), (:MUTP), (:VP);
INSERT INTO community_likes (post_id, user_id) VALUES (:P1, :U2);
RESET ROLE;
-- Người xem ẩn riêng một bài và tắt tiếng một tác giả.
SELECT pg_temp.who(:V); SET ROLE authenticated;
INSERT INTO community_post_hides (post_id) VALUES (:HIDP);
INSERT INTO community_mutes (muted_id) VALUES (:MUTED);
-- Đúng truy vấn của app (useUsefulThisWeek): 7 ngày, không bài mình, điểm ≥ 5,
-- điểm cao trước. `run.sh` dùng MỘT database cho mọi bộ, nên thêm lọc theo id
-- của bộ này — bài của bộ khác (vd. notify_more) cũng đủ điểm và mới.
CREATE TEMP TABLE pick AS
  SELECT id, useful_score FROM community_posts
  WHERE created_at >= now() - interval '7 days' AND author_id <> auth.uid() AND useful_score >= 5
    AND id::text LIKE 'a8a%'
  ORDER BY useful_score DESC, created_at DESC LIMIT 3;
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT count(*) FROM pick WHERE id = 'a8a00000-0000-0000-0000-000000000003') = 0, 'U16 bài cũ hơn 7 ngày lọt vào khối tuần này'; END $$;
DO $$ BEGIN ASSERT (SELECT count(*) FROM pick WHERE id = 'a8a00000-0000-0000-0000-000000000004') = 0, 'U17 bài người xem đã ẩn riêng vẫn được giới thiệu lại'; END $$;
DO $$ BEGIN ASSERT (SELECT count(*) FROM pick WHERE id = 'a8a00000-0000-0000-0000-000000000005') = 0, 'U18 bài của người bị tắt tiếng vẫn được giới thiệu'; END $$;
DO $$ BEGIN ASSERT (SELECT count(*) FROM pick WHERE id = 'a8a00000-0000-0000-0000-000000000006') = 0, 'U19 khối giới thiệu bài của chính người xem'; END $$;
DO $$ BEGIN ASSERT (SELECT count(*) FROM pick WHERE id = 'a8a00000-0000-0000-0000-000000000007') = 0, 'U20 bài một lượt thích (dưới ngưỡng 5) lọt vào khối'; END $$;
DO $$ BEGIN ASSERT (SELECT array_agg(id ORDER BY useful_score DESC) FROM pick) = ARRAY['a8a00000-0000-0000-0000-000000000002'::uuid, 'a8a00000-0000-0000-0000-000000000001'::uuid],
  'U21 khối không xếp đúng: bài hai (thử + lưu = 7) phải trước bài một (thử + thích = 5) — thấy ' || (SELECT array_agg(id || ':' || useful_score ORDER BY useful_score DESC)::text FROM pick); END $$;

-- ── xoá bài: cascade không vấp trigger ──
SELECT pg_temp.who(:AU); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$DELETE FROM community_posts WHERE id = 'a8a00000-0000-0000-0000-000000000002'$q$) = 'ok', 'U22 xoá bài có lượt thử/lưu thì vấp trigger điểm'; END $$;
RESET ROLE;

\echo TẤT CẢ 22 KỊCH BẢN HỮU ÍCH TUẦN NÀY ĐÚNG
