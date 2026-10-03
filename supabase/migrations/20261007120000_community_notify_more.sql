-- Cộng đồng: bốn loại thông báo concept §17 còn thiếu, cài đặt thông báo, và
-- tắt bình luận trên bài của mình (A, 03/10 — đề xuất sau báo cáo 03/10).
--
-- Không sửa migration cũ nào. Bốn phần:
--   1. thông báo `save` (có người lưu bài), `try` (có người thử buổi tập) và
--      `challenge_milestone` (chính mình đạt 50% / 100% thử thách — thông báo
--      của HỆ THỐNG, không có người gây ra, nên `actor_id` thôi bắt buộc);
--   2. `community_post_tries`: trước đây "Thử buổi tập" chỉ tạo một mẫu tập ở
--      máy, server không biết ai đã thử bài nào — không có gì để báo;
--   3. cài đặt thông báo: một cột bật/tắt cho mỗi nhóm trong
--      `community_settings`, và MỘT trigger BEFORE INSERT trên bảng thông báo
--      lọc theo nó — mọi chỗ sinh thông báo (cũ lẫn mới) đi qua đúng một cửa;
--   4. `community_posts.comments_off` + một policy RESTRICTIVE chặn bình luận
--      mới của người khác, đặt qua `community_set_comments_off` (bài không có
--      policy UPDATE cho client, và không nên có).
--
-- "Có người tham gia thử thách của bạn" (§17) KHÔNG làm: thử thách hiện do app
-- tạo, người dùng không tạo được thử thách nào để người khác tham gia.


/* ── 1. thông báo: ba loại mới ── */
ALTER TABLE public.community_notifications ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE public.community_notifications
  ADD COLUMN challenge_id uuid REFERENCES public.community_challenges(id) ON DELETE CASCADE,
  ADD COLUMN milestone smallint CHECK (milestone IN (50, 100));

-- Ràng buộc "follow ⇔ không có bài" của #13 được tìm theo ĐỊNH NGHĨA, như
-- 20261003120000 đã làm (tên tự sinh `…_check1` dịch số khi một CHECK khác bị
-- bỏ): thông báo mốc thử thách cũng không có bài.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.community_notifications'::regclass AND contype = 'c'
  LOOP
    IF r.def LIKE '%''follow''%' AND r.def LIKE '%post_id IS NULL%' THEN
      EXECUTE format('ALTER TABLE public.community_notifications DROP CONSTRAINT %I', r.conname);
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.community_notifications'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%''follow''%' AND pg_get_constraintdef(oid) LIKE '%post_id IS NULL%'
  ) THEN
    RAISE EXCEPTION 'community_notifications: ràng buộc follow ⇔ post_id của #13 chưa được gỡ';
  END IF;
END $$;
-- Câu theo tên cho `tools/fixture-integrity.mjs` (đọc migration bằng mẫu chữ,
-- không chạy khối DO); trên Postgres khối trên đã gỡ đúng ràng buộc.
ALTER TABLE public.community_notifications DROP CONSTRAINT IF EXISTS community_notifications_check1;
ALTER TABLE public.community_notifications DROP CONSTRAINT IF EXISTS community_notifications_kind_check;

ALTER TABLE public.community_notifications
  ADD CONSTRAINT community_notifications_kind_check
    CHECK (kind IN ('like', 'comment', 'follow', 'reply', 'mention', 'save', 'try', 'challenge_milestone')),
  ADD CONSTRAINT community_notifications_post_kinds
    CHECK ((kind IN ('follow', 'challenge_milestone')) = (post_id IS NULL)),
  ADD CONSTRAINT community_notifications_system_kinds
    CHECK ((kind = 'challenge_milestone') = (actor_id IS NULL)),
  ADD CONSTRAINT community_notifications_milestone_kinds
    CHECK ((kind = 'challenge_milestone') = (challenge_id IS NOT NULL AND milestone IS NOT NULL));

CREATE UNIQUE INDEX community_notifications_save_once
  ON public.community_notifications (user_id, actor_id, post_id) WHERE kind = 'save';
CREATE UNIQUE INDEX community_notifications_try_once
  ON public.community_notifications (user_id, actor_id, post_id) WHERE kind = 'try';
CREATE UNIQUE INDEX community_notifications_milestone_once
  ON public.community_notifications (user_id, challenge_id, milestone) WHERE kind = 'challenge_milestone';


/* ── 2. ai đã thử buổi tập nào ── */
CREATE TABLE public.community_post_tries (
  post_id  uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id  uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  tried_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

ALTER TABLE public.community_post_tries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own tries"
  ON public.community_post_tries FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- Bài phải đọc được (RLS của community_posts áp trong EXISTS) và là bài buổi tập.
CREATE POLICY "Users try visible workout posts"
  ON public.community_post_tries FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id = post_id AND p.kind = 'workout')
  );

GRANT SELECT, INSERT ON public.community_post_tries TO authenticated;


/* ── sinh / rút thông báo lưu bài và thử buổi tập ── */
CREATE OR REPLACE FUNCTION public.community_notify_more()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_to   uuid;
  v_kind text := CASE TG_TABLE_NAME WHEN 'community_saves' THEN 'save' ELSE 'try' END;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.community_notifications
    WHERE kind = v_kind AND post_id = OLD.post_id AND actor_id = OLD.user_id;
    RETURN OLD;
  END IF;
  SELECT author_id INTO v_to FROM public.community_posts WHERE id = NEW.post_id;
  -- Cùng luật với #13: không tự báo cho mình, người gây ra phải có hồ sơ (thông
  -- báo nói TÊN họ), và không báo qua một cặp đã chặn nhau.
  IF v_to IS NULL OR v_to = NEW.user_id
     OR NOT EXISTS (SELECT 1 FROM public.community_profiles WHERE user_id = NEW.user_id)
     OR public.community_blocked_between(v_to, NEW.user_id) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.community_notifications (user_id, actor_id, kind, post_id)
  VALUES (v_to, NEW.user_id, v_kind, NEW.post_id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_saves_notify
  AFTER INSERT ON public.community_saves
  FOR EACH ROW EXECUTE FUNCTION public.community_notify_more();
CREATE TRIGGER community_saves_unnotify
  AFTER DELETE ON public.community_saves
  FOR EACH ROW EXECUTE FUNCTION public.community_notify_more();
CREATE TRIGGER community_post_tries_notify
  AFTER INSERT ON public.community_post_tries
  FOR EACH ROW EXECUTE FUNCTION public.community_notify_more();

REVOKE EXECUTE ON FUNCTION public.community_notify_more() FROM PUBLIC, anon, authenticated;


/* ── mốc thử thách ── */
-- Server không biết múi giờ của người dùng, mà "một ngày có tập" là ngày ĐỊA
-- PHƯƠNG. Độ lệch được ghi lúc tham gia (máy gửi kèm), và tiến độ đếm bằng
-- đúng hàm mà màn thử thách dùng. Thành viên cũ mang 0 (UTC).
ALTER TABLE public.community_challenge_members
  ADD COLUMN offset_min integer NOT NULL DEFAULT 0 CHECK (offset_min BETWEEN -720 AND 840);

CREATE OR REPLACE FUNCTION public.community_notify_milestone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  v_done integer;
BEGIN
  FOR m IN
    SELECT cm.challenge_id, cm.offset_min, c.target
    FROM public.community_challenge_members cm
    JOIN public.community_challenges c ON c.id = cm.challenge_id
    WHERE cm.user_id = NEW.user_id
      AND cm.claimed_at IS NULL
      AND c.ends_on >= (NEW.date_time AT TIME ZONE 'UTC')::date - 1
      AND c.starts_on <= (NEW.date_time AT TIME ZONE 'UTC')::date + 1
  LOOP
    v_done := public.community_challenge_progress(m.challenge_id, NEW.user_id, m.offset_min);
    IF v_done >= m.target THEN
      INSERT INTO public.community_notifications (user_id, kind, challenge_id, milestone)
      VALUES (NEW.user_id, 'challenge_milestone', m.challenge_id, 100) ON CONFLICT DO NOTHING;
    ELSIF v_done * 2 >= m.target THEN
      INSERT INTO public.community_notifications (user_id, kind, challenge_id, milestone)
      VALUES (NEW.user_id, 'challenge_milestone', m.challenge_id, 50) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Một thông báo hỏng KHÔNG được làm hỏng việc lưu buổi tập — thứ người dùng
  -- vừa bấm Lưu. Ghi cảnh báo vào log của Postgres thay vì nuốt im lặng.
  RAISE WARNING 'community_notify_milestone: % (%)', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

CREATE TRIGGER workout_sessions_challenge_milestone
  AFTER INSERT ON public.workout_sessions
  FOR EACH ROW EXECUTE FUNCTION public.community_notify_milestone();

REVOKE EXECUTE ON FUNCTION public.community_notify_milestone() FROM PUBLIC, anon, authenticated;


/* ── 3. cài đặt thông báo ── */
ALTER TABLE public.community_settings
  ADD COLUMN notify_likes      boolean NOT NULL DEFAULT true,
  ADD COLUMN notify_comments   boolean NOT NULL DEFAULT true,
  ADD COLUMN notify_mentions   boolean NOT NULL DEFAULT true,
  ADD COLUMN notify_follows    boolean NOT NULL DEFAULT true,
  ADD COLUMN notify_saves      boolean NOT NULL DEFAULT true,
  ADD COLUMN notify_tries      boolean NOT NULL DEFAULT true,
  ADD COLUMN notify_challenges boolean NOT NULL DEFAULT true;

-- Một cửa cho mọi thông báo: tắt một nhóm là không hàng nào của nhóm ấy được
-- ghi (không phải "ghi rồi ẩn" — ẩn ở client vẫn để server giữ và đếm chúng).
-- Chưa có hàng cài đặt = mặc định, tức bật hết.
CREATE OR REPLACE FUNCTION public.community_notify_filter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.community_settings%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.community_settings WHERE user_id = NEW.user_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF (NEW.kind = 'like' AND NOT s.notify_likes)
     OR (NEW.kind IN ('comment', 'reply') AND NOT s.notify_comments)
     OR (NEW.kind = 'mention' AND NOT s.notify_mentions)
     OR (NEW.kind = 'follow' AND NOT s.notify_follows)
     OR (NEW.kind = 'save' AND NOT s.notify_saves)
     OR (NEW.kind = 'try' AND NOT s.notify_tries)
     OR (NEW.kind = 'challenge_milestone' AND NOT s.notify_challenges) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_notifications_filter
  BEFORE INSERT ON public.community_notifications
  FOR EACH ROW EXECUTE FUNCTION public.community_notify_filter();

REVOKE EXECUTE ON FUNCTION public.community_notify_filter() FROM PUBLIC, anon, authenticated;


/* ── 4. tắt bình luận trên bài của mình ── */
ALTER TABLE public.community_posts ADD COLUMN comments_off boolean NOT NULL DEFAULT false;

-- RESTRICTIVE: AND với policy chèn sẵn có. Bài tắt bình luận thì chỉ tác giả
-- còn bình luận được; bình luận đã có vẫn đứng nguyên.
CREATE POLICY "No new comments when the author turned them off"
  ON public.community_comments AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = post_id AND p.comments_off AND p.author_id <> auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.community_set_comments_off(p_post_id uuid, p_off boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_off IS NULL THEN
    RAISE EXCEPTION 'p_off is required' USING ERRCODE = '22023';
  END IF;
  -- "Không phải bài của mình" và "không có bài" là một lỗi: không dò được bài
  -- của người khác có tồn tại hay không.
  UPDATE public.community_posts SET comments_off = p_off
  WHERE id = p_post_id AND author_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'post not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.community_set_comments_off(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_set_comments_off(uuid, boolean) TO authenticated;


/* ── 5. thành tích cộng đồng trên hồ sơ ── */
-- Ba con số: số bài, lượt thích nhận được, số người đã thử buổi tập của người
-- ấy. CHỈ trên những bài NGƯỜI XEM được thấy (đúng luật đọc bài: không ẩn,
-- công khai hoặc mình theo dõi, hoặc là bài của chính mình) — một con số đếm
-- cả bài chỉ-người-theo-dõi sẽ để lộ rằng những bài ấy tồn tại. Hai người chặn
-- nhau: không có hàng nào.
CREATE OR REPLACE FUNCTION public.community_user_stats(p_user uuid)
RETURNS TABLE (posts integer, likes integer, tries integer)
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
  IF public.community_blocked_between(v_uid, p_user) THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH seen AS (
    SELECT p.id, p.like_count
    FROM public.community_posts p
    WHERE p.author_id = p_user
      AND (
        p_user = v_uid
        OR (
          NOT p.hidden
          AND (
            p.visibility = 'public'
            OR EXISTS (SELECT 1 FROM public.community_follows f WHERE f.follower_id = v_uid AND f.followee_id = p_user)
          )
        )
      )
  )
  SELECT
    (SELECT count(*) FROM seen)::integer,
    (SELECT coalesce(sum(like_count), 0) FROM seen)::integer,
    (SELECT count(*) FROM public.community_post_tries t WHERE t.post_id IN (SELECT id FROM seen))::integer;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.community_user_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_user_stats(uuid) TO authenticated;
