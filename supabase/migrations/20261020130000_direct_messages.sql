-- ════════════════════════════════════════════════════════════════════════════
-- Cộng đồng — Nhắn tin giữa người dùng (#527; chủ dự án 20/10: "làm tin nhắn thật").
--
-- Giao diện iOS đã có từ 15/10 (`DirectMessages.swift`, `CommunityMessagesView`)
-- nhưng ẩn vì chưa có server; kế hoạch: `apps/ios/docs/design/community/MESSAGING-PLAN.md`.
--
-- ── luật ──
--
--   1. Hội thoại là CẶP người, không trùng: `user_a < user_b`, UNIQUE (a, b).
--      Mở hội thoại chỉ qua RPC `dm_open` — kiểm chặn, khoá, quyền nhận tin.
--
--   2. Chỉ hai người trong cuộc đọc được (RLS SELECT). KHÔNG có policy INSERT /
--      UPDATE / DELETE nào cho người dùng: gửi qua `dm_send`, đánh dấu đọc qua
--      `dm_mark_read` — nên không ai bịa tin đứng tên người khác, sửa tin, hay đổi
--      `read_at` của tin mình gửi.
--
--   3. Chặn hai chiều (`community_blocked_between`): không mở, không gửi, và hội
--      thoại cũ ẩn khỏi cả hai phía. Người đang bị khoá (`community_restrictions`)
--      không gửi được.
--
--   4. "Ai được nhắn cho tôi" (`community_settings.dm_from`): mọi người (mặc định)
--      / người tôi theo dõi / không ai. Tin đầu từ người mình chưa theo dõi nằm ở
--      "Tin chờ" (như Instagram) tới khi mình trả lời.
--
--   5. Giới hạn: 30 tin / phút / người, 20 hội thoại mới / ngày, ≤ 1000 ký tự.
--
-- Chưa có: thông báo đẩy và realtime (app đọc lại khi mở hộp thư / hội thoại).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.community_settings
  ADD COLUMN IF NOT EXISTS dm_from text NOT NULL DEFAULT 'everyone'
    CHECK (dm_from IN ('everyone', 'following', 'nobody'));

CREATE TABLE public.dm_threads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a           uuid NOT NULL REFERENCES public.community_profiles(user_id) ON DELETE CASCADE,
  user_b           uuid NOT NULL REFERENCES public.community_profiles(user_id) ON DELETE CASCADE,
  started_by       uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_message_at  timestamptz,
  last_text        text NOT NULL DEFAULT '',
  last_sender      uuid,
  CHECK (user_a < user_b),
  CHECK (started_by IN (user_a, user_b)),
  UNIQUE (user_a, user_b)
);
CREATE INDEX dm_threads_a_idx ON public.dm_threads (user_a, last_message_at DESC);
CREATE INDEX dm_threads_b_idx ON public.dm_threads (user_b, last_message_at DESC);

CREATE TABLE public.dm_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  uuid NOT NULL REFERENCES public.dm_threads(id) ON DELETE CASCADE,
  sender_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       text NOT NULL DEFAULT '' CHECK (char_length(body) <= 1000),
  -- Buổi tập gửi vào hội thoại (bảng điểm thu nhỏ): {title, volume_kg, exercises, minutes, pr}.
  workout    jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz,
  CHECK (char_length(btrim(body)) > 0 OR workout IS NOT NULL)
);
CREATE INDEX dm_messages_thread_idx ON public.dm_messages (thread_id, created_at);
CREATE INDEX dm_messages_sender_idx ON public.dm_messages (sender_id, created_at DESC);

ALTER TABLE public.dm_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants read their threads"
  ON public.dm_threads FOR SELECT TO authenticated
  USING (auth.uid() IN (user_a, user_b) AND NOT public.community_blocked_between(user_a, user_b));

CREATE POLICY "Participants read their messages"
  ON public.dm_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dm_threads t
    WHERE t.id = thread_id AND auth.uid() IN (t.user_a, t.user_b)
      AND NOT public.community_blocked_between(t.user_a, t.user_b)));

REVOKE ALL ON public.dm_threads, public.dm_messages FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.dm_threads, public.dm_messages FROM authenticated;
GRANT SELECT ON public.dm_threads, public.dm_messages TO authenticated;

/* ── cửa chung: được nhắn cho `p_other` không ── */
CREATE OR REPLACE FUNCTION public.dm_can_message(p_me uuid, p_other uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_me <> p_other
    AND EXISTS (SELECT 1 FROM community_profiles WHERE user_id = p_me)
    AND EXISTS (SELECT 1 FROM community_profiles WHERE user_id = p_other)
    AND NOT community_blocked_between(p_me, p_other)
    AND NOT EXISTS (SELECT 1 FROM community_restrictions WHERE user_id = p_me AND until > now())
    AND CASE COALESCE((SELECT dm_from FROM community_settings WHERE user_id = p_other), 'everyone')
          WHEN 'everyone' THEN true
          WHEN 'following' THEN EXISTS (
            SELECT 1 FROM community_follows WHERE follower_id = p_other AND followee_id = p_me)
          ELSE false
        END;
$$;
REVOKE EXECUTE ON FUNCTION public.dm_can_message(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dm_can_message(uuid, uuid) TO authenticated;

/* ── mở (hoặc lấy) hội thoại với một người ── */
CREATE OR REPLACE FUNCTION public.dm_open(p_other uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_a uuid := LEAST(v_me, p_other);
  v_b uuid := GREATEST(v_me, p_other);
  v_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501'; END IF;
  SELECT id INTO v_id FROM dm_threads WHERE user_a = v_a AND user_b = v_b;
  IF v_id IS NOT NULL THEN
    IF community_blocked_between(v_me, p_other) THEN
      RAISE EXCEPTION 'blocked' USING ERRCODE = '42501';
    END IF;
    RETURN v_id;
  END IF;
  IF NOT dm_can_message(v_me, p_other) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(*) FROM dm_threads WHERE started_by = v_me AND created_at > now() - interval '1 day') >= 20 THEN
    RAISE EXCEPTION 'too many new conversations' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO dm_threads (user_a, user_b, started_by) VALUES (v_a, v_b, v_me)
  ON CONFLICT (user_a, user_b) DO UPDATE SET user_a = EXCLUDED.user_a
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dm_open(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dm_open(uuid) TO authenticated;

/* ── gửi ── */
CREATE OR REPLACE FUNCTION public.dm_send(p_thread uuid, p_body text, p_workout jsonb DEFAULT NULL)
RETURNS public.dm_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_t dm_threads;
  v_other uuid;
  v_body text := btrim(COALESCE(p_body, ''));
  v_row dm_messages;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_t FROM dm_threads WHERE id = p_thread;
  IF v_t.id IS NULL OR v_me NOT IN (v_t.user_a, v_t.user_b) THEN
    RAISE EXCEPTION 'no such conversation' USING ERRCODE = '42501';
  END IF;
  v_other := CASE WHEN v_t.user_a = v_me THEN v_t.user_b ELSE v_t.user_a END;
  IF community_blocked_between(v_me, v_other) THEN
    RAISE EXCEPTION 'blocked' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM community_restrictions WHERE user_id = v_me AND until > now()) THEN
    RAISE EXCEPTION 'restricted' USING ERRCODE = '42501';
  END IF;
  IF v_body = '' AND p_workout IS NULL THEN RAISE EXCEPTION 'empty' USING ERRCODE = '22023'; END IF;
  IF char_length(v_body) > 1000 THEN v_body := left(v_body, 1000); END IF;
  IF (SELECT count(*) FROM dm_messages WHERE sender_id = v_me AND created_at > now() - interval '1 minute') >= 30 THEN
    RAISE EXCEPTION 'slow down' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO dm_messages (thread_id, sender_id, body, workout)
  VALUES (p_thread, v_me, v_body, p_workout)
  RETURNING * INTO v_row;
  UPDATE dm_threads
     SET last_message_at = v_row.created_at,
         last_text = CASE WHEN v_body <> '' THEN left(v_body, 140) ELSE COALESCE(p_workout->>'title', '') END,
         last_sender = v_me
   WHERE id = p_thread;
  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dm_send(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dm_send(uuid, text, jsonb) TO authenticated;

/* ── đánh dấu đã đọc mọi tin GỬI CHO MÌNH trong hội thoại ── */
CREATE OR REPLACE FUNCTION public.dm_mark_read(p_thread uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE dm_messages m SET read_at = now()
   WHERE m.thread_id = p_thread AND m.sender_id <> auth.uid() AND m.read_at IS NULL
     AND EXISTS (SELECT 1 FROM dm_threads t WHERE t.id = p_thread AND auth.uid() IN (t.user_a, t.user_b));
$$;
REVOKE EXECUTE ON FUNCTION public.dm_mark_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dm_mark_read(uuid) TO authenticated;

/* ── hộp thư: mỗi hội thoại có tin, kèm người kia, chưa đọc, tin chờ ── */
CREATE OR REPLACE FUNCTION public.dm_inbox()
RETURNS TABLE (
  thread_id uuid, other_id uuid, last_text text, last_at timestamptz, last_from_me boolean,
  unread boolean, is_request boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id,
         CASE WHEN t.user_a = auth.uid() THEN t.user_b ELSE t.user_a END AS other_id,
         t.last_text, t.last_message_at, t.last_sender = auth.uid(),
         EXISTS (SELECT 1 FROM dm_messages m
                  WHERE m.thread_id = t.id AND m.sender_id <> auth.uid() AND m.read_at IS NULL),
         -- Tin chờ: người kia mở, mình chưa theo dõi họ và chưa trả lời câu nào.
         t.started_by <> auth.uid()
           AND NOT EXISTS (SELECT 1 FROM community_follows f
                            WHERE f.follower_id = auth.uid()
                              AND f.followee_id = CASE WHEN t.user_a = auth.uid() THEN t.user_b ELSE t.user_a END)
           AND NOT EXISTS (SELECT 1 FROM dm_messages m WHERE m.thread_id = t.id AND m.sender_id = auth.uid())
    FROM dm_threads t
   WHERE auth.uid() IN (t.user_a, t.user_b)
     AND t.last_message_at IS NOT NULL
     AND NOT community_blocked_between(t.user_a, t.user_b)
   ORDER BY t.last_message_at DESC
   LIMIT 200;
$$;
REVOKE EXECUTE ON FUNCTION public.dm_inbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dm_inbox() TO authenticated;
