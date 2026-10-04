-- Chống lạm dụng báo cáo (A, 04/10 — chủ dự án chốt ngưỡng ở #6).
--
-- ── lỗ hổng ──
--
-- Ba tài khoản BẤT KỲ báo cáo là một bài tự ẩn. Ba tài khoản vừa tạo, không
-- làm gì khác, ẩn được bài của bất kỳ ai — mỗi lần một đợt, chờ người kiểm
-- duyệt khôi phục rồi làm lại.
--
-- ── luật của chủ dự án ──
--
-- Báo cáo chỉ TÍNH vào ngưỡng tự ẩn khi người báo:
--   • hoạt động liên tục — tài khoản đã tồn tại ít nhất 30 ngày, VÀ
--   • có đóng góp trong 30 ngày gần nhất — một trong: đăng bài, bình luận,
--     thích, lưu, thử buổi tập, theo dõi, tham gia thử thách, hoặc ghi một
--     buổi tập trong app.
-- Người không đủ điều kiện vẫn báo cáo được (báo cáo vẫn vào hàng đợi của
-- người kiểm duyệt), chỉ là không đẩy bài tới ngưỡng tự ẩn. Thay vào đó họ có
-- công cụ cho RIÊNG mình: bài vừa báo cáo biến khỏi chỗ họ xem, và họ có thể
-- tạm ẩn mọi bài của tác giả trong 30 ngày (hoặc chặn, đã có từ trước).
--
-- Thêm: mỗi người tối đa 10 báo cáo trong 24 giờ (54000).
--
-- ── vì sao gắn cờ lúc GỬI, không tính lại lúc đếm ──
--
-- `counted` được trigger đặt khi báo cáo vào sổ và không đổi về sau. Tính lại
-- mỗi lần đếm thì một tài khoản "đủ tuổi" sau ba tuần sẽ biến các báo cáo cũ
-- của nó thành phiếu, và người kiểm duyệt không đọc được VÌ SAO một bài đã ẩn.
-- Client không đặt được cờ này: trigger ghi đè mọi giá trị gửi lên.

ALTER TABLE public.community_reports
  ADD COLUMN counted boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.community_reporter_eligible(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce((SELECT u.created_at <= now() - interval '30 days' FROM auth.users u WHERE u.id = p_user), false)
    AND (
         EXISTS (SELECT 1 FROM community_posts x WHERE x.author_id = p_user AND x.created_at >= now() - interval '30 days')
      OR EXISTS (SELECT 1 FROM community_comments x WHERE x.author_id = p_user AND x.created_at >= now() - interval '30 days')
      OR EXISTS (SELECT 1 FROM community_likes x WHERE x.user_id = p_user AND x.created_at >= now() - interval '30 days')
      OR EXISTS (SELECT 1 FROM community_saves x WHERE x.user_id = p_user AND x.created_at >= now() - interval '30 days')
      OR EXISTS (SELECT 1 FROM community_post_tries x WHERE x.user_id = p_user AND x.tried_at >= now() - interval '30 days')
      OR EXISTS (SELECT 1 FROM community_follows x WHERE x.follower_id = p_user AND x.created_at >= now() - interval '30 days')
      OR EXISTS (SELECT 1 FROM community_challenge_members x WHERE x.user_id = p_user AND x.joined_at >= now() - interval '30 days')
      OR EXISTS (SELECT 1 FROM workout_sessions x WHERE x.user_id = p_user AND x.date_time >= now() - interval '30 days')
    )
$$;
REVOKE EXECUTE ON FUNCTION public.community_reporter_eligible(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.community_reports_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM community_reports
       WHERE reporter_id = NEW.reporter_id AND created_at > now() - interval '24 hours') >= 10 THEN
    RAISE EXCEPTION 'report limit reached: at most 10 reports in 24 hours' USING ERRCODE = '54000';
  END IF;
  NEW.counted := public.community_reporter_eligible(NEW.reporter_id);
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.community_reports_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER community_reports_guard
  BEFORE INSERT ON public.community_reports
  FOR EACH ROW EXECUTE FUNCTION public.community_reports_guard();

-- Như bản 20261007130000 (chỉ báo cáo ĐANG MỞ), thêm: chỉ báo cáo ĐƯỢC TÍNH.
CREATE OR REPLACE FUNCTION public.community_reports_autohide()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.post_id IS NOT NULL AND (
    SELECT count(DISTINCT reporter_id) FROM public.community_reports WHERE post_id = NEW.post_id AND status = 'open' AND counted
  ) >= 3 THEN
    UPDATE public.community_posts SET hidden = true WHERE id = NEW.post_id;
  END IF;
  IF NEW.comment_id IS NOT NULL AND (
    SELECT count(DISTINCT reporter_id) FROM public.community_reports WHERE comment_id = NEW.comment_id AND status = 'open' AND counted
  ) >= 3 THEN
    UPDATE public.community_comments SET hidden = true WHERE id = NEW.comment_id;
  END IF;
  RETURN NEW;
END;
$$;


/* ── công cụ của riêng người xem ── */

-- Một bài người ấy không muốn thấy nữa. Báo cáo một bài là tự thêm dòng này.
CREATE TABLE public.community_post_hides (
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id    uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
ALTER TABLE public.community_post_hides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see their own post hides"
  ON public.community_post_hides FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users hide posts for themselves"
  ON public.community_post_hides FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users unhide posts for themselves"
  ON public.community_post_hides FOR DELETE TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.community_post_hides FROM anon;

-- Tạm ẩn mọi bài của một tác giả tới `until` (mặc định 30 ngày) — nhẹ hơn
-- chặn: không gỡ theo dõi, không chặn bình luận, tự hết hạn.
CREATE TABLE public.community_mutes (
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  until      timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, muted_id),
  CONSTRAINT community_mutes_not_self CHECK (user_id <> muted_id)
);
ALTER TABLE public.community_mutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see their own mutes"
  ON public.community_mutes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users mute for themselves"
  ON public.community_mutes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND until <= now() + interval '31 days');
CREATE POLICY "Users unmute for themselves"
  ON public.community_mutes FOR DELETE TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.community_mutes FROM anon;

-- Báo cáo một BÀI thì bài ấy biến khỏi chỗ người báo xem, ngay — với mọi
-- người báo, đủ điều kiện hay không: không ai báo cáo một bài để rồi tiếp tục
-- thấy nó.
CREATE OR REPLACE FUNCTION public.community_reports_hide_for_reporter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.post_id IS NOT NULL THEN
    INSERT INTO community_post_hides (user_id, post_id) VALUES (NEW.reporter_id, NEW.post_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.community_reports_hide_for_reporter() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER community_reports_hide_for_reporter
  AFTER INSERT ON public.community_reports
  FOR EACH ROW EXECUTE FUNCTION public.community_reports_hide_for_reporter();

-- RESTRICTIVE: cộng với (AND) policy đọc bài đang có, nên áp ở MỌI chỗ đọc —
-- bảng tin, hồ sơ, chi tiết bài, và các RPC tìm kiếm (chúng trả id rồi app
-- đọc lại qua RLS). Bài của chính mình không bao giờ bị lọc.
CREATE POLICY "Viewers do not see posts they hid or authors they muted"
  ON public.community_posts AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    author_id = auth.uid()
    OR (
      NOT EXISTS (SELECT 1 FROM public.community_post_hides h WHERE h.user_id = auth.uid() AND h.post_id = community_posts.id)
      AND NOT EXISTS (SELECT 1 FROM public.community_mutes m
                       WHERE m.user_id = auth.uid() AND m.muted_id = community_posts.author_id AND m.until > now())
    )
  );


/* ── người kiểm duyệt thấy báo cáo nào được tính ──
   Như bản 20261007130000, thêm `counted` vào từng báo cáo của `mod_target` và
   `counted_count` vào mỗi mục của `mod_reports`: một bài có 5 báo cáo mà không
   tự ẩn phải đọc ra được VÌ SAO. */
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
        'counted_count', (SELECT count(DISTINCT r3.reporter_id) FROM community_reports r3
                           WHERE r3.status = p_status AND r3.counted AND coalesce(r3.post_id, r3.comment_id) = g.target_id),
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
