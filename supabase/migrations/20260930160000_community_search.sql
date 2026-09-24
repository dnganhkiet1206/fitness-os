-- ════════════════════════════════════════════════════════════════════════════
-- Cộng đồng — Tìm người & gợi ý theo dõi (issue #19, người làm A).
--
-- Tab "Đang theo dõi" trống với người mới, và trước commit này chỉ có MỘT cách
-- để theo dõi ai: bấm vào tên trên một bài tình cờ gặp ở Khám phá.
--
-- ── vì sao là RPC, khi bảng hồ sơ vốn đọc được ──
--
-- `community_profiles` mở đọc cho mọi người đã đăng nhập, nên một `ilike` phía
-- client cũng chạy. Nhưng nó (1) quét cả bảng từ máy người dùng, (2) không lọc
-- được cặp đã chặn nhau — dòng chặn của NGƯỜI KIA không đọc được qua RLS — và
-- (3) không có trần. Hàm ở đây lọc chặn hai chiều bằng `community_blocked_between`
-- và trả tối đa 20 dòng.
--
-- ── tìm gì ──
--
-- Tiền tố của `handle` (luôn chữ thường, theo CHECK của bảng), hoặc tiền tố của
-- MỘT TỪ trong tên hiển thị ("linh" khớp "Linh Phạm" và "Minh Linh"). Tối thiểu
-- 2 ký tự: một ký tự khớp gần hết bảng. `%` và `_` trong chuỗi tìm được thoát —
-- không thì "_" khớp mọi thứ. Không bỏ dấu: không giả định extension `unaccent`
-- có trên project; handle là ASCII nên tìm theo handle luôn chạy.
--
-- ── gợi ý: không lộ hoạt động riêng ──
--
-- Tài khoản chính thức trước, rồi người có bài trong 14 ngày mà mình chưa theo
-- dõi. Chỉ đếm bài CÔNG KHAI và CHƯA BỊ ẨN: đếm cả bài "chỉ người theo dõi" là cho
-- người lạ biết một người đăng bao nhiêu thứ họ không được xem. Không gợi ý theo
-- danh bạ hay vị trí.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.community_search_profiles(p_q text)
RETURNS TABLE (
  user_id uuid, handle text, display_name text, mascot_id text, is_official boolean, bio text, i_follow boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_q   text := lower(btrim(coalesce(p_q, '')));
  v_pat text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  v_q := left(ltrim(v_q, '@'), 40);
  IF char_length(v_q) < 2 THEN
    RETURN;
  END IF;
  -- Ký tự đại diện của LIKE thành chữ thường; `\` là ký tự thoát mặc định.
  v_pat := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

  RETURN QUERY
  SELECT p.user_id, p.handle, p.display_name, p.mascot_id, p.is_official, p.bio,
         EXISTS (SELECT 1 FROM public.community_follows f WHERE f.follower_id = v_uid AND f.followee_id = p.user_id)
  FROM public.community_profiles p
  WHERE p.user_id <> v_uid
    AND NOT public.community_blocked_between(v_uid, p.user_id)
    AND (
      p.handle LIKE v_pat || '%'
      OR lower(p.display_name) LIKE v_pat || '%'
      OR lower(p.display_name) LIKE '% ' || v_pat || '%'
    )
  -- Gõ đúng handle thì người ấy đứng đầu, rồi tài khoản chính thức.
  ORDER BY (p.handle = v_q) DESC, p.is_official DESC, p.handle
  LIMIT 20;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.community_search_profiles(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_search_profiles(text) TO authenticated;


CREATE OR REPLACE FUNCTION public.community_follow_suggestions()
RETURNS TABLE (
  user_id uuid, handle text, display_name text, mascot_id text, is_official boolean, bio text, recent_posts integer
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
  SELECT s.user_id, s.handle, s.display_name, s.mascot_id, s.is_official, s.bio, s.n
  FROM (
    SELECT p.*,
           (SELECT count(*)::integer FROM public.community_posts x
            WHERE x.author_id = p.user_id AND x.visibility = 'public' AND NOT x.hidden
              AND x.created_at >= now() - interval '14 days') AS n
    FROM public.community_profiles p
    WHERE p.user_id <> v_uid
      AND NOT public.community_blocked_between(v_uid, p.user_id)
      AND NOT EXISTS (SELECT 1 FROM public.community_follows f WHERE f.follower_id = v_uid AND f.followee_id = p.user_id)
  ) s
  WHERE s.is_official OR s.n > 0
  ORDER BY s.is_official DESC, s.n DESC, s.handle
  LIMIT 10;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.community_follow_suggestions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_follow_suggestions() TO authenticated;
