-- ════════════════════════════════════════════════════════════════════════════
-- Cộng đồng — bài RECIPE (#7, người làm: B).
--
-- Một bài Recipe là một ĐỐI TƯỢNG DÙNG ĐƯỢC trong ASCND, không phải ảnh món ăn:
-- tên món, tổng kcal, ba chip macro, và danh sách nguyên liệu kèm khối lượng.
-- Người xem có thể "Lưu công thức" (dùng lại `community_saves`, không bảng mới)
-- và "Thêm vào bữa ăn" (ghi qua đường ghi bữa ăn SẴN CÓ của app).
--
-- ── luật lớn nhất: con số do SERVER dựng ──
--
-- Đúng như `share_workout`: client chỉ gửi ID của một bữa ĐÃ GHI và phần chữ
-- (tên món, chú thích). Mọi con số dinh dưỡng trên thẻ được đọc ở đây, từ
-- `meal_entries` + `meal_entry_items` của CHÍNH người gọi. `community_posts`
-- không có policy INSERT, nên đây là lối duy nhất sinh ra một bài Recipe.
--
-- ── tổng trên thẻ = TỔNG CÁC DÒNG, không phải `meal_entries.total_*` ──
--
-- "Thêm vào bữa ăn" ghi chính các dòng nguyên liệu này vào nhật ký của người
-- xem, và nhật ký ấy cộng tổng từ các dòng. Nên con số in trên thẻ phải ĐÚNG
-- BẰNG con số sẽ rơi vào ngày của người xem. Hai nguồn có thể lệch nhau khi một
-- dòng bị sửa khẩu phần mà tổng của bữa chưa được tính lại — test có ca ấy.
--
-- Giá trị trên mỗi dòng ĐÃ nhân với `servings` (xem `lib/recent-meals.ts`: "the
-- stored figures are already multiplied by `servings`"), nên ở đây không nhân
-- thêm lần nào.
--
-- ── khối lượng: chỉ khi BIẾT, không đoán ──
--
-- `grams` = `servings × food_items.serving_g`, và chỉ khi dòng ấy trỏ tới một
-- món trong kho còn tồn tại. Một dòng gõ tay không có món gốc thì `grams` là
-- null, và thẻ vẽ tên + kcal mà không bịa ra "100g".
--
-- ── vì sao hàm này TẠO ĐƯỢC khi các bảng bữa ăn chưa có ──
--
-- `supabase/tests/community/run.sh` áp mọi migration `*_community_*` lên một
-- stub chỉ có `auth.users`, `exercises`, `workout_sessions`. Nên ở đây không có
-- `%ROWTYPE` của bảng bữa ăn và không có ràng buộc DDL nào trỏ tới chúng:
-- plpgsql chỉ phân giải tên bảng lúc GỌI hàm, không lúc tạo. Viết khác đi là
-- làm đỏ bộ test của người kia.
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
  v_eaten_at    timestamptz;
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
  SELECT e.meal_type, e.date_time INTO v_meal_type, v_eaten_at
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
      'eatenAt',         v_eaten_at,
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
