-- Nhắc @handle chỉ tới người XEM ĐƯỢC bài (#30, A kiểm chéo 02/10).
--
-- ── lỗi ──
--
-- `community_notify_thread()` (20261003120000) nhắc mọi handle có thật, không
-- chặn hai chiều — nhưng không hỏi người được nhắc có đọc được BÀI không. Đo
-- trên Postgres thật: A đăng bài chỉ người theo dõi xem; C (có theo dõi A) bình
-- luận "@d"; D không theo dõi A. D thấy 0 bài, 0 bình luận — và 1 thông báo
-- `mention`. Thông báo ấy:
--   · lộ một bài riêng tư và việc C bình luận trên đó (actor_id + post_id);
--   · mở ra không được gì — bài và bình luận đều bị RLS giấu;
--   · là một lối làm phiền người bất kỳ từ một bài người ấy không vào được.
--
-- ── sửa ──
--
-- Định nghĩa lại hàm (migration MỚI, không sửa tệp cũ), thêm đúng một điều
-- kiện: người được nhắc phải thoả vị từ của policy "Readers see visible posts"
-- (20260927120000_community_foundation.sql) — là tác giả, hoặc bài chưa ẩn,
-- không chặn hai chiều, và công khai hay mình theo dõi tác giả. Không có hàng
-- `community_comment_mentions` lẫn thông báo cho người ngoài. Phần trả lời
-- (`reply`) giữ nguyên: tác giả bình luận cha đã đọc được bài lúc viết.
--
-- Chép vị từ thay vì gọi một hàm chung, cùng cách 20260930220000/20261001150000
-- đã làm; `community_comment_replies.test.sql` (MV1–MV3) canh nghĩa của nó.

CREATE OR REPLACE FUNCTION public.community_notify_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  uuid := NEW.author_id;
  v_to     uuid;
  v_handle text;
  v_target uuid;
BEGIN
  -- Như #13: người làm phải có hồ sơ (bình luận vốn đã đòi hồ sơ, giữ cho rõ).
  IF NOT EXISTS (SELECT 1 FROM public.community_profiles WHERE user_id = v_actor) THEN
    RETURN NEW;
  END IF;

  -- Trả lời: báo tác giả bình luận cha.
  IF NEW.parent_id IS NOT NULL THEN
    SELECT author_id INTO v_to FROM public.community_comments WHERE id = NEW.parent_id;
    IF v_to IS NOT NULL AND v_to <> v_actor AND NOT public.community_blocked_between(v_to, v_actor) THEN
      -- Chủ bài vừa nhận `comment` cho đúng bình luận này (trigger của #13 chạy
      -- trước) → đổi thành `reply`, không thêm dòng thứ hai.
      UPDATE public.community_notifications SET kind = 'reply'
      WHERE user_id = v_to AND comment_id = NEW.id AND kind = 'comment';
      IF NOT FOUND THEN
        INSERT INTO public.community_notifications (user_id, actor_id, kind, post_id, comment_id)
        VALUES (v_to, v_actor, 'reply', NEW.post_id, NEW.id) ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END IF;

  -- Nhắc: mỗi handle một lần; handle không kết thúc bằng dấu chấm (câu văn
  -- "…cảm ơn @minh." không nhắc một người tên "minh.").
  FOR v_handle IN
    SELECT DISTINCT m[1] FROM regexp_matches(lower(NEW.body), '@([a-z0-9_.]*[a-z0-9_])', 'g') AS m
  LOOP
    SELECT user_id INTO v_target FROM public.community_profiles WHERE handle = v_handle;
    CONTINUE WHEN v_target IS NULL OR v_target = v_actor OR public.community_blocked_between(v_target, v_actor);
    -- Chỉ nhắc người XEM ĐƯỢC bài (vị từ của policy "Readers see visible posts",
    -- với người được nhắc thay cho auth.uid()). Xem đầu tệp.
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = NEW.post_id
        AND (
          p.author_id = v_target
          OR (
            NOT p.hidden
            AND NOT public.community_blocked_between(v_target, p.author_id)
            AND (
              p.visibility = 'public'
              OR EXISTS (
                SELECT 1 FROM public.community_follows f
                WHERE f.follower_id = v_target AND f.followee_id = p.author_id
              )
            )
          )
        )
    );
    INSERT INTO public.community_comment_mentions (comment_id, user_id) VALUES (NEW.id, v_target) ON CONFLICT DO NOTHING;
    INSERT INTO public.community_notifications (user_id, actor_id, kind, post_id, comment_id)
    VALUES (v_target, v_actor, 'mention', NEW.post_id, NEW.id) ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.community_notify_thread() FROM PUBLIC, anon, authenticated;
