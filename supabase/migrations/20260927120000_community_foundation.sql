-- ════════════════════════════════════════════════════════════════════════════
-- Cộng đồng ASCND — giai đoạn 1: nền móng + bài Workout.
--
-- Đặt hàng (24/09): xây Community theo `ASCND_Community_Product_Concept.md`,
-- bắt đầu từ nền móng và bài Workout; feed trống thì có tài khoản ASCND chính
-- thức; KHÔNG tải ảnh — bài là thẻ dựng từ dữ liệu.
--
-- Ba nguyên tắc chạy xuyên suốt tệp này:
--
--   1. Chia sẻ là CHỦ ĐỘNG. Không bảng sức khoẻ nào (cân nặng, số đo, ảnh,
--      buổi tập) bị mở cho người khác đọc. Bài đăng là một BẢN CHỤP do chính
--      người dùng chọn chia sẻ, nằm ở bảng riêng. `workout_sessions` vẫn chỉ
--      chủ nó đọc được. (Concept mục 12; App Store 5.1.3 về dữ liệu sức khoẻ.)
--
--   2. Con số trên thẻ là số THẬT. Client không INSERT được vào
--      `community_posts` — không có policy INSERT. Bài chỉ sinh ra qua
--      `share_workout`, hàm đọc buổi tập CỦA NGƯỜI GỌI rồi tự dựng thẻ. Không
--      ai gửi được "12.840 kg · PR" cho một buổi không tồn tại.
--
--   3. An toàn trước tương tác (App Store 1.2 cho nội dung người dùng tạo):
--      báo cáo, chặn hai chiều, tự ẩn khi nhiều người báo cáo, và tác giả xoá
--      được bài/bình luận của mình.
--
-- Không đụng storage (không ảnh), và không đụng bảng hệ thống nào — xem
-- `tools/migration-privileges.mjs`. Mọi bảng treo `ON DELETE CASCADE` về
-- `auth.users`, nên `delete-account` (auth.admin.deleteUser) dọn sạch chúng.
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. Danh tính công khai ─────────────────────────────────────────────────
-- `profiles` giữ dữ liệu riêng (mục tiêu calo, chiều cao…) và CHỈ chủ đọc
-- được. Danh tính cộng đồng là một bảng khác hẳn, để không bao giờ phải nới
-- RLS của `profiles`. Avatar là LINH VẬT người dùng chọn — không ảnh tải lên.

CREATE TABLE public.community_profiles (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle       text NOT NULL UNIQUE CHECK (handle ~ '^[a-z0-9_.]{3,24}$'),
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 40),
  bio          text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 160),
  mascot_id    text,
  is_official  boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read community profiles"
  ON public.community_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users create their own community profile"
  ON public.community_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users edit their own community profile"
  ON public.community_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Dấu xác minh không đặt được từ app. Một policy không chặn được CỘT, nên
-- trigger giữ nguyên giá trị cũ (hoặc false khi tạo) cho hai vai trò API.
--
-- Ép theo `current_user` chứ không theo `auth.role()`: trigger không phải
-- SECURITY DEFINER nên chạy dưới vai trò của người gọi. SQL Editor của
-- dashboard chạy dưới `postgres`, nơi `auth.role()` rỗng — bản đầu ép theo
-- `auth.role() <> 'service_role'` và vì thế chặn luôn chủ dự án gắn dấu cho
-- chính tài khoản ASCND (`supabase/seed/community-official.sql`).
CREATE OR REPLACE FUNCTION public.community_profiles_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_official := false;
    ELSE
      NEW.is_official := OLD.is_official;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_profiles_guard
  BEFORE INSERT OR UPDATE ON public.community_profiles
  FOR EACH ROW EXECUTE FUNCTION public.community_profiles_guard();


-- ── 2. Chặn ────────────────────────────────────────────────────────────────
-- Dòng chặn thuộc về NGƯỜI CHẶN, và RLS chỉ cho họ đọc nó. Nhưng hiệu lực
-- phải HAI CHIỀU: người bị chặn cũng không được thấy bài của người chặn. Nên
-- phép hỏi "hai người này có chặn nhau không" chạy SECURITY DEFINER.

CREATE TABLE public.community_blocks (
  blocker_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.community_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own blocks"
  ON public.community_blocks FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
CREATE POLICY "Users block for themselves"
  ON public.community_blocks FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "Users unblock for themselves"
  ON public.community_blocks FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

CREATE OR REPLACE FUNCTION public.community_blocked_between(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_blocks
    WHERE (blocker_id = a AND blocked_id = b) OR (blocker_id = b AND blocked_id = a)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.community_blocked_between(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_blocked_between(uuid, uuid) TO authenticated;


-- ── 3. Theo dõi ────────────────────────────────────────────────────────────

CREATE TABLE public.community_follows (
  follower_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.community_profiles(user_id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES public.community_profiles(user_id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);

CREATE INDEX community_follows_followee_idx ON public.community_follows (followee_id);

ALTER TABLE public.community_follows ENABLE ROW LEVEL SECURITY;

-- Ai theo dõi ai là công khai với người đã đăng nhập — đó là thứ dựng số
-- "người theo dõi" trên hồ sơ, như mọi mạng xã hội.
CREATE POLICY "Signed-in users can read follows"
  ON public.community_follows FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users follow for themselves"
  ON public.community_follows FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = follower_id AND NOT public.community_blocked_between(follower_id, followee_id));
CREATE POLICY "Users unfollow for themselves"
  ON public.community_follows FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- Chặn thì gỡ luôn quan hệ theo dõi CẢ HAI CHIỀU, nếu không người bị chặn
-- vẫn nằm trong "Đang theo dõi" của người chặn và ngược lại.
CREATE OR REPLACE FUNCTION public.community_blocks_unfollow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.community_follows
  WHERE (follower_id = NEW.blocker_id AND followee_id = NEW.blocked_id)
     OR (follower_id = NEW.blocked_id AND followee_id = NEW.blocker_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_blocks_unfollow
  AFTER INSERT ON public.community_blocks
  FOR EACH ROW EXECUTE FUNCTION public.community_blocks_unfollow();


-- ── 4. Bài đăng ────────────────────────────────────────────────────────────
-- `kind` chỉ có 'workout' ở giai đoạn này; progress và recipe mở ra bằng
-- cách nới CHECK ở migration của chúng. `payload` là bản chụp do
-- `share_workout` dựng — xem mục 8.

CREATE TABLE public.community_posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     uuid NOT NULL REFERENCES public.community_profiles(user_id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('workout')),
  source_id     uuid,
  payload       jsonb NOT NULL,
  caption       text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 500),
  visibility    text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'followers')),
  like_count    integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  save_count    integer NOT NULL DEFAULT 0,
  hidden        boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Một buổi tập, một bài: chia sẻ lại cùng một buổi là thư rác.
  UNIQUE (author_id, source_id)
);

CREATE INDEX community_posts_feed_idx ON public.community_posts (created_at DESC);
CREATE INDEX community_posts_author_idx ON public.community_posts (author_id, created_at DESC);

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

-- Thấy được: bài của mình (kể cả khi bị ẩn — tác giả cần biết), hoặc bài
-- chưa bị ẩn của người không chặn/không bị mình chặn, công khai hoặc của
-- người mình đang theo dõi.
CREATE POLICY "Readers see visible posts"
  ON public.community_posts FOR SELECT TO authenticated
  USING (
    author_id = auth.uid()
    OR (
      NOT hidden
      AND NOT public.community_blocked_between(auth.uid(), author_id)
      AND (
        visibility = 'public'
        OR EXISTS (
          SELECT 1 FROM public.community_follows f
          WHERE f.follower_id = auth.uid() AND f.followee_id = community_posts.author_id
        )
      )
    )
  );
-- KHÔNG có policy INSERT hay UPDATE: bài sinh ra qua `share_workout`, bộ đếm
-- do trigger phía server giữ.
CREATE POLICY "Authors delete their own posts"
  ON public.community_posts FOR DELETE TO authenticated USING (auth.uid() = author_id);


-- ── 5. Thích và Lưu ────────────────────────────────────────────────────────
-- Chỉ tự đọc được dòng của mình (để tô trái tim). Tổng số nằm trên bài.
-- Phép `EXISTS` trên `community_posts` đi qua RLS của bảng ấy, nên không
-- thích/lưu được một bài mình không được thấy.

CREATE TABLE public.community_likes (
  post_id    uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE public.community_saves (
  post_id    uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX community_saves_user_idx ON public.community_saves (user_id, created_at DESC);

ALTER TABLE public.community_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own likes"
  ON public.community_likes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users like visible posts"
  ON public.community_likes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id = post_id));
CREATE POLICY "Users unlike"
  ON public.community_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users see their own saves"
  ON public.community_saves FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users save visible posts"
  ON public.community_saves FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id = post_id));
CREATE POLICY "Users unsave"
  ON public.community_saves FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- ── 6. Bình luận ───────────────────────────────────────────────────────────

CREATE TABLE public.community_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL DEFAULT auth.uid() REFERENCES public.community_profiles(user_id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  hidden     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX community_comments_post_idx ON public.community_comments (post_id, created_at);

ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Readers see comments on visible posts"
  ON public.community_comments FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id = post_id)
    AND (
      author_id = auth.uid()
      OR (NOT hidden AND NOT public.community_blocked_between(auth.uid(), author_id))
    )
  );
CREATE POLICY "Users comment on visible posts"
  ON public.community_comments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id = post_id)
  );
-- Người viết xoá bình luận của mình; chủ bài xoá được mọi bình luận trên bài.
CREATE POLICY "Authors and post owners delete comments"
  ON public.community_comments FOR DELETE TO authenticated
  USING (
    auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id = post_id AND p.author_id = auth.uid())
  );


-- ── 7. Bộ đếm ──────────────────────────────────────────────────────────────
-- Người thích không có quyền UPDATE bài của người khác, nên bộ đếm do trigger
-- SECURITY DEFINER giữ. `greatest(…, 0)` để một lần xoá lặp không đẩy số âm.

CREATE OR REPLACE FUNCTION public.community_count_bump()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d integer := CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE -1 END;
  pid uuid := CASE WHEN TG_OP = 'INSERT' THEN NEW.post_id ELSE OLD.post_id END;
BEGIN
  IF TG_TABLE_NAME = 'community_likes' THEN
    UPDATE public.community_posts SET like_count = greatest(like_count + d, 0) WHERE id = pid;
  ELSIF TG_TABLE_NAME = 'community_saves' THEN
    UPDATE public.community_posts SET save_count = greatest(save_count + d, 0) WHERE id = pid;
  ELSIF TG_TABLE_NAME = 'community_comments' THEN
    UPDATE public.community_posts SET comment_count = greatest(comment_count + d, 0) WHERE id = pid;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER community_likes_count
  AFTER INSERT OR DELETE ON public.community_likes
  FOR EACH ROW EXECUTE FUNCTION public.community_count_bump();
CREATE TRIGGER community_saves_count
  AFTER INSERT OR DELETE ON public.community_saves
  FOR EACH ROW EXECUTE FUNCTION public.community_count_bump();
CREATE TRIGGER community_comments_count
  AFTER INSERT OR DELETE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.community_count_bump();


-- ── 8. Chia sẻ một buổi tập ────────────────────────────────────────────────
-- Thẻ được dựng TỪ buổi tập của người gọi, ở đây, phía server:
--
--   bài tập     theo thứ tự xuất hiện; mỗi bài một dòng với SET NẶNG NHẤT
--               (nặng nhất rồi nhiều rep nhất) và số set làm việc. Set khởi
--               động bị bỏ — đúng như `lib/personal-record.ts` bỏ chúng.
--   library     true khi bài thuộc thư viện chung (`exercises.user_id IS
--               NULL`). "Thử workout" chỉ chép được những bài ấy: bài tự tạo
--               của người khác người xem không đọc được.
--   volumeKg    `volume_load` của buổi, không tính lại.
--   pr          cờ `pr_detected` — bảng không lưu SỐ kỷ lục, nên thẻ không
--               được nói "3 PRs".
--   minutes     do client ước tính (`trainingMinutes`) và gửi lên, vì bảng
--               không lưu thời lượng. Chặn trong 1…600; thẻ vẽ kèm dấu "~".

CREATE OR REPLACE FUNCTION public.share_workout(
  p_session_id uuid,
  p_caption    text DEFAULT '',
  p_visibility text DEFAULT 'public',
  p_minutes    integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  s           public.workout_sessions%ROWTYPE;
  v_exercises jsonb;
  v_id        uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.community_profiles WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'community profile required' USING ERRCODE = 'P0001';
  END IF;
  IF p_visibility NOT IN ('public', 'followers') THEN
    RAISE EXCEPTION 'bad visibility' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO s FROM public.workout_sessions WHERE id = p_session_id AND user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.community_posts WHERE author_id = v_uid AND source_id = p_session_id) THEN
    RAISE EXCEPTION 'already shared' USING ERRCODE = '23505';
  END IF;

  WITH raw AS (
    SELECT
      nullif(e->>'exerciseId', '')                         AS eid,
      coalesce(nullif(btrim(e->>'exerciseName'), ''), '?') AS ename,
      coalesce((e->>'weight')::numeric, 0)                 AS w,
      coalesce(round((e->>'reps')::numeric)::int, 0)       AS r,
      ord
    FROM jsonb_array_elements(coalesce(s.sets, '[]'::jsonb)) WITH ORDINALITY AS t(e, ord)
    WHERE coalesce((e->>'warmup')::boolean, false) = false
  ),
  per AS (
    SELECT
      coalesce(eid, 'name:' || ename)                   AS k,
      min(eid)                                          AS eid,
      min(ename)                                        AS ename,
      min(ord)                                          AS first_ord,
      count(*)                                          AS n_sets,
      (array_agg(w ORDER BY w DESC, r DESC))[1]         AS top_w,
      (array_agg(r ORDER BY w DESC, r DESC))[1]         AS top_r
    FROM raw
    GROUP BY 1
  )
  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'exerciseId',   per.eid,
             'exerciseName', per.ename,
             'library',      coalesce(x.user_id IS NULL AND x.id IS NOT NULL, false),
             'sets',         per.n_sets,
             'weight',       per.top_w,
             'reps',         per.top_r
           ) ORDER BY per.first_ord), '[]'::jsonb)
    INTO v_exercises
  FROM per
  LEFT JOIN public.exercises x ON x.id::text = per.eid;

  IF jsonb_array_length(v_exercises) = 0 THEN
    RAISE EXCEPTION 'empty session' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.community_posts (author_id, kind, source_id, payload, caption, visibility)
  VALUES (
    v_uid,
    'workout',
    p_session_id,
    jsonb_build_object(
      'title',         nullif(btrim(s.template_name), ''),
      'performedAt',   s.date_time,
      'volumeKg',      round(coalesce(s.volume_load, 0)::numeric, 1),
      'pr',            coalesce(s.pr_detected, false),
      'minutes',       CASE WHEN p_minutes BETWEEN 1 AND 600 THEN p_minutes END,
      'exerciseCount', jsonb_array_length(v_exercises),
      'exercises',     v_exercises
    ),
    left(coalesce(btrim(p_caption), ''), 500),
    p_visibility
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.share_workout(uuid, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_workout(uuid, text, text, integer) TO authenticated;


-- ── 9. Báo cáo, và tự ẩn ───────────────────────────────────────────────────
-- Người báo cáo chỉ đọc được báo cáo của mình. Xử lý do chủ dự án làm trên
-- dashboard (cột `status`). Trong lúc chờ, ba người KHÁC NHAU báo cáo cùng
-- một bài hay bình luận là nó tự ẩn khỏi mọi người trừ tác giả — Guideline
-- 1.2 đòi phản ứng kịp, và một hàng đợi không ai trực thì không kịp.

CREATE TABLE public.community_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id          uuid REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id       uuid REFERENCES public.community_comments(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  reason           text NOT NULL CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'misleading', 'other')),
  note             text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'dismissed')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(post_id, comment_id, reported_user_id) >= 1),
  UNIQUE (reporter_id, post_id),
  UNIQUE (reporter_id, comment_id)
);

ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users file reports"
  ON public.community_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id AND status = 'open');
CREATE POLICY "Users see their own reports"
  ON public.community_reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id);

CREATE OR REPLACE FUNCTION public.community_reports_autohide()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.post_id IS NOT NULL AND (
    SELECT count(DISTINCT reporter_id) FROM public.community_reports WHERE post_id = NEW.post_id
  ) >= 3 THEN
    UPDATE public.community_posts SET hidden = true WHERE id = NEW.post_id;
  END IF;
  IF NEW.comment_id IS NOT NULL AND (
    SELECT count(DISTINCT reporter_id) FROM public.community_reports WHERE comment_id = NEW.comment_id
  ) >= 3 THEN
    UPDATE public.community_comments SET hidden = true WHERE id = NEW.comment_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_reports_autohide
  AFTER INSERT ON public.community_reports
  FOR EACH ROW EXECUTE FUNCTION public.community_reports_autohide();
