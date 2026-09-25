-- ════════════════════════════════════════════════════════════════════════════
-- Cộng đồng — Tìm công thức theo tên món, không phân biệt dấu (issue #43).
--
-- Thiết kế là của B (bảng #6, 25/09 09:11); A viết lại khi nhận bàn giao, vì
-- bản của B chưa lên nhánh. Bài Recipe (#7) trước đây chỉ tìm thấy bằng cách
-- cuộn feed.
--
-- ── vì sao SECURITY DEFINER, không phải INVOKER ──
--
-- Issue gợi ý INVOKER để RLS của `community_posts` tự lo. Nhưng phép so phải
-- đi qua `community_fold` (#37), và hàm ấy đã bị REVOKE khỏi mọi vai: một hàm
-- INVOKER chạy dưới `authenticated` không gọi được nó. Nới quyền ấy là phá bất
-- biến "mọi hàm gọi được đều đóng với anon" (#15). Nên hàm này là DEFINER, như
-- `community_search_profiles`, và phải tự viết lại quyền đọc.
--
-- ── quyền đọc: đúng vị từ của policy, và hai lớp chống trôi ──
--
-- Điều kiện thấy bài dưới đây là vị từ của policy "Readers see visible posts"
-- (20260927120000_community_foundation.sql), chép TỪNG VẾ: bài của mình (kể cả
-- khi bị ẩn), hoặc bài chưa ẩn của người không chặn hai chiều, công khai hay
-- của người mình theo dõi. Hai bản sao của một luật sẽ trôi, nên:
--   · kịch bản F13 (`community_find_recipes.test.sql`) so, dưới vai người xem,
--     tập bài mà RLS cho thấy với tập hàm này trả — đổi policy mà quên hàm thì
--     đỏ;
--   · hàm CHỈ trả ID. App đọc bài bằng `.from('community_posts').in('id', …)`,
--     tức qua RLS thêm một lần: một bài hàm trả lọt thì RLS vẫn chặn ở đó.
--
-- ── so khớp ──
--
-- Tiền tố của một TỪ trong tên món, như tìm người: "ga" ra "Cơm gà áp chảo",
-- "ap chao" cũng ra, nhưng "hao" (giữa chữ "chảo") thì không. Ký tự đại diện
-- của LIKE trong chuỗi tìm là chữ thường. Tối đa 30 bài, mới nhất trước.
--
-- Tên tệp cố ý không chứa `community_recipe` hay `community_search`:
-- `b_reverse.py` khớp migration theo CHUỖI CON, và hai khoá ấy đã có chủ.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.community_find_recipes(p_q text)
RETURNS TABLE (post_id uuid)
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
  v_q := left(v_q, 40);
  IF char_length(v_q) < 2 THEN
    RETURN;
  END IF;
  -- Ký tự đại diện của LIKE thành chữ thường; `\` là ký tự thoát mặc định.
  v_pat := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

  RETURN QUERY
  SELECT p.id
  FROM public.community_posts p
  WHERE p.kind = 'recipe'
    AND (
      p.author_id = v_uid
      OR (
        NOT p.hidden
        AND NOT public.community_blocked_between(v_uid, p.author_id)
        AND (
          p.visibility = 'public'
          OR EXISTS (
            SELECT 1 FROM public.community_follows f
            WHERE f.follower_id = v_uid AND f.followee_id = p.author_id
          )
        )
      )
    )
    AND (
      public.community_fold(p.payload->>'title') LIKE v_pat || '%'
      OR public.community_fold(p.payload->>'title') LIKE '% ' || v_pat || '%'
    )
  ORDER BY p.created_at DESC, p.id
  LIMIT 30;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.community_find_recipes(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_find_recipes(text) TO authenticated;
