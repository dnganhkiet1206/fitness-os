-- `comment_count` đếm bình luận ĐANG HIỆN, không đếm bình luận đã bị ẩn (#175).
--
-- ── lỗi ──
--
-- `community_count_bump()` (community_foundation, §7) cộng/trừ `comment_count`
-- theo INSERT/DELETE. Trigger tự ẩn `community_reports_autohide` chỉ
-- `UPDATE … SET hidden = true` — không trừ bộ đếm. Nên sau khi một bình luận
-- bị ba người báo cáo và tự ẩn, thẻ bài vẫn nói "3", còn người xem mở bài chỉ
-- đọc được 2 (policy đọc ẩn bình luận `hidden` khỏi người khác).
--
-- ── vì sao không chỉ thêm một trigger UPDATE OF hidden ──
--
-- Thêm trigger "ẩn thì −1" mà giữ nhánh DELETE cũ là trừ HAI lần khi một
-- bình luận đã ẩn bị xoá (tác giả xoá, hay xoá bài gốc làm câu trả lời bị
-- xoá theo CASCADE): một lần lúc ẩn, một lần lúc xoá. Nên đếm bình luận
-- được tách khỏi hàm chung thành MỘT hàm nhìn cả ba sự kiện qua cùng một câu
-- hỏi — dòng này có đang hiện không:
--
--   INSERT                      +1 nếu dòng mới đang hiện
--   DELETE                      −1 nếu dòng cũ đang hiện
--   UPDATE OF hidden            −1 khi hiện → ẩn, +1 khi ẩn → hiện
--
-- Thích và lưu không có cột `hidden`, nên vẫn đi hàm chung như cũ — không đổi.
--
-- ── số đã lưu ──
--
-- Sửa trigger không sửa con số đã sai: một bài đã có bình luận bị ẩn trước
-- migration này vẫn đếm nó. Nên migration tính lại `comment_count` một lần
-- cho mọi bài, từ chính định nghĩa trên (đếm dòng `hidden = false`). Câu
-- UPDATE chỉ chạm bài có số lệch.
--
-- ── phần không sửa được ở đây ──
--
-- Bình luận của người trong cặp chặn cũng bị policy ẩn khỏi người xem, nhưng
-- điều đó phụ thuộc NGƯỜI XEM — một bộ đếm chung không đúng được cho từng
-- người. Chủ dự án chấp nhận độ lệch ấy (02/10), như các mạng xã hội lớn.

CREATE OR REPLACE FUNCTION public.community_comment_count_bump()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d integer := 0;
  pid uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    pid := NEW.post_id;
    IF NOT NEW.hidden THEN d := 1; END IF;
  ELSIF TG_OP = 'DELETE' THEN
    pid := OLD.post_id;
    IF NOT OLD.hidden THEN d := -1; END IF;
  ELSE
    pid := NEW.post_id;
    IF OLD.hidden IS DISTINCT FROM NEW.hidden THEN
      d := CASE WHEN NEW.hidden THEN -1 ELSE 1 END;
    END IF;
  END IF;
  IF d <> 0 THEN
    UPDATE public.community_posts SET comment_count = greatest(comment_count + d, 0) WHERE id = pid;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.community_comment_count_bump() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS community_comments_count ON public.community_comments;
CREATE TRIGGER community_comments_count
  AFTER INSERT OR DELETE OR UPDATE OF hidden ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.community_comment_count_bump();

-- Tính lại một lần — chỉ bài có số lệch.
UPDATE public.community_posts p
SET comment_count = v.n
FROM (
  SELECT p2.id, count(c.id) FILTER (WHERE NOT c.hidden)::integer AS n
  FROM public.community_posts p2
  LEFT JOIN public.community_comments c ON c.post_id = p2.id
  GROUP BY p2.id
) v
WHERE v.id = p.id AND p.comment_count IS DISTINCT FROM v.n;
