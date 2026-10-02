-- Thử thách có bản tiếng Anh (#172, chủ dự án chọn hướng (a), 02/10).
--
-- ── lỗi ──
--
-- `community_challenges` chỉ có một `title` và một `description`, seed viết
-- bằng tiếng Việt. App có hai thứ tiếng, nên người dùng tiếng Anh đọc nửa câu
-- Anh nửa câu Việt: lưu buổi tập xong toast là "Workout saved! · 30 ngày kỷ
-- luật: 9/30 days" (đo trên web); hero, trang thử thách và hộp thư cũng vậy.
--
-- ── cách ──
--
-- Hai cột CÓ THỂ NULL: `title_en`, `description_en`. App chọn theo ngôn ngữ,
-- và cột tiếng Anh trống thì dùng cột gốc — một thử thách mới thêm từ
-- dashboard mà chưa dịch vẫn hiện được, chỉ là bằng tiếng Việt. Không có bảng
-- dịch riêng (hướng (b)): hai thứ tiếng là hai cột, ngôn ngữ thứ ba mới đáng
-- một bảng.
--
-- Hai RPC đọc thử thách trả thêm hai cột ấy. Kiểu trả về đổi, nên phải DROP
-- rồi CREATE (CREATE OR REPLACE không đổi được RETURNS TABLE); thân hàm, quyền
-- và cửa sổ nhận thưởng 7 ngày sau hạn (CLAIM_WINDOW_DAYS — tools/claim-window.mjs
-- đọc nó từ migration SAU CÙNG định nghĩa tổng quan, nên câu này không chép lại
-- biểu thức ấy: phép thử ngược của nó sửa lần xuất hiện ĐẦU TIÊN) giữ nguyên
-- từng chữ.
--
-- Không sửa migration cũ; không đổi dữ liệu nào ngoài bản dịch của thử thách
-- mở màn có sẵn.

ALTER TABLE public.community_challenges
  ADD COLUMN title_en text CHECK (title_en IS NULL OR char_length(btrim(title_en)) BETWEEN 1 AND 60),
  ADD COLUMN description_en text CHECK (description_en IS NULL OR char_length(description_en) <= 400);

-- Bản dịch của thử thách mở màn (seed `community-official.sql`, khoá theo tiêu
-- đề). Tên tiếng Anh là đúng chữ của mockup hero ("30 Days of Consistency").
UPDATE public.community_challenges
SET title_en = '30 Days of Consistency',
    description_en = 'Train on 30 different days over the next 60. Every session counts, as long as you show up.'
WHERE title = '30 ngày kỷ luật' AND title_en IS NULL;


DROP FUNCTION public.community_challenges_overview(integer);

CREATE FUNCTION public.community_challenges_overview(p_offset_min integer DEFAULT 0)
RETURNS TABLE (
  id uuid, title text, description text, target integer, starts_on date, ends_on date,
  reward_coins integer, participants integer, joined boolean, progress integer, claimed boolean,
  title_en text, description_en text
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
    me.claimed_at IS NOT NULL,
    c.title_en, c.description_en
  FROM public.community_challenges c
  LEFT JOIN public.community_challenge_members me ON me.challenge_id = c.id AND me.user_id = v_uid
  -- Còn mở, hoặc hết hạn chưa quá 7 ngày (để người đã đạt vẫn kịp nhận).
  WHERE c.ends_on >= current_date - 7 AND c.starts_on <= current_date + 30
  ORDER BY (c.ends_on < current_date), c.ends_on ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.community_challenges_overview(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_challenges_overview(integer) TO authenticated;


DROP FUNCTION public.community_challenge_history();

CREATE FUNCTION public.community_challenge_history()
RETURNS TABLE (
  id uuid, title text, description text, target integer, starts_on date, ends_on date,
  coins integer, claimed_at timestamptz,
  title_en text, description_en text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.id, c.title, c.description, c.target, c.starts_on, c.ends_on,
         coalesce(t.amount, 0)::integer, m.claimed_at,
         c.title_en, c.description_en
  FROM public.community_challenge_members m
  JOIN public.community_challenges c ON c.id = m.challenge_id
  LEFT JOIN public.mascot_transactions t ON t.user_id = m.user_id AND t.ref_key = 'cc:' || c.id::text
  WHERE m.user_id = auth.uid() AND m.claimed_at IS NOT NULL
  ORDER BY m.claimed_at DESC
  LIMIT 200;
$$;

REVOKE EXECUTE ON FUNCTION public.community_challenge_history() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_challenge_history() TO authenticated;
