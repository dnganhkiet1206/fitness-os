-- Huy hiệu thử thách trên hồ sơ (#42). Chạy trên cùng cụm với các bộ khác;
-- người dùng và thử thách riêng (b6b6… chủ huy hiệu X, b7b7… người xem V,
-- b8b8… người chặn/bị chặn Z; thử thách bd00…), và mọi phép đếm lọc về đúng
-- các id ấy — bộ thử thách (#9) và lịch sử (#41) cũng ghi vào hai bảng này.
\set ON_ERROR_STOP 1
\set X '''b6b6b6b6-0000-0000-0000-00000000000b'''
\set V '''b7b7b7b7-0000-0000-0000-00000000000b'''
\set Z '''b8b8b8b8-0000-0000-0000-00000000000b'''
INSERT INTO auth.users VALUES (:X), (:V), (:Z);

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.anon() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false) $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

-- Dashboard: ba thử thách. X đã NHẬN hai (b1, b2), tham gia mà CHƯA nhận một (b3).
INSERT INTO community_challenges (id, title, target, starts_on, ends_on, reward_coins) VALUES
  ('bd000000-0000-0000-0000-0000000000b1', 'Tháng Sáu', 3, current_date - 90, current_date - 60, 100),
  ('bd000000-0000-0000-0000-0000000000b2', 'Tháng Tám', 3, current_date - 40, current_date - 20, 100),
  ('bd000000-0000-0000-0000-0000000000b3', 'Đang dở', 3, current_date - 5, current_date + 20, 100);
-- "Đã nhận" chỉ hàm nhận thưởng đặt được (không có policy UPDATE), nên ghi
-- thẳng bằng vai chủ — bộ #9 đã đo chính hàm nhận thưởng.
INSERT INTO community_challenge_members (challenge_id, user_id, joined_at, claimed_at) VALUES
  ('bd000000-0000-0000-0000-0000000000b1', :X, now() - interval '88 days', now() - interval '61 days'),
  ('bd000000-0000-0000-0000-0000000000b2', :X, now() - interval '38 days', now() - interval '21 days'),
  ('bd000000-0000-0000-0000-0000000000b3', :X, now() - interval '4 days', NULL);

-- Hỏi QUYỀN, không hỏi kết quả: với anon, auth.uid() là NULL nên hàm ném lỗi
-- dù có quyền hay không (dạng rỗng nghĩa thứ tư, #13/#14). ĐỨNG ĐẦU: rút quyền
-- của người đã đăng nhập thì mọi lời gọi bên dưới ném "permission denied", và
-- kịch bản quyền đứng cuối không bao giờ được chạy tới để nói ra điều ấy.
DO $$ BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.community_user_badges(uuid)', 'EXECUTE'), 'B1 anon gọi được huy hiệu';
  ASSERT has_function_privilege('authenticated', 'public.community_user_badges(uuid)', 'EXECUTE'), 'B2 người đã đăng nhập không gọi được';
END $$;

-- ── mặc định TẮT ──
-- X chưa có dòng cài đặt nào: người xem không thấy gì.
SELECT pg_temp.who(:V); SET ROLE authenticated;
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM community_user_badges('b6b6b6b6-0000-0000-0000-00000000000b')),
    'B3 chưa có cài đặt mà huy hiệu đã lộ — mặc định phải là TẮT';
END $$;
RESET ROLE;
-- X tạo dòng cài đặt mà không nhắc tới cột: cột phải ra FALSE.
SELECT pg_temp.who(:X); SET ROLE authenticated;
INSERT INTO community_settings (user_id) VALUES ('b6b6b6b6-0000-0000-0000-00000000000b');
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT show_badges FROM community_settings WHERE user_id = 'b6b6b6b6-0000-0000-0000-00000000000b') = false,
    'B4 dòng cài đặt mới phải có show_badges = false';
END $$;
SELECT pg_temp.who(:V); SET ROLE authenticated;
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM community_user_badges('b6b6b6b6-0000-0000-0000-00000000000b')),
    'B5 X đã có cài đặt, show_badges = false, mà huy hiệu vẫn lộ';
END $$;
RESET ROLE;

-- ── người khác KHÔNG bật hộ được, và không đọc được công tắc ──
-- UPDATE KHÔNG có WHERE: một WHERE đọc cột làm Postgres áp cả policy SELECT,
-- và kịch bản xanh mà không đo policy UPDATE (dạng rỗng nghĩa thứ hai, #11).
SELECT pg_temp.who(:V); SET ROLE authenticated;
UPDATE community_settings SET show_badges = true;
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM community_settings WHERE user_id = 'b6b6b6b6-0000-0000-0000-00000000000b'),
    'B6 người khác đọc được dòng cài đặt của X';
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT show_badges FROM community_settings WHERE user_id = 'b6b6b6b6-0000-0000-0000-00000000000b') = false,
    'B7 người khác bật được huy hiệu của X';
END $$;

-- ── X bật ──
SELECT pg_temp.who(:X); SET ROLE authenticated;
UPDATE community_settings SET show_badges = true WHERE user_id = 'b6b6b6b6-0000-0000-0000-00000000000b';
RESET ROLE;
SELECT pg_temp.who(:V); SET ROLE authenticated;
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM community_user_badges('b6b6b6b6-0000-0000-0000-00000000000b') WHERE challenge_id = 'bd000000-0000-0000-0000-0000000000b3'),
    'B8 thử thách tham gia mà CHƯA nhận thưởng lại thành huy hiệu';
END $$;
RESET ROLE;

-- ── chặn, HAI chiều ──
INSERT INTO community_blocks (blocker_id, blocked_id) VALUES ('b6b6b6b6-0000-0000-0000-00000000000b', 'b8b8b8b8-0000-0000-0000-00000000000b');
SELECT pg_temp.who(:Z); SET ROLE authenticated;
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM community_user_badges('b6b6b6b6-0000-0000-0000-00000000000b')),
    'B9 người bị X chặn vẫn thấy huy hiệu của X';
END $$;
RESET ROLE;
DELETE FROM community_blocks WHERE blocker_id = 'b6b6b6b6-0000-0000-0000-00000000000b';
INSERT INTO community_blocks (blocker_id, blocked_id) VALUES ('b8b8b8b8-0000-0000-0000-00000000000b', 'b6b6b6b6-0000-0000-0000-00000000000b');
SELECT pg_temp.who(:Z); SET ROLE authenticated;
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM community_user_badges('b6b6b6b6-0000-0000-0000-00000000000b')),
    'B10 người đã chặn X vẫn thấy huy hiệu của X';
END $$;
RESET ROLE;
-- Đối chứng cho B9/B10: gỡ chặn thì Z THẤY — không thì hai kịch bản trên có
-- thể xanh vì một chốt khác (dạng rỗng nghĩa thứ ba, #14).
DELETE FROM community_blocks WHERE blocker_id = 'b8b8b8b8-0000-0000-0000-00000000000b';
SELECT pg_temp.who(:Z); SET ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM community_user_badges('b6b6b6b6-0000-0000-0000-00000000000b')) = 2,
    'B11 đối chứng: không còn chặn mà Z không thấy đủ hai huy hiệu của X';
END $$;
RESET ROLE;


-- Tập đầy đủ ĐỨNG CUỐI: đứng đầu thì nó bắt mọi phép phá trước các kịch bản
-- cụ thể ở trên, và phép thử ngược không còn nói được kịch bản nào đo gì.
SELECT pg_temp.who(:V); SET ROLE authenticated;
DO $$ DECLARE ids uuid[]; BEGIN
  SELECT array_agg(challenge_id) INTO ids FROM community_user_badges('b6b6b6b6-0000-0000-0000-00000000000b');
  ASSERT ids = ARRAY['bd000000-0000-0000-0000-0000000000b2', 'bd000000-0000-0000-0000-0000000000b1']::uuid[],
    format('B12 V phải thấy đúng hai huy hiệu của X, mới nhận nhất trước, ra %s', ids);
END $$;
RESET ROLE;
\echo TẤT CẢ 12 KỊCH BẢN HUY HIỆU ĐÚNG
