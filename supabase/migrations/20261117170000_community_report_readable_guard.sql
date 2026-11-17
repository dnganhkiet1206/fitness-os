-- ════════════════════════════════════════════════════════════════════════════
-- Báo cáo chỉ trên nội dung mình đọc được (D, 17/11 — Devin #924, SEC).
--
-- Lỗ hổng: `community_reports` chèn trực tiếp, policy "Users file reports"
-- (20260927120000) chỉ kiểm `auth.uid() = reporter_id AND status = 'open'`,
-- không kiểm quyền đọc đích. `community_my_reports()` (20261117070000) là
-- SECURITY DEFINER nên đọc vượt RLS, trả trích đoạn 160 ký tự của bất cứ nội
-- dung nào đã báo cáo. Biết ID một bài chỉ-follower / bài của người đã chặn
-- → báo cáo → đọc trích đoạn trong "Báo cáo của tôi".
--
-- Sửa ở GỐC, hai lớp, cùng một hàm kiểm:
--
--   1. `community_reports_guard()` (trigger BEFORE INSERT, từ
--      20261007220000): từ chối báo cáo trên đích mà người báo không đọc
--      được (42501). Giữ nguyên hai luật cũ (tối đa 10 báo cáo / 24 giờ;
--      gắn `counted` theo `community_reporter_eligible`).
--
--   2. `community_my_reports()`: trích đoạn chỉ trả khi người gọi đọc được
--      đích LÚC GỌI; không đọc được thì trích đoạn rỗng (hàng vẫn có lý do
--      + trạng thái + ngày — đủ để theo dõi). Phòng thủ sâu: chặn cả báo cáo
--      lạm dụng đã tồn tại trước migration này, và cả trường hợp đích đổi
--      trạng thái sau khi báo cáo (vd. tác giả chặn người báo sau). Cộng đồng
--      chưa có người dùng thật nên chưa có báo cáo lạm dụng nào tồn tại, nhưng
--      luật phải đúng ngay cả khi đó. Cờ `removed` giữ nguyên — nó là siêu dữ
--      liệu thi hành về nội dung người báo đã biết, không phải nội dung riêng.
--
-- Hàm kiểm `community_post_readable_by()` / `community_report_target_readable()`
-- chép đúng điều kiện của hai policy đọc ("Readers see visible posts" và
-- "Readers see comments on visible posts", 20260927120000) — guard là
-- SECURITY DEFINER nên SELECT thường trong nó không đi qua RLS, phải kiểm
-- tường minh. ĐỔI POLICY ĐỌC THÌ ĐỔI CẢ HAI HÀM NÀY.
--
-- Cố tình KHÔNG kiểm bài tự ẩn / tác giả bị tắt tiếng (policy RESTRICTIVE
-- 20261007220000): đó là lựa chọn của chính người báo, gỡ được bất cứ lúc
-- nào — chặn báo cáo ở đó chỉ trừng phạt báo cáo hợp lệ ("tôi ẩn bài này
-- rồi, nhưng nó vi phạm nên tôi báo cáo"). Ranh giới riêng tư thật là: bị
-- chặn, chỉ-follower mà không theo dõi, và bị ẩn bởi kiểm duyệt.
-- ════════════════════════════════════════════════════════════════════════════

/* ── bài đọc được bởi một người (chép policy "Readers see visible posts") ── */
CREATE OR REPLACE FUNCTION public.community_post_readable_by(p_viewer uuid, p_post uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_posts p
    WHERE p.id = p_post
      AND (
        p.author_id = p_viewer
        OR (
          NOT p.hidden
          AND NOT public.community_blocked_between(p_viewer, p.author_id)
          AND (
            p.visibility = 'public'
            OR EXISTS (
              SELECT 1 FROM public.community_follows f
              WHERE f.follower_id = p_viewer AND f.followee_id = p.author_id
            )
          )
        )
      )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.community_post_readable_by(uuid, uuid) FROM PUBLIC, anon, authenticated;

/* ── đích báo cáo đọc được bởi người báo ── */
CREATE OR REPLACE FUNCTION public.community_report_target_readable(p_viewer uuid, p_post uuid, p_comment uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Mọi đích không rỗng đều phải đọc được (báo cáo thường chỉ có một đích;
    -- báo cáo hai đích thì cả hai đều phải đọc được, vì trích đoạn lấy bài trước).
    (p_post IS NULL OR public.community_post_readable_by(p_viewer, p_post))
    AND (p_comment IS NULL OR EXISTS (
      SELECT 1 FROM public.community_comments c
      WHERE c.id = p_comment
        AND public.community_post_readable_by(p_viewer, c.post_id)
        AND (
          c.author_id = p_viewer
          OR (NOT c.hidden AND NOT public.community_blocked_between(p_viewer, c.author_id))
        )
    ))
    -- Báo cáo một NGƯỜI (cả hai đều NULL): không lộ nội dung — trích đoạn là
    -- display_name, hồ sơ đọc được bởi mọi người đã đăng nhập.
$$;
REVOKE EXECUTE ON FUNCTION public.community_report_target_readable(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

/* ── guard: như bản 20261007220000, thêm kiểm quyền đọc đích ── */
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
  IF NOT public.community_report_target_readable(NEW.reporter_id, NEW.post_id, NEW.comment_id) THEN
    RAISE EXCEPTION 'cannot report content you cannot read' USING ERRCODE = '42501';
  END IF;
  NEW.counted := public.community_reporter_eligible(NEW.reporter_id);
  RETURN NEW;
END;
$$;

/* ── `community_my_reports()`: như bản 20261117070000, trích đoạn chỉ trả
   khi người gọi đọc được đích lúc gọi ── */
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
      'excerpt', CASE
        WHEN public.community_report_target_readable(v_uid, r.post_id, r.comment_id) THEN coalesce(
          (SELECT left(p.caption, 160) FROM community_posts p WHERE p.id = r.post_id),
          (SELECT left(c.body, 160) FROM community_comments c WHERE c.id = r.comment_id),
          (SELECT cp.display_name FROM community_profiles cp WHERE cp.user_id = r.reported_user_id))
        ELSE ''
      END,
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
