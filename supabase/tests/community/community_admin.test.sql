-- Vai trò, kiểm duyệt, nhật ký kiểm toán (20261007130000). Người dùng riêng.
-- Lệnh ghi và phép kiểm luôn là HAI câu lệnh (xem community_privacy.test.sql, V4).
\set ON_ERROR_STOP 1
\set ADM '''ad0000a1-0000-0000-0000-0000000000a1'''
\set MOD '''ad0000a2-0000-0000-0000-0000000000a2'''
\set U '''ad0000b1-0000-0000-0000-0000000000b1'''
\set R2 '''ad0000b2-0000-0000-0000-0000000000b2'''
\set R3 '''ad0000b3-0000-0000-0000-0000000000b3'''
\set R4 '''ad0000b4-0000-0000-0000-0000000000b4'''
\set R5 '''ad0000b5-0000-0000-0000-0000000000b5'''
INSERT INTO auth.users (id, email) VALUES
  (:ADM, 'Admin@Example.com'), (:MOD, 'mod@example.com'), (:U, 'u@example.com'),
  (:R2, 'r2@example.com'), (:R3, 'r3@example.com'), (:R4, 'r4@example.com'), (:R5, 'r5@example.com');
INSERT INTO community_profiles (user_id, handle, display_name) VALUES
  (:ADM, 'ad_admin', 'Admin'), (:MOD, 'ad_mod', 'Mod'), (:U, 'ad_u', 'Tác giả'),
  (:R2, 'ad_r2', 'R2'), (:R3, 'ad_r3', 'R3'), (:R4, 'ad_r4', 'R4'), (:R5, 'ad_r5', 'R5');
-- Bài CHỈ NGƯỜI THEO DÕI, và mọi người trong bộ này theo dõi tác giả: một ca
-- thử ngược làm bộ này dừng giữa chừng (trước phần dọn ở cuối) thì bài của nó
-- không lọt vào phép đếm "bài công khai" của các bộ chạy sau trên cùng database.
INSERT INTO community_posts (id, author_id, kind, payload, caption, visibility) VALUES
  ('ad00c001-0000-0000-0000-000000000001', :U, 'workout', '{}', 'bài một', 'followers'),
  ('ad00c001-0000-0000-0000-000000000002', :U, 'workout', '{}', 'bài hai', 'followers'),
  ('ad00c001-0000-0000-0000-000000000003', :U, 'workout', '{}', 'bài ba', 'followers');
INSERT INTO community_follows (follower_id, followee_id)
SELECT f, :U::uuid FROM unnest(ARRAY[:ADM, :MOD, :R2, :R3, :R4, :R5]::uuid[]) f;
INSERT INTO community_comments (id, post_id, author_id, body) VALUES
  ('ad00cc01-0000-0000-0000-000000000001', 'ad00c001-0000-0000-0000-000000000003', :R2, 'bình luận xấu');

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.anon() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon, service_role;
CREATE OR REPLACE FUNCTION pg_temp.audits(a text) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM moderation_audit_log WHERE action = a $$;

-- Mọi lời gọi của bảng điều khiển, kèm "chỉ admin".
CREATE TEMP TABLE calls (stmt text, admin_only boolean);
INSERT INTO calls VALUES
  ($q$SELECT mod_dashboard()$q$, false),
  ($q$SELECT mod_reports()$q$, false),
  ($q$SELECT mod_appeals()$q$, false),
  ($q$SELECT mod_target('post', 'ad00c001-0000-0000-0000-000000000001')$q$, false),
  ($q$SELECT mod_hide('post', 'ad00c001-0000-0000-0000-000000000002', 'x')$q$, false),
  ($q$SELECT mod_restore('post', 'ad00c001-0000-0000-0000-000000000002', 'x')$q$, false),
  ($q$SELECT mod_remove('post', 'ad00c001-0000-0000-0000-000000000002', 'x')$q$, false),
  ($q$SELECT mod_dismiss('post', 'ad00c001-0000-0000-0000-000000000002', 'x')$q$, false),
  ($q$SELECT mod_decide_appeal('00000000-0000-0000-0000-000000000000', true, 'x')$q$, false),
  ($q$SELECT admin_audit()$q$, true),
  ($q$SELECT admin_users('')$q$, true),
  ($q$SELECT admin_user('ad0000b1-0000-0000-0000-0000000000b1')$q$, true),
  ($q$SELECT admin_set_role('ad0000b2-0000-0000-0000-0000000000b2', 'admin', 'x')$q$, true),
  ($q$SELECT admin_art()$q$, true),
  ($q$SELECT admin_add_art('workout', 'mono', '{}', 'workout/ad-x.png', 'a', 'b', 0)$q$, true),
  ($q$SELECT admin_set_art_active('00000000-0000-0000-0000-000000000000', false, 'x')$q$, true);
GRANT SELECT ON calls TO authenticated, anon;

-- ── admin đầu tiên: chỉ quyền server ──
SELECT pg_temp.who(:U); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT bootstrap_first_admin('u@example.com')$q$) = '42501', 'B1 người dùng tự khởi tạo được admin'; END $$;
RESET ROLE;
SELECT pg_temp.anon(); SET ROLE anon;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT bootstrap_first_admin('u@example.com')$q$) = '42501', 'B2 anon khởi tạo được admin'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM app_roles), 'B3 lời gọi bị từ chối vẫn để lại vai trò'; END $$;
SET ROLE service_role;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT bootstrap_first_admin('khong-co@example.com')$q$) = 'P0002', 'B4 email lạ phải ra P0002'; END $$;
-- Email không phân biệt hoa thường.
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT bootstrap_first_admin('admin@example.com')$q$) = 'ok', 'B5 service_role không khởi tạo được admin đầu tiên (email khác hoa thường)'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT role FROM app_roles WHERE user_id = 'ad0000a1-0000-0000-0000-0000000000a1') = 'admin', 'B5 service_role không khởi tạo được admin đầu tiên'; END $$;
DO $$ BEGIN ASSERT (SELECT count(*) FROM moderation_audit_log WHERE action = 'ROLE_CHANGE' AND actor_role = 'system' AND actor_id IS NULL) = 1, 'B6 khởi tạo không ghi nhật ký hệ thống'; END $$;
SET ROLE service_role;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT bootstrap_first_admin('mod@example.com')$q$) = '42501', 'B7 khởi tạo lần hai được khi đã có admin'; END $$;
RESET ROLE;

-- ── R: người dùng thường và anon không gọi được gì ──
SELECT pg_temp.who(:U); SET ROLE authenticated;
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT * FROM calls LOOP
    ASSERT pg_temp.errcode(c.stmt) = '42501', format('R1 người dùng thường gọi được %s', c.stmt);
  END LOOP;
END $$;
DO $$ BEGIN ASSERT my_app_role() = 'user', 'R2 vai trò của người dùng thường phải là user'; END $$;
-- Tự nâng vai trò: bảng không có policy ghi.
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO app_roles (user_id, role) VALUES ('ad0000b1-0000-0000-0000-0000000000b1', 'admin')$q$) = '42501', 'R3 người dùng tự ghi được vai trò admin'; END $$;
-- Chỉ đọc được vai trò của chính mình.
DO $$ BEGIN ASSERT (SELECT count(*) FROM app_roles) = 0, 'R4 người dùng đọc được vai trò của người khác'; END $$;
-- Không đọc thẳng được nhật ký.
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT count(*) FROM moderation_audit_log$q$) = '42501', 'R5 người dùng đọc thẳng được nhật ký kiểm toán'; END $$;
RESET ROLE;
SELECT pg_temp.anon(); SET ROLE anon;
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT * FROM calls LOOP
    ASSERT pg_temp.errcode(c.stmt) = '42501', format('R6 anon gọi được %s', c.stmt);
  END LOOP;
END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT my_app_role()$q$) = '42501', 'R7 anon gọi được my_app_role'; END $$;
RESET ROLE;
-- Lớp quyền, tách khỏi lớp thân hàm (R6 xanh dù thiếu lớp nào trong hai):
-- anon không có quyền EXECUTE trên hàm nào của bảng điều khiển, và client không
-- có quyền trên các hàm nội bộ (đường tắt qua `moderation_require`).
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname ~ '^(mod|admin)_' AND has_function_privilege('anon', p.oid, 'EXECUTE')), 'R6b anon có quyền EXECUTE trên hàm bảng điều khiển'; END $$;
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND (p.proname ~ '^moderation_' OR p.proname IN ('app_role_of', 'bootstrap_first_admin'))
    AND (has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('anon', p.oid, 'EXECUTE'))), 'R9 client gọi thẳng được hàm nội bộ'; END $$;
DO $$ BEGIN ASSERT pg_temp.audits('HIDE_POST') + pg_temp.audits('REMOVE_POST') + pg_temp.audits('RESTORE_POST') = 0, 'R8 lời gọi bị từ chối vẫn ghi nhật ký'; END $$;

-- ── admin cấp vai trò người kiểm duyệt ──
SELECT pg_temp.who(:ADM); SET ROLE authenticated;
DO $$ BEGIN ASSERT my_app_role() = 'admin', 'A1 admin không thấy vai trò của mình'; END $$;
SELECT admin_set_role('ad0000a2-0000-0000-0000-0000000000a2', 'moderator', 'tuyển người kiểm duyệt');
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT admin_set_role('ad0000a1-0000-0000-0000-0000000000a1', 'user', 'x')$q$) = '22023', 'A2 admin tự đổi vai trò của mình được'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT admin_set_role('ad0000a2-0000-0000-0000-0000000000a2', 'moderator', 'x')$q$) = '22023', 'A3 cấp lại đúng vai trò đang có không báo'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT admin_set_role('ad0000a2-0000-0000-0000-0000000000a2', 'owner', 'x')$q$) = '22023', 'A4 vai trò lạ lọt qua'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT admin_set_role('00000000-0000-0000-0000-00000000dead', 'moderator', 'x')$q$) = 'P0002', 'A5 cấp vai trò cho người không tồn tại'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT metadata FROM moderation_audit_log WHERE action = 'ROLE_CHANGE' AND target_id = 'ad0000a2-0000-0000-0000-0000000000a2') = '{"from": "user", "to": "moderator"}'::jsonb, 'A6 ROLE_CHANGE không ghi từ → tới'; END $$;
DO $$ BEGIN ASSERT (SELECT actor_id FROM moderation_audit_log WHERE action = 'ROLE_CHANGE' AND target_id = 'ad0000a2-0000-0000-0000-0000000000a2') = 'ad0000a1-0000-0000-0000-0000000000a1', 'A7 ROLE_CHANGE không ghi đúng người làm'; END $$;

-- ── người kiểm duyệt: làm được việc kiểm duyệt, KHÔNG làm được việc của admin ──
SELECT pg_temp.who(:MOD); SET ROLE authenticated;
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT * FROM calls WHERE admin_only LOOP
    ASSERT pg_temp.errcode(c.stmt) = '42501', format('M1 người kiểm duyệt gọi được việc của admin: %s', c.stmt);
  END LOOP;
END $$;
-- Tự nâng mình lên admin: hàm chỉ của admin, bảng không có policy ghi.
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT admin_set_role('ad0000a2-0000-0000-0000-0000000000a2', 'admin', 'x')$q$) = '42501', 'M2 người kiểm duyệt tự nâng mình lên admin được'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$UPDATE app_roles SET role = 'admin' WHERE user_id = 'ad0000a2-0000-0000-0000-0000000000a2'$q$) = '42501', 'M3 người kiểm duyệt sửa được bảng vai trò'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT mod_dashboard()$q$) = 'ok', 'M4 người kiểm duyệt không mở được bảng điều khiển'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT role FROM app_roles WHERE user_id = 'ad0000a2-0000-0000-0000-0000000000a2') = 'moderator', 'M5 vai trò người kiểm duyệt bị đổi'; END $$;

-- ── luồng: báo cáo → tự ẩn → kháng nghị → xem lại ──
SELECT pg_temp.who(:R2); SET ROLE authenticated;
INSERT INTO community_reports (post_id, reason) VALUES ('ad00c001-0000-0000-0000-000000000001', 'spam');
DO $$ BEGIN ASSERT pg_temp.errcode($q$INSERT INTO community_reports (post_id, reason) VALUES ('ad00c001-0000-0000-0000-000000000001', 'spam')$q$) = '23505', 'F1 một người báo cáo hai lần được'; END $$;
RESET ROLE;
SELECT pg_temp.who(:R3); SET ROLE authenticated;
INSERT INTO community_reports (post_id, reason) VALUES ('ad00c001-0000-0000-0000-000000000001', 'harassment');
RESET ROLE;
DO $$ BEGIN ASSERT NOT (SELECT hidden FROM community_posts WHERE id = 'ad00c001-0000-0000-0000-000000000001'), 'F2 hai báo cáo đã tự ẩn'; END $$;
SELECT pg_temp.who(:R4); SET ROLE authenticated;
INSERT INTO community_reports (post_id, reason, note) VALUES ('ad00c001-0000-0000-0000-000000000001', 'spam', 'quảng cáo');
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT hidden FROM community_posts WHERE id = 'ad00c001-0000-0000-0000-000000000001'), 'F3 ba người báo cáo mà bài chưa tự ẩn'; END $$;
-- Tác giả kháng nghị, kèm lời nhắn.
SELECT pg_temp.who(:U); SET ROLE authenticated;
SELECT community_appeal('ad00c001-0000-0000-0000-000000000001', NULL, 'Đây là bài tập thật của tôi');
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT community_appeal('ad00c001-0000-0000-0000-000000000001', NULL, 'lần nữa')$q$) = '23505', 'F4 kháng nghị hai lần trong một đợt ẩn được'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT community_appeal('ad00c001-0000-0000-0000-000000000001', NULL, repeat('x', 501))$q$) = '22023', 'F5 lời nhắn quá dài lọt'; END $$;
RESET ROLE;
-- Hàng đợi của người kiểm duyệt.
SELECT pg_temp.who(:MOD); SET ROLE authenticated;
DO $$ DECLARE q jsonb := (SELECT e FROM jsonb_array_elements(mod_reports()) e WHERE e->>'target_id' = 'ad00c001-0000-0000-0000-000000000001'); BEGIN
  ASSERT (q->>'report_count')::int = 3, format('F6 hàng đợi phải gom 3 báo cáo thành một việc, ra %s', q->>'report_count');
  ASSERT (q->'reasons'->>'spam')::int = 2 AND (q->'reasons'->>'harassment')::int = 1, format('F7 lý do gộp sai: %s', q->'reasons');
  ASSERT q->'author'->>'handle' = 'ad_u', 'F8 hàng đợi không có tác giả';
  ASSERT q->'appeal'->>'status' = 'open', 'F9 hàng đợi không thấy kháng nghị đang chờ';
  ASSERT (q->'target'->>'hidden')::boolean, 'F10 hàng đợi không nói bài đang ẩn';
END $$;
DO $$ DECLARE t jsonb := mod_target('post', 'ad00c001-0000-0000-0000-000000000001'); BEGIN
  ASSERT jsonb_array_length(t->'reports') = 3, 'F11 chi tiết không đủ ba báo cáo';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(t->'reports') r WHERE r->>'note' = 'quảng cáo' AND r->'reporter'->>'handle' = 'ad_r4'), 'F12 chi tiết thiếu ghi chú / người báo';
  ASSERT t->'appeals'->0->>'message' = 'Đây là bài tập thật của tôi', 'F13 người kiểm duyệt không đọc được lời nhắn kháng nghị';
END $$;
-- Từ chối kháng nghị. Người kiểm duyệt KHÔNG đọc thẳng được bảng yêu cầu
-- (RLS: chỉ người gửi) — id lấy từ hàng đợi của chính họ.
DO $$ BEGIN ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(mod_appeals()) e WHERE e->>'target_id' = 'ad00c001-0000-0000-0000-000000000001' AND e->>'message' = 'Đây là bài tập thật của tôi'), 'F13b hàng đợi kháng nghị không có kháng nghị này'; END $$;
SELECT e->>'id' AS appeal1 FROM jsonb_array_elements(mod_appeals()) e WHERE e->>'target_id' = 'ad00c001-0000-0000-0000-000000000001' \gset
SELECT mod_decide_appeal(:'appeal1', false, 'đúng là quảng cáo');
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT status FROM community_review_requests WHERE post_id = 'ad00c001-0000-0000-0000-000000000001') = 'upheld', 'F14 từ chối mà kháng nghị không thành upheld'; END $$;
DO $$ BEGIN ASSERT (SELECT hidden FROM community_posts WHERE id = 'ad00c001-0000-0000-0000-000000000001'), 'F15 từ chối kháng nghị mà bài hiện lại'; END $$;
DO $$ BEGIN ASSERT (SELECT count(*) FROM community_reports WHERE post_id = 'ad00c001-0000-0000-0000-000000000001' AND status = 'actioned') = 3, 'F16 từ chối mà báo cáo không đóng'; END $$;
DO $$ BEGIN ASSERT pg_temp.audits('REJECT_APPEAL') = 1, 'F17 từ chối kháng nghị không ghi nhật ký'; END $$;
SELECT pg_temp.who(:U); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT review_upheld AND NOT review_requested FROM community_my_hidden_reasons() WHERE post_id = 'ad00c001-0000-0000-0000-000000000001'), 'F18 tác giả không biết kháng nghị đã bị từ chối'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT community_request_review('ad00c001-0000-0000-0000-000000000001', NULL)$q$) = '23505', 'F19 bị từ chối rồi vẫn kháng nghị lại được trong cùng đợt'; END $$;
RESET ROLE;
SELECT pg_temp.who(:MOD); SET ROLE authenticated;
SELECT set_config('ad.redecide', format($q$SELECT mod_decide_appeal(%L, true, 'x')$q$, :'appeal1'), false);
DO $$ BEGIN ASSERT pg_temp.errcode(current_setting('ad.redecide')) = '22023', 'F20 quyết định lại một kháng nghị đã xong'; END $$;
RESET ROLE;

-- ── khôi phục, và lỗi tự ẩn cũ ──
SELECT pg_temp.who(:MOD); SET ROLE authenticated;
SELECT mod_restore('post', 'ad00c001-0000-0000-0000-000000000001', 'xem lại: không vi phạm');
RESET ROLE;
DO $$ BEGIN ASSERT NOT (SELECT hidden FROM community_posts WHERE id = 'ad00c001-0000-0000-0000-000000000001'), 'K1 khôi phục mà bài vẫn ẩn'; END $$;
DO $$ BEGIN ASSERT (SELECT status FROM community_review_requests WHERE post_id = 'ad00c001-0000-0000-0000-000000000001') = 'restored', 'K2 khôi phục mà kháng nghị cũ không thành restored'; END $$;
DO $$ BEGIN ASSERT (SELECT actor_role FROM moderation_audit_log WHERE action = 'RESTORE_POST') = 'moderator', 'K3 RESTORE_POST không ghi vai người làm'; END $$;
-- Lỗi cũ: chỉ MỘT báo cáo mới đã đủ ẩn lại (đếm cả báo cáo cũ).
SELECT pg_temp.who(:R5); SET ROLE authenticated;
INSERT INTO community_reports (post_id, reason) VALUES ('ad00c001-0000-0000-0000-000000000001', 'spam');
RESET ROLE;
DO $$ BEGIN ASSERT NOT (SELECT hidden FROM community_posts WHERE id = 'ad00c001-0000-0000-0000-000000000001'), 'K4 một báo cáo mới đã ẩn lại bài vừa khôi phục (đếm cả báo cáo đã đóng)'; END $$;
-- Ba báo cáo MỚI đang mở thì ẩn lại; đợt mới có một lần kháng nghị mới.
INSERT INTO community_reports (reporter_id, post_id, reason) VALUES
  (:ADM, 'ad00c001-0000-0000-0000-000000000001', 'other'), (:MOD, 'ad00c001-0000-0000-0000-000000000001', 'other');
DO $$ BEGIN ASSERT (SELECT hidden FROM community_posts WHERE id = 'ad00c001-0000-0000-0000-000000000001'), 'K5 ba báo cáo mới mà không ẩn lại'; END $$;
SELECT pg_temp.who(:U); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT community_appeal('ad00c001-0000-0000-0000-000000000001', NULL, 'đợt mới')$q$) = 'ok', 'K6 đợt ẩn mới không cho kháng nghị lại'; END $$;
RESET ROLE;
-- Chấp nhận kháng nghị thì bài hiện.
SELECT pg_temp.who(:MOD); SET ROLE authenticated;
SELECT e->>'id' AS appeal2 FROM jsonb_array_elements(mod_appeals()) e WHERE e->>'target_id' = 'ad00c001-0000-0000-0000-000000000001' \gset
SELECT mod_decide_appeal(:'appeal2', true, 'chấp nhận');
RESET ROLE;
DO $$ BEGIN ASSERT NOT (SELECT hidden FROM community_posts WHERE id = 'ad00c001-0000-0000-0000-000000000001'), 'K7 chấp nhận kháng nghị mà bài vẫn ẩn'; END $$;
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM community_reports WHERE post_id = 'ad00c001-0000-0000-0000-000000000001' AND status = 'open'), 'K8 chấp nhận kháng nghị mà còn báo cáo mở'; END $$;
DO $$ BEGIN ASSERT pg_temp.audits('APPROVE_APPEAL') = 1, 'K9 chấp nhận kháng nghị không ghi nhật ký'; END $$;

-- ── gỡ ──
SELECT pg_temp.who(:MOD); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT mod_remove('post', 'ad00c001-0000-0000-0000-000000000002', '   ')$q$) = '22023', 'G1 gỡ không cần lý do'; END $$;
SELECT mod_remove('post', 'ad00c001-0000-0000-0000-000000000002', 'nội dung nguy hiểm');
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT mod_remove('post', 'ad00c001-0000-0000-0000-000000000002', 'x')$q$) = '22023', 'G2 gỡ hai lần'; END $$;
-- Người kiểm duyệt KHÔNG hoàn tác được việc gỡ.
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT mod_restore('post', 'ad00c001-0000-0000-0000-000000000002', 'x')$q$) = '42501', 'G3 người kiểm duyệt khôi phục được bài đã gỡ'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT hidden AND removed_at IS NOT NULL AND removed_by = 'ad0000a2-0000-0000-0000-0000000000a2' FROM community_posts WHERE id = 'ad00c001-0000-0000-0000-000000000002'), 'G4 gỡ không đặt trạng thái gỡ'; END $$;
-- Người khác không thấy bài đã gỡ.
SELECT pg_temp.who(:R2); SET ROLE authenticated;
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM community_posts WHERE id = 'ad00c001-0000-0000-0000-000000000002'), 'G5 người khác thấy bài đã gỡ'; END $$;
RESET ROLE;
-- Tác giả thấy "đã gỡ" và không kháng nghị được.
SELECT pg_temp.who(:U); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT removed FROM community_my_hidden_reasons() WHERE post_id = 'ad00c001-0000-0000-0000-000000000002'), 'G6 tác giả không biết bài đã bị gỡ'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT community_request_review('ad00c001-0000-0000-0000-000000000002', NULL)$q$) = 'P0002', 'G7 kháng nghị được bài đã gỡ'; END $$;
RESET ROLE;
-- Admin hoàn tác được.
SELECT pg_temp.who(:ADM); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT mod_restore('post', 'ad00c001-0000-0000-0000-000000000002', 'gỡ nhầm')$q$) = 'ok', 'G8 admin không hoàn tác được việc gỡ'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT NOT hidden AND removed_at IS NULL AND removed_by IS NULL FROM community_posts WHERE id = 'ad00c001-0000-0000-0000-000000000002'), 'G8 admin không hoàn tác được việc gỡ'; END $$;
DO $$ BEGIN ASSERT (SELECT metadata->>'was_removed' FROM moderation_audit_log WHERE action = 'RESTORE_POST' AND target_id = 'ad00c001-0000-0000-0000-000000000002') = 'true', 'G9 nhật ký không ghi rằng bài từng bị gỡ'; END $$;

-- ── ẩn tay, bác báo cáo ──
SELECT pg_temp.who(:MOD); SET ROLE authenticated;
SELECT mod_hide('post', 'ad00c001-0000-0000-0000-000000000003', 'đang xem xét');
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT mod_hide('post', 'ad00c001-0000-0000-0000-000000000003', 'x')$q$) = '22023', 'H1 ẩn hai lần'; END $$;
SELECT mod_restore('post', 'ad00c001-0000-0000-0000-000000000003', 'ổn');
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT mod_dismiss('post', 'ad00c001-0000-0000-0000-000000000003', 'x')$q$) = '22023', 'H3 bác khi không có báo cáo mở'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT mod_hide('photo', 'ad00c001-0000-0000-0000-000000000003', 'x')$q$) = '22023', 'H4 loại đích lạ lọt'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT mod_hide('post', '00000000-0000-0000-0000-0000000000ff', 'x')$q$) = 'P0002', 'H5 ẩn được bài không tồn tại'; END $$;
RESET ROLE;
SELECT pg_temp.who(:R2); SET ROLE authenticated;
INSERT INTO community_reports (post_id, reason) VALUES ('ad00c001-0000-0000-0000-000000000003', 'misleading');
RESET ROLE;
SELECT pg_temp.who(:MOD); SET ROLE authenticated;
DO $$ BEGIN ASSERT mod_dismiss('post', 'ad00c001-0000-0000-0000-000000000003', 'không sai') = 1, 'H6 bác báo cáo không trả số báo cáo đã bác'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT status FROM community_reports WHERE post_id = 'ad00c001-0000-0000-0000-000000000003') = 'dismissed', 'H7 bác mà báo cáo vẫn mở'; END $$;
DO $$ BEGIN ASSERT pg_temp.audits('DISMISS_REPORT') = 1 AND pg_temp.audits('HIDE_POST') = 1, 'H8 bác / ẩn không ghi nhật ký'; END $$;

-- ── bình luận ──
INSERT INTO community_reports (reporter_id, comment_id, reason) VALUES
  (:U, 'ad00cc01-0000-0000-0000-000000000001', 'harassment'), (:R3, 'ad00cc01-0000-0000-0000-000000000001', 'harassment'),
  (:R4, 'ad00cc01-0000-0000-0000-000000000001', 'harassment');
DO $$ BEGIN ASSERT (SELECT hidden FROM community_comments WHERE id = 'ad00cc01-0000-0000-0000-000000000001'), 'C1 ba báo cáo mà bình luận chưa ẩn'; END $$;
SELECT pg_temp.who(:MOD); SET ROLE authenticated;
DO $$ BEGIN ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(mod_reports()) e WHERE e->>'target_type' = 'comment' AND (e->>'report_count')::int = 3), 'C2 hàng đợi không có bình luận bị báo cáo'; END $$;
-- Đích đang ẩn VÀ còn báo cáo mở (tự ẩn): bác báo cáo không phải lối ra.
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT mod_dismiss('comment', 'ad00cc01-0000-0000-0000-000000000001', 'x')$q$) = '22023', 'H2 bác báo cáo trên đích đang ẩn (phải khôi phục hoặc gỡ)'; END $$;
SELECT mod_remove('comment', 'ad00cc01-0000-0000-0000-000000000001', 'quấy rối');
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT removed_at IS NOT NULL FROM community_comments WHERE id = 'ad00cc01-0000-0000-0000-000000000001') AND pg_temp.audits('REMOVE_COMMENT') = 1, 'C3 gỡ bình luận không đặt trạng thái / không ghi nhật ký'; END $$;

-- ── thư viện ảnh ──
SELECT pg_temp.who(:ADM); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT admin_add_art('workout', 'mono', '{}', '../etc/passwd', 'a', 'b', 0)$q$) = '22023', 'I1 đường dẫn lùi thư mục lọt'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT admin_add_art('workout', 'mono', '{}', '/abs.png', 'a', 'b', 0)$q$) = '22023', 'I2 đường dẫn tuyệt đối lọt'; END $$;
SELECT admin_add_art('workout', 'mono', ARRAY['push'], 'workout/ad-new.png', 'New art', 'Ảnh mới', 5);
RESET ROLE;
DO $$ BEGIN ASSERT EXISTS (SELECT 1 FROM community_art WHERE path = 'workout/ad-new.png' AND active) AND pg_temp.audits('ADD_IMAGE') = 1, 'I3 thêm ảnh không ghi ảnh / nhật ký'; END $$;
SELECT pg_temp.who(:ADM); SET ROLE authenticated;
SELECT admin_set_art_active((SELECT id FROM community_art WHERE path = 'workout/ad-new.png'), false, 'ảnh mờ');
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT admin_set_art_active((SELECT id FROM community_art WHERE path = 'workout/ad-new.png'), false, 'x')$q$) = '22023', 'I4 tắt hai lần'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT admin_set_art_active('00000000-0000-0000-0000-0000000000ff', false, 'x')$q$) = 'P0002', 'I5 tắt ảnh không tồn tại'; END $$;
DO $$ BEGIN ASSERT (SELECT (e->>'active')::boolean = false FROM jsonb_array_elements(admin_art()) e WHERE e->>'path' = 'workout/ad-new.png'), 'I6 admin không thấy ảnh đã tắt trong thư viện'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT pg_temp.audits('REMOVE_IMAGE') = 1, 'I7 tắt ảnh không ghi nhật ký'; END $$;
-- Tắt, không xoá: người dùng vẫn ĐỌC được hàng (bài cũ dùng ảnh ấy phải vẽ
-- được, #163), và nó mang `active = false` để bộ chọn ảnh bỏ qua.
SELECT pg_temp.who(:U); SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT NOT active FROM community_art WHERE path = 'workout/ad-new.png'), 'I8 ảnh đã tắt không còn đọc được (bài cũ sẽ vỡ) hoặc vẫn active'; END $$;
RESET ROLE;

-- ── người dùng, bảng điều khiển, nhật ký ──
SELECT set_config('ad.audit_n', (SELECT count(*) FROM moderation_audit_log)::text, false);
SELECT pg_temp.who(:ADM); SET ROLE authenticated;
DO $$ DECLARE u jsonb := (SELECT e FROM jsonb_array_elements(admin_users('ad_u')) e WHERE e->>'user_id' = 'ad0000b1-0000-0000-0000-0000000000b1'); BEGIN
  ASSERT u IS NOT NULL, 'U1 tìm theo handle không ra';
  ASSERT u->>'email' = 'u@example.com' AND u->>'role' = 'user', format('U2 thông tin sai: %s', u);
  ASSERT (u->>'posts')::int = 3, format('U3 số bài sai: %s', u->>'posts');
END $$;
DO $$ BEGIN ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(admin_users('MOD@example')) e WHERE e->>'role' = 'moderator'), 'U4 tìm theo email (không phân biệt hoa thường) không ra'; END $$;
DO $$ BEGIN ASSERT jsonb_array_length(admin_users('%')) = 0, 'U5 ký tự đại diện trong ô tìm không được thoát'; END $$;
DO $$ DECLARE d jsonb := admin_user('ad0000b1-0000-0000-0000-0000000000b1'); BEGIN
  ASSERT jsonb_array_length(d->'posts') = 3, 'U6 chi tiết người dùng thiếu bài';
  ASSERT jsonb_array_length(d->'reports_against') >= 7, format('U7 chi tiết thiếu báo cáo về người ấy: %s', jsonb_array_length(d->'reports_against'));
  ASSERT jsonb_array_length(d->'history') >= 5, 'U8 chi tiết thiếu lịch sử kiểm duyệt';
END $$;
DO $$ DECLARE d jsonb := mod_dashboard(); BEGIN
  ASSERT (d->>'pending_reports')::int = 0, format('D1 việc chờ sai: %s', d->>'pending_reports');
  ASSERT (d->>'removed_posts')::int = 0 AND (d->>'hidden_posts')::int = 0, format('D2 đếm bài ẩn / gỡ sai: %s', d);
  ASSERT (d->>'reports_today')::int >= 10, format('D3 báo cáo hôm nay sai: %s', d->>'reports_today');
  ASSERT jsonb_array_length(d->'recent') = 10, 'D4 bảng điều khiển không có 10 việc gần nhất';
END $$;
DO $$ BEGIN ASSERT jsonb_array_length(admin_audit(500)) = current_setting('ad.audit_n')::int, 'L1 admin không đọc được toàn bộ nhật ký'; END $$;
DO $$ BEGIN ASSERT (SELECT bool_and(e->>'action' = 'ROLE_CHANGE') FROM jsonb_array_elements(admin_audit(100, NULL, 'ROLE_CHANGE')) e), 'L2 lọc nhật ký theo hành động sai'; END $$;
-- Admin không hạ được admin cuối cùng (chính mình bị chặn sẵn; thử qua một admin thứ hai).
SELECT admin_set_role('ad0000b5-0000-0000-0000-0000000000b5', 'admin', 'admin thứ hai');
-- Có HAI admin thì luật "admin cuối" không chặn: chỉ luật "không tự đổi" chặn.
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT admin_set_role('ad0000a1-0000-0000-0000-0000000000a1', 'moderator', 'x')$q$) = '22023', 'A8 có hai admin mà một người tự hạ mình được'; END $$;
RESET ROLE;
SELECT pg_temp.who(:R5); SET ROLE authenticated;
SELECT admin_set_role('ad0000a1-0000-0000-0000-0000000000a1', 'user', 'chuyển giao');
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT admin_set_role('ad0000b5-0000-0000-0000-0000000000b5', 'user', 'x')$q$) = '22023', 'L3 tự hạ được admin cuối cùng'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT count(*) FROM app_roles WHERE role = 'admin') = 1, 'L4 hạ admin làm mất admin cuối cùng'; END $$;
-- Người vừa bị hạ mất quyền ngay ở lời gọi kế tiếp.
SELECT pg_temp.who(:ADM); SET ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode($q$SELECT admin_audit()$q$) = '42501', 'L5 admin đã bị hạ vẫn gọi được việc của admin'; END $$;
RESET ROLE;

-- ── nhật ký: chỉ thêm, kể cả với chủ database ──
DO $$ BEGIN ASSERT pg_temp.errcode($q$UPDATE moderation_audit_log SET reason = 'sửa'$q$) = '42501', 'L6 sửa được nhật ký'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$DELETE FROM moderation_audit_log$q$) = '42501', 'L7 xoá được nhật ký'; END $$;
DO $$ BEGIN ASSERT pg_temp.errcode($q$TRUNCATE moderation_audit_log$q$) = '42501', 'L8 truncate được nhật ký'; END $$;
SET ROLE service_role;
DO $$ BEGIN ASSERT pg_temp.errcode($q$DELETE FROM moderation_audit_log$q$) = '42501', 'L9 service_role xoá được nhật ký'; END $$;
RESET ROLE;
-- Xoá tài khoản người làm không xoá dấu vết việc họ đã làm.
DO $$ BEGIN ASSERT pg_temp.errcode($q$DELETE FROM auth.users WHERE id = 'ad0000a2-0000-0000-0000-0000000000a2'$q$) = 'ok', 'L10 xoá tài khoản người kiểm duyệt bị nhật ký chặn (khoá ngoại?)'; END $$;
DO $$ BEGIN ASSERT (SELECT count(*) FROM moderation_audit_log WHERE actor_id = 'ad0000a2-0000-0000-0000-0000000000a2') >= 5, 'L10 xoá tài khoản xoá luôn dấu vết kiểm duyệt'; END $$;

-- Dọn: các bộ chạy sau trên CÙNG database đếm cả bảng (community_art đếm thư
-- viện ảnh, community_foundation đếm bài đang hiện). Xoá người dùng kéo theo
-- hồ sơ, bài, bình luận, báo cáo và vai trò; nhật ký ở lại — và đó cũng là
-- phép thử L10 một lần nữa, trên cả bảy tài khoản.
DELETE FROM community_art WHERE path = 'workout/ad-new.png';
-- Nội dung xoá TRƯỚC, không trông vào cascade từ auth.users: một ca thử ngược
-- phá chính cascade ấy (foundation 36) thì bình luận của bộ này ở lại và làm
-- đỏ phép đếm toàn bảng của foundation 33 — đỏ sai chỗ.
DELETE FROM community_comments WHERE author_id::text LIKE 'ad0000__-0000-0000-0000-%';
DELETE FROM community_posts WHERE author_id::text LIKE 'ad0000__-0000-0000-0000-%';
DELETE FROM community_profiles WHERE user_id::text LIKE 'ad0000__-0000-0000-0000-%';
DELETE FROM auth.users WHERE id::text LIKE 'ad0000__-0000-0000-0000-%';
DO $$ BEGIN ASSERT (SELECT count(*) FROM moderation_audit_log) = current_setting('ad.audit_n')::int + 2, 'L11 xoá tài khoản làm mất dòng nhật ký'; END $$;

\echo 'TẤT CẢ 111 KỊCH BẢN QUẢN TRỊ ĐÚNG'
