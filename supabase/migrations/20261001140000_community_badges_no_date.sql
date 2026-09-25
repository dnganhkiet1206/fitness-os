-- ════════════════════════════════════════════════════════════════════════════
-- Cộng đồng — huy hiệu thử thách: KHÔNG trả ngày nhận (#88, người làm: B).
--
-- `20261001120000_community_badges.sql` (#42) trả thêm `claimed_on date`, cắt
-- từ `claimed_at::date`. Phép ép ấy dùng múi giờ của PHIÊN Postgres (UTC trên
-- Supabase), nên ai nhận thưởng lúc 00:00–06:59 giờ Việt Nam thì ra ngày hôm
-- trước. A bắt được khi kiểm chéo #42.
--
-- A đề nghị hai cách: trả `claimed_at timestamptz` như lịch sử (#41), hoặc nhận
-- `p_offset_min` như tiến độ. Tệp này chọn cách thứ ba — không trả ngày — vì:
-- - Không màn nào đọc nó. Hàng huy hiệu (`community-user.tsx`) chỉ vẽ tên thử
--   thách; #42 cũng không đòi ngày. Cột ấy chỉ đi qua mạng.
-- - Đây là dữ liệu của NGƯỜI KHÁC. Lịch sử (#41) trả `timestamptz` cho chính
--   chủ nhân; ở đây người xem là ai cũng được, và một mốc giờ nhận thưởng là
--   giờ người ta cầm máy — thói quen sinh hoạt, cùng lý do #7 gỡ `eatenAt` khỏi
--   bài Recipe. Sửa "đúng múi giờ" bằng `timestamptz` sẽ lộ NHIỀU hơn bây giờ.
-- Khi nào một màn cần ngày, trả `timestamptz` cho client tự đổi theo giờ máy.
--
-- Thứ tự "mới nhận nhất trước" vẫn tính ở server từ `claimed_at`; nó chỉ không
-- rời server.
--
-- Hàm dưới đây là ĐÚNG bản #42, trừ kiểu trả về và danh sách chọn. Đổi cột
-- trả về thì `CREATE OR REPLACE` không làm được, nên DROP rồi CREATE; DROP làm
-- mất quyền, nên REVOKE/GRANT được đặt lại y như cũ (hàm mới mặc định cho
-- PUBLIC gọi). Không sửa migration đã commit.
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.community_user_badges(uuid);

CREATE FUNCTION public.community_user_badges(p_user uuid)
RETURNS TABLE (challenge_id uuid, title text)
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
  SELECT c.id, c.title
  FROM public.community_challenge_members m
  JOIN public.community_challenges c ON c.id = m.challenge_id
  WHERE m.user_id = p_user AND m.claimed_at IS NOT NULL
  ORDER BY m.claimed_at DESC
  LIMIT 50;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.community_user_badges(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_user_badges(uuid) TO authenticated;
