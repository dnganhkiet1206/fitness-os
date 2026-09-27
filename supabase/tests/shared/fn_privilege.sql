-- Hàm mà policy, cột sinh, DEFAULT hay CHECK gọi phải chạy được với ĐÚNG vai
-- đọc/ghi bảng ấy (#156). Chạy trong cả bộ lõi lẫn bộ Cộng đồng (`\ir` từ
-- `core/fn_privilege.test.sql` và `community/community_fn_privilege.test.sql`).
--
-- ── lỗi mà tệp này ghim ──
--
-- #150 thêm `display_name_folded GENERATED ALWAYS AS (community_fold(…))`.
-- Biểu thức ấy chạy bằng quyền của NGƯỜI GHI, không phải chủ bảng; mà
-- `community_fold` đã bị `REVOKE … FROM authenticated` từ tệp unaccent. Mọi lệnh
-- tạo / sửa hồ sơ Cộng đồng thành 42501 — bộ nền móng đỏ, và chỉ vì nó tình cờ
-- tạo hồ sơ. Không gì hỏi câu ấy CHO MỌI bảng: một policy `TO public` gọi một
-- hàm đã đóng với anon làm anon nhận lỗi thay vì không dòng nào; một DEFAULT gọi
-- hàm đã đóng làm lệnh chèn hỏng, nhưng chỉ khi cột bị bỏ trống.
--
-- ── luật ──
--
--   FP1  policy P của bảng T gọi hàm F (pg_depend, ngoài pg_catalog): mọi vai
--        trong {anon, authenticated} mà P áp vào (polroles; `{0}` = public) và
--        có quyền bảng ứng với lệnh của P phải có EXECUTE trên F.
--   FP2  DEFAULT / cột sinh / CHECK của T gọi F: mọi vai ghi được T — có quyền
--        INSERT (UPDATE với cột sinh và CHECK) VÀ có một policy PERMISSIVE cho
--        lệnh ấy áp vào mình (hoặc T không bật RLS) — phải có EXECUTE trên F.
--
-- Không đi vào thân hàm: một hàm SECURITY INVOKER mà thân gọi hàm khác thì hàm
-- trong cũng cần EXECUTE, và pg_depend chỉ ghi phụ thuộc ấy cho thân BEGIN
-- ATOMIC. Hôm nay không hàm nào được gọi như thế ngoài hàm SECURITY DEFINER
-- (community_blocked_between — chạy bằng quyền chủ) và hàm thuần (community_fold).
--
-- FP3 tự kiểm TRƯỚC mọi thứ: dựng trong một SAVEPOINT một bảng sai theo cả bốn
-- đường, đòi bộ kiểm thấy đủ bốn, và đòi lệnh thật của đúng vai ấy hỏng 42501 —
-- tức tiền đề "chạy bằng quyền người gọi" vẫn đúng trên Postgres đang chạy.
\set ON_ERROR_STOP 1
BEGIN;

CREATE FUNCTION pg_temp.fn_priv_deps() RETURNS TABLE (kind text, tbl oid, what text, cmd "char", roles oid[], f oid)
LANGUAGE sql STABLE AS $$
  SELECT 'policy', po.polrelid, po.polname::text, po.polcmd, po.polroles, d.refobjid
  FROM pg_policy po
  JOIN pg_depend d ON d.classid = 'pg_policy'::regclass AND d.objid = po.oid AND d.refclassid = 'pg_proc'::regclass
  UNION ALL
  SELECT CASE WHEN a.attgenerated = 's' THEN 'cột sinh' ELSE 'DEFAULT' END, ad.adrelid, a.attname::text,
         (CASE WHEN a.attgenerated = 's' THEN 'w' ELSE 'a' END)::"char", NULL::oid[], d.refobjid
  FROM pg_attrdef ad
  JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
  JOIN pg_depend d ON d.classid = 'pg_attrdef'::regclass AND d.objid = ad.oid AND d.refclassid = 'pg_proc'::regclass
  UNION ALL
  SELECT 'CHECK', co.conrelid, co.conname::text, 'w'::"char", NULL::oid[], d.refobjid
  FROM pg_constraint co
  JOIN pg_depend d ON d.classid = 'pg_constraint'::regclass AND d.objid = co.oid AND d.refclassid = 'pg_proc'::regclass
  WHERE co.contype = 'c'
$$;

-- Lệnh của policy → quyền bảng cần có để policy ấy còn được hỏi tới.
CREATE FUNCTION pg_temp.fn_priv_table_ok(r text, t oid, c "char") RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE c
    WHEN 'r' THEN has_table_privilege(r, t, 'SELECT')
    WHEN 'a' THEN has_table_privilege(r, t, 'INSERT')
    WHEN 'w' THEN has_table_privilege(r, t, 'UPDATE')
    WHEN 'd' THEN has_table_privilege(r, t, 'DELETE')
    ELSE has_table_privilege(r, t, 'SELECT,INSERT,UPDATE,DELETE') END
$$;

-- Vai r ghi được t bằng lệnh c ('a' chèn; 'w' chèn HOẶC sửa — cột sinh và
-- CHECK chạy ở cả hai).
CREATE FUNCTION pg_temp.fn_priv_writes(r text, t oid, c "char") RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT bool_or(pg_temp.fn_priv_table_ok(r, t, x) AND (
           NOT (SELECT relrowsecurity FROM pg_class WHERE oid = t)
           OR EXISTS (SELECT 1 FROM pg_policy po WHERE po.polrelid = t AND po.polpermissive AND po.polcmd IN (x, '*')
                        AND (po.polroles = '{0}' OR (SELECT oid FROM pg_roles WHERE rolname = r) = ANY (po.polroles)))))
  FROM unnest(CASE c WHEN 'a' THEN ARRAY['a']::"char"[] ELSE ARRAY['a', 'w']::"char"[] END) x
$$;

CREATE FUNCTION pg_temp.fn_priv_problems() RETURNS SETOF text LANGUAGE sql STABLE AS $$
  SELECT format('%s %s "%s" trên %s gọi %s mà %s không có EXECUTE',
                CASE d.kind WHEN 'policy' THEN 'FP1' ELSE 'FP2' END, d.kind, d.what, d.tbl::regclass, d.f::regprocedure, r.rolname)
  FROM pg_temp.fn_priv_deps() d
  JOIN pg_proc p ON p.oid = d.f AND p.pronamespace <> 'pg_catalog'::regnamespace
  CROSS JOIN pg_roles r
  WHERE r.rolname IN ('anon', 'authenticated')
    AND NOT has_function_privilege(r.oid, d.f, 'EXECUTE')
    AND CASE WHEN d.kind = 'policy'
          THEN (d.roles = '{0}' OR r.oid = ANY (d.roles)) AND pg_temp.fn_priv_table_ok(r.rolname, d.tbl, d.cmd)
          ELSE pg_temp.fn_priv_writes(r.rolname, d.tbl, d.cmd) END
  ORDER BY 1
$$;
CREATE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO anon, authenticated;

-- ── FP0: bộ kiểm nhìn thấy gì đó — một phép nối catalog sai thì mọi thứ xanh ──
DO $$ DECLARE n int := (SELECT count(*) FROM pg_temp.fn_priv_deps() d JOIN pg_proc p ON p.oid = d.f WHERE p.pronamespace <> 'pg_catalog'::regnamespace AND d.kind = 'policy'); BEGIN
  ASSERT n > 0, 'FP0 đối chứng: không thấy policy nào gọi hàm (auth.uid() ở khắp nơi) — phép nối pg_depend hỏng, FP1/FP2 xanh vì không nhìn gì';
END $$;

-- ── FP3: tự kiểm trên một bảng sai theo cả bốn đường ──
SAVEPOINT probe;
CREATE FUNCTION public.zz_fp_closed(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$ SELECT t $f$;
REVOKE EXECUTE ON FUNCTION public.zz_fp_closed(text) FROM PUBLIC, anon, authenticated;
CREATE TABLE public.zz_fp_probe (
  id int PRIMARY KEY,
  a text DEFAULT public.zz_fp_closed('x'),
  b text GENERATED ALWAYS AS (public.zz_fp_closed(a)) STORED,
  c text CHECK (public.zz_fp_closed(c) IS NOT NULL OR c IS NULL)
);
ALTER TABLE public.zz_fp_probe ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.zz_fp_probe TO anon, authenticated;
CREATE POLICY zz_read ON public.zz_fp_probe FOR SELECT USING (public.zz_fp_closed('y') = 'y');
CREATE POLICY zz_write ON public.zz_fp_probe FOR ALL TO authenticated USING (true) WITH CHECK (true);
DO $$ DECLARE got text[] := ARRAY(SELECT x FROM pg_temp.fn_priv_problems() x WHERE x LIKE '%zz_fp_probe%'); BEGIN
  ASSERT (SELECT count(*) FROM unnest(got) x WHERE x LIKE 'FP1 policy "zz_read"%') = 2
     AND (SELECT count(*) FROM unnest(got) x WHERE x LIKE 'FP2 DEFAULT "a"%authenticated%') = 1
     AND (SELECT count(*) FROM unnest(got) x WHERE x LIKE 'FP2 cột sinh "b"%authenticated%') = 1
     AND (SELECT count(*) FROM unnest(got) x WHERE x LIKE 'FP2 CHECK%authenticated%') = 1
     AND NOT EXISTS (SELECT 1 FROM unnest(got) x WHERE x LIKE 'FP2%anon'),
    format('FP3 bộ kiểm mất răng: bảng dựng sai theo bốn đường (policy TO public với anon và authenticated; DEFAULT, cột sinh, CHECK với authenticated — anon không có policy ghi nên không tính) mà bộ kiểm ra %s', got);
END $$;
-- Tiền đề: đúng vai ấy chạy thật thì hỏng 42501. Nếu một ngày Postgres chạy các
-- biểu thức này bằng quyền chủ bảng, FP1/FP2 thành báo động giả và phải biết.
-- Đọc bằng ANON: với authenticated, `zz_read OR true` của zz_write được gập
-- thành true trước khi hàm kịp chạy — nên FP1 bảo thủ hơn thực tế ở chỗ ấy.
SET LOCAL ROLE anon;
DO $$ BEGIN ASSERT pg_temp.errcode('SELECT * FROM public.zz_fp_probe') = '42501', 'FP3 tiền đề sai: anon đọc bảng có policy gọi hàm đã đóng mà không hỏng 42501'; END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.errcode('INSERT INTO public.zz_fp_probe (id, a) VALUES (1, NULL)') = '42501', 'FP3 tiền đề sai: authenticated chèn vào bảng có cột sinh gọi hàm đã đóng mà không hỏng 42501'; END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT probe;

-- ── FP1 / FP2 trên lược đồ THẬT ──
DO $$ DECLARE bad text[] := ARRAY(SELECT x FROM pg_temp.fn_priv_problems() x WHERE x LIKE 'FP1 %'); BEGIN
  ASSERT cardinality(bad) = 0, format('FP1 policy gọi một hàm mà vai nó áp vào không chạy được — vai ấy nhận 42501 thay vì bị lọc: %s', bad);
END $$;
DO $$ DECLARE bad text[] := ARRAY(SELECT x FROM pg_temp.fn_priv_problems() x WHERE x LIKE 'FP2 %'); BEGIN
  ASSERT cardinality(bad) = 0, format('FP2 DEFAULT / cột sinh / CHECK gọi một hàm mà vai ghi được bảng không chạy được — lệnh ghi hỏng 42501 (như #150): %s', bad);
END $$;

\echo 'HÀM TRONG POLICY / CỘT SINH / DEFAULT / CHECK: FP0–FP3 xanh'
ROLLBACK;
