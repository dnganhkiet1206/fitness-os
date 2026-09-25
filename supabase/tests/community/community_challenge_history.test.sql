-- Lịch sử thử thách đã hoàn thành (#41). Chạy trên cùng cụm với các bộ khác;
-- người dùng và thử thách riêng (d4d4…/e5e5…, dd00…), và mọi phép đếm lọc về
-- đúng các id ấy — bộ thử thách (#9) cũng ghi vào hai bảng này.
\set ON_ERROR_STOP 1
\set D '''d4d4d4d4-0000-0000-0000-00000000000d'''
\set E '''e5e5e5e5-0000-0000-0000-00000000000e'''
INSERT INTO auth.users VALUES (:D), (:E);

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.anon() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false) $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

-- Dashboard: bốn thử thách.
--   h1  hết hạn 40 ngày trước, thưởng 150 — D ĐÃ nhận (ngoài cửa sổ 7 ngày của tổng quan)
--   h2  hết hạn 20 ngày trước, KHÔNG thưởng — D đã nhận (không có dòng sổ)
--   h3  đang mở — D tham gia, CHƯA nhận
--   h4  đang mở, thưởng 300 — E đã nhận (D không được thấy)
INSERT INTO community_challenges (id, title, target, starts_on, ends_on, reward_coins) VALUES
  ('dd000000-0000-0000-0000-0000000000a1', 'Tháng trước', 3, current_date - 60, current_date - 40, 150),
  ('dd000000-0000-0000-0000-0000000000a2', 'Không thưởng', 1, current_date - 30, current_date - 20, 0),
  ('dd000000-0000-0000-0000-0000000000a3', 'Đang mở', 2, current_date - 5, current_date + 20, 100),
  ('dd000000-0000-0000-0000-0000000000a4', 'Của E', 1, current_date - 5, current_date + 20, 300);
-- Dòng "đã nhận" chỉ hàm nhận thưởng đặt được (không có policy UPDATE), nên
-- ghi thẳng bằng vai chủ — bộ #9 đã đo chính hàm nhận thưởng.
INSERT INTO community_challenge_members (challenge_id, user_id, joined_at, claimed_at) VALUES
  ('dd000000-0000-0000-0000-0000000000a1', :D, now() - interval '58 days', now() - interval '41 days'),
  ('dd000000-0000-0000-0000-0000000000a2', :D, now() - interval '29 days', now() - interval '21 days'),
  ('dd000000-0000-0000-0000-0000000000a3', :D, now() - interval '4 days', NULL),
  ('dd000000-0000-0000-0000-0000000000a4', :E, now() - interval '4 days', now() - interval '1 day');
INSERT INTO mascot_transactions (user_id, amount, reason, ref_key) VALUES
  (:D, 150, 'Thử thách: Tháng trước', 'cc:dd000000-0000-0000-0000-0000000000a1'),
  (:E, 300, 'Thử thách: Của E', 'cc:dd000000-0000-0000-0000-0000000000a4');
-- Dashboard sửa thưởng SAU khi D đã nhận: lịch sử phải giữ số đã vào sổ.
UPDATE community_challenges SET reward_coins = 500 WHERE id = 'dd000000-0000-0000-0000-0000000000a1';

SELECT pg_temp.who(:D); SET ROLE authenticated;
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM community_challenge_history() WHERE id = 'dd000000-0000-0000-0000-0000000000a3'),
    'H1 thử thách tham gia mà CHƯA nhận nằm trong lịch sử';
END $$;
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM community_challenge_history() WHERE id = 'dd000000-0000-0000-0000-0000000000a4'),
    'H2 thấy thử thách người khác đã nhận';
END $$;
DO $$ BEGIN
  ASSERT (SELECT coins FROM community_challenge_history() WHERE id = 'dd000000-0000-0000-0000-0000000000a1') = 150,
    format('H3 số xu phải là số ĐÃ VÀO SỔ (150), không phải thưởng hiện tại (500), ra %s',
      (SELECT coins FROM community_challenge_history() WHERE id = 'dd000000-0000-0000-0000-0000000000a1'));
  ASSERT (SELECT coins FROM community_challenge_history() WHERE id = 'dd000000-0000-0000-0000-0000000000a2') = 0,
    'H4 thử thách không thưởng phải ra 0 xu (và vẫn có mặt)';
END $$;
-- Thứ tự do HÀM đặt, không do người gọi: đọc theo thứ tự trả về.
DO $$ DECLARE first uuid; BEGIN
  SELECT id INTO first FROM community_challenge_history() LIMIT 1;
  ASSERT first = 'dd000000-0000-0000-0000-0000000000a2', 'H5 mới nhận nhất phải đứng đầu';
END $$;
-- Tổng quan KHÔNG bị nới: h1 hết hạn 40 ngày vẫn không có trong đó.
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM community_challenges_overview(0) WHERE id = 'dd000000-0000-0000-0000-0000000000a1'),
    'H6 tổng quan hiện thử thách hết hạn quá 7 ngày';
END $$;
-- Tập đầy đủ ĐỨNG CUỐI: đứng đầu thì nó bắt mọi phép phá trước các kịch bản
-- cụ thể ở trên, và phép thử ngược không còn nói được kịch bản nào đo gì.
DO $$ DECLARE ids uuid[]; BEGIN
  SELECT array_agg(id ORDER BY claimed_at DESC) INTO ids FROM community_challenge_history();
  ASSERT ids = ARRAY['dd000000-0000-0000-0000-0000000000a2', 'dd000000-0000-0000-0000-0000000000a1']::uuid[],
    format('H7 lịch sử của D phải đúng hai thử thách đã nhận, ra %s', ids);
END $$;
RESET ROLE;

-- E chỉ thấy của E.
SELECT pg_temp.who(:E); SET ROLE authenticated;
DO $$ DECLARE ids uuid[]; BEGIN
  SELECT array_agg(id) INTO ids FROM community_challenge_history();
  ASSERT ids = ARRAY['dd000000-0000-0000-0000-0000000000a4']::uuid[], format('H8 lịch sử của E, ra %s', ids);
END $$;
RESET ROLE;

-- Hỏi QUYỀN, không hỏi kết quả: với anon, auth.uid() là NULL nên hàm trả
-- rỗng dù có quyền hay không — một kịch bản "anon nhận rỗng" xanh cả khi
-- GRANT sai (dạng rỗng nghĩa thứ tư, #13/#14).
DO $$ BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.community_challenge_history()', 'EXECUTE'), 'H9 anon gọi được lịch sử';
  ASSERT has_function_privilege('authenticated', 'public.community_challenge_history()', 'EXECUTE'), 'H10 người đã đăng nhập không gọi được';
END $$;
\echo TẤT CẢ 10 KỊCH BẢN LỊCH SỬ THỬ THÁCH ĐÚNG
