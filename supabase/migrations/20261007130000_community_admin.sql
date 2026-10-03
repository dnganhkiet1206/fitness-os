-- Vận hành Cộng đồng: vai trò, kiểm duyệt, nhật ký kiểm toán (A, 03/10).
--
-- ── không có hệ thống đăng nhập thứ hai ──
--
-- Người kiểm duyệt và admin là NGƯỜI DÙNG Supabase Auth như mọi người, đăng
-- nhập bằng đúng phiên của app. Vai trò là một hàng trong `app_roles`; không có
-- hàng = người dùng thường. Không email nào được viết cứng ở đâu cả.
--
-- ── quyền nằm ở database, không ở nút bấm ──
--
-- Mọi việc của bảng điều khiển là một hàm SECURITY DEFINER tự hỏi vai trò của
-- `auth.uid()` trước khi làm gì (`moderation_require`). Client không có policy
-- GHI nào trên `app_roles` hay `moderation_audit_log`, và không đọc được nhật ký
-- trực tiếp. Ẩn một nút ở client không cho ai thêm quyền nào.
--
-- 42501 cho cả "chưa đăng nhập" lẫn "không đủ quyền": PostgREST trả 401 cho vai
-- anon và 403 cho người đã đăng nhập; token sai chữ ký hoặc hết hạn bị PostgREST
-- từ chối 401 trước khi tới đây.
--
-- ── admin đầu tiên ──
--
-- `bootstrap_first_admin(email)` chỉ chạy được bằng quyền server (postgres /
-- service_role — client KHÔNG được cấp), và chỉ khi chưa có admin nào. Sau đó
-- admin cấp vai trò cho người khác qua `admin_set_role`. Xem docs/ADMIN.md.
--
-- ── hai lỗi của luồng báo cáo cũ được sửa ở đây ──
--
--   • Tự ẩn đếm MỌI báo cáo, kể cả báo cáo đã bị bác: khôi phục một bài xong,
--     chỉ cần thêm MỘT báo cáo là bài lại ẩn. Nay chỉ đếm báo cáo đang mở.
--   • Mỗi bài chỉ được xin xem lại MỘT lần trong đời (UNIQUE(post_id)): bị ẩn
--     lần hai thì tác giả hết đường kháng nghị. Nay một yêu cầu cho mỗi ĐỢT ẩn.


/* ── 1. vai trò ── */
CREATE TABLE public.app_roles (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('moderator', 'admin')),
  -- Không khoá ngoại: người cấp có thể xoá tài khoản sau này; lịch sử thật ở
  -- nhật ký kiểm toán.
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;
-- Mỗi người đọc được vai trò của CHÍNH mình (để app biết có hiện lối vào bảng
-- điều khiển không). Không policy ghi nào.
CREATE POLICY "Users read their own role"
  ON public.app_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.app_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.app_roles TO authenticated;

CREATE OR REPLACE FUNCTION public.app_role_of(p_user uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT role FROM public.app_roles WHERE user_id = p_user), 'user')
$$;
REVOKE EXECUTE ON FUNCTION public.app_role_of(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_app_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  RETURN public.app_role_of(auth.uid());
END;
$$;
REVOKE EXECUTE ON FUNCTION public.my_app_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_app_role() TO authenticated;

-- Cửa duy nhất của mọi hàm quản trị. Trả về người gọi khi đủ quyền.
CREATE OR REPLACE FUNCTION public.moderation_require(p_admin boolean)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  v_role := public.app_role_of(v_uid);
  IF v_role = 'admin' OR (NOT p_admin AND v_role = 'moderator') THEN
    RETURN v_uid;
  END IF;
  RAISE EXCEPTION 'forbidden: % role required', CASE WHEN p_admin THEN 'admin' ELSE 'moderator' END
    USING ERRCODE = '42501';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.moderation_require(boolean) FROM PUBLIC, anon, authenticated;


/* ── 2. nhật ký kiểm toán: chỉ thêm, không sửa, không xoá ── */
CREATE TABLE public.moderation_audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- NULL = hệ thống (lần cấp admin đầu tiên). Không khoá ngoại: xoá tài khoản
  -- của người làm không được xoá hay sửa dấu vết việc họ đã làm.
  actor_id    uuid,
  actor_role  text NOT NULL CHECK (actor_role IN ('system', 'moderator', 'admin')),
  action      text NOT NULL CHECK (action IN (
                'HIDE_POST', 'RESTORE_POST', 'REMOVE_POST',
                'HIDE_COMMENT', 'RESTORE_COMMENT', 'REMOVE_COMMENT',
                'DISMISS_REPORT', 'APPROVE_APPEAL', 'REJECT_APPEAL',
                'ADD_IMAGE', 'REMOVE_IMAGE', 'RESTORE_IMAGE', 'ROLE_CHANGE')),
  target_type text NOT NULL CHECK (target_type IN ('post', 'comment', 'appeal', 'image', 'user')),
  target_id   uuid NOT NULL,
  reason      text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 500),
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX moderation_audit_log_target ON public.moderation_audit_log (target_type, target_id, created_at DESC);
CREATE INDEX moderation_audit_log_recent ON public.moderation_audit_log (created_at DESC);

ALTER TABLE public.moderation_audit_log ENABLE ROW LEVEL SECURITY;
-- Không policy nào: client không đọc, không ghi. Đọc qua `admin_audit` (admin).
REVOKE ALL ON public.moderation_audit_log FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.moderation_audit_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'moderation_audit_log is append-only' USING ERRCODE = '42501';
END;
$$;
-- Áp cho MỌI vai, kể cả service_role và chủ bảng: sửa lịch sử là việc không ai
-- được làm qua đường thường.
CREATE TRIGGER moderation_audit_no_update_delete
  BEFORE UPDATE OR DELETE ON public.moderation_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.moderation_audit_immutable();
CREATE TRIGGER moderation_audit_no_truncate
  BEFORE TRUNCATE ON public.moderation_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.moderation_audit_immutable();
REVOKE EXECUTE ON FUNCTION public.moderation_audit_immutable() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.moderation_log(
  p_actor uuid, p_action text, p_type text, p_id uuid, p_reason text, p_meta jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.moderation_audit_log (actor_id, actor_role, action, target_type, target_id, reason, metadata)
  VALUES (p_actor,
          CASE WHEN p_actor IS NULL THEN 'system' ELSE public.app_role_of(p_actor) END,
          p_action, p_type, p_id, coalesce(btrim(p_reason), ''), coalesce(p_meta, '{}'::jsonb))
$$;
REVOKE EXECUTE ON FUNCTION public.moderation_log(uuid, text, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;


/* ── 3. trạng thái kiểm duyệt của bài và bình luận ── */
-- "Gỡ" là quyết định cuối của đội kiểm duyệt: vẫn ẩn, không xin xem lại được,
-- và chỉ admin hoàn tác. Hàng không bị xoá — báo cáo, yêu cầu và nhật ký vẫn
-- trỏ được vào nó.
ALTER TABLE public.community_posts
  ADD COLUMN removed_at timestamptz,
  ADD COLUMN removed_by uuid,
  ADD CONSTRAINT community_posts_removed_is_hidden CHECK (removed_at IS NULL OR hidden);
ALTER TABLE public.community_comments
  ADD COLUMN removed_at timestamptz,
  ADD COLUMN removed_by uuid,
  ADD CONSTRAINT community_comments_removed_is_hidden CHECK (removed_at IS NULL OR hidden);

-- Sửa lỗi 1: chỉ báo cáo ĐANG MỞ mới tính vào ngưỡng tự ẩn.
CREATE OR REPLACE FUNCTION public.community_reports_autohide()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.post_id IS NOT NULL AND (
    SELECT count(DISTINCT reporter_id) FROM public.community_reports WHERE post_id = NEW.post_id AND status = 'open'
  ) >= 3 THEN
    UPDATE public.community_posts SET hidden = true WHERE id = NEW.post_id;
  END IF;
  IF NEW.comment_id IS NOT NULL AND (
    SELECT count(DISTINCT reporter_id) FROM public.community_reports WHERE comment_id = NEW.comment_id AND status = 'open'
  ) >= 3 THEN
    UPDATE public.community_comments SET hidden = true WHERE id = NEW.comment_id;
  END IF;
  RETURN NEW;
END;
$$;


/* ── 4. kháng nghị: một yêu cầu cho mỗi đợt ẩn, có lời nhắn ── */
ALTER TABLE public.community_review_requests
  ADD COLUMN message    text NOT NULL DEFAULT '' CHECK (char_length(message) <= 500),
  ADD COLUMN decided_by uuid,
  ADD COLUMN decided_at timestamptz;

-- Sửa lỗi 2. `open` = đang chờ, `upheld` = đã xem và giữ nguyên ẩn: cả hai chặn
-- yêu cầu mới. Khôi phục (bởi người kiểm duyệt hay do chấp nhận kháng nghị) đưa
-- mọi yêu cầu của đích về `restored`, nên đợt ẩn SAU lại có một lần kháng nghị.
ALTER TABLE public.community_review_requests DROP CONSTRAINT community_review_requests_one_per_post;
ALTER TABLE public.community_review_requests DROP CONSTRAINT community_review_requests_one_per_comment;
CREATE UNIQUE INDEX community_review_requests_one_live_per_post
  ON public.community_review_requests (post_id) WHERE status IN ('open', 'upheld');
CREATE UNIQUE INDEX community_review_requests_one_live_per_comment
  ON public.community_review_requests (comment_id) WHERE status IN ('open', 'upheld');

-- Như bản 20261004120000, thêm: bài / bình luận đã bị GỠ không xin xem lại được.
CREATE OR REPLACE FUNCTION public.community_request_review(p_post_id uuid DEFAULT NULL, p_comment_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  IF num_nonnulls(p_post_id, p_comment_id) <> 1 THEN
    RAISE EXCEPTION 'exactly one of post or comment' USING ERRCODE = '22023';
  END IF;
  IF p_post_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM community_posts WHERE id = p_post_id AND author_id = auth.uid() AND hidden
      AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'no hidden post of yours' USING ERRCODE = 'P0002';
  END IF;
  IF p_comment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM community_comments WHERE id = p_comment_id AND author_id = auth.uid() AND hidden
      AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'no hidden comment of yours' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO community_review_requests (requester_id, post_id, comment_id)
  VALUES (auth.uid(), p_post_id, p_comment_id);
END;
$$;

-- Kháng nghị kèm lời nhắn: đúng các luật của `community_request_review`, rồi
-- ghi lời nhắn vào yêu cầu vừa tạo. Tên riêng, không phải một overload — hai
-- hàm cùng tên khác số đối số làm PostgREST nhập nhằng khi gọi theo tên.
CREATE OR REPLACE FUNCTION public.community_appeal(p_post_id uuid, p_comment_id uuid, p_message text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF char_length(coalesce(p_message, '')) > 500 THEN
    RAISE EXCEPTION 'message too long' USING ERRCODE = '22023';
  END IF;
  PERFORM public.community_request_review(p_post_id, p_comment_id);
  UPDATE community_review_requests SET message = coalesce(btrim(p_message), '')
  WHERE requester_id = auth.uid() AND status = 'open'
    AND post_id IS NOT DISTINCT FROM p_post_id AND comment_id IS NOT DISTINCT FROM p_comment_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.community_appeal(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_appeal(uuid, uuid, text) TO authenticated;

-- Lý do ẩn của chính mình: như bản 20261004120000, thêm `removed` và
-- `review_upheld`; "đã yêu cầu" chỉ tính yêu cầu ĐANG CHỜ của đợt ẩn này.
-- Đổi kiểu trả về nên phải DROP rồi tạo lại (CREATE OR REPLACE không đổi được).
DROP FUNCTION public.community_my_hidden_reasons();
CREATE FUNCTION public.community_my_hidden_reasons()
RETURNS TABLE (post_id uuid, comment_id uuid, reporters integer, top_reason text, review_requested boolean,
               removed boolean, review_upheld boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH mine AS (
    SELECT p.id AS post_id, NULL::uuid AS comment_id, p.removed_at IS NOT NULL AS removed FROM community_posts p
     WHERE p.author_id = auth.uid() AND p.hidden
    UNION ALL
    SELECT NULL::uuid, c.id, c.removed_at IS NOT NULL FROM community_comments c
     WHERE c.author_id = auth.uid() AND c.hidden
  ),
  counted AS (
    SELECT m.post_id, m.comment_id, r.reason, count(DISTINCT r.reporter_id) AS n
      FROM mine m
      JOIN community_reports r
        ON (m.post_id IS NOT NULL AND r.post_id = m.post_id)
        OR (m.comment_id IS NOT NULL AND r.comment_id = m.comment_id)
     GROUP BY m.post_id, m.comment_id, r.reason
  )
  SELECT m.post_id, m.comment_id,
         coalesce((SELECT count(DISTINCT r.reporter_id)::int FROM community_reports r
                    WHERE (m.post_id IS NOT NULL AND r.post_id = m.post_id)
                       OR (m.comment_id IS NOT NULL AND r.comment_id = m.comment_id)), 0),
         (SELECT k.reason FROM counted k
           WHERE k.post_id IS NOT DISTINCT FROM m.post_id AND k.comment_id IS NOT DISTINCT FROM m.comment_id
           ORDER BY k.n DESC, array_position(ARRAY['harassment', 'inappropriate', 'misleading', 'spam', 'other'], k.reason)
           LIMIT 1),
         EXISTS (SELECT 1 FROM community_review_requests q
                  WHERE ((m.post_id IS NOT NULL AND q.post_id = m.post_id)
                     OR (m.comment_id IS NOT NULL AND q.comment_id = m.comment_id))
                    AND q.status = 'open'),
         m.removed,
         EXISTS (SELECT 1 FROM community_review_requests q
                  WHERE ((m.post_id IS NOT NULL AND q.post_id = m.post_id)
                     OR (m.comment_id IS NOT NULL AND q.comment_id = m.comment_id))
                    AND q.status = 'upheld')
    FROM mine m
$$;
REVOKE ALL ON FUNCTION public.community_my_hidden_reasons() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_my_hidden_reasons() TO authenticated;


/* ── 5. việc của người kiểm duyệt (moderator hoặc admin) ── */

-- Một bài hoặc một bình luận, khoá dòng: hai người kiểm duyệt bấm cùng lúc thì
-- người sau thấy trạng thái người trước để lại, không ghi đè mù.
CREATE OR REPLACE FUNCTION public.moderation_lock_target(p_type text, p_id uuid,
  OUT hidden boolean, OUT removed boolean, OUT author_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_type = 'post' THEN
    SELECT p.hidden, p.removed_at IS NOT NULL, p.author_id INTO hidden, removed, author_id
    FROM community_posts p WHERE p.id = p_id FOR UPDATE;
  ELSIF p_type = 'comment' THEN
    SELECT c.hidden, c.removed_at IS NOT NULL, c.author_id INTO hidden, removed, author_id
    FROM community_comments c WHERE c.id = p_id FOR UPDATE;
  ELSE
    RAISE EXCEPTION 'target type must be post or comment' USING ERRCODE = '22023';
  END IF;
  IF author_id IS NULL THEN
    RAISE EXCEPTION 'target not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.moderation_lock_target(text, uuid) FROM PUBLIC, anon, authenticated;

-- Đặt trạng thái của đích (dùng chung cho hide / restore / remove).
CREATE OR REPLACE FUNCTION public.moderation_apply(p_type text, p_id uuid, p_hidden boolean, p_removed_by uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_type = 'post' THEN
    UPDATE community_posts SET hidden = p_hidden,
      removed_at = CASE WHEN p_removed_by IS NULL THEN NULL ELSE now() END, removed_by = p_removed_by
    WHERE id = p_id;
  ELSE
    UPDATE community_comments SET hidden = p_hidden,
      removed_at = CASE WHEN p_removed_by IS NULL THEN NULL ELSE now() END, removed_by = p_removed_by
    WHERE id = p_id;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.moderation_apply(text, uuid, boolean, uuid) FROM PUBLIC, anon, authenticated;

-- Đóng báo cáo đang mở của một đích, trả số báo cáo đã đóng.
CREATE OR REPLACE FUNCTION public.moderation_close_reports(p_type text, p_id uuid, p_status text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE community_reports SET status = p_status
  WHERE status = 'open'
    AND ((p_type = 'post' AND post_id = p_id) OR (p_type = 'comment' AND comment_id = p_id));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.moderation_close_reports(text, uuid, text) FROM PUBLIC, anon, authenticated;

-- Đưa yêu cầu xem lại của một đích sang trạng thái mới. `p_from` là các trạng
-- thái được chuyển (khôi phục: cả 'open' lẫn 'upheld'; gỡ / từ chối: 'open').
CREATE OR REPLACE FUNCTION public.moderation_close_appeals(p_type text, p_id uuid, p_from text[], p_to text, p_actor uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE community_review_requests SET status = p_to, decided_by = p_actor, decided_at = now()
  WHERE status = ANY (p_from)
    AND ((p_type = 'post' AND post_id = p_id) OR (p_type = 'comment' AND comment_id = p_id))
$$;
REVOKE EXECUTE ON FUNCTION public.moderation_close_appeals(text, uuid, text[], text, uuid) FROM PUBLIC, anon, authenticated;

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
BEGIN
  t := public.moderation_lock_target(p_type, p_id);
  IF t.hidden THEN
    RAISE EXCEPTION 'already hidden' USING ERRCODE = '22023';
  END IF;
  PERFORM public.moderation_apply(p_type, p_id, true, NULL);
  n := public.moderation_close_reports(p_type, p_id, 'actioned');
  PERFORM public.moderation_log(v_actor, CASE p_type WHEN 'post' THEN 'HIDE_POST' ELSE 'HIDE_COMMENT' END,
                                p_type, p_id, p_reason, jsonb_build_object('reports_closed', n));
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
BEGIN
  t := public.moderation_lock_target(p_type, p_id);
  IF NOT t.hidden THEN
    RAISE EXCEPTION 'not hidden' USING ERRCODE = '22023';
  END IF;
  -- Gỡ là quyết định cuối: chỉ admin hoàn tác.
  IF t.removed AND public.app_role_of(v_actor) <> 'admin' THEN
    RAISE EXCEPTION 'forbidden: only an admin can restore removed content' USING ERRCODE = '42501';
  END IF;
  PERFORM public.moderation_apply(p_type, p_id, false, NULL);
  n := public.moderation_close_reports(p_type, p_id, 'dismissed');
  PERFORM public.moderation_close_appeals(p_type, p_id, ARRAY['open', 'upheld'], 'restored', v_actor);
  PERFORM public.moderation_log(v_actor, CASE p_type WHEN 'post' THEN 'RESTORE_POST' ELSE 'RESTORE_COMMENT' END,
                                p_type, p_id, p_reason, jsonb_build_object('reports_dismissed', n, 'was_removed', t.removed));
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
BEGIN
  -- Quyết định phá huỷ thì phải nói vì sao — lý do là thứ người đọc nhật ký cần.
  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'a reason is required to remove content' USING ERRCODE = '22023';
  END IF;
  t := public.moderation_lock_target(p_type, p_id);
  IF t.removed THEN
    RAISE EXCEPTION 'already removed' USING ERRCODE = '22023';
  END IF;
  PERFORM public.moderation_apply(p_type, p_id, true, v_actor);
  n := public.moderation_close_reports(p_type, p_id, 'actioned');
  PERFORM public.moderation_close_appeals(p_type, p_id, ARRAY['open'], 'upheld', v_actor);
  PERFORM public.moderation_log(v_actor, CASE p_type WHEN 'post' THEN 'REMOVE_POST' ELSE 'REMOVE_COMMENT' END,
                                p_type, p_id, p_reason, jsonb_build_object('reports_closed', n));
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
BEGIN
  t := public.moderation_lock_target(p_type, p_id);
  IF t.hidden THEN
    RAISE EXCEPTION 'target is hidden: restore or remove it instead' USING ERRCODE = '22023';
  END IF;
  n := public.moderation_close_reports(p_type, p_id, 'dismissed');
  IF n = 0 THEN
    RAISE EXCEPTION 'no open reports' USING ERRCODE = '22023';
  END IF;
  PERFORM public.moderation_log(v_actor, 'DISMISS_REPORT', p_type, p_id, p_reason, jsonb_build_object('reports_dismissed', n));
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
END;
$$;

-- Bảng điều khiển: chỉ số vận hành, không phân tích.
CREATE OR REPLACE FUNCTION public.mod_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.moderation_require(false);
BEGIN
  RETURN jsonb_build_object(
    'pending_reports', (SELECT count(*) FROM (
        SELECT DISTINCT coalesce(post_id, comment_id) FROM community_reports
         WHERE status = 'open' AND num_nonnulls(post_id, comment_id) = 1) x),
    'pending_appeals', (SELECT count(*) FROM community_review_requests WHERE status = 'open'),
    'hidden_posts', (SELECT count(*) FROM community_posts WHERE hidden AND removed_at IS NULL),
    'hidden_comments', (SELECT count(*) FROM community_comments WHERE hidden AND removed_at IS NULL),
    'removed_posts', (SELECT count(*) FROM community_posts WHERE removed_at IS NOT NULL),
    'reports_today', (SELECT count(*) FROM community_reports WHERE created_at >= date_trunc('day', now())),
    'recent', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'action', a.action, 'target_type', a.target_type, 'target_id', a.target_id,
               'reason', a.reason, 'created_at', a.created_at, 'actor_role', a.actor_role,
               'actor', (SELECT jsonb_build_object('user_id', cp.user_id, 'handle', cp.handle, 'display_name', cp.display_name)
                           FROM community_profiles cp WHERE cp.user_id = a.actor_id))
             ORDER BY a.id DESC)
        FROM (SELECT * FROM moderation_audit_log ORDER BY id DESC LIMIT 10) a), '[]'::jsonb)
  );
END;
$$;

-- Hàng đợi báo cáo, gom theo đích: một bài ba người báo là MỘT việc.
CREATE OR REPLACE FUNCTION public.mod_reports(p_status text DEFAULT 'open', p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.moderation_require(false);
BEGIN
  IF p_status NOT IN ('open', 'actioned', 'dismissed') THEN
    RAISE EXCEPTION 'status must be open, actioned or dismissed' USING ERRCODE = '22023';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row ORDER BY (row->>'last_at') DESC)
    FROM (
      SELECT jsonb_build_object(
        'target_type', g.target_type,
        'target_id', g.target_id,
        'report_count', g.n,
        'reasons', (SELECT jsonb_object_agg(x.reason, x.n) FROM (
                      SELECT r2.reason, count(DISTINCT r2.reporter_id) AS n FROM community_reports r2
                       WHERE r2.status = p_status AND coalesce(r2.post_id, r2.comment_id) = g.target_id
                       GROUP BY r2.reason) x),
        'last_at', g.last_at,
        'target', CASE g.target_type
          WHEN 'post' THEN (SELECT jsonb_build_object('kind', p.kind, 'caption', left(p.caption, 160), 'hidden', p.hidden,
                                   'removed', p.removed_at IS NOT NULL, 'author_id', p.author_id, 'created_at', p.created_at)
                              FROM community_posts p WHERE p.id = g.target_id)
          ELSE (SELECT jsonb_build_object('body', left(c.body, 160), 'post_id', c.post_id, 'hidden', c.hidden,
                       'removed', c.removed_at IS NOT NULL, 'author_id', c.author_id, 'created_at', c.created_at)
                  FROM community_comments c WHERE c.id = g.target_id) END,
        'author', (SELECT jsonb_build_object('user_id', cp.user_id, 'handle', cp.handle, 'display_name', cp.display_name)
                     FROM community_profiles cp
                    WHERE cp.user_id = coalesce(
                      (SELECT p.author_id FROM community_posts p WHERE p.id = g.target_id),
                      (SELECT c.author_id FROM community_comments c WHERE c.id = g.target_id))),
        'appeal', (SELECT jsonb_build_object('id', q.id, 'status', q.status, 'created_at', q.created_at)
                     FROM community_review_requests q
                    WHERE coalesce(q.post_id, q.comment_id) = g.target_id
                    ORDER BY q.created_at DESC LIMIT 1)
      ) AS row
      FROM (
        SELECT CASE WHEN r.post_id IS NOT NULL THEN 'post' ELSE 'comment' END AS target_type,
               coalesce(r.post_id, r.comment_id) AS target_id,
               count(DISTINCT r.reporter_id) AS n,
               max(r.created_at) AS last_at
          FROM community_reports r
         WHERE r.status = p_status AND num_nonnulls(r.post_id, r.comment_id) = 1
         GROUP BY 1, 2
         ORDER BY max(r.created_at) DESC
         LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
      ) g
    ) s), '[]'::jsonb);
END;
$$;

-- Toàn bộ một đích: nội dung, tác giả, từng báo cáo (kể cả người báo — người
-- kiểm duyệt cần thấy một đợt báo cáo dồn từ một nhóm), kháng nghị và lịch sử.
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
    'reports', coalesce((SELECT jsonb_agg(jsonb_build_object(
                 'id', r.id, 'reason', r.reason, 'note', r.note, 'status', r.status, 'created_at', r.created_at,
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

-- Hàng đợi kháng nghị.
CREATE OR REPLACE FUNCTION public.mod_appeals(p_status text DEFAULT 'open', p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.moderation_require(false);
BEGIN
  IF p_status NOT IN ('open', 'restored', 'upheld') THEN
    RAISE EXCEPTION 'status must be open, restored or upheld' USING ERRCODE = '22023';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', q.id, 'status', q.status, 'message', q.message, 'created_at', q.created_at, 'decided_at', q.decided_at,
      'target_type', CASE WHEN q.post_id IS NOT NULL THEN 'post' ELSE 'comment' END,
      'target_id', coalesce(q.post_id, q.comment_id),
      'excerpt', coalesce((SELECT left(p.caption, 160) FROM community_posts p WHERE p.id = q.post_id),
                          (SELECT left(c.body, 160) FROM community_comments c WHERE c.id = q.comment_id)),
      'reports', (SELECT count(DISTINCT r.reporter_id) FROM community_reports r
                   WHERE coalesce(r.post_id, r.comment_id) = coalesce(q.post_id, q.comment_id)),
      'author', (SELECT jsonb_build_object('user_id', cp.user_id, 'handle', cp.handle, 'display_name', cp.display_name)
                   FROM community_profiles cp WHERE cp.user_id = q.requester_id))
      ORDER BY q.created_at)
    FROM (SELECT * FROM community_review_requests WHERE status = p_status
           ORDER BY created_at LIMIT greatest(1, least(coalesce(p_limit, 50), 200))) q), '[]'::jsonb);
END;
$$;


/* ── 6. việc chỉ admin làm ── */

CREATE OR REPLACE FUNCTION public.admin_audit(p_limit integer DEFAULT 100, p_before bigint DEFAULT NULL, p_action text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.moderation_require(true);
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', a.id, 'action', a.action, 'target_type', a.target_type, 'target_id', a.target_id, 'reason', a.reason,
      'metadata', a.metadata, 'actor_role', a.actor_role, 'created_at', a.created_at,
      'actor', (SELECT jsonb_build_object('user_id', cp.user_id, 'handle', cp.handle, 'display_name', cp.display_name)
                  FROM community_profiles cp WHERE cp.user_id = a.actor_id))
      ORDER BY a.id DESC)
    FROM (SELECT * FROM moderation_audit_log
           WHERE (p_before IS NULL OR id < p_before) AND (p_action IS NULL OR action = p_action)
           ORDER BY id DESC LIMIT greatest(1, least(coalesce(p_limit, 100), 500))) a), '[]'::jsonb);
END;
$$;

-- Email đọc qua to_jsonb để hàm vẫn chạy khi auth.users không có cột ấy (stub
-- của bộ test); trên Supabase thật nó có.
CREATE OR REPLACE FUNCTION public.admin_users(p_query text DEFAULT '', p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.moderation_require(true);
  q text := '%' || replace(replace(replace(coalesce(btrim(p_query), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(row ORDER BY row->>'handle' NULLS LAST)
    FROM (
      SELECT jsonb_build_object(
        'user_id', u.id,
        'email', to_jsonb(u)->>'email',
        'handle', cp.handle,
        'display_name', cp.display_name,
        'role', public.app_role_of(u.id),
        'posts', (SELECT count(*) FROM community_posts p WHERE p.author_id = u.id),
        'hidden_posts', (SELECT count(*) FROM community_posts p WHERE p.author_id = u.id AND p.hidden AND p.removed_at IS NULL),
        'removed_posts', (SELECT count(*) FROM community_posts p WHERE p.author_id = u.id AND p.removed_at IS NOT NULL),
        'open_reports_against', (SELECT count(*) FROM community_reports r
                                  LEFT JOIN community_posts p ON p.id = r.post_id
                                  LEFT JOIN community_comments c ON c.id = r.comment_id
                                  WHERE r.status = 'open' AND coalesce(p.author_id, c.author_id) = u.id),
        'reports_filed', (SELECT count(*) FROM community_reports r WHERE r.reporter_id = u.id)
      ) AS row
      FROM auth.users u
      LEFT JOIN community_profiles cp ON cp.user_id = u.id
      WHERE q = '%%'
         OR cp.handle ILIKE q OR cp.display_name ILIKE q OR (to_jsonb(u)->>'email') ILIKE q OR u.id::text = btrim(p_query)
      LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
    ) s), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_user(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.moderation_require(true);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user) THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object(
    'user_id', p_user,
    'email', (SELECT to_jsonb(u)->>'email' FROM auth.users u WHERE u.id = p_user),
    'role', public.app_role_of(p_user),
    'profile', (SELECT jsonb_build_object('handle', cp.handle, 'display_name', cp.display_name, 'bio', cp.bio)
                  FROM community_profiles cp WHERE cp.user_id = p_user),
    'posts', coalesce((SELECT jsonb_agg(jsonb_build_object(
               'id', p.id, 'kind', p.kind, 'caption', left(p.caption, 160), 'hidden', p.hidden,
               'removed', p.removed_at IS NOT NULL, 'created_at', p.created_at,
               'reports', (SELECT count(*) FROM community_reports r WHERE r.post_id = p.id))
               ORDER BY p.created_at DESC)
             FROM (SELECT * FROM community_posts WHERE author_id = p_user ORDER BY created_at DESC LIMIT 50) p), '[]'::jsonb),
    'reports_against', coalesce((SELECT jsonb_agg(jsonb_build_object(
               'id', r.id, 'reason', r.reason, 'status', r.status, 'created_at', r.created_at,
               'target_type', CASE WHEN r.post_id IS NOT NULL THEN 'post' ELSE 'comment' END,
               'target_id', coalesce(r.post_id, r.comment_id))
               ORDER BY r.created_at DESC)
             FROM community_reports r
             LEFT JOIN community_posts p ON p.id = r.post_id
             LEFT JOIN community_comments c ON c.id = r.comment_id
             WHERE coalesce(p.author_id, c.author_id) = p_user), '[]'::jsonb),
    'reports_filed', (SELECT count(*) FROM community_reports r WHERE r.reporter_id = p_user),
    'history', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'action', a.action, 'reason', a.reason,
               'target_type', a.target_type, 'target_id', a.target_id, 'created_at', a.created_at) ORDER BY a.id DESC)
             FROM moderation_audit_log a
             WHERE (a.target_type = 'user' AND a.target_id = p_user)
                OR (a.target_type = 'post' AND a.target_id IN (SELECT id FROM community_posts WHERE author_id = p_user))
                OR (a.target_type = 'comment' AND a.target_id IN (SELECT id FROM community_comments WHERE author_id = p_user))), '[]'::jsonb)
  );
END;
$$;

-- Đổi vai trò. Không tự đổi vai trò của mình (một admin không tự hạ rồi khoá
-- mình ra ngoài, và một người kiểm duyệt không với tới hàm này), và không bao
-- giờ hạ admin CUỐI CÙNG.
CREATE OR REPLACE FUNCTION public.admin_set_role(p_user uuid, p_role text, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.moderation_require(true);
  v_from  text;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('user', 'moderator', 'admin') THEN
    RAISE EXCEPTION 'role must be user, moderator or admin' USING ERRCODE = '22023';
  END IF;
  IF p_user = v_actor THEN
    RAISE EXCEPTION 'you cannot change your own role' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user) THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
  END IF;
  -- Khoá cả bảng vai trò: hai admin hạ nhau cùng lúc không được để lại không ai.
  LOCK TABLE public.app_roles IN SHARE ROW EXCLUSIVE MODE;
  v_from := public.app_role_of(p_user);
  IF v_from = p_role THEN
    RAISE EXCEPTION 'user already has that role' USING ERRCODE = '22023';
  END IF;
  IF v_from = 'admin' AND (SELECT count(*) FROM public.app_roles WHERE role = 'admin') <= 1 THEN
    RAISE EXCEPTION 'cannot remove the last admin' USING ERRCODE = '22023';
  END IF;
  IF p_role = 'user' THEN
    DELETE FROM public.app_roles WHERE user_id = p_user;
  ELSE
    INSERT INTO public.app_roles (user_id, role, granted_by) VALUES (p_user, p_role, v_actor)
    ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, granted_by = EXCLUDED.granted_by, granted_at = now();
  END IF;
  PERFORM public.moderation_log(v_actor, 'ROLE_CHANGE', 'user', p_user, p_reason,
                                jsonb_build_object('from', v_from, 'to', p_role));
END;
$$;

-- Thư viện ảnh: toàn bộ, kể cả ảnh đã tắt, kèm số bài đang dùng.
CREATE OR REPLACE FUNCTION public.admin_art()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.moderation_require(true);
BEGIN
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', a.id, 'kind', a.kind, 'style', a.style, 'tags', a.tags, 'path', a.path, 'alt_en', a.alt_en,
      'alt_vi', a.alt_vi, 'active', a.active, 'sort', a.sort, 'created_at', a.created_at,
      'used_by', (SELECT count(*) FROM community_posts p WHERE p.art_id = a.id))
      ORDER BY a.kind, a.style, a.sort)
    FROM community_art a), '[]'::jsonb);
END;
$$;

-- Thêm một ảnh đã có tệp trong bucket `community-art` (Edge Function
-- `admin-art` tải tệp lên bằng service_role SAU KHI kiểm vai trò, rồi gọi hàm
-- này bằng phiên của chính admin — nên vai trò được kiểm lần nữa ở đây).
CREATE OR REPLACE FUNCTION public.admin_add_art(
  p_kind text, p_style text, p_tags text[], p_path text, p_alt_en text, p_alt_vi text, p_sort integer DEFAULT 0)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.moderation_require(true);
  v_id uuid;
  v_found boolean;
BEGIN
  IF coalesce(btrim(p_path), '') = '' OR p_path LIKE '/%' OR p_path LIKE '%..%' THEN
    RAISE EXCEPTION 'invalid path' USING ERRCODE = '22023';
  END IF;
  -- Ảnh trỏ vào một tệp không có là một ô vỡ trên mọi bài chọn nó.
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = $1 AND name = $2)'
      INTO v_found USING 'community-art', p_path;
    IF NOT v_found THEN
      RAISE EXCEPTION 'image file not uploaded' USING ERRCODE = '22023';
    END IF;
  END IF;
  INSERT INTO community_art (kind, style, tags, path, alt_en, alt_vi, sort)
  VALUES (p_kind, p_style, coalesce(p_tags, '{}'), p_path, coalesce(p_alt_en, ''), coalesce(p_alt_vi, ''), coalesce(p_sort, 0))
  RETURNING id INTO v_id;
  PERFORM public.moderation_log(v_actor, 'ADD_IMAGE', 'image', v_id, '',
                                jsonb_build_object('path', p_path, 'kind', p_kind, 'style', p_style));
  RETURN v_id;
END;
$$;

-- Tắt / bật lại một ảnh. Không xoá: bài đã đăng với ảnh ấy vẫn phải vẽ được.
CREATE OR REPLACE FUNCTION public.admin_set_art_active(p_art uuid, p_active boolean, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.moderation_require(true);
BEGIN
  IF p_active IS NULL THEN
    RAISE EXCEPTION 'p_active is required' USING ERRCODE = '22023';
  END IF;
  UPDATE community_art SET active = p_active WHERE id = p_art AND active <> p_active;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM community_art WHERE id = p_art) THEN
      RAISE EXCEPTION 'image already in that state' USING ERRCODE = '22023';
    END IF;
    RAISE EXCEPTION 'image not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.moderation_log(v_actor, CASE WHEN p_active THEN 'RESTORE_IMAGE' ELSE 'REMOVE_IMAGE' END,
                                'image', p_art, p_reason, '{}'::jsonb);
END;
$$;


/* ── 7. admin đầu tiên: chỉ quyền server ── */
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.app_roles WHERE role = 'admin') THEN
    RAISE EXCEPTION 'an admin already exists: use admin_set_role' USING ERRCODE = '42501';
  END IF;
  SELECT u.id INTO v_user FROM auth.users u WHERE lower(to_jsonb(u)->>'email') = lower(btrim(p_email));
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'no user with that email' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.app_roles (user_id, role, granted_by) VALUES (v_user, 'admin', NULL);
  PERFORM public.moderation_log(NULL, 'ROLE_CHANGE', 'user', v_user, 'bootstrap',
                                jsonb_build_object('from', 'user', 'to', 'admin', 'via', 'bootstrap_first_admin'));
  RETURN v_user;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin(text) TO service_role;


/* ── 8. cấp quyền: chỉ người đã đăng nhập; mỗi hàm tự kiểm vai trò ── */
REVOKE EXECUTE ON FUNCTION public.mod_hide(text, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mod_restore(text, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mod_remove(text, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mod_dismiss(text, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mod_decide_appeal(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mod_dashboard() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mod_reports(text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mod_target(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mod_appeals(text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_audit(integer, bigint, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_users(text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_user(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_role(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_art() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_add_art(text, text, text[], text, text, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_art_active(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mod_hide(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mod_restore(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mod_remove(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mod_dismiss(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mod_decide_appeal(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mod_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mod_reports(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mod_target(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mod_appeals(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_audit(integer, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_users(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_art() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_art(text, text, text[], text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_art_active(uuid, boolean, text) TO authenticated;
