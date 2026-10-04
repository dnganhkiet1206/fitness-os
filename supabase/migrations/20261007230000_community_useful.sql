-- ════════════════════════════════════════════════════════════════════════════
-- "Hữu ích tuần này" ở đầu tab Khám phá (A 04/10, bàn với C ở #6).
--
-- Concept §19: "Community Feed không nên chỉ dựa vào Like." Khám phá đang xếp
-- thuần theo thời gian; khối này chọn tối đa 3 bài của 7 ngày qua theo độ
-- HỮU ÍCH — thứ người khác đã làm với bài, nặng nhẹ theo công sức:
--
--   thử buổi tập  × 4   (dựng cả một mẫu tập từ bài)
--   lưu           × 3   (giữ lại để dùng)
--   người bình luận × 2 (mỗi người MỘT lần, dù viết bao nhiêu câu)
--   thích         × 1
--
-- ── chỉ hành động của NGƯỜI KHÁC ──
--
-- Bộ đếm hiển thị (`like_count`, `save_count`…) đếm cả tác giả. Điểm hữu ích
-- thì không: tự thích + tự lưu + tự thử bài mình là 8 điểm không ai cho, và tự
-- bình luận 50 câu là 100. Nên điểm có trigger RIÊNG, bỏ qua tác giả, và đếm
-- người bình luận chứ không đếm câu bình luận.
--
-- ── vì sao một cột, không một hàm ──
--
-- Client đọc khối này bằng chính `community_posts` — qua RLS, nên bài bị ẩn,
-- bài của người chặn nhau, bài chỉ-người-theo-dõi, bài mình ẩn riêng hay của
-- người mình tắt tiếng (20261007220000) tự rơi ra, không phải chép lại luật
-- nào. Một hàm SECURITY DEFINER đếm từ các bảng con sẽ phải chép lại cả bộ
-- luật ấy (như community_find_posts đã phải làm) và lệch khi luật đổi.
--
-- Bài KHÔNG có policy UPDATE cho client (community_foundation §7), nên cột này
-- chỉ trigger ghi được.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.community_posts
  ADD COLUMN try_count    integer NOT NULL DEFAULT 0,
  ADD COLUMN useful_score integer NOT NULL DEFAULT 0;

-- Bộ đếm hiển thị của lượt thử — như like_count/save_count, đếm mọi người.
CREATE OR REPLACE FUNCTION public.community_try_count_bump()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d integer := CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE -1 END;
  pid uuid := CASE WHEN TG_OP = 'INSERT' THEN NEW.post_id ELSE OLD.post_id END;
BEGIN
  UPDATE public.community_posts SET try_count = greatest(try_count + d, 0) WHERE id = pid;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.community_try_count_bump() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER community_post_tries_count
  AFTER INSERT OR DELETE ON public.community_post_tries
  FOR EACH ROW EXECUTE FUNCTION public.community_try_count_bump();

-- Điểm hữu ích: một trigger cho cả bốn bảng, bỏ qua tác giả của bài.
CREATE OR REPLACE FUNCTION public.community_useful_bump()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d      integer := CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE -1 END;
  r      record;
  actor  uuid;
  w      integer;
  author uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN r := NEW; ELSE r := OLD; END IF;
  IF TG_TABLE_NAME = 'community_comments' THEN
    actor := r.author_id;
    w := 2;
  ELSE
    actor := r.user_id;
    w := CASE TG_TABLE_NAME WHEN 'community_post_tries' THEN 4 WHEN 'community_saves' THEN 3 ELSE 1 END;
  END IF;

  SELECT p.author_id INTO author FROM public.community_posts p WHERE p.id = r.post_id;
  -- Bài đã xoá (cascade) hay chính tác giả: không có gì để cộng.
  IF author IS NULL OR actor = author THEN
    RETURN NULL;
  END IF;

  -- Bình luận: chỉ câu ĐẦU TIÊN của một người cộng, chỉ câu CUỐI CÙNG bị xoá
  -- mới trừ. AFTER trigger: dòng mới đã có trong bảng, dòng xoá đã ra khỏi.
  -- (IF lồng chứ không `AND`: PL/pgSQL dựng cả biểu thức, và dòng của bảng
  -- thích/lưu/thử không có cột `id`.)
  IF TG_TABLE_NAME = 'community_comments' THEN
    IF EXISTS (
      SELECT 1 FROM public.community_comments c
      WHERE c.post_id = r.post_id AND c.author_id = actor AND c.id <> r.id
    ) THEN
      RETURN NULL;
    END IF;
  END IF;

  UPDATE public.community_posts SET useful_score = greatest(useful_score + d * w, 0) WHERE id = r.post_id;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.community_useful_bump() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER community_likes_useful
  AFTER INSERT OR DELETE ON public.community_likes
  FOR EACH ROW EXECUTE FUNCTION public.community_useful_bump();
CREATE TRIGGER community_saves_useful
  AFTER INSERT OR DELETE ON public.community_saves
  FOR EACH ROW EXECUTE FUNCTION public.community_useful_bump();
CREATE TRIGGER community_post_tries_useful
  AFTER INSERT OR DELETE ON public.community_post_tries
  FOR EACH ROW EXECUTE FUNCTION public.community_useful_bump();
CREATE TRIGGER community_comments_useful
  AFTER INSERT OR DELETE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.community_useful_bump();

-- Tính lại một lần cho bài đã có — đúng công thức của trigger.
UPDATE public.community_posts p SET
  try_count = (SELECT count(*) FROM public.community_post_tries t WHERE t.post_id = p.id),
  useful_score =
      (SELECT count(*) FROM public.community_likes x WHERE x.post_id = p.id AND x.user_id <> p.author_id)
    + 2 * (SELECT count(DISTINCT c.author_id) FROM public.community_comments c WHERE c.post_id = p.id AND c.author_id <> p.author_id)
    + 3 * (SELECT count(*) FROM public.community_saves x WHERE x.post_id = p.id AND x.user_id <> p.author_id)
    + 4 * (SELECT count(*) FROM public.community_post_tries x WHERE x.post_id = p.id AND x.user_id <> p.author_id);

-- Khối đọc "bài 7 ngày qua, điểm cao nhất": lọc theo thời gian rồi xếp điểm.
CREATE INDEX community_posts_useful_idx ON public.community_posts (created_at DESC, useful_score DESC);
