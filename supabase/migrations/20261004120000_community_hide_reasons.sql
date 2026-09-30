-- Tác giả biết vì sao bài/bình luận của mình bị ẩn, và yêu cầu xem lại được (#26).
--
-- Trước đây: ba người khác nhau báo cáo là bài tự ẩn (`community_reports_autohide`,
-- 20260927120000), và tác giả chỉ thấy "đang bị ẩn" — không biết vì sao, không
-- có bước nào tiếp theo. Với người bị một nhóm nhỏ báo cáo oan, đó là ngõ cụt.
--
-- ── lý do gộp, không lộ người báo cáo ──
-- `community_my_hidden_reasons()` trả cho CHÍNH tác giả, với mỗi bài/bình luận
-- ĐANG ẨN của họ: số người báo cáo và lý do phổ biến nhất. Không id người báo,
-- không ghi chú (`note` là chữ tự do — có thể chứa tên). Người khác gọi thì
-- không có hàng nào của ai khác: hàm lọc theo `auth.uid()`, không theo tham số.
--
-- ── yêu cầu xem lại: một lần, chỉ qua RPC ──
-- Bảng `community_review_requests` KHÔNG có policy ghi cho client: một lệnh
-- INSERT thẳng sẽ bỏ qua được điều kiện "của mình VÀ đang ẩn". Ghi qua
-- `community_request_review()` (SECURITY DEFINER), nơi điều kiện ấy được kiểm.
-- UNIQUE trên bài / trên bình luận: lần hai là 23505. Không tự bỏ ẩn — dashboard
-- xử lý (`status`).

-- ── 1. bảng ──
CREATE TABLE public.community_review_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id      uuid REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id   uuid REFERENCES public.community_comments(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'restored', 'upheld')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_review_requests_one_target CHECK (num_nonnulls(post_id, comment_id) = 1),
  CONSTRAINT community_review_requests_one_per_post UNIQUE (post_id),
  CONSTRAINT community_review_requests_one_per_comment UNIQUE (comment_id)
);

ALTER TABLE public.community_review_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authors see their own review requests"
  ON public.community_review_requests FOR SELECT TO authenticated
  USING (auth.uid() = requester_id);

REVOKE ALL ON public.community_review_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.community_review_requests TO authenticated;

-- ── 2. lý do gộp ──
CREATE OR REPLACE FUNCTION public.community_my_hidden_reasons()
RETURNS TABLE (post_id uuid, comment_id uuid, reporters integer, top_reason text, review_requested boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH mine AS (
    SELECT p.id AS post_id, NULL::uuid AS comment_id FROM community_posts p
     WHERE p.author_id = auth.uid() AND p.hidden
    UNION ALL
    SELECT NULL::uuid, c.id FROM community_comments c
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
                  WHERE (m.post_id IS NOT NULL AND q.post_id = m.post_id)
                     OR (m.comment_id IS NOT NULL AND q.comment_id = m.comment_id))
    FROM mine m
$$;

REVOKE ALL ON FUNCTION public.community_my_hidden_reasons() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_my_hidden_reasons() TO authenticated;

-- ── 3. yêu cầu xem lại ──
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
  -- Của mình VÀ đang ẩn — cả hai điều kiện trong một câu, nên "không phải của
  -- mình" và "không ẩn" ra cùng một mã: không dò được bài người khác có bị ẩn.
  IF p_post_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM community_posts WHERE id = p_post_id AND author_id = auth.uid() AND hidden
  ) THEN
    RAISE EXCEPTION 'no hidden post of yours' USING ERRCODE = 'P0002';
  END IF;
  IF p_comment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM community_comments WHERE id = p_comment_id AND author_id = auth.uid() AND hidden
  ) THEN
    RAISE EXCEPTION 'no hidden comment of yours' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO community_review_requests (requester_id, post_id, comment_id)
  VALUES (auth.uid(), p_post_id, p_comment_id);
END;
$$;

REVOKE ALL ON FUNCTION public.community_request_review(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_request_review(uuid, uuid) TO authenticated;
