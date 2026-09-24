-- Thử thách cộng đồng (#9). Chạy sau hai bộ trước, trên cùng cụm; người dùng riêng.
\set ON_ERROR_STOP 1
\set X '''a1a1a1a1-0000-0000-0000-000000000007'''
\set Y '''b2b2b2b2-0000-0000-0000-000000000008'''
INSERT INTO auth.users VALUES (:X), (:Y);

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

-- Dashboard tạo hai thử thách: một đang mở (đích 3 ngày, thưởng 200), một đã đóng.
INSERT INTO community_challenges (id, title, target, starts_on, ends_on, reward_coins) VALUES
  ('cc000000-0000-0000-0000-00000000000a', '3 ngày', 3, current_date - 10, current_date + 20, 200),
  ('cc000000-0000-0000-0000-00000000000b', 'Đã đóng', 1, current_date - 40, current_date - 30, 50);
-- X: 2 buổi CÙNG một ngày (phải tính 1 ngày), 1 buổi ngày khác → 2 ngày.
INSERT INTO workout_sessions (user_id, date_time, sets) VALUES
  (:X, date_trunc('day', now()) - interval '5 days' + interval '10 hours', '[]'),
  (:X, date_trunc('day', now()) - interval '5 days' + interval '11 hours', '[]'),
  (:X, date_trunc('day', now()) - interval '3 days' + interval '10 hours', '[]'),
  -- NGOÀI khoảng thử thách: không được tính
  (:X, now() - interval '30 days', '[]');
-- Y: 5 ngày tập — số của Y không bao giờ được lẫn vào X.
INSERT INTO workout_sessions (user_id, date_time, sets)
SELECT :Y, date_trunc('day', now()) - (g || ' days')::interval + interval '12 hours', '[]' FROM generate_series(1, 5) g;

SELECT pg_temp.who(:X); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_challenges (title, target, starts_on, ends_on) VALUES ('fake', 1, current_date, current_date)$q$) <> 'ok', 'C1 client tạo được thử thách'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_challenge_members (challenge_id) VALUES ('cc000000-0000-0000-0000-00000000000b')$q$) <> 'ok', 'C2 tham gia được thử thách đã đóng'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_challenge_members (challenge_id, claimed_at) VALUES ('cc000000-0000-0000-0000-00000000000a', now())$q$) <> 'ok', 'C3 tham gia kèm "đã nhận" tự khai'; END $$;
INSERT INTO community_challenge_members (challenge_id) VALUES ('cc000000-0000-0000-0000-00000000000a');
-- Lệnh ghi và phép kiểm là HAI câu lệnh: trong một câu, Postgres không hứa
-- thứ tự tính hai vế của AND, và phép đếm có thể chạy TRƯỚC lệnh ghi — kịch
-- bản sẽ xanh mà không đo gì (bắt được bằng phép thử ngược, 24/09).
SELECT pg_temp.errcode($q$UPDATE community_challenge_members SET claimed_at = now()$q$);
DO $$ BEGIN ASSERT (SELECT claimed_at FROM community_challenge_members) IS NULL, 'C4 tự đánh dấu đã nhận được'; END $$;
DO $$ DECLARE r record; BEGIN
  SELECT * INTO r FROM community_challenges_overview(0) WHERE id = 'cc000000-0000-0000-0000-00000000000a';
  ASSERT r.joined, 'C5 chưa thấy mình đã tham gia';
  ASSERT r.progress = 2, format('C6 tiến độ phải là 2 ngày (hai buổi cùng ngày = 1, buổi ngoài khoảng bị loại), ra %s', r.progress);
  ASSERT r.participants = 1, 'C7 số người tham gia';
END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT claim_community_challenge('cc000000-0000-0000-0000-00000000000a', 0)$q$) = '22023', 'C8 nhận thưởng khi chưa đạt'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT community_challenge_progress('cc000000-0000-0000-0000-00000000000a', 'b2b2b2b2-0000-0000-0000-000000000008', 0)$q$) <> 'ok', 'C9 client gọi thẳng được hàm đo tiến độ (đo được người khác)'; END $$;
-- (Khoá `cc:` qua `claim_quest_reward` không kiểm ở đây: stub không có hàm ấy,
--  nên một kịch bản sẽ xanh vì hàm không tồn tại chứ không vì luật. Trong code
--  thật `reward_amount_for` trả NULL cho tiền tố lạ và hàm ném 'unknown reward'.)
RESET ROLE;

-- Y tham gia: số người tham gia là 2, nhưng X không đọc được dòng của Y.
SELECT pg_temp.who(:Y); SET ROLE authenticated;
INSERT INTO community_challenge_members (challenge_id) VALUES ('cc000000-0000-0000-0000-00000000000a');
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_challenge_members) = 1, 'C10 đọc được danh sách thành viên của người khác'; END $$;
DO $$ BEGIN ASSERT (SELECT progress FROM community_challenges_overview(0) WHERE id = 'cc000000-0000-0000-0000-00000000000a') = 5, 'C11 tiến độ của Y'; END $$;
DO $$ BEGIN ASSERT claim_community_challenge('cc000000-0000-0000-0000-00000000000a', 0) = 200, 'C12 nhận thưởng khi đã đạt'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT claim_community_challenge('cc000000-0000-0000-0000-00000000000a', 0)$q$) = '23505', 'C13 nhận thưởng HAI lần'; END $$;
SELECT pg_temp.errcode($q$DELETE FROM community_challenge_members$q$);
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_challenge_members) = 1, 'C14 rời được sau khi nhận (để vào lại nhận lần nữa)'; END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM mascot_transactions WHERE ref_key = 'cc:cc000000-0000-0000-0000-00000000000a') = 1, 'C15 sổ xu phải có đúng một dòng';
  ASSERT (SELECT sum(amount) FROM mascot_transactions WHERE user_id = 'b2b2b2b2-0000-0000-0000-000000000008') = 200, 'C16 số xu';
END $$;

-- Múi giờ: một buổi 23:30 UTC là 06:30 hôm sau ở UTC+7. Đếm theo UTC thì hai
-- buổi "23:30 UTC hôm qua" và "10:00 UTC hôm nay" là HAI ngày; theo UTC+7 là MỘT.
INSERT INTO community_challenges (id, title, target, starts_on, ends_on) VALUES ('cc000000-0000-0000-0000-00000000000c', 'tz', 1, current_date - 5, current_date + 5);
INSERT INTO auth.users VALUES ('c3c3c3c3-0000-0000-0000-000000000009');
INSERT INTO workout_sessions (user_id, date_time, sets) VALUES
  ('c3c3c3c3-0000-0000-0000-000000000009', date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '2 days' + interval '23 hours 30 minutes', '[]'),
  ('c3c3c3c3-0000-0000-0000-000000000009', date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '1 day' + interval '10 hours', '[]');
DO $$ BEGIN
  ASSERT community_challenge_progress('cc000000-0000-0000-0000-00000000000c', 'c3c3c3c3-0000-0000-0000-000000000009', 0) = 2, 'C17 theo UTC phải là 2 ngày';
  ASSERT community_challenge_progress('cc000000-0000-0000-0000-00000000000c', 'c3c3c3c3-0000-0000-0000-000000000009', 420) = 1, 'C18 theo UTC+7 phải là 1 ngày';
END $$;

-- Hỏi QUYỀN, không hỏi mã lỗi: với anon `auth.uid()` là null nên cả hai hàm
-- tự ném 42501 — bản đầu so mã lỗi và vẫn xanh khi cấp quyền cho anon (phép
-- thử ngược #13; B bắt được đúng dạng này ở R1 của Recipe).
DO $$ BEGIN ASSERT NOT has_function_privilege('anon', 'public.community_challenges_overview(integer)', 'EXECUTE'), 'C19 anon đọc được tổng quan'; END $$;
DO $$ BEGIN ASSERT NOT has_function_privilege('anon', 'public.claim_community_challenge(uuid, integer)', 'EXECUTE'), 'C20 anon nhận được thưởng'; END $$;
\echo TẤT CẢ 20 KỊCH BẢN THỬ THÁCH ĐÚNG
