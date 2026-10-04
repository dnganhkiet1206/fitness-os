-- Golden path Cộng đồng, đầu tới cuối, trên Postgres thật (A, 03/10).
--
--   A tập xong → chia sẻ → B thấy ở Khám phá → lưu → thử → tập xong → chia sẻ
--   tiến trình (CHỈ cân nặng) → A thích, bình luận → B trả lời và nhắc @A →
--   ba người báo cáo bài của A → tự ẩn → A kháng nghị kèm lời nhắn → người
--   kiểm duyệt chấp nhận → bài hiện lại → admin gỡ bài của B → B không kháng
--   nghị được → admin hoàn tác → nhật ký đủ dấu vết → A xoá bài → không còn
--   lượt lưu, lượt thử hay thông báo nào trỏ vào nó.
--
-- Mỗi bước kiểm ở PHÍA NGƯỜI NHẬN (B thấy gì, A được báo gì), không ở phía
-- người làm. Người dùng riêng (9a…); không dựa vào dữ liệu của tệp khác.
\set ON_ERROR_STOP 1
\set A '''9a000000-0000-0000-0000-0000000000a1'''
\set B '''9a000000-0000-0000-0000-0000000000b2'''
\set MOD '''9a000000-0000-0000-0000-0000000000c3'''
\set ADM '''9a000000-0000-0000-0000-0000000000c4'''
\set R1 '''9a000000-0000-0000-0000-0000000000d1'''
\set R2 '''9a000000-0000-0000-0000-0000000000d2'''
\set R3 '''9a000000-0000-0000-0000-0000000000d3'''
INSERT INTO auth.users (id) VALUES (:A), (:B), (:MOD), (:ADM), (:R1), (:R2), (:R3);
-- Người dùng của bộ này là tài khoản hoạt động: một buổi tập gần đây là
-- "đóng góp" theo luật báo cáo đáng tin (20261007220000), nên báo cáo của
-- họ được tính vào ngưỡng tự ẩn như trước.
INSERT INTO workout_sessions (user_id) VALUES (:A), (:B), (:MOD), (:ADM), (:R1), (:R2), (:R3);
INSERT INTO community_profiles (user_id, handle, display_name) VALUES
  (:A, 'gp.anh', 'Anh'), (:B, 'gp.binh', 'Bình'), (:MOD, 'gp.mod', 'Mod'), (:ADM, 'gp.adm', 'Adm'),
  (:R1, 'gp.r1', 'R1'), (:R2, 'gp.r2', 'R2'), (:R3, 'gp.r3', 'R3');
-- Vai trò do SERVER đặt (đường của bootstrap_first_admin / admin_set_role,
-- đã có bộ riêng): ở đây chỉ cần có người kiểm duyệt và admin.
INSERT INTO app_roles (user_id, role) VALUES (:MOD, 'moderator'), (:ADM, 'admin');
INSERT INTO exercises (id, user_id, name) VALUES ('9a0e0000-0000-0000-0000-000000000001', NULL, 'GP Back Squat');
INSERT INTO workout_sessions (id, user_id, template_name, volume_load, pr_detected, sets) VALUES
 ('9a5e0000-0000-0000-0000-0000000000a1', :A, 'Leg Day', 4300, true, '[
   {"exerciseId":"9a0e0000-0000-0000-0000-000000000001","exerciseName":"GP Back Squat","weight":60,"reps":8,"warmup":true},
   {"exerciseId":"9a0e0000-0000-0000-0000-000000000001","exerciseName":"GP Back Squat","weight":100,"reps":5},
   {"exerciseId":"9a0e0000-0000-0000-0000-000000000001","exerciseName":"GP Back Squat","weight":100,"reps":4}]');
-- B: cân nặng trong 12 tuần, VÀ vòng eo — vòng eo không được lọt ra khi B tắt nó.
INSERT INTO weight_logs (user_id, date, weight_kg) VALUES (:B, current_date - 60, 71.0), (:B, current_date - 2, 69.4);
INSERT INTO body_measurements (user_id, date, waist_cm) VALUES (:B, current_date - 60, 84.0), (:B, current_date - 2, 81.5);

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;
CREATE OR REPLACE FUNCTION pg_temp.notes(u uuid, k text) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM community_notifications WHERE user_id = u AND kind = k $$;

-- ── 1. A chia sẻ buổi tập ──
SELECT pg_temp.who(:A); SET ROLE authenticated;
SELECT share_workout('9a5e0000-0000-0000-0000-0000000000a1', 'Squat 100 lần đầu', 'public', 52) AS post_a \gset
RESET ROLE;
SELECT set_config('gp.post_a', :'post_a', false);
DO $$ DECLARE p jsonb := (SELECT payload FROM community_posts WHERE id = current_setting('gp.post_a')::uuid); BEGIN
  ASSERT (p->>'volumeKg')::numeric = 4300 AND (p->>'pr')::boolean AND (p->>'minutes')::int = 52, format('GP1 payload buổi tập sai (volume/PR/phút): %s', p);
  ASSERT jsonb_array_length(p->'exercises') = 1 AND (p->'exercises'->0->>'sets')::int = 2
     AND (p->'exercises'->0->>'weight')::numeric = 100 AND (p->'exercises'->0->>'reps')::int = 5, format('GP2 bài tập / set / reps / tạ sai: %s', p->'exercises');
END $$;

-- ── 2. B thấy ở Khám phá (không theo dõi A), lưu, thử ──
SELECT pg_temp.who(:B); SET ROLE authenticated;
DO $$ BEGIN ASSERT EXISTS (SELECT 1 FROM community_posts WHERE id = current_setting('gp.post_a')::uuid AND author_id = '9a000000-0000-0000-0000-0000000000a1'), 'GP3 B không thấy bài công khai của A ở Khám phá'; END $$;
INSERT INTO community_saves (post_id) VALUES (:'post_a');
INSERT INTO community_post_tries (post_id) VALUES (:'post_a');
-- B tập xong buổi đã thử (bảng tập luyện thuộc app, không thuộc bộ này: ghi
-- bằng quyền của bộ test, như mọi tệp khác).
RESET ROLE;
INSERT INTO workout_sessions (user_id, template_name, volume_load, sets) VALUES
  (:B, 'Leg Day', 3200, '[{"exerciseId":"9a0e0000-0000-0000-0000-000000000001","exerciseName":"GP Back Squat","weight":80,"reps":5}]');
SELECT pg_temp.who(:B); SET ROLE authenticated;
-- B chia sẻ tiến trình: CHỈ cân nặng.
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT share_progress(12, false, false)$q$) = '22023', 'GP4 chia sẻ tiến trình không có chỉ số nào mà vẫn đăng'; END $$;
SELECT share_progress(12, true, false, NULL, 'Giảm 1,6 kg', 'public') AS post_b \gset
RESET ROLE;
SELECT set_config('gp.post_b', :'post_b', false);
DO $$ BEGIN ASSERT pg_temp.notes('9a000000-0000-0000-0000-0000000000a1', 'save') = 1 AND pg_temp.notes('9a000000-0000-0000-0000-0000000000a1', 'try') = 1, 'GP5 A không được báo đúng một lượt lưu và một lượt thử'; END $$;

-- ── 3. A thấy tiến trình của B: chỉ cân nặng, KHÔNG có vòng eo ở đâu cả ──
SELECT pg_temp.who(:A); SET ROLE authenticated;
DO $$ DECLARE p jsonb := (SELECT payload FROM community_posts WHERE id = current_setting('gp.post_b')::uuid); BEGIN
  ASSERT p ? 'weight' AND (p->'weight'->>'start')::numeric = 71.0 AND (p->'weight'->>'end')::numeric = 69.4, format('GP6 cân nặng sai: %s', p);
  ASSERT NOT p ? 'waist' AND p::text NOT LIKE '%84%' AND p::text NOT LIKE '%81.5%', format('GP7 vòng eo (đã tắt) lọt vào bài: %s', p);
END $$;
-- (Bảng số đo / cân nặng thô của B: RLS ở migration nền của app, ngoài bộ
-- Cộng đồng — stub của bộ này không dựng chúng với quyền client.)
-- A thích và bình luận.
INSERT INTO community_likes (post_id) VALUES (:'post_b');
INSERT INTO community_comments (id, post_id, body) VALUES ('9acc0000-0000-0000-0000-0000000000a1', :'post_b', 'Giỏi quá!');
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.notes('9a000000-0000-0000-0000-0000000000b2', 'like') = 1 AND pg_temp.notes('9a000000-0000-0000-0000-0000000000b2', 'comment') = 1, 'GP8 B không được báo lượt thích / bình luận của A'; END $$;
DO $$ BEGIN ASSERT (SELECT like_count = 1 AND comment_count = 1 FROM community_posts WHERE id = current_setting('gp.post_b')::uuid), 'GP9 bộ đếm thích / bình luận sai'; END $$;

-- ── 4. B trả lời A và nhắc @gp.anh ──
SELECT pg_temp.who(:B); SET ROLE authenticated;
INSERT INTO community_comments (post_id, parent_id, body) VALUES (:'post_b', '9acc0000-0000-0000-0000-0000000000a1', 'Cảm ơn @gp.anh nhé');
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.notes('9a000000-0000-0000-0000-0000000000a1', 'reply') + pg_temp.notes('9a000000-0000-0000-0000-0000000000a1', 'mention') >= 1, 'GP10 A không được báo câu trả lời / lượt nhắc'; END $$;

-- ── 5. Báo cáo → tự ẩn → kháng nghị → người kiểm duyệt chấp nhận ──
SELECT pg_temp.who(:R1); SET ROLE authenticated; INSERT INTO community_reports (post_id, reason) VALUES (:'post_a', 'spam'); RESET ROLE;
SELECT pg_temp.who(:R2); SET ROLE authenticated; INSERT INTO community_reports (post_id, reason) VALUES (:'post_a', 'spam'); RESET ROLE;
SELECT pg_temp.who(:R3); SET ROLE authenticated; INSERT INTO community_reports (post_id, reason, note) VALUES (:'post_a', 'misleading', 'số liệu ảo'); RESET ROLE;
SELECT pg_temp.who(:B); SET ROLE authenticated;
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM community_posts WHERE id = current_setting('gp.post_a')::uuid), 'GP11 ba báo cáo mà B vẫn thấy bài của A'; END $$;
RESET ROLE;
SELECT pg_temp.who(:A); SET ROLE authenticated;
DO $$ DECLARE r record; BEGIN
  SELECT * INTO r FROM community_my_hidden_reasons() WHERE post_id = current_setting('gp.post_a')::uuid;
  ASSERT r.reporters = 3 AND r.top_reason = 'spam' AND NOT r.removed AND NOT r.review_requested, format('GP12 A không thấy đúng vì sao bài bị ẩn: %s', r);
END $$;
SELECT community_appeal(:'post_a', NULL, 'Đây là buổi tập thật, có video');
RESET ROLE;
SELECT pg_temp.who(:MOD); SET ROLE authenticated;
SELECT e->>'id' AS appeal FROM jsonb_array_elements(mod_appeals()) e WHERE e->>'target_id' = :'post_a' \gset
DO $$ DECLARE t jsonb := mod_target('post', current_setting('gp.post_a')::uuid); BEGIN
  ASSERT jsonb_array_length(t->'reports') = 3 AND t->'appeals'->0->>'message' = 'Đây là buổi tập thật, có video'
     AND t->'author'->>'handle' = 'gp.anh', format('GP13 người kiểm duyệt không thấy đủ báo cáo / lời nhắn / tác giả: %s', t);
END $$;
SELECT mod_decide_appeal(:'appeal', true, 'bài tập hợp lệ');
RESET ROLE;
SELECT pg_temp.who(:B); SET ROLE authenticated;
DO $$ BEGIN ASSERT EXISTS (SELECT 1 FROM community_posts WHERE id = current_setting('gp.post_a')::uuid), 'GP14 chấp nhận kháng nghị mà B vẫn không thấy bài'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT EXISTS (SELECT 1 FROM moderation_audit_log WHERE action = 'APPROVE_APPEAL' AND actor_id = '9a000000-0000-0000-0000-0000000000c3' AND actor_role = 'moderator'), 'GP15 nhật ký không ghi người kiểm duyệt chấp nhận'; END $$;

-- ── 6. Người kiểm duyệt KHÔNG làm được việc của admin; admin gỡ rồi hoàn tác ──
SELECT pg_temp.who(:MOD); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT admin_audit()$q$) = '42501', 'GP16 người kiểm duyệt đọc được nhật ký của admin'; END $$;
RESET ROLE;
SELECT pg_temp.who(:ADM); SET ROLE authenticated;
SELECT mod_remove('post', :'post_b', 'ảnh không phải của người đăng');
RESET ROLE;
SELECT pg_temp.who(:B); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT removed FROM community_my_hidden_reasons() WHERE post_id = current_setting('gp.post_b')::uuid), 'GP17 B không biết bài bị gỡ'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode(format($q$SELECT community_appeal(%L, NULL, 'xin xem lại')$q$, current_setting('gp.post_b'))) = 'P0002', 'GP18 kháng nghị được bài đã gỡ'; END $$;
RESET ROLE;
SELECT pg_temp.who(:A); SET ROLE authenticated;
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM community_posts WHERE id = current_setting('gp.post_b')::uuid), 'GP19 A vẫn thấy bài đã gỡ'; END $$;
RESET ROLE;
SELECT pg_temp.who(:ADM); SET ROLE authenticated;
SELECT mod_restore('post', :'post_b', 'gỡ nhầm');
DO $$ DECLARE l jsonb := admin_audit(50); BEGIN
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(l) e WHERE e->>'action' = 'REMOVE_POST' AND e->>'target_id' = current_setting('gp.post_b') AND e->>'reason' = 'ảnh không phải của người đăng'), 'GP20 nhật ký thiếu REMOVE_POST kèm lý do';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(l) e WHERE e->>'action' = 'RESTORE_POST' AND e->>'target_id' = current_setting('gp.post_b') AND e->'metadata'->>'was_removed' = 'true'), 'GP21 nhật ký thiếu RESTORE_POST (từng bị gỡ)';
END $$;
RESET ROLE;

-- ── 7. A xoá bài: không còn gì trỏ vào nó ──
SELECT pg_temp.who(:A); SET ROLE authenticated;
DELETE FROM community_posts WHERE id = :'post_a';
RESET ROLE;
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM community_saves WHERE post_id = current_setting('gp.post_a')::uuid)
     AND NOT EXISTS (SELECT 1 FROM community_post_tries WHERE post_id = current_setting('gp.post_a')::uuid)
     AND NOT EXISTS (SELECT 1 FROM community_notifications WHERE post_id = current_setting('gp.post_a')::uuid)
     AND NOT EXISTS (SELECT 1 FROM community_reports WHERE post_id = current_setting('gp.post_a')::uuid), 'GP22 xoá bài để lại lượt lưu / thử / thông báo / báo cáo';
END $$;

-- Dọn: các bộ chạy sau đếm cả bảng. Nhật ký ở lại (chỉ thêm, không xoá).
DELETE FROM community_comments WHERE author_id::text LIKE '9a000000-0000-0000-0000-%';
DELETE FROM community_posts WHERE author_id::text LIKE '9a000000-0000-0000-0000-%';
DELETE FROM auth.users WHERE id::text LIKE '9a000000-0000-0000-0000-%';
DELETE FROM exercises WHERE id = '9a0e0000-0000-0000-0000-000000000001';

\echo 'TẤT CẢ 22 KỊCH BẢN GOLDEN PATH ĐÚNG'
