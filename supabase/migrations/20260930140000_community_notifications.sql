-- ════════════════════════════════════════════════════════════════════════════
-- Cộng đồng — Hộp thông báo trong app (issue #13, người làm A).
--
-- Người đăng bài trước đây không biết ai đã thích, bình luận hay theo dõi mình.
-- Không có vòng phản hồi ấy thì cộng đồng không sống được.
--
-- ── bốn luật ──
--
--   1. Chỉ SERVER ghi. Không có policy INSERT: thông báo sinh ra từ trigger
--      trên đúng hành động đã xảy ra, nên không ai bịa được "X đã thích bài
--      của bạn" hay dội thông báo vào hộp người khác.
--
--   2. Không tự báo cho mình, và không báo qua một cặp đã chặn nhau (hai
--      chiều, như mọi chỗ khác). Chặn SAU khi thông báo đã có thì RLS giấu nó
--      đi — người đã chặn ai không cần thấy tên người ấy trong hộp của mình.
--
--   3. Hành động bị rút lại thì thông báo đi theo: bỏ thích, bỏ theo dõi, xoá
--      bình luận, bình luận bị tự ẩn vì báo cáo. Một hộp thư nói "X đã bình
--      luận" về một bình luận không còn là một lời nói sai.
--
--   4. Thích và theo dõi không lặp: UNIQUE theo (người nhận, người làm, loại,
--      bài). Bấm thích–bỏ thích mười lần là mười lần xoá rồi tạo lại MỘT dòng,
--      không phải mười dòng.
--
-- ── không có loại "thử thách đạt" ──
--
-- Tiến độ thử thách được TÍNH lúc đọc (`community_challenge_progress`), không
-- có một lần ghi nào để trigger bám vào — trừ `workout_sessions`, và gắn
-- trigger lên bảng lõi ấy là bắt mỗi lần lưu buổi tập đếm lại mọi thử thách.
-- Thẻ thử thách ở đầu Khám phá đã tự hiện "Nhận N xu" khi đạt.
--
-- Đánh dấu đã đọc đi qua RPC: không có policy UPDATE, vì một policy không
-- chặn được CỘT, và các cột còn lại (ai, loại, bài) không ai được sửa.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE public.community_notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id   uuid NOT NULL REFERENCES public.community_profiles(user_id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('like', 'comment', 'follow')),
  post_id    uuid REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.community_comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz,
  CHECK (user_id <> actor_id),
  CHECK ((kind = 'follow') = (post_id IS NULL)),
  CHECK ((kind = 'comment') = (comment_id IS NOT NULL))
);

-- Thích/theo dõi: một dòng cho mỗi (người nhận, người làm, [bài]). Hai index
-- riêng phần chứ không một index `NULLS NOT DISTINCT` (Postgres 15+): theo dõi
-- có post_id NULL, và NULL mặc định không đụng nhau trong UNIQUE.
CREATE UNIQUE INDEX community_notifications_like_once
  ON public.community_notifications (user_id, actor_id, post_id) WHERE kind = 'like';
CREATE UNIQUE INDEX community_notifications_follow_once
  ON public.community_notifications (user_id, actor_id) WHERE kind = 'follow';
CREATE INDEX community_notifications_inbox
  ON public.community_notifications (user_id, created_at DESC);

ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own notifications"
  ON public.community_notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND NOT public.community_blocked_between(user_id, actor_id));


/* ── sinh thông báo ── */
CREATE OR REPLACE FUNCTION public.community_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_to    uuid;
  v_actor uuid;
BEGIN
  IF TG_TABLE_NAME = 'community_likes' THEN
    SELECT author_id INTO v_to FROM public.community_posts WHERE id = NEW.post_id;
    v_actor := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'community_comments' THEN
    SELECT author_id INTO v_to FROM public.community_posts WHERE id = NEW.post_id;
    v_actor := NEW.author_id;
  ELSE
    v_to := NEW.followee_id;
    v_actor := NEW.follower_id;
  END IF;

  -- Người thích có thể chưa có hồ sơ cộng đồng (thích không đòi hồ sơ); khi
  -- ấy không có tên nào để hiện, và không báo.
  IF v_to IS NULL OR v_to = v_actor
     OR NOT EXISTS (SELECT 1 FROM public.community_profiles WHERE user_id = v_actor)
     OR public.community_blocked_between(v_to, v_actor) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'community_likes' THEN
    INSERT INTO public.community_notifications (user_id, actor_id, kind, post_id)
    VALUES (v_to, v_actor, 'like', NEW.post_id) ON CONFLICT DO NOTHING;
  ELSIF TG_TABLE_NAME = 'community_comments' THEN
    INSERT INTO public.community_notifications (user_id, actor_id, kind, post_id, comment_id)
    VALUES (v_to, v_actor, 'comment', NEW.post_id, NEW.id);
  ELSE
    INSERT INTO public.community_notifications (user_id, actor_id, kind)
    VALUES (v_to, v_actor, 'follow') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_likes_notify
  AFTER INSERT ON public.community_likes
  FOR EACH ROW EXECUTE FUNCTION public.community_notify();
CREATE TRIGGER community_comments_notify
  AFTER INSERT ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.community_notify();
CREATE TRIGGER community_follows_notify
  AFTER INSERT ON public.community_follows
  FOR EACH ROW EXECUTE FUNCTION public.community_notify();


/* ── rút lại hành động thì rút thông báo ── */
-- Xoá bình luận đã có ON DELETE CASCADE qua `comment_id`. Còn lại ba đường:
-- bỏ thích, bỏ theo dõi, và bình luận bị tự ẩn vì báo cáo.
CREATE OR REPLACE FUNCTION public.community_unnotify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'community_likes' THEN
    DELETE FROM public.community_notifications
    WHERE kind = 'like' AND post_id = OLD.post_id AND actor_id = OLD.user_id;
    RETURN OLD;
  ELSIF TG_TABLE_NAME = 'community_follows' THEN
    DELETE FROM public.community_notifications
    WHERE kind = 'follow' AND user_id = OLD.followee_id AND actor_id = OLD.follower_id;
    RETURN OLD;
  END IF;
  -- community_comments, UPDATE: vừa bị ẩn.
  DELETE FROM public.community_notifications WHERE comment_id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_likes_unnotify
  AFTER DELETE ON public.community_likes
  FOR EACH ROW EXECUTE FUNCTION public.community_unnotify();
CREATE TRIGGER community_follows_unnotify
  AFTER DELETE ON public.community_follows
  FOR EACH ROW EXECUTE FUNCTION public.community_unnotify();
CREATE TRIGGER community_comments_hidden_unnotify
  AFTER UPDATE OF hidden ON public.community_comments
  FOR EACH ROW WHEN (NEW.hidden AND NOT OLD.hidden) EXECUTE FUNCTION public.community_unnotify();

-- Hàm trigger không phải để gọi thẳng.
REVOKE EXECUTE ON FUNCTION public.community_notify() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.community_unnotify() FROM PUBLIC, anon, authenticated;


/* ── đánh dấu đã đọc: mọi thông báo của chính mình ── */
CREATE OR REPLACE FUNCTION public.community_mark_notifications_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_n   integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  UPDATE public.community_notifications SET read_at = now()
  WHERE user_id = v_uid AND read_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.community_mark_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_mark_notifications_read() TO authenticated;
