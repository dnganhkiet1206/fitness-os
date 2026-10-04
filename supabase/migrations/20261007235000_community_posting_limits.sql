-- ════════════════════════════════════════════════════════════════════════════
-- Chống spam phía đăng bài (A 04/10, concept §17 Admin: "Spam detection",
-- "Account restrictions"; chia việc với C ở #6).
--
-- Hai lớp, cùng một cửa (trigger BEFORE INSERT trên bài và bình luận — mọi
-- đường tạo bài đều là hàm `share_*` chạy với author_id của người gọi, mọi
-- bình luận là INSERT của chính người viết):
--
--   trần      10 bài và 30 bình luận mỗi 60 phút cho một người. Người dùng
--             thật không chạm tới (một buổi tập, một bữa ăn, một lần cập nhật
--             tiến trình mỗi ngày); một kịch bản rải bài thì chạm ngay. 54000.
--   tạm khoá  đội kiểm duyệt khoá đăng bài + bình luận của một tài khoản tới
--             một mốc (tối đa 30 ngày), kèm lý do, ghi nhật ký. Thích, lưu,
--             theo dõi, đọc vẫn như thường — khoá CÁI LOA, không khoá người.
--             Mã CR001 (lớp riêng) để app nói đúng câu, không nhầm với
--             "phiên hết hạn" của 42501.
--
-- Đội kiểm duyệt (moderator/admin) không bị trần — họ đăng thông báo, trả lời
-- hàng loạt khi có sự cố — và không ai khoá được người trong đội (đổi vai trò
-- trước, ở admin_set_role).
-- ════════════════════════════════════════════════════════════════════════════

/* ── tạm khoá ── */
CREATE TABLE public.community_restrictions (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  until      timestamptz NOT NULL,
  reason     text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 500),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.community_restrictions ENABLE ROW LEVEL SECURITY;
-- Người bị khoá đọc được dòng của CHÍNH mình (app nói "đến bao giờ, vì sao");
-- không ai ghi trực tiếp — chỉ qua mod_restrict / mod_unrestrict.
CREATE POLICY "Users see their own restriction"
  ON public.community_restrictions FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.community_restrictions FROM anon;
GRANT SELECT ON public.community_restrictions TO authenticated;

ALTER TABLE public.moderation_audit_log DROP CONSTRAINT moderation_audit_log_action_check;
ALTER TABLE public.moderation_audit_log ADD CONSTRAINT moderation_audit_log_action_check CHECK (action IN (
  'HIDE_POST', 'RESTORE_POST', 'REMOVE_POST',
  'HIDE_COMMENT', 'RESTORE_COMMENT', 'REMOVE_COMMENT',
  'DISMISS_REPORT', 'APPROVE_APPEAL', 'REJECT_APPEAL',
  'ADD_IMAGE', 'REMOVE_IMAGE', 'RESTORE_IMAGE', 'ROLE_CHANGE',
  'RESTRICT_USER', 'UNRESTRICT_USER'));

/* ── cửa chung cho bài và bình luận ── */
CREATE OR REPLACE FUNCTION public.community_posting_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author uuid := NEW.author_id;
  v_until  timestamptz;
  n        integer;
BEGIN
  IF public.app_role_of(v_author) IN ('moderator', 'admin') THEN
    RETURN NEW;
  END IF;

  SELECT r.until INTO v_until FROM public.community_restrictions r WHERE r.user_id = v_author AND r.until > now();
  IF v_until IS NOT NULL THEN
    RAISE EXCEPTION 'posting restricted until %', v_until USING ERRCODE = 'CR001';
  END IF;

  IF TG_TABLE_NAME = 'community_posts' THEN
    SELECT count(*) INTO n FROM public.community_posts
    WHERE author_id = v_author AND created_at > now() - interval '60 minutes';
    IF n >= 10 THEN
      RAISE EXCEPTION 'post limit reached: at most 10 posts per hour' USING ERRCODE = '54000';
    END IF;
  ELSE
    SELECT count(*) INTO n FROM public.community_comments
    WHERE author_id = v_author AND created_at > now() - interval '60 minutes';
    IF n >= 30 THEN
      RAISE EXCEPTION 'comment limit reached: at most 30 comments per hour' USING ERRCODE = '54000';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.community_posting_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER community_posts_posting_guard
  BEFORE INSERT ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.community_posting_guard();
CREATE TRIGGER community_comments_posting_guard
  BEFORE INSERT ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.community_posting_guard();

-- Đếm "trong 60 phút" của từng người: chỉ mục theo tác giả + thời điểm.
CREATE INDEX IF NOT EXISTS community_posts_author_created_idx ON public.community_posts (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS community_comments_author_created_idx ON public.community_comments (author_id, created_at DESC);

/* ── đội kiểm duyệt: khoá / gỡ khoá ── */
CREATE OR REPLACE FUNCTION public.mod_restrict(p_user uuid, p_hours integer, p_reason text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.moderation_require(false);
  v_until timestamptz;
BEGIN
  IF p_hours IS NULL OR p_hours < 1 OR p_hours > 720 THEN
    RAISE EXCEPTION 'hours must be between 1 and 720' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'a reason is required' USING ERRCODE = '22023';
  END IF;
  IF p_user = v_actor THEN
    RAISE EXCEPTION 'you cannot restrict yourself' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user) THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
  END IF;
  IF public.app_role_of(p_user) IN ('moderator', 'admin') THEN
    RAISE EXCEPTION 'cannot restrict a staff account — change its role first' USING ERRCODE = '22023';
  END IF;
  v_until := now() + make_interval(hours => p_hours);
  INSERT INTO public.community_restrictions (user_id, until, reason, created_by)
  VALUES (p_user, v_until, btrim(p_reason), v_actor)
  ON CONFLICT (user_id) DO UPDATE SET until = EXCLUDED.until, reason = EXCLUDED.reason,
                                      created_by = EXCLUDED.created_by, created_at = now();
  PERFORM public.moderation_log(v_actor, 'RESTRICT_USER', 'user', p_user, p_reason,
                                jsonb_build_object('hours', p_hours, 'until', v_until));
  RETURN v_until;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mod_restrict(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mod_restrict(uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mod_unrestrict(p_user uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.moderation_require(false);
BEGIN
  DELETE FROM public.community_restrictions WHERE user_id = p_user AND until > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user is not restricted' USING ERRCODE = '22023';
  END IF;
  PERFORM public.moderation_log(v_actor, 'UNRESTRICT_USER', 'user', p_user, p_reason, '{}'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mod_unrestrict(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mod_unrestrict(uuid, text) TO authenticated;

-- Trạng thái khoá của một người, cho màn kiểm duyệt (đội kiểm duyệt đọc được
-- của mọi người; người thường đọc dòng của mình qua bảng).
CREATE OR REPLACE FUNCTION public.mod_user_restriction(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.moderation_require(false);
BEGIN
  RETURN (SELECT jsonb_build_object('until', r.until, 'reason', r.reason, 'created_at', r.created_at)
          FROM public.community_restrictions r WHERE r.user_id = p_user AND r.until > now());
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mod_user_restriction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mod_user_restriction(uuid) TO authenticated;
