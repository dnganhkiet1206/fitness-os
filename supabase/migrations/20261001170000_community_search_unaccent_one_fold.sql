-- ════════════════════════════════════════════════════════════════════════════
-- Cộng đồng — Tìm người: gập tên hiển thị MỘT lần mỗi dòng (issue #119).
--
-- Cùng lỗ với #116 (`20261001160000_community_find_recipes_one_fold.sql`):
-- `20260930170000_community_search_unaccent.sql` so tên bằng hai vế OR, mỗi
-- vế gọi `community_fold(p.display_name)`. Hàm ấy IMMUTABLE nên được nhúng
-- thẳng vào câu, và Postgres không gộp hai biểu thức giống nhau giữa hai vế:
-- một chuỗi không khớp gập mỗi tên HAI lần.
--
-- ── đo (`perf_search_profiles.sh`: cụm PG16 tạm, 50 000 hồ sơ tên Việt có dấu,
--    1 000 dòng chặn, sau ANALYZE; lượt ấm) ──
--
--   chuỗi tìm      bản #37      tệp này
--   'ga'           517–571 ms   298–299 ms
--   'nguyen'       595–629 ms   312–319 ms
--   'user123'      545–554 ms   278–287 ms
--   'zzzz'         573–574 ms   275–277 ms
--
-- Tách riêng từng điều kiện trên 50 000 hồ sơ, chuỗi trượt: hai vế OR 566 ms ·
-- LIKE ANY 306 ms · riêng nhánh handle 4 ms · riêng lọc chặn 276 ms.
--
-- Khác tìm công thức: câu này sắp theo `handle`, không theo thời gian, nên
-- KHÔNG có chuyện dừng sớm ở LIMIT — mọi lần tìm, khớp hay trượt, đều gập đủ
-- mọi hồ sơ. Nửa chi phí ấy đi mất ở đây; kết quả trả về không đổi, mọi kịch
-- bản S/U/G vẫn chạy trên hàm này, S11 giữ cho phép gập chỉ còn một chỗ.
--
-- ── nhánh handle ──
--
-- `p.handle LIKE v_pat || '%'` KHÔNG dùng chỉ mục UNIQUE của handle: collation
-- của database không phải C, và B-tree thường không phục vụ LIKE tiền tố (cần
-- `text_pattern_ops`). Nó cũng không cần: nằm trong một OR với vế gập tên, vế
-- không có chỉ mục nào, nên cả OR vẫn là một lần quét; và nhánh ấy chỉ 4 ms.
--
-- ── phần còn lại ──
--
-- ~6 µs mỗi hồ sơ vẫn là phép gập (`translate` trên một chuỗi 134 ký tự). Nếu
-- số hồ sơ tiến tới 50 000 thì một cột tên đã gập (sinh sẵn, có chỉ mục) bỏ
-- được hẳn chi phí ấy — một thay đổi bảng, nên để issue riêng.
--
-- Thân hàm là ĐÚNG bản #37 trừ phép so. Không sửa migration đã commit;
-- REVOKE/GRANT được chép lại để tệp này tự đứng được, và ca phá S10 phá được
-- cả hai tệp (khoá `community_search_unaccent` trong b_cases.py khớp cả hai).
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
      -- Đầu tên, hoặc đầu một từ sau dấu cách. Một lần gập, hai mẫu (#119).
      OR public.community_fold(p.display_name) LIKE ANY (ARRAY[v_pat || '%', '% ' || v_pat || '%'])
    )
  -- Gõ đúng handle thì người ấy đứng đầu, rồi tài khoản chính thức.
  ORDER BY (p.handle = v_q) DESC, p.is_official DESC, p.handle
  LIMIT 20;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.community_search_profiles(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_search_profiles(text) TO authenticated;
