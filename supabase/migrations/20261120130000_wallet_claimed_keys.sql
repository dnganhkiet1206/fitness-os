-- ════════════════════════════════════════════════════════════════════════════
-- KOA-T54 (1) — `mascot_wallet()`: tập `claimed` chỉ còn khoá app thật sự hỏi "nhận chưa": `welcome`, `x:`
-- (khám phá), `set:` (bộ sưu tập), `d:` 7 ngày gần đây, `ch:` 4 tuần gần đây (khoá ngày / tuần sai hình dạng —
-- khoá cũ — vẫn coi như khoá một lần). Trước đây MỌI khoá khác (`clean:<ngày>` mỗi lần dọn phòng, `buy:`,
-- `freeze:`, `cc:`) đều vào tập này nên nó phình theo tuổi tài khoản, trái với thiết kế của 20261112150000.
-- App đọc ngày dọn phòng bằng truy vấn riêng (`KoaDust`), không qua ví. Số dư và XP không đổi.
-- Chỉ thay thân hàm; không đổi bảng, không đổi quyền.
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
        -- KOA-T54 (1): chỉ khoá một lần app thật sự hỏi "nhận chưa" (`welcome`, `x:`, `set:`); `clean:`, `buy:`,
        -- `freeze:`, `cc:`… không ai hỏi qua đây và làm tập này phình theo tuổi tài khoản.
        ref_key = 'welcome' OR ref_key LIKE 'x:%' OR ref_key LIKE 'set:%'
        -- khoá ngày / tuần không đúng hình dạng (khoá cũ) vẫn coi như khoá một lần, như trước
        OR ((ref_key LIKE 'd:%' OR ref_key LIKE 'ch:%')
            AND NOT (ref_key ~ '^d:\d{4}-\d{2}-\d{2}:' OR ref_key ~ '^ch:[^:]*:\d{4}-\d{2}-\d{2}:'))
        -- ngày hỏng trong khoá cũ (trước luật hình dạng khoá) thì coi như khoá một lần,
        -- không ép kiểu để cả lượt đọc không hỏng vì một dòng
        OR (ref_key ~ '^d:\d{4}-\d{2}-\d{2}:' AND (NOT pg_input_is_valid(substring(ref_key FROM 3 FOR 10), 'date')
            OR substring(ref_key FROM 3 FOR 10)::date >= (now() AT TIME ZONE 'UTC')::date - 7))
        OR (ref_key ~ '^ch:[^:]*:\d{4}-\d{2}-\d{2}:' AND (NOT pg_input_is_valid(split_part(ref_key, ':', 3), 'date')
            OR split_part(ref_key, ':', 3)::date >= (now() AT TIME ZONE 'UTC')::date - 28)))), '[]'::jsonb)
  );
$$;
