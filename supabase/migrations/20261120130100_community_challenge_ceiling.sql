-- ════════════════════════════════════════════════════════════════════════════
-- KOA-T54 (5) — `claim_community_challenge`: trần 800 xu / ngày KHÔNG tính xu khám phá (`x:`, một lần trọn
-- đời), như `claim_quest_reward` (20261119120000). Trước đây 195 xu khám phá trong ngày chỉ ăn vào trần của
-- thử thách cộng đồng. Chỉ thay thân hàm; không đổi bảng, không đổi quyền.
-- ════════════════════════════════════════════════════════════════════════════

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
    -- KOA-T54 (5): như `claim_quest_reward` — xu khám phá (`x:`, một lần trọn đời) không tính vào trần ngày.
    SELECT coalesce(sum(amount), 0) INTO v_today FROM public.mascot_transactions
    WHERE user_id = v_uid AND amount > 0 AND COALESCE(ref_key, '') NOT LIKE 'x:%'
      AND created_at >= date_trunc('day', now());
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

