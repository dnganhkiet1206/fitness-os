-- ════════════════════════════════════════════════════════════════════════════
-- Cộng đồng — bài RECIPE: payload công khai KHÔNG mang giờ ăn (#7, người làm: B).
--
-- `20260929120000_community_recipe.sql` ghi `'eatenAt', e.date_time` vào
-- payload. Thẻ không đọc trường ấy (`readRecipePayload` bỏ qua nó), nhưng
-- payload đi qua RLS tới MỌI người xem được bài — tức ai cũng đọc được người
-- đăng ăn bữa ấy lúc mấy giờ, ngày nào. Đó là dữ liệu thói quen sinh hoạt, và
-- concept mục 11 dặn không công khai mặc định. A bắt được khi kiểm chéo (#7).
--
-- Hàm dưới đây là ĐÚNG bản cũ, trừ hai chỗ: không đọc `e.date_time`, và không
-- ghi `eatenAt`. Không sửa migration đã commit.
--
-- `mealType` (sáng / trưa / tối / phụ / trước tập / sau tập) vẫn ở lại: nó là
-- nhãn mà người đăng thấy trên màn chia sẻ ("Bữa trưa"), không phải một mốc
-- thời gian.
--
-- ── bài ĐÃ đăng ──
--
-- Dòng UPDATE cuối tệp gỡ `eatenAt` khỏi mọi bài Recipe đã có. Chưa có bài
-- nào ngoài máy dev (chưa `db push`), nên trên production nó chạm 0 dòng;
-- trên một máy dev đã từng đăng thử thì nó dọn đúng thứ cần dọn. Không đụng
-- bài loại khác.
--
-- Tên tệp mang `20260930…` chứ không `20260929…` (dải của B ở #6): migration
-- này phải chạy SAU mọi migration đã có — một tệp mang ngày sớm hơn migration
-- cuối cùng bị `supabase db push` từ chối khi remote đã áp tới đó.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.share_recipe(
  p_entry_id   uuid,
  p_title      text,
  p_caption    text DEFAULT '',
  p_visibility text DEFAULT 'public'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_title       text := btrim(coalesce(p_title, ''));
  v_meal_type   text;
  v_ingredients jsonb;
  v_n           integer;
  v_id          uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.community_profiles WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'community profile required' USING ERRCODE = 'P0001';
  END IF;
  IF p_visibility NOT IN ('public', 'followers') THEN
    RAISE EXCEPTION 'bad visibility' USING ERRCODE = '22023';
  END IF;
  -- Tên món là CHỮ của người đăng — `meal_entries` không có cột tên, chỉ có
  -- `meal_type`. Bắt buộc, vì một thẻ Recipe không tên là "Bữa trưa" của một
  -- người lạ, không phải một công thức.
  IF char_length(v_title) < 1 OR char_length(v_title) > 80 THEN
    RAISE EXCEPTION 'bad title' USING ERRCODE = '22023';
  END IF;

  -- Bữa của CHÍNH người gọi. Bữa của người khác trả về đúng câu "không thấy"
  -- như bữa không tồn tại: không để lộ rằng ID ấy có thật.
  SELECT e.meal_type INTO v_meal_type
  FROM public.meal_entries e
  WHERE e.id = p_entry_id AND e.user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'meal not found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.community_posts WHERE author_id = v_uid AND source_id = p_entry_id) THEN
    RAISE EXCEPTION 'already shared' USING ERRCODE = '23505';
  END IF;

  -- Nguyên liệu theo thứ tự ghi. Tối đa 50 dòng: một bữa thật không có nhiều
  -- hơn, và một payload không giới hạn là một bài có thể làm nặng feed của
  -- người khác.
  SELECT
    coalesce(jsonb_agg(jsonb_build_object(
      'name',      coalesce(nullif(btrim(it.food_name), ''), '?'),
      'grams',     CASE WHEN f.id IS NOT NULL AND f.serving_g > 0 AND it.servings > 0
                        THEN round(it.servings * f.serving_g) END,
      'kcal',      round(coalesce(it.kcal, 0)),
      'protein',   round(coalesce(it.protein_g, 0)),
      'carbs',     round(coalesce(it.carbs_g, 0)),
      'fat',       round(coalesce(it.fat_g, 0))
    ) ORDER BY it.created_at, it.id), '[]'::jsonb),
    count(*)
    INTO v_ingredients, v_n
  FROM (
    SELECT * FROM public.meal_entry_items
    WHERE meal_entry_id = p_entry_id
    ORDER BY created_at, id
    LIMIT 50
  ) it
  LEFT JOIN public.food_items f ON f.id = it.food_item_id;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'empty meal' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.community_posts (author_id, kind, source_id, payload, caption, visibility)
  VALUES (
    v_uid,
    'recipe',
    p_entry_id,
    jsonb_build_object(
      'title',           v_title,
      'mealType',        v_meal_type,
      -- TỔNG CÁC DÒNG, cộng từ chính các số đã làm tròn ở trên — xem khối đầu tệp.
      'kcal',            (SELECT coalesce(sum((x->>'kcal')::numeric), 0) FROM jsonb_array_elements(v_ingredients) x),
      'protein',         (SELECT coalesce(sum((x->>'protein')::numeric), 0) FROM jsonb_array_elements(v_ingredients) x),
      'carbs',           (SELECT coalesce(sum((x->>'carbs')::numeric), 0) FROM jsonb_array_elements(v_ingredients) x),
      'fat',             (SELECT coalesce(sum((x->>'fat')::numeric), 0) FROM jsonb_array_elements(v_ingredients) x),
      'ingredientCount', v_n,
      'ingredients',     v_ingredients
    ),
    left(coalesce(btrim(p_caption), ''), 500),
    p_visibility
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.share_recipe(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_recipe(uuid, text, text, text) TO authenticated;

-- Gỡ khỏi bài đã đăng. `-` trên jsonb bỏ một khoá; bài không có khoá ấy giữ nguyên.
UPDATE public.community_posts SET payload = payload - 'eatenAt'
WHERE kind = 'recipe' AND payload ? 'eatenAt';
