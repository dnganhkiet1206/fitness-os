-- Tìm người & gợi ý theo dõi (#19). Người dùng riêng; không phụ thuộc bộ khác.
-- Theo #14/#21: kịch bản quyền hỏi has_function_privilege, và mỗi kịch bản
-- "không được thấy X" có một đối chứng chứng minh X khớp khi không bị chặn.
\set ON_ERROR_STOP 1
\set ME '''e0e0e0e0-0000-0000-0000-000000000101'''
INSERT INTO auth.users SELECT ('e0e0e0e0-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid FROM generate_series(1, 12) g;
INSERT INTO auth.users SELECT ('e1e1e1e1-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid FROM generate_series(1, 25) g;

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
-- Vai anon, ĐÚNG như Supabase: không sub, role anon. `who()` đặt sub ở cấp
-- phiên nên nó SỐNG SÓT qua RESET ROLE — thiếu dòng này, mọi `SET ROLE anon`
-- chạy với danh tính của người dùng cuối cùng (#14, #21).
CREATE OR REPLACE FUNCTION pg_temp.anon() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false) $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

INSERT INTO community_profiles (user_id, handle, display_name, is_official) VALUES
  ('e0e0e0e0-0000-0000-0000-000000000101', 'linhme',   'Chính Tôi', false),
  ('e0e0e0e0-0000-0000-0000-000000000102', 'linh.pham', 'Linh Phạm', false),
  ('e0e0e0e0-0000-0000-0000-000000000103', 'linhda',   'Đa Linh', false),
  ('e0e0e0e0-0000-0000-0000-000000000104', 'mlinh',    'Minh Linh', false),       -- khớp theo TỪ trong tên
  ('e0e0e0e0-0000-0000-0000-000000000105', 'linh_bl',  'Bị tôi chặn', false),
  ('e0e0e0e0-0000-0000-0000-000000000106', 'linhbr',   'Chặn tôi', false),
  ('e0e0e0e0-0000-0000-0000-000000000107', 'x_y',      'Gạch dưới', false),
  ('e0e0e0e0-0000-0000-0000-000000000108', 'xay',      'Không gạch', false),
  ('e0e0e0e0-0000-0000-0000-000000000109', 'ascnd_sr', 'ASCND', true),
  ('e0e0e0e0-0000-0000-0000-000000000110', 'quiet',    'Im Lặng', false),       -- không bài nào
  ('e0e0e0e0-0000-0000-0000-000000000111', 'hiddenonly','Chỉ bài ẩn', false),   -- bài bị ẩn + bài chỉ-người-theo-dõi
  ('e0e0e0e0-0000-0000-0000-000000000112', 'followed', 'Đã theo dõi', false);
-- #37: tên có dấu, handle không gợi ý gì — chỉ tìm KHÔNG DẤU theo tên mới ra.
INSERT INTO auth.users VALUES ('e0e0e0e0-0000-0000-0000-000000000113'), ('e0e0e0e0-0000-0000-0000-000000000114');
INSERT INTO community_profiles (user_id, handle, display_name) VALUES
  ('e0e0e0e0-0000-0000-0000-000000000113', 'dkhoa', 'ĐẶNG Khoa'),
  ('e0e0e0e0-0000-0000-0000-000000000114', 'tm_a', 'Trần Minh Ánh');
INSERT INTO community_profiles (user_id, handle, display_name)
SELECT ('e1e1e1e1-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid, 'zz' || lpad(g::text, 2, '0'), 'Zed ' || g FROM generate_series(1, 25) g;
-- S6 cần một người KHÁC khớp 'linhda' mà sẽ đứng trước nếu luật "đúng handle
-- đứng đầu" mất: một tài khoản CHÍNH THỨC 'linhdaa'. Không có nó, 'linhda' là
-- kết quả DUY NHẤT và S6 xanh với mọi thứ tự — rỗng nghĩa (b_reverse --coverage,
-- #79). Ngoài vùng e0e0… nên hits()/sugg() không thấy nó.
INSERT INTO auth.users VALUES ('e2e2e2e2-0000-0000-0000-000000000001');
INSERT INTO community_profiles (user_id, handle, display_name, is_official) VALUES
  ('e2e2e2e2-0000-0000-0000-000000000001', 'linhdaa', 'Tài khoản thử', true);

INSERT INTO community_blocks (blocker_id, blocked_id) VALUES
  ('e0e0e0e0-0000-0000-0000-000000000101', 'e0e0e0e0-0000-0000-0000-000000000105'),
  ('e0e0e0e0-0000-0000-0000-000000000106', 'e0e0e0e0-0000-0000-0000-000000000101');
INSERT INTO community_follows (follower_id, followee_id) VALUES ('e0e0e0e0-0000-0000-0000-000000000101', 'e0e0e0e0-0000-0000-0000-000000000112');
-- Bài: linh.pham 2 bài công khai gần đây, linhda 1, người bị chặn 3 (không
-- được gợi ý dù đăng nhiều nhất), hiddenonly chỉ có bài ẩn + bài chỉ-theo-dõi,
-- followed 5 (đã theo dõi nên không gợi ý), một bài cũ 30 ngày của mlinh.
INSERT INTO community_posts (author_id, kind, payload, visibility, hidden, created_at) VALUES
  ('e0e0e0e0-0000-0000-0000-000000000102', 'workout', '{}', 'public', false, now() - interval '1 day'),
  ('e0e0e0e0-0000-0000-0000-000000000102', 'workout', '{}', 'public', false, now() - interval '2 days'),
  ('e0e0e0e0-0000-0000-0000-000000000103', 'workout', '{}', 'public', false, now() - interval '3 days'),
  ('e0e0e0e0-0000-0000-0000-000000000105', 'workout', '{}', 'public', false, now()),
  ('e0e0e0e0-0000-0000-0000-000000000105', 'workout', '{}', 'public', false, now()),
  ('e0e0e0e0-0000-0000-0000-000000000105', 'workout', '{}', 'public', false, now()),
  ('e0e0e0e0-0000-0000-0000-000000000111', 'workout', '{}', 'public', true,  now()),
  ('e0e0e0e0-0000-0000-0000-000000000111', 'workout', '{}', 'followers', false, now()),
  ('e0e0e0e0-0000-0000-0000-000000000112', 'workout', '{}', 'public', false, now()),
  ('e0e0e0e0-0000-0000-0000-000000000104', 'workout', '{}', 'public', false, now() - interval '30 days');

-- Chỉ người dùng của BỘ NÀY (id e0e0e0e0…): các bộ chạy trước dùng chung
-- database, và nền móng có một hồ sơ handle `linh` khớp đúng phép tìm. Lọc theo
-- không gian id giữ kịch bản chính xác mà không phụ thuộc dữ liệu bộ khác.
CREATE OR REPLACE FUNCTION pg_temp.hits(q text) RETURNS text LANGUAGE sql AS $$ SELECT coalesce(string_agg(handle, ',' ORDER BY handle), '') FROM community_search_profiles(q) WHERE user_id::text LIKE 'e0e0e0e0%' $$;
CREATE OR REPLACE FUNCTION pg_temp.sugg() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(string_agg(handle, ','), '') FROM community_follow_suggestions() WHERE user_id::text LIKE 'e0e0e0e0%' $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

SELECT pg_temp.who(:ME); SET ROLE authenticated;
-- ── tìm ──
DO $$ BEGIN ASSERT pg_temp.hits('l') = '', 'S1 một ký tự đã trả kết quả'; END $$;
DO $$ BEGIN ASSERT pg_temp.hits('linh') = 'linh.pham,linhda,mlinh', format('S2 "linh" phải ra linh.pham,linhda,mlinh — ra %s', pg_temp.hits('linh')); END $$;
-- S2 gói trong nó bốn điều: không có chính mình (linhme), không có người mình
-- chặn (linh_bl), không có người chặn mình (linhbr), và mlinh khớp theo TỪ.
DO $$ BEGIN ASSERT pg_temp.hits('@LINH') = pg_temp.hits('linh'), 'S3 @ và chữ hoa phải được bỏ qua'; END $$;
DO $$ BEGIN ASSERT pg_temp.hits('x_') = 'x_y', format('S4 "_" phải là chữ, không phải ký tự đại diện — ra %s', pg_temp.hits('x_')); END $$;
DO $$ BEGIN ASSERT pg_temp.hits('x%') = '', 'S5 "%" phải là chữ, không phải ký tự đại diện'; END $$;
DO $$ BEGIN ASSERT (SELECT handle FROM community_search_profiles('linhda') LIMIT 1) = 'linhda', 'S6 gõ đúng handle thì người ấy phải đứng đầu'; END $$;
DO $$ BEGIN ASSERT (SELECT i_follow FROM community_search_profiles('followed')) AND NOT (SELECT i_follow FROM community_search_profiles('linhda') WHERE handle = 'linhda'), 'S7 cờ đang-theo-dõi sai'; END $$;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_search_profiles('zz')) = 20, 'S8 phải có trần 20 dòng'; END $$;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_search_profiles('ascnd_sr')) = 1, 'S9 ĐỐI CHỨNG: tài khoản thường tìm được bằng handle'; END $$;
-- ── không dấu (#37) ──
DO $$ BEGIN ASSERT pg_temp.hits('pham') = 'linh.pham', format('U1 "pham" phải ra linh.pham (tên "Linh Phạm") — ra %s', pg_temp.hits('pham')); END $$;
DO $$ BEGIN ASSERT pg_temp.hits('dang') = 'dkhoa', format('U2 "dang" phải ra "ĐẶNG Khoa" — chữ HOA có dấu, không trông vào lower() — ra %s', pg_temp.hits('dang')); END $$;
DO $$ BEGIN ASSERT pg_temp.hits('Phạm') = pg_temp.hits('pham'), 'U3 gõ có dấu phải ra như không dấu'; END $$;
DO $$ BEGIN ASSERT pg_temp.hits('anh') = 'tm_a' AND pg_temp.hits('tran') = 'tm_a', format('U4 "anh"/"tran" phải ra "Trần Minh Ánh" — ra %s / %s', pg_temp.hits('anh'), pg_temp.hits('tran')); END $$;
RESET ROLE;
DO $$ BEGIN ASSERT community_fold('ĐẶNG Ánh ỨNG') = 'dang anh ung', format('U5 hàm gập sai: %s', community_fold('ĐẶNG Ánh ỨNG')); END $$;
DO $$ BEGIN ASSERT NOT has_function_privilege('anon', 'public.community_fold(text)', 'EXECUTE'), 'U6 anon gọi được hàm gập'; END $$;
-- S2b ĐỐI CHỨNG cho vế chặn: người bị chặn KHỚP chuỗi tìm, và hiện ra khi chặn gỡ đi.
SELECT pg_temp.who('e0e0e0e0-0000-0000-0000-000000000102'); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.hits('linh') LIKE '%linh_bl%' AND pg_temp.hits('linh') LIKE '%linhbr%', 'S2b ĐỐI CHỨNG: người không bị chặn phải thấy linh_bl và linhbr'; END $$;
RESET ROLE;

-- ── gợi ý ──
SELECT pg_temp.who(:ME); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.sugg() = 'ascnd_sr,linh.pham,linhda', format('G1 gợi ý phải là ascnd_sr,linh.pham,linhda — ra %s', pg_temp.sugg()); END $$;
-- G1 gói trong nó: chính thức đứng đầu; nhiều bài hơn đứng trước; không có
-- người đã theo dõi (followed, 1 bài), người bị chặn hai chiều (linh_bl 3 bài),
-- người im lặng (quiet), người chỉ có bài ẩn/chỉ-theo-dõi (hiddenonly), và bài
-- quá 14 ngày không tính (mlinh).
DO $$ BEGIN ASSERT (SELECT recent_posts FROM community_follow_suggestions() WHERE handle = 'linh.pham') = 2, 'G2 đếm bài gần đây sai'; END $$;
RESET ROLE;
SELECT pg_temp.who('e0e0e0e0-0000-0000-0000-000000000102'); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.sugg() LIKE '%linh_bl%' AND pg_temp.sugg() LIKE '%followed%', 'G3 ĐỐI CHỨNG: với người khác, linh_bl và followed phải được gợi ý'; END $$;
RESET ROLE;

-- ── quyền ──
DO $$ BEGIN ASSERT NOT has_function_privilege('anon', 'public.community_search_profiles(text)', 'EXECUTE'), 'S10 anon gọi được tìm người'; END $$;
DO $$ BEGIN ASSERT NOT has_function_privilege('anon', 'public.community_follow_suggestions()', 'EXECUTE'), 'G4 anon gọi được gợi ý'; END $$;
DO $$ BEGIN ASSERT has_function_privilege('authenticated', 'public.community_search_profiles(text)', 'EXECUTE') AND has_function_privilege('authenticated', 'public.community_follow_suggestions()', 'EXECUTE'), 'G5 người đã đăng nhập không gọi được'; END $$;
\echo TẤT CẢ 22 KỊCH BẢN TÌM NGƯỜI ĐÚNG
