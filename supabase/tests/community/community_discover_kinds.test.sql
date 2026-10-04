-- Loại bài muốn thấy ở Khám phá (20261007233000). Người dùng riêng (a9…).
\set ON_ERROR_STOP 1
\set ME '''a9000000-0000-0000-0000-0000000000a1'''
\set OTHER '''a9000000-0000-0000-0000-0000000000b1'''
INSERT INTO auth.users (id) VALUES (:ME), (:OTHER);

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

SELECT pg_temp.who(:ME); SET ROLE authenticated;
-- DK1 dòng cài đặt mới (chỉ đặt chế độ hiển thị) thấy đủ ba loại.
INSERT INTO community_settings (user_id, default_visibility) VALUES (:ME, 'public');
DO $$ BEGIN ASSERT (SELECT discover_kinds FROM community_settings) = ARRAY['workout', 'progress', 'recipe'], 'DK1 mặc định không phải cả ba loại bài'; END $$;
-- DK2 chọn bớt được.
UPDATE community_settings SET discover_kinds = ARRAY['workout'] WHERE user_id = auth.uid();
DO $$ BEGIN ASSERT (SELECT discover_kinds FROM community_settings) = ARRAY['workout'], 'DK2 không lưu được lựa chọn chỉ Buổi tập'; END $$;
-- DK3 rỗng bị từ chối — một Khám phá không có loại nào là màn trống không giải thích được.
DO $$ BEGIN ASSERT pg_temp.errcode($q$UPDATE community_settings SET discover_kinds = ARRAY[]::text[] WHERE user_id = auth.uid()$q$) = '23514', 'DK3 bỏ chọn hết mà server vẫn nhận'; END $$;
-- DK4 loại lạ bị từ chối.
DO $$ BEGIN ASSERT pg_temp.errcode($q$UPDATE community_settings SET discover_kinds = ARRAY['workout', 'ads'] WHERE user_id = auth.uid()$q$) = '23514', 'DK4 loại bài không có thật lọt vào cài đặt'; END $$;
-- DK5 upsert như app gửi (onConflict user_id) đi qua được.
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_settings (user_id, discover_kinds) VALUES ('a9000000-0000-0000-0000-0000000000a1', ARRAY['progress', 'recipe']) ON CONFLICT (user_id) DO UPDATE SET discover_kinds = EXCLUDED.discover_kinds$q$) = 'ok', 'DK5 upsert của app bị từ chối'; END $$;
DO $$ BEGIN ASSERT (SELECT discover_kinds FROM community_settings) = ARRAY['progress', 'recipe'], 'DK5 upsert không đổi lựa chọn'; END $$;
RESET ROLE;

-- DK6 người khác không đọc được lựa chọn của mình (RLS của bảng).
SELECT pg_temp.who(:OTHER); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_settings WHERE user_id = 'a9000000-0000-0000-0000-0000000000a1') = 0, 'DK6 người khác đọc được loại bài mình chọn'; END $$;
RESET ROLE;

\echo TẤT CẢ 6 KỊCH BẢN LOẠI BÀI Ở KHÁM PHÁ ĐÚNG
