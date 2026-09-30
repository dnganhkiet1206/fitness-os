-- ════════════════════════════════════════════════════════════════════════════
-- Cộng đồng — Tìm bài viết theo chú thích + tên (người làm C).
--
-- Phân đoạn "Bài viết" của màn tìm kiếm: trước commit này, tìm chỉ ra người
-- (#19) và công thức (#43); một bài workout hay tiến trình chỉ tìm thấy bằng
-- cách cuộn feed. Tìm trong hai chỗ người ta NHÌN khi lướt: chú thích họ viết
-- và tên trong payload (tên buổi tập, tên món, tiêu đề tiến trình). Không phân
-- biệt dấu, như tìm công thức.
--
-- ── vì sao chỉ bài không phải công thức ──
--
-- Màn tìm kiếm có HAI phân đoạn bài: "Công thức" (kind = 'recipe', hàm
-- `community_find_recipes`) và "Bài viết". Hai tập không giao nhau: hàm này
-- chỉ tìm 'workout' và 'progress'. Một bài công thức lọt vào cả hai nơi là
-- trùng lặp, còn lọt vào KHÔNG nơi nào là mất bài — kịch bản P4k bắt vế đầu
-- (bỏ lọc kind thì công thức hiện trong "Bài viết").
--
-- ── vì sao SECURITY DEFINER, không phải INVOKER ──
--
-- Như `community_find_recipes` (20261001150000): phép so phải đi qua
-- `community_fold` (#37), và hàm ấy đã bị REVOKE khỏi mọi vai — một hàm
-- INVOKER chạy dưới `authenticated` không gọi được nó. Nới quyền ấy là phá
-- bất biến "mọi hàm gọi được đều đóng với anon" (#15). Nên hàm này là
-- DEFINER, như hai hàm tìm trước nó, và phải tự viết lại quyền đọc.
--
-- ── quyền đọc: đúng vị từ của policy, và hai lớp chống trôi ──
--
-- Điều kiện thấy bài dưới đây là vị từ của policy "Readers see visible posts"
-- (20260927120000_community_foundation.sql), chép TỪNG VẾ: bài của mình (kể cả
-- khi bị ẩn), hoặc bài chưa ẩn của người không chặn hai chiều, công khai hay
-- của người mình theo dõi. Hai bản sao của một luật sẽ trôi, nên:
--   · kịch bản P13 (`community_find_posts.test.sql`) so, dưới vai người xem,
--     tập bài mà RLS cho thấy với tập hàm này trả — đổi policy mà quên hàm thì
--     đỏ;
--   · hàm CHỈ trả ID. App đọc bài bằng `.from('community_posts').in('id', …)`,
--     tức qua RLS thêm một lần: một bài hàm trả lọt thì RLS vẫn chặn ở đó.
--
-- ── so khớp ──
--
-- Tiền tố của một TỪ trong chú thích đã gập hoặc tên đã gập, như tìm công thức:
-- "sang" ra "Buổi sáng bận rộn" và "Ăn sáng đủ chất", "ang" (giữa chữ) thì
-- không. Ký tự đại diện của LIKE trong chuỗi tìm là chữ thường. Tối đa 30 bài,
-- mới nhất trước.
--
-- Tên tệp cố ý không chứa `community_search` hay `community_recipe`:
-- `b_reverse.py` khớp migration theo CHUỖI CON, và hai khoá ấy đã có chủ.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.community_find_posts(p_q text)
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
  WHERE p.kind IN ('workout', 'progress')
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
      public.community_fold(coalesce(p.caption, '')) LIKE v_pat || '%'
      OR public.community_fold(coalesce(p.caption, '')) LIKE '% ' || v_pat || '%'
      OR public.community_fold(coalesce(p.payload->>'title', '')) LIKE v_pat || '%'
      OR public.community_fold(coalesce(p.payload->>'title', '')) LIKE '% ' || v_pat || '%'
    )
  ORDER BY p.created_at DESC, p.id
  LIMIT 30;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.community_find_posts(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_find_posts(text) TO authenticated;
