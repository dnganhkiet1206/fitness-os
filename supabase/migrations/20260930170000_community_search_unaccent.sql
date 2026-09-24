-- ════════════════════════════════════════════════════════════════════════════
-- Cộng đồng — Tìm người không phân biệt dấu (issue #37, người làm A).
--
-- #19 so tiền tố bằng `lower(...) LIKE`, không bỏ dấu: gõ "pham" không ra
-- "Linh Phạm", gõ "dang" không ra "Đặng Khoa". Người Việt thường gõ không dấu
-- khi tìm.
--
-- ── không dùng extension `unaccent` ──
--
-- Không giả định nó có trên project, và nó phụ thuộc từ điển của máy chủ.
-- `community_fold` là SQL thuần, IMMUTABLE: `translate()` từng chữ có dấu của
-- tiếng Việt về chữ gốc, cả HOA lẫn thường, rồi mới `lower()`.
--
-- Vì sao dịch cả chữ hoa thay vì `lower()` trước: `lower()` chỉ hạ chữ ngoài
-- ASCII khi database dùng locale UTF-8. Với locale C, `lower('Đ')` vẫn là 'Đ'
-- — và một phép tìm chạy đúng hay sai tuỳ locale của project là một lỗi chỉ
-- lộ ra trên máy người dùng. Chữ hoa ASCII còn lại thì `lower()` luôn đúng.
--
-- Cả hai phía đi qua cùng một hàm: tên hiển thị VÀ chuỗi tìm, nên gõ có dấu
-- vẫn ra như cũ ("Phạm" → "pham" khớp "pham").
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.community_fold(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(translate(coalesce(p, ''),
    'àÀáÁạẠảẢãÃâÂầẦấẤậẬẩẨẫẪăĂằẰắẮặẶẳẲẵẴAèÈéÉẹẸẻẺẽẼêÊềỀếẾệỆểỂễỄEìÌíÍịỊỉỈĩĨIòÒóÓọỌỏỎõÕôÔồỒốỐộỘổỔỗỖơƠờỜớỚợỢởỞỡỠOùÙúÚụỤủỦũŨưƯừỪứỨựỰửỬữỮUỳỲýÝỵỴỷỶỹỸYđĐD',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaeeeeeeeeeeeeeeeeeeeeeeeiiiiiiiiiiiooooooooooooooooooooooooooooooooooouuuuuuuuuuuuuuuuuuuuuuuyyyyyyyyyyyddd'));
$$;

-- Hàm thuần, vô hại — nhưng giữ bất biến "mọi hàm gọi được đều đóng với anon"
-- (#15): chỉ hàm tìm (SECURITY DEFINER, chủ là postgres) gọi nó.
REVOKE EXECUTE ON FUNCTION public.community_fold(text) FROM PUBLIC, anon, authenticated;

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
  v_q   text := public.community_fold(btrim(coalesce(p_q, '')));
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
      OR public.community_fold(p.display_name) LIKE v_pat || '%'
      OR public.community_fold(p.display_name) LIKE '% ' || v_pat || '%'
    )
  -- Gõ đúng handle thì người ấy đứng đầu, rồi tài khoản chính thức.
  ORDER BY (p.handle = v_q) DESC, p.is_official DESC, p.handle
  LIMIT 20;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.community_search_profiles(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_search_profiles(text) TO authenticated;
