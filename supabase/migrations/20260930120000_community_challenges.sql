-- ════════════════════════════════════════════════════════════════════════════
-- Cộng đồng — Thử thách (issue #9, người làm A).
--
-- Concept mục 9–10 + mockup màn 1: "Thử thách · 30 Days of Consistency —
-- 24 / 30 ngày — 2.481 người tham gia — Tham gia".
--
-- ── bốn luật ──
--
--   1. Thử thách do dashboard/seed tạo. Client không tạo, không sửa được
--      (không có policy INSERT/UPDATE/DELETE trên `community_challenges`).
--
--   2. Tiến độ tính ở SERVER, từ buổi tập đã ghi. Client không khai "tôi đã
--      xong 24 ngày"; nó chỉ hỏi. Loại duy nhất lúc này là `workout_days`:
--      số NGÀY KHÁC NHAU (theo giờ địa phương của người dùng) trong khoảng
--      [starts_on, ends_on] có ít nhất một buổi tập.
--
--   3. Số người tham gia là một phép đếm thật — nhưng danh sách người tham
--      gia thì KHÔNG lộ ra (RLS của bảng thành viên chỉ cho đọc dòng của
--      mình). Con số đi qua một hàm tổng quan SECURITY DEFINER.
--
--   4. Phần thưởng đi vào sổ xu `mascot_transactions` với khoá `cc:<id>`:
--      ràng buộc UNIQUE(user_id, ref_key) sẵn có chặn nhận hai lần, và cùng
--      trần 800 xu/ngày với `claim_quest_reward`. `reward_amount_for` không
--      biết khoá `cc:`, nên đi đường `claim_quest_reward` để nhận là bị từ
--      chối — chỉ hàm ở đây, sau khi xác minh hoàn thành, mới trả được.
--
-- ── múi giờ ──
--
-- Hồ sơ không lưu múi giờ. Một buổi tập 6 giờ sáng ở Việt Nam là 23 giờ HÔM
-- TRƯỚC theo UTC; đếm theo UTC thì buổi sáng gộp vào ngày hôm qua và người
-- dùng mất một ngày. Nên client gửi độ lệch UTC hiện tại (phút, chặn trong
-- -720…+840). Khai sai chỉ dời mỗi buổi tập tối đa một ngày — không tạo ra
-- buổi tập nào — và xu vẫn bị trần ngày chặn. Cái giá chấp nhận được cho
-- việc đếm đúng ngày của người thật.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE public.community_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 60),
  description  text NOT NULL DEFAULT '' CHECK (char_length(description) <= 400),
  kind         text NOT NULL DEFAULT 'workout_days' CHECK (kind IN ('workout_days')),
  target       integer NOT NULL CHECK (target BETWEEN 1 AND 365),
  starts_on    date NOT NULL,
  ends_on      date NOT NULL,
  reward_coins integer NOT NULL DEFAULT 0 CHECK (reward_coins BETWEEN 0 AND 800),
  -- Không có cột "người tạo". Thử thách là nội dung của nền tảng, không phải
  -- bài của một người; một khoá tới hồ sơ chỉ để ghi công sẽ là một mẩu dữ
  -- liệu người dùng không ai đọc, và nếu nó là SET NULL thì guard xoá tài
  -- khoản phải học cách bỏ qua SET NULL — đúng lỗ để bài của người đã xoá
  -- tài khoản nằm lại.
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  -- Không đặt được một đích không thể đạt: `target` ngày tập trong một khoảng
  -- ngắn hơn `target` ngày là một lời hứa thưởng không ai nhận được.
  CHECK (ends_on - starts_on + 1 >= target)
);

ALTER TABLE public.community_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can read challenges"
  ON public.community_challenges FOR SELECT TO authenticated USING (true);

CREATE TABLE public.community_challenge_members (
  challenge_id uuid NOT NULL REFERENCES public.community_challenges(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  claimed_at   timestamptz,
  PRIMARY KEY (challenge_id, user_id)
);

ALTER TABLE public.community_challenge_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own memberships"
  ON public.community_challenge_members FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- Tham gia: cho chính mình, khi thử thách còn mở, và chưa nhận thưởng.
CREATE POLICY "Users join open challenges"
  ON public.community_challenge_members FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND claimed_at IS NULL
    AND EXISTS (SELECT 1 FROM public.community_challenges c WHERE c.id = challenge_id AND c.ends_on >= current_date)
  );
-- Rời: chỉ khi CHƯA nhận thưởng (rời rồi vào lại không được làm mới lượt nhận).
CREATE POLICY "Users leave unclaimed challenges"
  ON public.community_challenge_members FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND claimed_at IS NULL);
-- Không có policy UPDATE: `claimed_at` chỉ hàm nhận thưởng đặt được.


/* Số ngày có tập trong khoảng của thử thách, theo giờ địa phương. */
CREATE OR REPLACE FUNCTION public.community_challenge_progress(p_challenge uuid, p_user uuid, p_offset_min integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(DISTINCT ((s.date_time AT TIME ZONE 'UTC') + make_interval(mins => greatest(-720, least(840, coalesce(p_offset_min, 0)))))::date)::integer
  FROM public.workout_sessions s
  JOIN public.community_challenges c ON c.id = p_challenge
  WHERE s.user_id = p_user
    AND ((s.date_time AT TIME ZONE 'UTC') + make_interval(mins => greatest(-720, least(840, coalesce(p_offset_min, 0)))))::date
        BETWEEN c.starts_on AND c.ends_on;
$$;

-- Hàm này nhận `p_user` bất kỳ, nên KHÔNG ai ngoài hai hàm dưới gọi được nó —
-- để client gọi thẳng là cho người ta đo số ngày tập của người khác.
REVOKE EXECUTE ON FUNCTION public.community_challenge_progress(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;


/* Tổng quan cho màn hình: mọi thử thách chưa hết hạn quá 7 ngày. */
CREATE OR REPLACE FUNCTION public.community_challenges_overview(p_offset_min integer DEFAULT 0)
RETURNS TABLE (
  id uuid, title text, description text, target integer, starts_on date, ends_on date,
  reward_coins integer, participants integer, joined boolean, progress integer, claimed boolean
)
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
  RETURN QUERY
  SELECT
    c.id, c.title, c.description, c.target, c.starts_on, c.ends_on, c.reward_coins,
    (SELECT count(*)::integer FROM public.community_challenge_members m WHERE m.challenge_id = c.id),
    me.user_id IS NOT NULL,
    CASE WHEN me.user_id IS NOT NULL THEN public.community_challenge_progress(c.id, v_uid, p_offset_min) ELSE 0 END,
    me.claimed_at IS NOT NULL
  FROM public.community_challenges c
  LEFT JOIN public.community_challenge_members me ON me.challenge_id = c.id AND me.user_id = v_uid
  -- Còn mở, hoặc hết hạn chưa quá 7 ngày (để người đã đạt vẫn kịp nhận).
  WHERE c.ends_on >= current_date - 7 AND c.starts_on <= current_date + 30
  ORDER BY (c.ends_on < current_date), c.ends_on ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.community_challenges_overview(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_challenges_overview(integer) TO authenticated;


/* Nhận thưởng — xác minh hoàn thành, đánh dấu, ghi sổ xu. */
CREATE OR REPLACE FUNCTION public.claim_community_challenge(p_challenge uuid, p_offset_min integer DEFAULT 0)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  c         public.community_challenges%ROWTYPE;
  v_claimed timestamptz;
  v_today   integer;
  MAX_PER_DAY CONSTANT integer := 800;  -- cùng trần với claim_quest_reward
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.community_challenges WHERE id = p_challenge;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'challenge not found' USING ERRCODE = 'P0002';
  END IF;

  -- Khoá theo người dùng như claim_quest_reward: hai lần bấm đồng thời không
  -- cùng đọc "chưa nhận" rồi cùng trả.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  SELECT claimed_at INTO v_claimed FROM public.community_challenge_members
  WHERE challenge_id = p_challenge AND user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not a member' USING ERRCODE = 'P0001';
  END IF;
  IF v_claimed IS NOT NULL THEN
    RAISE EXCEPTION 'already claimed' USING ERRCODE = '23505';
  END IF;
  IF public.community_challenge_progress(p_challenge, v_uid, p_offset_min) < c.target THEN
    RAISE EXCEPTION 'not completed' USING ERRCODE = '22023';
  END IF;

  IF c.reward_coins > 0 THEN
    SELECT coalesce(sum(amount), 0) INTO v_today FROM public.mascot_transactions
    WHERE user_id = v_uid AND amount > 0 AND created_at >= date_trunc('day', now());
    IF v_today + c.reward_coins > MAX_PER_DAY THEN
      RAISE EXCEPTION 'daily reward ceiling reached' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.mascot_transactions (user_id, amount, reason, ref_key)
    VALUES (v_uid, c.reward_coins, 'Thử thách: ' || c.title, 'cc:' || c.id)
    ON CONFLICT (user_id, ref_key) DO NOTHING;
  END IF;

  UPDATE public.community_challenge_members SET claimed_at = now()
  WHERE challenge_id = p_challenge AND user_id = v_uid;

  RETURN c.reward_coins;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_community_challenge(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_community_challenge(uuid, integer) TO authenticated;
