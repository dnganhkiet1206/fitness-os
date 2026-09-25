-- ════════════════════════════════════════════════════════════════════════════
-- Cộng đồng — lịch sử thử thách ĐÃ HOÀN THÀNH (issue #41, người làm A).
--
-- `community_challenges_overview` cố ý bỏ thử thách hết hạn quá 7 ngày: nó là
-- câu trả lời cho "đang có gì để làm". Người đã hoàn thành ba thử thách thì
-- không có chỗ nào để thấy chúng sau tuần ấy. Hàm này là câu trả lời cho câu
-- hỏi khác — "mình đã làm được gì" — nên nó là một hàm RIÊNG, không phải một
-- điều kiện nới ra trong tổng quan.
--
-- ── hoàn thành = đã nhận thưởng ──
--
-- `claimed_at` chỉ `claim_community_challenge` đặt được, và nó chỉ đặt sau khi
-- đã xác minh tiến độ ở server (không có policy UPDATE). Một thử thách đạt mà
-- chưa nhận nằm trong tổng quan tới 7 ngày sau hạn, với nút Nhận.
--
-- ── số xu là số THẬT ĐÃ VÀO SỔ ──
--
-- `reward_coins` của thử thách là con số HIỆN TẠI; dashboard sửa được nó sau
-- khi người ta đã nhận. Lịch sử hiện con số đã vào `mascot_transactions` qua
-- khoá `cc:<id>` — UNIQUE(user_id, ref_key) nên ghép không nhân dòng. Thử
-- thách không có thưởng thì không có dòng sổ, và ra 0.
--
-- ── quyền của người GỌI ──
--
-- SECURITY INVOKER: RLS của `community_challenge_members` ("Users see their own
-- memberships") và của sổ xu đã chỉ cho đọc dòng của chính mình, nên hàm không
-- cần quyền nào hơn người gọi. `m.user_id = auth.uid()` vẫn được viết ra: nếu
-- một ngày policy ấy nới, hàm này không tự nhiên thành danh sách của mọi người.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.community_challenge_history()
RETURNS TABLE (
  id uuid, title text, description text, target integer, starts_on date, ends_on date,
  coins integer, claimed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.id, c.title, c.description, c.target, c.starts_on, c.ends_on,
         coalesce(t.amount, 0)::integer, m.claimed_at
  FROM public.community_challenge_members m
  JOIN public.community_challenges c ON c.id = m.challenge_id
  LEFT JOIN public.mascot_transactions t ON t.user_id = m.user_id AND t.ref_key = 'cc:' || c.id::text
  WHERE m.user_id = auth.uid() AND m.claimed_at IS NOT NULL
  ORDER BY m.claimed_at DESC
  LIMIT 200;
$$;

REVOKE EXECUTE ON FUNCTION public.community_challenge_history() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_challenge_history() TO authenticated;
