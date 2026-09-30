-- ════════════════════════════════════════════════════════════════════════════
-- Cộng đồng — trả lời một bình luận (một tầng) và nhắc @handle (#30, người làm B).
--
-- Bình luận từng là một danh sách phẳng: trả lời ai đó thì chỉ có cách gõ tên
-- người ấy và mong họ đọc được, và hộp thông báo (#13) không báo cho người
-- được trả lời.
--
-- ── luật ──
--
--   1. MỘT tầng. `parent_id` luôn trỏ vào một bình luận GỐC: trả lời một câu
--      trả lời thì được gắn vào gốc của nó (trigger chuẩn hoá, không từ chối —
--      người bấm "Trả lời" dưới một câu trả lời muốn nói với người ấy, và câu
--      của họ vẫn nằm đúng luồng). Cha phải CÙNG bài. Xoá gốc thì các câu trả
--      lời đi theo (ON DELETE CASCADE), và bộ đếm bình luận của bài trừ đúng
--      từng dòng vì trigger đếm là FOR EACH ROW.
--
--   2. Nhắc `@handle` chỉ nhận handle CÓ THẬT và không qua một cặp đã chặn
--      nhau, không nhận chính mình. Server phân giải lúc ghi và lưu vào
--      `community_comment_mentions` — client vẽ liên kết từ bảng ấy, không tự
--      đoán chuỗi nào là một người. Không có policy ghi: chỉ trigger ghi.
--
--   3. Thông báo (#13) thêm hai loại, `reply` và `mention`, bằng migration NÀY
--      — migration của #13 giữ nguyên, và `community_notify()` /
--      `community_unnotify()` của A không bị định nghĩa lại. Một trigger mới
--      chạy SAU `community_comments_notify` (Postgres gọi trigger cùng thời
--      điểm theo thứ tự TÊN):
--        · tác giả bình luận cha nhận `reply`; nếu người ấy cũng là chủ bài thì
--          dòng `comment` vừa sinh ĐỔI thành `reply` — một người, một thông
--          báo cho một bình luận;
--        · người được nhắc nhận `mention`, trừ khi đã có thông báo về chính
--          bình luận ấy (chủ bài, người được trả lời);
--        · mọi luật của #13 giữ nguyên: không tự báo cho mình, không báo qua
--          cặp đã chặn, người làm phải có hồ sơ. Rút bình luận (xoá, bị ẩn) thì
--          thông báo đi theo — hai đường dọn của #13 dọn theo `comment_id`, nên
--          chúng dọn cả hai loại mới mà không phải sửa.
-- ════════════════════════════════════════════════════════════════════════════

/* ── 1. một tầng ── */
ALTER TABLE public.community_comments
  ADD COLUMN parent_id uuid REFERENCES public.community_comments(id) ON DELETE CASCADE,
  ADD CONSTRAINT community_comments_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id);

CREATE INDEX community_comments_parent_idx ON public.community_comments (parent_id) WHERE parent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.community_comment_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent public.community_comments%ROWTYPE;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_parent FROM public.community_comments WHERE id = NEW.parent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reply target not found' USING ERRCODE = 'P0002';
  END IF;
  -- Trả lời một câu trả lời: gắn vào gốc của nó. Gốc thì không có cha, nên
  -- một bước là đủ — bất biến "cha luôn là gốc" được giữ từ lần ghi đầu.
  IF v_parent.parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.community_comments WHERE id = v_parent.parent_id;
  END IF;
  IF v_parent.post_id <> NEW.post_id THEN
    RAISE EXCEPTION 'reply must be on the same post' USING ERRCODE = '22023';
  END IF;
  -- Không trả lời được một thứ mình không thấy: bình luận đã ẩn, hoặc của một
  -- người mình đã chặn / đã chặn mình.
  IF v_parent.hidden OR public.community_blocked_between(NEW.author_id, v_parent.author_id) THEN
    RAISE EXCEPTION 'reply target not available' USING ERRCODE = 'P0002';
  END IF;
  NEW.parent_id := v_parent.id;
  RETURN NEW;
END;
$$;

-- Không có policy UPDATE trên bình luận, nên `parent_id` chỉ đặt được lúc ghi;
-- trigger vẫn bám cả UPDATE OF parent_id để một đường ghi của server cũng không
-- dựng được hai tầng.
CREATE TRIGGER community_comments_thread
  BEFORE INSERT OR UPDATE OF parent_id ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.community_comment_thread();


/* ── 2. nhắc @handle ── */
CREATE TABLE public.community_comment_mentions (
  comment_id uuid NOT NULL REFERENCES public.community_comments(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.community_profiles(user_id) ON DELETE CASCADE,
  PRIMARY KEY (comment_id, user_id)
);
CREATE INDEX community_comment_mentions_user_idx ON public.community_comment_mentions (user_id);

ALTER TABLE public.community_comment_mentions ENABLE ROW LEVEL SECURITY;
-- Thấy được lượt nhắc khi thấy được bình luận (policy SELECT của bình luận áp
-- trong câu con này) và không có cặp chặn giữa người đọc và người được nhắc.
CREATE POLICY "Readers see mentions on comments they can read"
  ON public.community_comment_mentions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.community_comments c WHERE c.id = comment_id)
    AND NOT public.community_blocked_between(auth.uid(), user_id)
  );
REVOKE ALL ON public.community_comment_mentions FROM PUBLIC, anon;
GRANT SELECT ON public.community_comment_mentions TO authenticated;


/* ── 3. thông báo: hai loại mới ── */
-- Hai ràng buộc cũ của #13 — "kind thuộc ba loại" và "comment ⇔ comment_id" —
-- được tìm theo ĐỊNH NGHĨA trong pg_constraint, không theo tên. Tên tự sinh
-- của CHECK cấp bảng đánh số theo thứ tự khai (`…_check`, `…_check1`, …), và
-- đo được ở b_cases: một ca đột biến của A (N5) bỏ CHECK `user_id <> actor_id`
-- là mọi số dịch đi một, và một lệnh drop theo tên `…_check2` trượt.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.community_notifications'::regclass AND contype = 'c'
  LOOP
    IF (r.def LIKE '%kind = ANY%' AND r.def NOT LIKE '%post_id%' AND r.def NOT LIKE '%comment_id%')
       OR (r.def LIKE '%''comment''%' AND r.def LIKE '%comment_id IS NOT NULL%') THEN
      EXECUTE format('ALTER TABLE public.community_notifications DROP CONSTRAINT %I', r.conname);
    END IF;
  END LOOP;
  -- Không lặng lẽ: còn sót một ràng buộc cũ thì hai loại mới bị chặn mãi.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.community_notifications'::regclass AND contype = 'c'
      AND (pg_get_constraintdef(oid) LIKE '%comment_id IS NOT NULL%'
           OR (pg_get_constraintdef(oid) LIKE '%kind = ANY%' AND pg_get_constraintdef(oid) NOT LIKE '%post_id%'))
  ) THEN
    RAISE EXCEPTION 'community_notifications: ràng buộc cũ của #13 chưa được gỡ';
  END IF;
END $$;
-- Hai câu theo tên, sau khi khối trên đã gỡ đúng ràng buộc: trên Postgres chúng
-- không làm gì (IF EXISTS), nhưng `tools/fixture-integrity.mjs` đọc migration
-- bằng mẫu chữ và không chạy được khối DO — thiếu hai câu này nó áp CHECK cũ
-- lên fixture reply/mention và đỏ.
ALTER TABLE public.community_notifications DROP CONSTRAINT IF EXISTS community_notifications_kind_check;
ALTER TABLE public.community_notifications DROP CONSTRAINT IF EXISTS community_notifications_check2;

ALTER TABLE public.community_notifications
  ADD CONSTRAINT community_notifications_kind_check
    CHECK (kind IN ('like', 'comment', 'follow', 'reply', 'mention')),
  ADD CONSTRAINT community_notifications_comment_kinds
    CHECK ((kind IN ('comment', 'reply', 'mention')) = (comment_id IS NOT NULL));

-- Một người, một thông báo cho một bình luận.
CREATE UNIQUE INDEX community_notifications_one_per_comment
  ON public.community_notifications (user_id, comment_id) WHERE comment_id IS NOT NULL;

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
    INSERT INTO public.community_comment_mentions (comment_id, user_id) VALUES (NEW.id, v_target) ON CONFLICT DO NOTHING;
    INSERT INTO public.community_notifications (user_id, actor_id, kind, post_id, comment_id)
    VALUES (v_target, v_actor, 'mention', NEW.post_id, NEW.id) ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$;

-- Tên xếp SAU `community_comments_notify` (#13): trigger AFTER cùng bảng chạy
-- theo thứ tự tên, và bước "đổi comment thành reply" cần dòng của #13 đã có.
CREATE TRIGGER community_comments_notify_thread
  AFTER INSERT ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.community_notify_thread();

REVOKE EXECUTE ON FUNCTION public.community_comment_thread() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.community_notify_thread() FROM PUBLIC, anon, authenticated;
