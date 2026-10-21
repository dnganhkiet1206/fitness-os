-- Nhắn tin giữa người dùng (#527, `20261020130000_community_direct_messages.sql`).
-- Người dùng riêng; không phụ thuộc bộ khác. Lệnh ghi và phép kiểm là HAI câu lệnh.
\set ON_ERROR_STOP 1
\set A '''d1d1d1d1-0000-0000-0000-0000000000a1'''
\set B '''d1d1d1d1-0000-0000-0000-0000000000b2'''
\set C '''d1d1d1d1-0000-0000-0000-0000000000c3'''
\set D '''d1d1d1d1-0000-0000-0000-0000000000d4'''
\set E '''d1d1d1d1-0000-0000-0000-0000000000e5'''
INSERT INTO auth.users VALUES (:A), (:B), (:C), (:D), (:E);
-- E không có hồ sơ cộng đồng.
INSERT INTO community_profiles (user_id, handle, display_name) VALUES
  (:A, 'dm_a', 'A'), (:B, 'dm_b', 'B'), (:C, 'dm_c', 'C'), (:D, 'dm_d', 'D');

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.anon() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

-- D chặn A; B chỉ nhận tin từ người B theo dõi (B không theo dõi ai).
SELECT pg_temp.who(:D); SET ROLE authenticated; INSERT INTO community_blocks (blocked_id) VALUES ('d1d1d1d1-0000-0000-0000-0000000000a1'); RESET ROLE;
SELECT pg_temp.who(:B); SET ROLE authenticated; INSERT INTO community_settings (dm_from) VALUES ('following'); RESET ROLE;

-- ── mở + gửi ──
SELECT pg_temp.who(:A); SET ROLE authenticated;
DO $$ BEGIN ASSERT dm_open('d1d1d1d1-0000-0000-0000-0000000000c3') = dm_open('d1d1d1d1-0000-0000-0000-0000000000c3'), 'M1 mở lại phải ra cùng hội thoại'; END $$;
SELECT dm_send(dm_open('d1d1d1d1-0000-0000-0000-0000000000c3'), 'Chào C');
DO $$ BEGIN ASSERT (SELECT count(*) FROM dm_messages) = 1, 'M2 tin vừa gửi không đọc lại được'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT dm_open('d1d1d1d1-0000-0000-0000-0000000000d4')$q$) = '42501', 'M3 mở được với người đã chặn mình'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT dm_open('d1d1d1d1-0000-0000-0000-0000000000b2')$q$) = '42501', 'M4 nhắn được cho người chỉ nhận từ người họ theo dõi'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT dm_open('d1d1d1d1-0000-0000-0000-0000000000e5')$q$) = '42501', 'M5 nhắn được cho người không có hồ sơ'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT dm_open('d1d1d1d1-0000-0000-0000-0000000000a1')$q$) = '42501', 'M6 tự nhắn cho mình được'; END $$;
-- Không ghi thẳng vào bảng: mọi lệnh ghi đi qua RPC.
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO dm_messages (thread_id, sender_id, body) SELECT id, 'd1d1d1d1-0000-0000-0000-0000000000c3', 'bịa' FROM dm_threads$q$) <> 'ok', 'M7 chèn thẳng tin đứng tên người khác được'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$UPDATE dm_messages SET body = 'sửa'$q$) <> 'ok', 'M8 sửa được tin'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO dm_threads (user_a, user_b, started_by) VALUES ('d1d1d1d1-0000-0000-0000-0000000000a1', 'd1d1d1d1-0000-0000-0000-0000000000b2', 'd1d1d1d1-0000-0000-0000-0000000000a1')$q$) <> 'ok', 'M9 tạo hội thoại vượt cửa dm_open được'; END $$;
DO $$ BEGIN ASSERT (SELECT bool_and(last_from_me AND NOT is_request) FROM dm_inbox()), 'M10 hộp thư người gửi sai'; END $$;
RESET ROLE;

-- ── người nhận: tin chờ + chưa đọc; người ngoài không thấy gì ──
SELECT pg_temp.who(:C); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT is_request AND unread FROM dm_inbox()), 'M11 tin từ người lạ phải là tin chờ, chưa đọc'; END $$;
RESET ROLE;
SELECT pg_temp.who(:B); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT count(*) FROM dm_threads) = 0 AND (SELECT count(*) FROM dm_messages) = 0, 'M12 người ngoài đọc được hội thoại'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT dm_send((SELECT id FROM dm_threads LIMIT 1), 'x')$q$) <> 'ok', 'M13 người ngoài gửi vào hội thoại được'; END $$;
RESET ROLE;
SELECT pg_temp.anon(); SET ROLE anon;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT count(*) FROM dm_messages$q$) <> 'ok', 'M14 anon đọc được tin nhắn'; END $$;
RESET ROLE;

-- ── trả lời: hết tin chờ, đã đọc ──
SELECT pg_temp.who(:C); SET ROLE authenticated;
SELECT dm_mark_read(thread_id) FROM dm_inbox();
SELECT dm_send((SELECT thread_id FROM dm_inbox() LIMIT 1), 'Chào A');
DO $$ BEGIN ASSERT (SELECT NOT is_request AND NOT unread FROM dm_inbox()), 'M15 trả lời xong vẫn là tin chờ / chưa đọc'; END $$;
RESET ROLE;
SELECT pg_temp.who(:A); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT read_at IS NOT NULL FROM dm_messages WHERE sender_id = auth.uid()), 'M16 người gửi không thấy "đã xem"'; END $$;
DO $$ BEGIN ASSERT (SELECT unread FROM dm_inbox()), 'M17 tin trả lời không hiện chưa đọc'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT dm_send((SELECT thread_id FROM dm_inbox() LIMIT 1), '   ')$q$) = '22023', 'M18 gửi được tin rỗng'; END $$;
DO $$ BEGIN ASSERT char_length((dm_send((SELECT thread_id FROM dm_inbox() LIMIT 1), repeat('x', 1500))).body) = 1000, 'M19 tin dài không cắt về 1000'; END $$;
DO $$ BEGIN ASSERT (dm_send((SELECT thread_id FROM dm_inbox() LIMIT 1), '', '{"title":"Chest day","volume_kg":5200}')).workout->>'title' = 'Chest day', 'M20 không gửi được buổi tập'; END $$;
-- Giới hạn 30 tin / phút (A đã gửi 3 tin ở trên: M2, M19, M20).
DO $$ DECLARE i int; t uuid := (SELECT thread_id FROM dm_inbox() LIMIT 1); BEGIN
  FOR i IN 1..27 LOOP PERFORM dm_send(t, 'tin ' || i); END LOOP;
END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT dm_send((SELECT thread_id FROM dm_inbox() LIMIT 1), 'thêm')$q$) = 'P0001', 'M21 không giới hạn tốc độ gửi'; END $$;
RESET ROLE;

-- ── chặn SAU khi đã nhắn: hội thoại ẩn khỏi cả hai phía ──
SELECT pg_temp.who(:C); SET ROLE authenticated; INSERT INTO community_blocks (blocked_id) VALUES ('d1d1d1d1-0000-0000-0000-0000000000a1'); RESET ROLE;
SELECT pg_temp.who(:A); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT count(*) FROM dm_threads) = 0 AND (SELECT count(*) FROM dm_inbox()) = 0, 'M22 chặn rồi vẫn thấy hội thoại'; END $$;
RESET ROLE;

\echo 'NHẮN TIN ĐÚNG'
