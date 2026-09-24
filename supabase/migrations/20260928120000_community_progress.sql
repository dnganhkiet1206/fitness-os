-- ════════════════════════════════════════════════════════════════════════════
-- Cộng đồng — bài Progress (issue #8, người làm A).
--
-- Concept mục 5 + mockup màn 4: "Tiến trình · 12 tuần — Từ 52.1 kg → 55.4 kg",
-- các ô thay đổi (Cân nặng, Vòng eo, một bài sức mạnh) kèm đường xu hướng.
--
-- ── ba luật, cùng tinh thần với `share_workout` ──
--
--   1. Dựng ở SERVER, từ dữ liệu của NGƯỜI GỌI. Client không gửi con số nào;
--      nó chỉ nói muốn chia sẻ bao nhiêu tuần và những chỉ số nào.
--   2. Chỉ những chỉ số người dùng BẬT. Mỗi chỉ số là một cờ riêng, và một
--      chỉ số tắt thì không một con số nào của nó có mặt trong payload — kể
--      cả khi dữ liệu có sẵn. (Concept mục 12: "Người dùng phải chủ động chia
--      sẻ những dữ liệu họ muốn đưa lên".)
--   3. Xem trước = đăng. `build_progress_payload` là hàm DUY NHẤT dựng payload;
--      màn chia sẻ gọi nó để xem trước, `share_progress` gọi nó để đăng. Không
--      có bản dựng thứ hai ở client để lệch khỏi bản này.
--
-- Không ảnh trước/sau: ảnh cơ thể là loại dữ liệu nhạy cảm nhất, và chủ dự án
-- đã chọn không tải ảnh ở MVP.
--
-- Mỗi chỉ số cần ÍT NHẤT HAI điểm trong khoảng: một điểm không phải là một
-- thay đổi, và "+0 kg" từ một lần cân duy nhất là nói sai về hành trình.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.build_progress_payload(
  p_weeks            integer,
  p_weight           boolean DEFAULT true,
  p_waist            boolean DEFAULT false,
  p_lift_exercise_id uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_to    date := current_date;
  v_from  date;
  v_w     jsonb;
  v_waist jsonb;
  v_lift  jsonb;
  v_name  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_weeks IS NULL OR p_weeks NOT BETWEEN 1 AND 52 THEN
    RAISE EXCEPTION 'weeks out of range' USING ERRCODE = '22023';
  END IF;
  v_from := v_to - p_weeks * 7;

  -- Mỗi chuỗi: một điểm mỗi tuần (điểm CUỐI của tuần), tối đa `p_weeks` điểm
  -- — đủ cho một đường xu hướng nhỏ, không đủ để dựng lại nhật ký từng ngày.

  IF p_weight THEN
    WITH pts AS (
      SELECT date, weight_kg FROM public.weight_logs
      WHERE user_id = v_uid AND date > v_from AND date <= v_to
    ), wk AS (
      SELECT ((date - v_from - 1) / 7) AS b, (array_agg(weight_kg ORDER BY date DESC))[1] AS v
      FROM pts GROUP BY 1
    )
    SELECT CASE WHEN (SELECT count(*) FROM pts) >= 2 THEN jsonb_build_object(
      'start',  round((SELECT weight_kg FROM pts ORDER BY date ASC LIMIT 1)::numeric, 1),
      'end',    round((SELECT weight_kg FROM pts ORDER BY date DESC LIMIT 1)::numeric, 1),
      'series', (SELECT jsonb_agg(round(v::numeric, 1) ORDER BY b) FROM wk)
    ) END INTO v_w;
  END IF;

  IF p_waist THEN
    WITH pts AS (
      SELECT date, waist_cm FROM public.body_measurements
      WHERE user_id = v_uid AND waist_cm IS NOT NULL AND waist_cm > 0 AND date > v_from AND date <= v_to
    ), wk AS (
      SELECT ((date - v_from - 1) / 7) AS b, (array_agg(waist_cm ORDER BY date DESC))[1] AS v
      FROM pts GROUP BY 1
    )
    SELECT CASE WHEN (SELECT count(*) FROM pts) >= 2 THEN jsonb_build_object(
      'start',  round((SELECT waist_cm FROM pts ORDER BY date ASC LIMIT 1)::numeric, 1),
      'end',    round((SELECT waist_cm FROM pts ORDER BY date DESC LIMIT 1)::numeric, 1),
      'series', (SELECT jsonb_agg(round(v::numeric, 1) ORDER BY b) FROM wk)
    ) END INTO v_waist;
  END IF;

  -- Sức mạnh: set NẶNG NHẤT mỗi tuần của một bài, bỏ set khởi động — đúng
  -- luật `lib/personal-record.ts`. Chỉ bài người gọi đọc được (thư viện chung
  -- hoặc bài tự tạo của CHÍNH họ): tên bài tự tạo của người khác không lọt ra.
  IF p_lift_exercise_id IS NOT NULL THEN
    SELECT name INTO v_name FROM public.exercises
    WHERE id = p_lift_exercise_id AND (user_id IS NULL OR user_id = v_uid);
    IF v_name IS NOT NULL THEN
      WITH sets AS (
        SELECT (s.date_time AT TIME ZONE 'UTC')::date AS d, (e->>'weight')::numeric AS w
        FROM public.workout_sessions s, jsonb_array_elements(coalesce(s.sets, '[]'::jsonb)) AS e
        WHERE s.user_id = v_uid
          AND (s.date_time AT TIME ZONE 'UTC')::date > v_from
          AND e->>'exerciseId' = p_lift_exercise_id::text
          AND coalesce((e->>'warmup')::boolean, false) = false
          AND coalesce((e->>'weight')::numeric, 0) > 0
      ), wk AS (
        SELECT ((d - v_from - 1) / 7) AS b, max(w) AS v FROM sets GROUP BY 1
      )
      SELECT CASE WHEN (SELECT count(*) FROM wk) >= 2 THEN jsonb_build_object(
        'exerciseId', p_lift_exercise_id,
        'name',       v_name,
        'start',      (SELECT round(v, 1) FROM wk ORDER BY b ASC LIMIT 1),
        'end',        (SELECT round(v, 1) FROM wk ORDER BY b DESC LIMIT 1),
        'series',     (SELECT jsonb_agg(round(v, 1) ORDER BY b) FROM wk)
      ) END INTO v_lift;
    END IF;
  END IF;

  IF v_w IS NULL AND v_waist IS NULL AND v_lift IS NULL THEN
    RAISE EXCEPTION 'nothing to share' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'weeks',  p_weeks,
    'from',   v_from,
    'to',     v_to,
    'weight', v_w,
    'waist',  v_waist,
    'lift',   v_lift
  ));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.build_progress_payload(integer, boolean, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.build_progress_payload(integer, boolean, boolean, uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.share_progress(
  p_weeks            integer,
  p_weight           boolean DEFAULT true,
  p_waist            boolean DEFAULT false,
  p_lift_exercise_id uuid    DEFAULT NULL,
  p_caption          text    DEFAULT '',
  p_visibility       text    DEFAULT 'public'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
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

  INSERT INTO public.community_posts (author_id, kind, source_id, payload, caption, visibility)
  VALUES (
    v_uid,
    'progress',
    NULL,
    public.build_progress_payload(p_weeks, p_weight, p_waist, p_lift_exercise_id),
    left(coalesce(btrim(p_caption), ''), 500),
    p_visibility
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.share_progress(integer, boolean, boolean, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_progress(integer, boolean, boolean, uuid, text, text) TO authenticated;
