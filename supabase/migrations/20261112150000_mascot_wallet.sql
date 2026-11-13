-- ════════════════════════════════════════════════════════════════════════════
-- Ví Koa tính ở server, gọn một lượt đọc (round 3, AUD-28 / R3-DATA-02).
--
-- App dựng số dư, XP và tập khoá đã nhận bằng cách đọc CẢ sổ `mascot_transactions`
-- của người dùng (không limit, không phân trang) rồi cộng ở máy. Sổ chỉ tăng
-- (~5–10 dòng / ngày), còn PostgREST cắt mỗi lượt đọc ở `max_rows` (mặc định
-- 1000): sau vài tháng, lượt đọc bị cắt LẶNG LẼ → số dư và XP hiện sai, không báo
-- lỗi gì.
--
-- `mascot_wallet()` trả MỘT jsonb:
-- - `balance`: tổng `amount` (đúng phép cộng app vẫn làm);
-- - `xp`: số dòng theo từng LOẠI khoá có XP, kèm một khoá mẫu của loại ấy —
--   app tự nhân với `MascotRules.xpForRefKey(mẫu)`, nên bảng XP chỉ nằm một chỗ
--   (Swift), không chép sang SQL để lệch;
-- - `claimed`: khoá đã nhận mà app còn cần hỏi "nhận chưa": khoá một lần
--   (`welcome`, `x:`, `set:`, …), khoá ngày `d:` 7 ngày gần đây, khoá tuần `ch:`
--   4 tuần gần đây (nhận thưởng chỉ mở cho -2…+1 ngày / tuần này và tuần trước).
--
-- Kích thước trả về không còn tăng theo tuổi tài khoản (trừ khoá một lần, vốn hữu
-- hạn). Chỉ đọc sổ của chính người gọi (`auth.uid()`).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.mascot_wallet()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH t AS (
    SELECT amount, ref_key FROM public.mascot_transactions WHERE user_id = auth.uid()
  ),
  cls AS (
    SELECT CASE
      WHEN ref_key ~ '^d:\d{4}-\d{2}-\d{2}:.+$' THEN 'd:2000-01-03:' || substring(ref_key FROM 14)
      WHEN ref_key LIKE 'ch:%' THEN 'ch:' || split_part(ref_key, ':', 2) || ':2000-01-03:xp'
      WHEN ref_key LIKE 'set:%' THEN ref_key
      WHEN ref_key LIKE 'w:%' THEN 'w:xp'
    END AS k
    FROM t
  )
  SELECT jsonb_build_object(
    'balance', COALESCE((SELECT sum(amount) FROM t), 0),
    'xp', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', k, 'n', n) ORDER BY k)
      FROM (SELECT k, count(*) AS n FROM cls WHERE k IS NOT NULL GROUP BY k) g), '[]'::jsonb),
    'claimed', COALESCE((
      SELECT jsonb_agg(ref_key ORDER BY ref_key) FROM t
      WHERE ref_key IS NOT NULL AND (
        NOT (ref_key ~ '^d:\d{4}-\d{2}-\d{2}:' OR ref_key ~ '^ch:[^:]*:\d{4}-\d{2}-\d{2}:')
        -- ngày hỏng trong khoá cũ (trước luật hình dạng khoá) thì coi như khoá một lần,
        -- không ép kiểu để cả lượt đọc không hỏng vì một dòng
        OR (ref_key ~ '^d:\d{4}-\d{2}-\d{2}:' AND (NOT pg_input_is_valid(substring(ref_key FROM 3 FOR 10), 'date')
            OR substring(ref_key FROM 3 FOR 10)::date >= (now() AT TIME ZONE 'UTC')::date - 7))
        OR (ref_key ~ '^ch:[^:]*:\d{4}-\d{2}-\d{2}:' AND (NOT pg_input_is_valid(split_part(ref_key, ':', 3), 'date')
            OR split_part(ref_key, ':', 3)::date >= (now() AT TIME ZONE 'UTC')::date - 28)))), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.mascot_wallet() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mascot_wallet() TO authenticated, service_role;
