-- Thử thách có bản tiếng Anh (#172). Người dùng và thử thách riêng (ee17…);
-- cả tệp trong một giao dịch ROLLBACK (#163). Lệnh ghi và phép kiểm là HAI câu
-- lệnh; câu ghi "không được" đi qua errcode() (#14).
\set ON_ERROR_STOP 1
BEGIN;
\set U '''ee172000-0000-0000-0000-000000000172'''
INSERT INTO auth.users VALUES (:U);

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.anon() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

-- e1: có bản tiếng Anh, U đã nhận (vào lịch sử). e2: CHƯA dịch.
INSERT INTO community_challenges (id, title, description, target, starts_on, ends_on, reward_coins, title_en, description_en) VALUES
  ('ee172000-0000-0000-0000-0000000000e1', 'Bảy ngày', 'Tập bảy ngày.', 1, current_date - 3, current_date + 20, 0, 'Seven days', 'Train seven days.');
INSERT INTO community_challenges (id, title, description, target, starts_on, ends_on, reward_coins) VALUES
  ('ee172000-0000-0000-0000-0000000000e2', 'Chưa dịch', 'Chỉ có tiếng Việt.', 1, current_date - 3, current_date + 20, 0);
INSERT INTO community_challenge_members (challenge_id, user_id, joined_at, claimed_at) VALUES
  ('ee172000-0000-0000-0000-0000000000e1', :U, now() - interval '2 days', now() - interval '1 day');

SELECT pg_temp.who(:U); SET ROLE authenticated;
CREATE TEMP TABLE en_o AS SELECT * FROM community_challenges_overview(0);
CREATE TEMP TABLE en_h AS SELECT * FROM community_challenge_history();
RESET ROLE;

-- ── EN1: tổng quan trả bản tiếng Anh của thử thách đã dịch ──
DO $$ BEGIN
  ASSERT (SELECT title_en FROM en_o WHERE id = 'ee172000-0000-0000-0000-0000000000e1') = 'Seven days', 'EN1 tổng quan không trả title_en';
  ASSERT (SELECT description_en FROM en_o WHERE id = 'ee172000-0000-0000-0000-0000000000e1') = 'Train seven days.', 'EN1 tổng quan không trả description_en';
  -- cột gốc giữ nguyên: app dùng nó khi chưa dịch
  ASSERT (SELECT title FROM en_o WHERE id = 'ee172000-0000-0000-0000-0000000000e1') = 'Bảy ngày', 'EN1 tổng quan làm mất tiêu đề gốc';
END $$;

-- ── EN2: thử thách CHƯA dịch trả NULL, không phải chuỗi rỗng hay bản gốc ──
DO $$ BEGIN
  ASSERT (SELECT title_en IS NULL AND description_en IS NULL FROM en_o WHERE id = 'ee172000-0000-0000-0000-0000000000e2'), 'EN2 thử thách chưa dịch phải trả NULL';
END $$;

-- ── EN3: lịch sử cũng trả bản tiếng Anh ──
DO $$ BEGIN
  ASSERT (SELECT title_en FROM en_h WHERE id = 'ee172000-0000-0000-0000-0000000000e1') = 'Seven days', 'EN3 lịch sử không trả title_en';
  ASSERT (SELECT description_en FROM en_h WHERE id = 'ee172000-0000-0000-0000-0000000000e1') = 'Train seven days.', 'EN3 lịch sử không trả description_en';
END $$;

-- ── EN4: tiêu đề tiếng Anh toàn khoảng trắng bị từ chối (cùng luật với tiêu đề gốc) ──
DO $$ BEGIN
  ASSERT pg_temp.errcode($q$UPDATE community_challenges SET title_en = '   ' WHERE id = 'ee172000-0000-0000-0000-0000000000e2'$q$) = '23514', 'EN4 title_en toàn khoảng trắng lọt qua CHECK';
END $$;

-- ── EN5: hai hàm tạo lại vẫn đóng với anon ──
-- Hỏi QUYỀN, không gọi thử: thân tổng quan tự ném 42501 khi không có
-- người đăng nhập, nên một lời gọi thử của anon đỏ cả khi REVOKE bị quên.
DO $$ BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.community_challenges_overview(integer)', 'EXECUTE'), 'EN5 anon có quyền gọi tổng quan sau khi hàm được tạo lại';
  ASSERT NOT has_function_privilege('anon', 'public.community_challenge_history()', 'EXECUTE'), 'EN5 anon có quyền gọi lịch sử sau khi hàm được tạo lại';
  ASSERT has_function_privilege('authenticated', 'public.community_challenges_overview(integer)', 'EXECUTE'), 'EN5 người đăng nhập mất quyền gọi tổng quan';
END $$;

\echo 'TẤT CẢ 5 KỊCH BẢN THỬ THÁCH TIẾNG ANH (#172) ĐÚNG'
ROLLBACK;
