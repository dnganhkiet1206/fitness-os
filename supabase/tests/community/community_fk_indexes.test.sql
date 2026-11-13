-- Mọi khoá ngoại có index dẫn đầu bằng đúng cột của nó (round 3, AUD-10 / R3-PERF-01).
-- Không có: lượt đọc qua RLS theo `user_id` và lượt xoá dòng cha (xoá tài khoản, xoá bài,
-- xoá mẫu buổi tập) quét cả bảng con. Bảng mới thêm khoá ngoại mà quên index thì đỏ ở đây.
\set ON_ERROR_STOP 1
DO $$ DECLARE missing text; BEGIN
  SELECT string_agg(format('%s(%s)', t, cols), ', ') INTO missing FROM (
    SELECT c.conrelid::regclass::text AS t, string_agg(a.attname, ',' ORDER BY k.ord) AS cols
    FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
      -- bảng lõi ở đây là bản giả của stub; bộ lõi kiểm bảng thật
      AND c.conrelid::regclass::text LIKE 'community\_%'
      AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid
        AND (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
        AND (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] <@ c.conkey)
    GROUP BY c.conrelid, c.conname) x;
  ASSERT missing IS NULL, 'FK1 khoá ngoại thiếu index: ' || missing;
END $$;
\echo 'KHOÁ NGOẠI CÓ INDEX: FK1 xanh'
