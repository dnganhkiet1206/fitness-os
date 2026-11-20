-- ════════════════════════════════════════════════════════════════════════════
-- Cộng đồng được kiểm duyệt — vòng phản hồi cho tác giả và người báo cáo
-- (D, 17/11 — #915, lát 2).
--
-- Vấn đề: một quyết định kiểm duyệt xong thì im lặng. Tác giả không biết bài
-- mình bị ẩn / gỡ vì sao, và người báo cáo không bao giờ nghe lại kết quả —
-- nên họ ngừng báo cáo (nghiên cứu 17/11: Facebook Support Inbox là mẫu tốt
-- nhất; Discourse im lặng với người báo là điều cố tình KHÔNG học theo).
--
-- Ba phần, không đổi chữ ký hàm nào, không sửa migration cũ:
--
--   1. Thông báo kiểm duyệt: loại `moderation` mới của
--      `community_notifications`, kèm cột `payload` (jsonb) mang kết quả +
--      lý do + loại đích. `mod_hide` / `mod_remove` / `mod_restore` /
--      `mod_decide_appeal` báo cho TÁC GIẢ; `mod_hide` / `mod_dismiss` /
--      `mod_remove` / `mod_restore` báo cho từng NGƯỜI BÁO CÁO có báo cáo
--      đang mở. Ẩn cũng báo cho người báo ("đã xử lý") — vì ẩn ĐÓNG báo cáo
--      thành `actioned` (luật gốc của 20261007130000): với người báo, ẩn là
--      đã có hành động. Không báo ở bước ẩn thì bước khôi phục sau đó không
--      còn tìm được họ (báo cáo đã đóng), và họ không bao giờ nghe gì.
--
--      Thông báo là thông báo HỆ THỐNG (`actor_id` NULL, như mốc thử thách):
--      đội kiểm duyệt nói bằng một giọng, không lộ tên người quyết định, và
--      người nhận không tắt được (trigger lọc cài đặt `community_notify_filter`
--      không khớp loại này nên cho qua — như Facebook / Discord, thông báo thi
--      hành không phải thứ để tắt; người dùng vẫn cần biết quyền kháng nghị).
--      RLS vẫn đọc được: `community_blocked_between(user, NULL)` là false
--      (`EXISTS` trên so sánh với NULL).
--
--      MỖI lần ghi thông báo nằm trong khối `BEGIN ... EXCEPTION WHEN OTHERS
--      THEN NULL; END` riêng: thông báo hỏng không bao giờ được làm hỏng một
--      quyết định kiểm duyệt (như `community_notify_milestone` không được làm
--      hỏng việc lưu buổi tập).
--
--   2. `mod_target` thêm hai trường (chỉ THÊM, không đổi trường cũ — bản này
--      chép từ 20261007220000, giữ nguyên `counted`):
--      `author_stats` (số bài / bài ẩn / bài gỡ / báo cáo đang mở về tác giả /
--      báo cáo tác giả đã gửi — cùng truy vấn với `admin_users`) và
--      `restriction` (tạm khoá đăng đang còn hiệu lực, như
--      `mod_user_restriction` — để màn chi tiết khỏi gọi thêm một lượt).
--      Client cũ không đọc hai trường này thì không ảnh hưởng gì.
--
--   3. `community_my_reports()`: báo cáo của CHÍNH người gọi kèm trích nội
--      dung đích (tối đa 160 ký tự) và cờ `removed`. Không đọc trực tiếp bảng
--      được: bài vừa báo cáo tự ẩn khỏi chính người báo (`community_post_hides`
--      + policy RESTRICTIVE), nên đọc qua RLS không lấy được trích đoạn. Hàm
--      chỉ trả dữ liệu của `auth.uid()`, không nhận tham số người dùng nào.
-- ════════════════════════════════════════════════════════════════════════════

/* ── 1a. loại `moderation` + cột payload ── */
ALTER TABLE public.community_notifications
  ADD COLUMN payload jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Ràng buộc đã có tên cố định từ 20261007120000 nên gỡ theo tên (như
-- 20261007235000 gỡ `moderation_audit_log_action_check`).
ALTER TABLE public.community_notifications DROP CONSTRAINT IF EXISTS community_notifications_kind_check;
ALTER TABLE public.community_notifications
  ADD CONSTRAINT community_notifications_kind_check
    CHECK (kind IN ('like', 'comment', 'follow', 'reply', 'mention', 'save', 'try', 'challenge_milestone', 'moderation'));

-- Thông báo hệ thống (không có người gây ra) nay gồm cả kiểm duyệt.
ALTER TABLE public.community_notifications DROP CONSTRAINT IF EXISTS community_notifications_system_kinds;
ALTER TABLE public.community_notifications
  ADD CONSTRAINT community_notifications_system_kinds
    CHECK ((kind IN ('challenge_milestone', 'moderation')) = (actor_id IS NULL));

/* ── 1b. ghi một thông báo kiểm duyệt ── */
-- `p_outcome`: hidden | removed | restored | appeal_approved | appeal_rejected
-- (cho tác giả) và report_actioned | report_dismissed (cho người báo cáo).
-- Không tự báo cho chính người quyết định; đích không còn bài cha thì bỏ.
CREATE OR REPLACE FUNCTION public.moderation_notify(
  p_user uuid, p_type text, p_id uuid, p_outcome text, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post uuid;
BEGIN
  IF p_user IS NULL OR p_user = auth.uid() THEN
    RETURN;
  END IF;
  IF p_type = 'post' THEN
    v_post := p_id;
  ELSE
    SELECT post_id INTO v_post FROM public.community_comments WHERE id = p_id;
  END IF;
  IF v_post IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.community_notifications (user_id, actor_id, kind, post_id, payload)
  VALUES (p_user, NULL, 'moderation', v_post,
          jsonb_build_object(
            'outcome', p_outcome,
            'reason', coalesce(p_reason, ''),
            'target_type', p_type,
            'comment_id', CASE WHEN p_type = 'comment' THEN p_id::text ELSE NULL END));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.moderation_notify(uuid, text, uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Người báo cáo có báo cáo đang mở trên một đích (chụp TRƯỚC khi đóng báo
-- cáo — đóng rồi thì không phân biệt được báo cáo của đợt này với đợt trước).
CREATE OR REPLACE FUNCTION public.moderation_open_reporters(p_type text, p_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT reporter_id), '{}')
  FROM public.community_reports
  WHERE status = 'open'
    AND ((p_type = 'post' AND post_id = p_id) OR (p_type = 'comment' AND comment_id = p_id))
$$;
REVOKE EXECUTE ON FUNCTION public.moderation_open_reporters(text, uuid) FROM PUBLIC, anon, authenticated;

/* ── 1c. năm quyết định: như bản 20261007130000, thêm thông báo ở cuối ── */
-- Mỗi quyết định giữ nguyên mọi luật (khoá đích, kiểm trạng thái, đóng báo
-- cáo / kháng nghị, ghi nhật ký). Thông báo chỉ thêm sau khi nhật ký đã ghi,
-- mỗi lần ghi trong khối EXCEPTION riêng.

CREATE OR REPLACE FUNCTION public.mod_hide(p_type text, p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.moderation_require(false);
  t record;
  n integer;
  v_reporters uuid[];
  v_r uuid;
BEGIN
  t := public.moderation_lock_target(p_type, p_id);
  IF t.hidden THEN
    RAISE EXCEPTION 'already hidden' USING ERRCODE = '22023';
  END IF;
  v_reporters := public.moderation_open_reporters(p_type, p_id);
  PERFORM public.moderation_apply(p_type, p_id, true, NULL);
  n := public.moderation_close_reports(p_type, p_id, 'actioned');
  PERFORM public.moderation_log(v_actor, CASE p_type WHEN 'post' THEN 'HIDE_POST' ELSE 'HIDE_COMMENT' END,
                                p_type, p_id, p_reason, jsonb_build_object('reports_closed', n));
  BEGIN
    PERFORM public.moderation_notify(t.author_id, p_type, p_id, 'hidden', p_reason);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  -- Ẩn đóng báo cáo thành `actioned` nên người báo nghe "đã xử lý" ở đây —
  -- khôi phục sau đó không còn báo cáo mở để tìm họ nữa.
  FOREACH v_r IN ARRAY v_reporters LOOP
    BEGIN
      PERFORM public.moderation_notify(v_r, p_type, p_id, 'report_actioned', p_reason);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.mod_restore(p_type text, p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.moderation_require(false);
  t record;
  n integer;
  v_reporters uuid[];
  v_r uuid;
BEGIN
  t := public.moderation_lock_target(p_type, p_id);
  IF NOT t.hidden THEN
    RAISE EXCEPTION 'not hidden' USING ERRCODE = '22023';
  END IF;
  -- Gỡ là quyết định cuối: chỉ admin hoàn tác.
  IF t.removed AND public.app_role_of(v_actor) <> 'admin' THEN
    RAISE EXCEPTION 'forbidden: only an admin can restore removed content' USING ERRCODE = '42501';
  END IF;
  v_reporters := public.moderation_open_reporters(p_type, p_id);
  PERFORM public.moderation_apply(p_type, p_id, false, NULL);
  n := public.moderation_close_reports(p_type, p_id, 'dismissed');
  PERFORM public.moderation_close_appeals(p_type, p_id, ARRAY['open', 'upheld'], 'restored', v_actor);
  PERFORM public.moderation_log(v_actor, CASE p_type WHEN 'post' THEN 'RESTORE_POST' ELSE 'RESTORE_COMMENT' END,
                                p_type, p_id, p_reason, jsonb_build_object('reports_dismissed', n, 'was_removed', t.removed));
  BEGIN
    PERFORM public.moderation_notify(t.author_id, p_type, p_id, 'restored', p_reason);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  FOREACH v_r IN ARRAY v_reporters LOOP
    BEGIN
      PERFORM public.moderation_notify(v_r, p_type, p_id, 'report_dismissed', p_reason);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.mod_remove(p_type text, p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.moderation_require(false);
  t record;
  n integer;
  v_reporters uuid[];
  v_r uuid;
BEGIN
  -- Quyết định phá huỷ thì phải nói vì sao — lý do là thứ người đọc nhật ký cần.
  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'a reason is required to remove content' USING ERRCODE = '22023';
  END IF;
  t := public.moderation_lock_target(p_type, p_id);
  IF t.removed THEN
    RAISE EXCEPTION 'already removed' USING ERRCODE = '22023';
  END IF;
  v_reporters := public.moderation_open_reporters(p_type, p_id);
  PERFORM public.moderation_apply(p_type, p_id, true, v_actor);
  n := public.moderation_close_reports(p_type, p_id, 'actioned');
  PERFORM public.moderation_close_appeals(p_type, p_id, ARRAY['open'], 'upheld', v_actor);
  PERFORM public.moderation_log(v_actor, CASE p_type WHEN 'post' THEN 'REMOVE_POST' ELSE 'REMOVE_COMMENT' END,
                                p_type, p_id, p_reason, jsonb_build_object('reports_closed', n));
  BEGIN
    PERFORM public.moderation_notify(t.author_id, p_type, p_id, 'removed', p_reason);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  FOREACH v_r IN ARRAY v_reporters LOOP
    BEGIN
      PERFORM public.moderation_notify(v_r, p_type, p_id, 'report_actioned', p_reason);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END;
$$;

-- Bác báo cáo trên một đích VẪN ĐANG HIỆN. Đích đang ẩn thì quyết định là khôi
-- phục hay gỡ, không phải "bác báo cáo" — để không ai bác hết báo cáo mà bỏ
-- quên một bài ẩn không lý do.
CREATE OR REPLACE FUNCTION public.mod_dismiss(p_type text, p_id uuid, p_reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.moderation_require(false);
  t record;
  n integer;
  v_reporters uuid[];
  v_r uuid;
BEGIN
  t := public.moderation_lock_target(p_type, p_id);
  IF t.hidden THEN
    RAISE EXCEPTION 'target is hidden: restore or remove it instead' USING ERRCODE = '22023';
  END IF;
  v_reporters := public.moderation_open_reporters(p_type, p_id);
  n := public.moderation_close_reports(p_type, p_id, 'dismissed');
  IF n = 0 THEN
    RAISE EXCEPTION 'no open reports' USING ERRCODE = '22023';
  END IF;
  PERFORM public.moderation_log(v_actor, 'DISMISS_REPORT', p_type, p_id, p_reason, jsonb_build_object('reports_dismissed', n));
  -- Tác giả không bị báo: nội dung của họ vẫn hiện, không có gì thay đổi với họ.
  FOREACH v_r IN ARRAY v_reporters LOOP
    BEGIN
      PERFORM public.moderation_notify(v_r, p_type, p_id, 'report_dismissed', p_reason);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.mod_decide_appeal(p_appeal uuid, p_approve boolean, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.moderation_require(false);
  q community_review_requests%ROWTYPE;
  v_type text;
  v_id uuid;
  t record;
  n integer;
BEGIN
  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'p_approve is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO q FROM community_review_requests WHERE id = p_appeal FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appeal not found' USING ERRCODE = 'P0002';
  END IF;
  IF q.status <> 'open' THEN
    RAISE EXCEPTION 'appeal already decided' USING ERRCODE = '22023';
  END IF;
  v_type := CASE WHEN q.post_id IS NOT NULL THEN 'post' ELSE 'comment' END;
  v_id := coalesce(q.post_id, q.comment_id);
  t := public.moderation_lock_target(v_type, v_id);
  IF p_approve THEN
    PERFORM public.moderation_apply(v_type, v_id, false, NULL);
    n := public.moderation_close_reports(v_type, v_id, 'dismissed');
    PERFORM public.moderation_close_appeals(v_type, v_id, ARRAY['open', 'upheld'], 'restored', v_actor);
  ELSE
    n := public.moderation_close_reports(v_type, v_id, 'actioned');
    PERFORM public.moderation_close_appeals(v_type, v_id, ARRAY['open'], 'upheld', v_actor);
  END IF;
  PERFORM public.moderation_log(v_actor, CASE WHEN p_approve THEN 'APPROVE_APPEAL' ELSE 'REJECT_APPEAL' END,
                                'appeal', p_appeal, p_reason,
                                jsonb_build_object('target_type', v_type, 'target_id', v_id, 'reports_closed', n));
  -- Người kháng nghị là tác giả (chỉ tác giả kháng nghị được nội dung của mình).
  BEGIN
    PERFORM public.moderation_notify(
      t.author_id, v_type, v_id, CASE WHEN p_approve THEN 'appeal_approved' ELSE 'appeal_rejected' END, p_reason);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END;
$$;

/* ── 2. `mod_target`: như bản 20261007220000 (giữ `counted`), thêm
   `author_stats` + `restriction` ── */
CREATE OR REPLACE FUNCTION public.mod_target(p_type text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.moderation_require(false);
  v_target jsonb;
  v_author uuid;
BEGIN
  IF p_type = 'post' THEN
    SELECT jsonb_build_object('id', p.id, 'kind', p.kind, 'caption', p.caption, 'payload', p.payload,
             'visibility', p.visibility, 'hidden', p.hidden, 'removed_at', p.removed_at,
             'like_count', p.like_count, 'comment_count', p.comment_count, 'created_at', p.created_at), p.author_id
      INTO v_target, v_author FROM community_posts p WHERE p.id = p_id;
  ELSIF p_type = 'comment' THEN
    SELECT jsonb_build_object('id', c.id, 'body', c.body, 'post_id', c.post_id, 'hidden', c.hidden,
             'removed_at', c.removed_at, 'created_at', c.created_at), c.author_id
      INTO v_target, v_author FROM community_comments c WHERE c.id = p_id;
  ELSE
    RAISE EXCEPTION 'target type must be post or comment' USING ERRCODE = '22023';
  END IF;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'target not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object(
    'type', p_type,
    'target', v_target,
    'author', (SELECT jsonb_build_object('user_id', cp.user_id, 'handle', cp.handle, 'display_name', cp.display_name,
                        'role', public.app_role_of(cp.user_id))
                 FROM community_profiles cp WHERE cp.user_id = v_author),
    -- Dải lịch sử tác giả (nghiên cứu 17/11, mẫu 4: 84% người kiểm duyệt rời
    -- hàng đợi để xem lịch sử — đặt nó ngay trên màn chi tiết). Cùng truy vấn
    -- với `admin_users`.
    'author_stats', jsonb_build_object(
      'posts', (SELECT count(*) FROM community_posts p WHERE p.author_id = v_author),
      'hidden_posts', (SELECT count(*) FROM community_posts p WHERE p.author_id = v_author AND p.hidden AND p.removed_at IS NULL),
      'removed_posts', (SELECT count(*) FROM community_posts p WHERE p.author_id = v_author AND p.removed_at IS NOT NULL),
      'open_reports_against', (SELECT count(*) FROM community_reports r
                                LEFT JOIN community_posts p ON p.id = r.post_id
                                LEFT JOIN community_comments c ON c.id = r.comment_id
                                WHERE r.status = 'open' AND coalesce(p.author_id, c.author_id) = v_author),
      'reports_filed', (SELECT count(*) FROM community_reports r WHERE r.reporter_id = v_author)),
    -- Tạm khoá đăng đang còn hiệu lực (như `mod_user_restriction`): `null` khi
    -- không bị khoá — màn chi tiết không cần gọi thêm.
    'restriction', (SELECT jsonb_build_object('until', r.until, 'reason', r.reason, 'created_at', r.created_at)
                      FROM public.community_restrictions r WHERE r.user_id = v_author AND r.until > now()),
    'reports', coalesce((SELECT jsonb_agg(jsonb_build_object(
                 'id', r.id, 'reason', r.reason, 'note', r.note, 'status', r.status, 'created_at', r.created_at,
                 'counted', r.counted,
                 'reporter', (SELECT jsonb_build_object('user_id', cp.user_id, 'handle', cp.handle)
                                FROM community_profiles cp WHERE cp.user_id = r.reporter_id))
                 ORDER BY r.created_at DESC)
               FROM community_reports r
               WHERE (p_type = 'post' AND r.post_id = p_id) OR (p_type = 'comment' AND r.comment_id = p_id)), '[]'::jsonb),
    'appeals', coalesce((SELECT jsonb_agg(jsonb_build_object(
                 'id', q.id, 'status', q.status, 'message', q.message, 'created_at', q.created_at,
                 'decided_at', q.decided_at, 'decided_by', q.decided_by)
                 ORDER BY q.created_at DESC)
               FROM community_review_requests q
               WHERE (p_type = 'post' AND q.post_id = p_id) OR (p_type = 'comment' AND q.comment_id = p_id)), '[]'::jsonb),
    'history', coalesce((SELECT jsonb_agg(jsonb_build_object(
                 'id', a.id, 'action', a.action, 'reason', a.reason, 'actor_role', a.actor_role, 'created_at', a.created_at,
                 'actor', (SELECT jsonb_build_object('user_id', cp.user_id, 'handle', cp.handle)
                             FROM community_profiles cp WHERE cp.user_id = a.actor_id))
                 ORDER BY a.id DESC)
               FROM moderation_audit_log a
               WHERE (a.target_type = p_type AND a.target_id = p_id)
                  OR (a.target_type = 'appeal' AND a.metadata->>'target_id' = p_id::text)), '[]'::jsonb)
  );
END;
$$;

/* ── 3. báo cáo của chính mình, kèm trích nội dung đích ── */
CREATE OR REPLACE FUNCTION public.community_my_reports()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id,
      'reason', r.reason, 'note', r.note, 'status', r.status, 'created_at', r.created_at,
      'target_type', CASE WHEN r.post_id IS NOT NULL THEN 'post'
                          WHEN r.comment_id IS NOT NULL THEN 'comment' ELSE 'user' END,
      'target_id', coalesce(r.post_id, r.comment_id, r.reported_user_id),
      'excerpt', coalesce(
        (SELECT left(p.caption, 160) FROM community_posts p WHERE p.id = r.post_id),
        (SELECT left(c.body, 160) FROM community_comments c WHERE c.id = r.comment_id),
        (SELECT cp.display_name FROM community_profiles cp WHERE cp.user_id = r.reported_user_id)),
      'removed', coalesce(
        (SELECT p.removed_at IS NOT NULL FROM community_posts p WHERE p.id = r.post_id),
        (SELECT c.removed_at IS NOT NULL FROM community_comments c WHERE c.id = r.comment_id),
        false))
      ORDER BY r.created_at DESC)
    FROM community_reports r WHERE r.reporter_id = v_uid), '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.community_my_reports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_my_reports() TO authenticated;
