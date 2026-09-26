-- ════════════════════════════════════════════════════════════════════════════
-- Cộng đồng — Tìm công thức: gập tên món MỘT lần mỗi dòng (issue #116).
--
-- `20261001150000_community_find_recipes.sql` (#43) so tên món bằng hai vế
-- `community_fold(title) LIKE 'x%' OR community_fold(title) LIKE '% x%'`.
-- `community_fold` là hàm SQL IMMUTABLE nên được nhúng thẳng vào câu, và
-- Postgres không gộp hai biểu thức giống nhau trong một OR: mỗi dòng gập tên
-- HAI lần.
--
-- ── đo (cụm PG16 tạm, 500 người, 50 000 bài, 10% recipe, 1/7 chỉ-người-theo-
--    dõi, sau ANALYZE; mỗi số là lượt 2–3 của một phiên) ──
--
--   chuỗi tìm        bản #43     tệp này   (dừng sớm ở LIMIT 30 nếu đủ bài)
--   'ga'             2–6 ms      2 ms
--   'ga ap chao'     15–41 ms    12 ms
--   'zzzz' (trượt)   93–115 ms   53 ms
--
-- Tách riêng từng điều kiện trên 5 000 bài recipe, ca trượt: hai vế OR 82–88
-- ms · LIKE ANY 44 ms · bỏ hẳn phép so 4 ms · chỉ lọc chặn 16 ms.
--
-- Ca tệ nhất là chuỗi không khớp gì: quét hết mọi bài recipe, và gần hết thời
-- gian là phép gập tên. `LIKE ANY (ARRAY[…])` gập một lần rồi thử cả hai mẫu,
-- nên nửa chi phí ấy đi mất. Kết quả trả về không đổi — mọi kịch bản F1–F16
-- vẫn chạy trên hàm này; F17 giữ cho phép gập chỉ còn một chỗ.
--
-- ── vì sao KHÔNG thêm chỉ mục ──
--
-- Đã thử chỉ mục bộ phận `(created_at DESC, id) WHERE kind = 'recipe'`: ca
-- trượt chỉ còn ~80 ms (vẫn gập đủ 5 000 tên), còn 'ga ap chao' chậm đi
-- 15 → 82 ms vì planner bỏ chỉ mục feed. Mẫu `'% x%'` có ký tự đại diện đứng
-- đầu nên B-tree trên tên đã gập không dùng được; chỉ pg_trgm (GIN) giúp được,
-- và một extension mới là một quyết định lớn hơn con số này đáng. Chi phí tăng
-- tuyến tính theo số bài recipe: ~11 µs mỗi bài sau tệp này. Khi số bài recipe
-- tiến tới 50 000 (~0,5 s cho một lần tìm trượt), mở lại #116 cho pg_trgm hoặc
-- một cột tên đã gập.
--
-- Thân hàm là ĐÚNG bản #43 trừ phép so. Không sửa migration đã commit;
-- `CREATE OR REPLACE` giữ nguyên quyền, nhưng REVOKE/GRANT được chép lại để
-- tệp này tự đứng được và ca phá F15 phá được cả hai tệp.
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
    -- Đầu tên, hoặc đầu một từ sau dấu cách. Một lần gập, hai mẫu (#116).
    AND public.community_fold(p.payload->>'title') LIKE ANY (ARRAY[v_pat || '%', '% ' || v_pat || '%'])
  ORDER BY p.created_at DESC, p.id
  LIMIT 30;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.community_find_recipes(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_find_recipes(text) TO authenticated;
