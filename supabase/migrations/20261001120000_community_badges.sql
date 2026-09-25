-- ════════════════════════════════════════════════════════════════════════════
-- Cộng đồng — Huy hiệu thử thách trên hồ sơ (issue #42, người làm B).
--
-- Concept mục 10: hoàn thành một thử thách thì người ta có thứ để khoe. Trước
-- đây hoàn thành chỉ ra một toast và xu vào sổ; trên hồ sơ cộng đồng không ai
-- thấy gì.
--
-- Đánh số `20261001…`: dải của B theo đề nghị ở #6. Nó phải xếp SAU mọi
-- migration đã có (`community_settings` sinh ở 20260930130000, thử thách ở
-- 20260930120000), vì migration chạy theo thứ tự tên.
--
-- ── tắt sẵn ──
--
-- `show_badges` mặc định FALSE. Huy hiệu nói người ta đã tập những ngày nào,
-- trong khoảng nào — thứ `community_challenge_members` cố ý không cho ai khác
-- đọc (RLS chỉ chủ nhân). Bật là một quyết định của người ấy, trong Quyền
-- riêng tư, không phải một mặc định app đặt thay.
--
-- ── vì sao là RPC, và vì sao không nới RLS ──
--
-- Người xem hồ sơ của X cần đọc một phần hàng của X trong bảng thành viên. Mở
-- RLS ấy cho người khác là mở cả `joined_at` và mọi thử thách X đang tham gia
-- dở. Hàm này trả ĐÚNG phần được khoe: thử thách đã NHẬN THƯỞNG (hoàn thành
-- đã được `claim_community_challenge` xác minh ở server), tên, ngày nhận — và
-- chỉ khi X đã bật và hai người không chặn nhau (hai chiều).
--
-- Chính người ấy cũng chỉ thấy khi đã bật: hàng huy hiệu là thứ NGƯỜI KHÁC
-- thấy trên hồ sơ, và nó không được khác đi tuỳ ai đang nhìn.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.community_settings
  ADD COLUMN IF NOT EXISTS show_badges boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.community_user_badges(p_user uuid)
RETURNS TABLE (challenge_id uuid, title text, claimed_on date)
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
  IF p_user IS NULL THEN
    RETURN;
  END IF;
  IF NOT coalesce((SELECT s.show_badges FROM public.community_settings s WHERE s.user_id = p_user), false) THEN
    RETURN;
  END IF;
  IF public.community_blocked_between(v_uid, p_user) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT c.id, c.title, m.claimed_at::date
  FROM public.community_challenge_members m
  JOIN public.community_challenges c ON c.id = m.challenge_id
  WHERE m.user_id = p_user AND m.claimed_at IS NOT NULL
  ORDER BY m.claimed_at DESC
  LIMIT 50;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.community_user_badges(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_user_badges(uuid) TO authenticated;
