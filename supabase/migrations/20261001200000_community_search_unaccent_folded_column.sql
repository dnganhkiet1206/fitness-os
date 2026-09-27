-- ════════════════════════════════════════════════════════════════════════════
-- Cộng đồng — Tìm người trên tên ĐÃ GẬP SẴN (issue #150).
--
-- #119 bỏ được một nửa chi phí (gập một lần mỗi dòng thay vì hai), nhưng câu
-- sắp theo handle nên không dừng sớm ở LIMIT: MỌI lần tìm vẫn gập đủ mọi hồ
-- sơ, ~6 µs mỗi hồ sơ — ~0,3 s ở 50 000 hồ sơ.
--
-- ── đo (perf_search_profiles.sh, cụm PG16 tạm, 50 000 hồ sơ, lượt ấm) ──
--
--   điều kiện so tên, chuỗi trượt       trên community_fold(…)   trên cột gập sẵn
--   LIKE ANY (đầu tên / đầu từ)          283 ms                    11 ms
--   cả OR với nhánh handle                —                         8–9 ms
--   ALTER TABLE … ADD COLUMN … STORED     viết lại bảng: 420 ms một lần
--
--   cả hàm community_search_profiles    bản #119        tệp này
--   'ga'                                 298–299 ms      8–9 ms
--   'nguyen'                             312–319 ms      29–30 ms
--   'user123'                            278–287 ms      10 ms
--   'zzzz'                               275–277 ms      9–10 ms
--
-- ── cột sinh sẵn ──
--
-- `display_name_folded` = `community_fold(display_name)`, STORED. Hàm đã
-- IMMUTABLE (điều kiện của cột sinh). Không có chỉ mục: vế `'% x%'` (đầu một từ
-- giữa tên) có ký tự đại diện đứng đầu, B-tree không dùng được; phép so trên
-- chuỗi đã gập sẵn đã rẻ như nhánh handle (4 ms), và một chỉ mục chỉ phục vụ
-- vế tiền tố là một thứ phải giữ mà không đổi được con số.
--
-- ── rủi ro, viết ra ──
--
--   · `CREATE OR REPLACE community_fold` về sau KHÔNG tính lại các giá trị đã
--     lưu. `run.sh` đỏ nếu một migration sau tệp này định nghĩa lại
--     community_fold mà không nhắc tới display_name_folded (phải tính lại).
--   · Cột lộ qua `select *` của community_profiles. Nó chỉ là display_name
--     viết thường không dấu — không thêm thông tin nào display_name chưa lộ.
--   · Thêm cột STORED viết lại bảng (khoá ACCESS EXCLUSIVE trong lúc ấy): 420 ms
--     ở 50 000 hồ sơ, nhỏ hơn nhiều ở cỡ hiện tại.
--
-- Thân hàm là ĐÚNG bản #119 trừ phép so. Không sửa migration cũ; REVOKE/GRANT
-- chép lại (ca phá S10 phá được mọi tệp mang khoá SPM).
-- ════════════════════════════════════════════════════════════════════════════

-- Cột sinh chạy biểu thức của nó bằng quyền của NGƯỜI GHI: người dùng tạo hay
-- sửa hồ sơ (vai authenticated, qua RLS) cần EXECUTE trên community_fold. #37
-- thu quyền ấy ("chỉ hàm tìm gọi nó"), và bộ nền móng đỏ ngay ở lần tạo hồ sơ
-- đầu tiên: 'permission denied for function community_fold' — tức production
-- sẽ không tạo được hồ sơ Cộng đồng nào. Hàm thuần, không đọc bảng nào; anon
-- vẫn đóng (U6), chỉ người đã đăng nhập được gọi.
GRANT EXECUTE ON FUNCTION public.community_fold(text) TO authenticated;

ALTER TABLE public.community_profiles
  ADD COLUMN IF NOT EXISTS display_name_folded text
  GENERATED ALWAYS AS (public.community_fold(display_name)) STORED;

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
      -- Đầu tên, hoặc đầu một từ sau dấu cách, trên tên ĐÃ GẬP SẴN (#150).
      OR p.display_name_folded LIKE ANY (ARRAY[v_pat || '%', '% ' || v_pat || '%'])
    )
  -- Gõ đúng handle thì người ấy đứng đầu, rồi tài khoản chính thức.
  ORDER BY (p.handle = v_q) DESC, p.is_official DESC, p.handle
  LIMIT 20;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.community_search_profiles(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_search_profiles(text) TO authenticated;
