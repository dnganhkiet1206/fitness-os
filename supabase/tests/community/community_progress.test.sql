-- Bài Progress (#8): chạy sau community_foundation.test.sql, trên cùng cụm.
-- Người dùng riêng (P, Q) để không phụ thuộc thứ tự hay dữ liệu của tệp trước.
\set ON_ERROR_STOP 1
\set P '''eeeeeeee-0000-0000-0000-000000000005'''
\set Q '''ffffffff-0000-0000-0000-000000000006'''
INSERT INTO auth.users VALUES (:P), (:Q);

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

-- P: cân 4 lần trong 12 tuần (52.1 → 55.4), vòng eo 2 lần, Bench Press 3 tuần.
INSERT INTO weight_logs (user_id, date, weight_kg) VALUES
  (:P, current_date - 80, 52.1), (:P, current_date - 50, 53.0), (:P, current_date - 20, 54.6), (:P, current_date - 1, 55.4),
  (:P, current_date - 200, 40.0);  -- NGOÀI khoảng 12 tuần: không được tính
INSERT INTO body_measurements (user_id, date, waist_cm) VALUES (:P, current_date - 70, 82.1), (:P, current_date - 3, 80.0);
INSERT INTO exercises (id, user_id, name) VALUES
  ('b3000000-0000-0000-0000-000000000001', NULL, 'Bench Press'),
  ('b3000000-0000-0000-0000-000000000002', :Q, 'Q Secret Press');
INSERT INTO workout_sessions (user_id, date_time, sets) VALUES
  (:P, now() - interval '75 days', '[{"exerciseId":"b3000000-0000-0000-0000-000000000001","weight":60,"reps":5,"warmup":true},{"exerciseId":"b3000000-0000-0000-0000-000000000001","weight":40,"reps":8}]'),
  (:P, now() - interval '40 days', '[{"exerciseId":"b3000000-0000-0000-0000-000000000001","weight":47.5,"reps":6}]'),
  (:P, now() - interval '2 days',  '[{"exerciseId":"b3000000-0000-0000-0000-000000000001","weight":55,"reps":5}]'),
  -- P ghi hai tuần với ID bài tự tạo của Q (sets là jsonb, ghi được ID bất kỳ):
  -- không có hai dòng này thì P9 xanh cả khi tên bài của Q lọt ra, vì không
  -- có điểm nào để dựng (#14).
  (:P, now() - interval '30 days', '[{"exerciseId":"b3000000-0000-0000-0000-000000000002","weight":70,"reps":5}]'),
  (:P, now() - interval '5 days',  '[{"exerciseId":"b3000000-0000-0000-0000-000000000002","weight":75,"reps":5}]');
-- Q: có dữ liệu riêng, và một bài tự tạo mà P không được đọc tên.
INSERT INTO weight_logs (user_id, date, weight_kg) VALUES (:Q, current_date - 30, 90), (:Q, current_date - 2, 88);
INSERT INTO workout_sessions (user_id, date_time, sets) VALUES
  (:Q, now() - interval '30 days', '[{"exerciseId":"b3000000-0000-0000-0000-000000000002","weight":100,"reps":5}]'),
  (:Q, now() - interval '3 days',  '[{"exerciseId":"b3000000-0000-0000-0000-000000000002","weight":110,"reps":5}]');

SELECT pg_temp.who(:P); SET ROLE authenticated;
-- P1 chỉ cân nặng: không có khoá waist/lift nào lọt ra
DO $$ DECLARE p jsonb := build_progress_payload(12, true, false, NULL); BEGIN
  ASSERT p ? 'weight' AND NOT p ? 'waist' AND NOT p ? 'lift', 'P1 chỉ số TẮT vẫn lọt vào payload';
  ASSERT (p->'weight'->>'start')::numeric = 52.1 AND (p->'weight'->>'end')::numeric = 55.4, 'P2 đầu/cuối cân nặng sai (hoặc tính cả điểm ngoài khoảng)';
  ASSERT jsonb_array_length(p->'weight'->'series') BETWEEN 2 AND 12, 'P3 chuỗi tuần sai độ dài';
  ASSERT (p->>'weeks')::int = 12, 'P4 số tuần';
END $$;
-- P5 bật vòng eo + Bench: set khởi động 60 kg KHÔNG được thành đỉnh tuần đầu
DO $$ DECLARE p jsonb := build_progress_payload(12, false, true, 'b3000000-0000-0000-0000-000000000001'); BEGIN
  ASSERT NOT p ? 'weight', 'P5 cân nặng tắt mà vẫn có';
  ASSERT (p->'waist'->>'start')::numeric = 82.1 AND (p->'waist'->>'end')::numeric = 80.0, 'P6 vòng eo';
  ASSERT p->'lift'->>'name' = 'Bench Press', 'P7 tên bài';
  ASSERT (p->'lift'->>'start')::numeric = 40 AND (p->'lift'->>'end')::numeric = 55, 'P8 Bench: set khởi động bị tính hoặc đầu/cuối sai';
END $$;
-- P9 bài tự tạo của Q: P có số với ID ấy, nhưng không được biết TÊN của nó, nên
-- khối lift không có mặt. Bật kèm cân nặng để payload dựng được — bản đầu chỉ
-- xin lift rồi đòi 22023, và 22023 đến từ "không có gì để chia sẻ" dù tên có
-- lọt hay không (#14).
DO $$ DECLARE p jsonb := build_progress_payload(12, true, false, 'b3000000-0000-0000-0000-000000000002'); BEGIN
  ASSERT NOT p ? 'lift' AND p::text NOT LIKE '%Q Secret Press%', 'P9 đọc được bài tự tạo của người khác';
END $$;
-- P10 số tuần NGOÀI 1..52 trong khi dữ liệu có đủ: bản đầu dùng 0 tuần — một
-- khoảng rỗng, nên 22023 đến từ "không có gì để chia sẻ" dù chốt số tuần có
-- hay không (#14). P10b là đối chứng: 52 tuần, cùng dữ liệu, thì dựng được.
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT build_progress_payload(53, true)$q$) = '22023', 'P10 số tuần 53 lọt qua'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT build_progress_payload(52, true)$q$) = 'ok', 'P10b 52 tuần không dựng được — P10 không đo được gì'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT build_progress_payload(12, false, false, NULL)$q$) = '22023', 'P11 không bật chỉ số nào mà vẫn dựng'; END $$;
-- P12 chưa có hồ sơ cộng đồng thì không đăng
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT share_progress(12)$q$) = 'P0001', 'P12 đăng được khi chưa có hồ sơ'; END $$;
INSERT INTO community_profiles (user_id, handle, display_name) VALUES (:P, 'p.user', 'P');
SELECT share_progress(12, true, true, 'b3000000-0000-0000-0000-000000000001', 'Keep going', 'public') AS prog \gset
DO $$ BEGIN
  ASSERT (SELECT kind FROM community_posts WHERE caption = 'Keep going') = 'progress', 'P13 loại bài';
  ASSERT (SELECT payload->'weight'->>'end' FROM community_posts WHERE caption = 'Keep going') = '55.4', 'P14 bài đăng khác bản xem trước';
END $$;
RESET ROLE;

-- Q: chỉ một lần cân trong 1 tuần → không có "thay đổi" nào để bịa
SELECT pg_temp.who(:Q); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT build_progress_payload(1, true)$q$) = '22023', 'P15 một điểm dữ liệu mà vẫn thành "thay đổi"'; END $$;
-- Q không bao giờ thấy số của P
DO $$ DECLARE p jsonb := build_progress_payload(12, true); BEGIN
  ASSERT (p->'weight'->>'start')::numeric = 90, 'P16 payload của Q lẫn dữ liệu của P';
END $$;
-- P19 Q không có buổi Bench nào: xin biểu đồ Bench (bài THƯ VIỆN, ai cũng xin
-- được) thì không có gì để dựng. Trước #14 không kịch bản nào canh chuyện
-- khối sức mạnh đọc buổi tập của NGƯỜI KHÁC — gỡ `s.user_id = v_uid` mà cả
-- bộ vẫn xanh. P có 3 tuần Bench, nên thiếu lọc thì Q nhận số của P.
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT build_progress_payload(12, false, false, 'b3000000-0000-0000-0000-000000000001')$q$) = '22023', 'P19 biểu đồ sức mạnh của Q lẫn buổi tập của P'; END $$;
RESET ROLE;

-- P17/P18 hỏi thẳng QUYỀN. Bản đầu gọi dưới vai anon và đòi "không ok" — nhưng
-- `request.jwt.claim.sub` còn là Q từ trên, và Q chưa có hồ sơ: cấp quyền
-- share_progress cho anon mà P18 vẫn xanh, vì lời gọi hỏng ở P0001 (#14).
DO $$ BEGIN ASSERT NOT has_function_privilege('anon', 'public.build_progress_payload(integer, boolean, boolean, uuid)', 'EXECUTE'), 'P17 anon gọi được build_progress_payload'; END $$;
DO $$ BEGIN ASSERT NOT has_function_privilege('anon', 'public.share_progress(integer, boolean, boolean, uuid, text, text)', 'EXECUTE'), 'P18 anon gọi được share_progress'; END $$;
\echo TẤT CẢ 20 KỊCH BẢN PROGRESS ĐÚNG
