-- RLS của MỌI bảng lõi, chạy thật (#132). Hai người A, B và anon.
--
-- ── cách đo ──
--
-- Mỗi bảng được XẾP LOẠI ở ba bảng tạm dưới đây, và T0 đỏ khi một bảng public
-- chưa có chỗ — một bảng mới không lọt qua bộ này chỉ vì chưa ai viết kịch bản
-- cho nó. Dòng thử được SINH từ catalog (`row_sql`): cột NOT NULL không có mặc
-- định lấy một giá trị theo kiểu, khoá ngoại trỏ tới dòng cha CÙNG chủ. Vài cột
-- có CHECK được ghi đè tay trong `row_sql`.
--
-- Bốn pha, theo thứ tự này vì một lý do:
--   1. service role ghi một dòng của A vào mọi bảng.
--   2. B — CHƯA có dòng nào ở đâu cả — đọc, sửa, xoá, chèn-mang-tên-A. Vì B
--      không có dòng nào, MỌI dòng một lệnh của B chạm tới là dòng của A: lệnh
--      UPDATE không WHERE (`SET user_id = B`, một hằng — không đọc cột nên
--      Postgres không áp policy SELECT, xem V4 ở community_privacy) mà báo lỗi
--      hay đổi được dòng của A đều là B với tới dòng ấy. Và không có dòng nào
--      của B để một ràng buộc UNIQUE va vào rồi lăn cả câu lại (bài của M14).
--   3. B với dòng CỦA MÌNH: chèn / thấy / sửa / xoá được đúng như cột `may`
--      nói. Đây là kịch bản kiểm soát — một policy đóng chặt đến mức chặn luôn
--      chủ làm mọi kịch bản pha 2 xanh vô nghĩa — và cũng là DANH SÁCH các bảng
--      cố ý không theo luật "chủ làm gì cũng được" (server ghi, chỉ đọc…).
--   4. anon.
--
-- Lỗi khi chèn phải ĐÚNG là 42501 (vi phạm RLS). Một lần chèn hỏng vì CHECK,
-- NOT NULL hay UNIQUE không chứng minh gì về policy.
\set ON_ERROR_STOP 1
BEGIN;
\set A '''0a0a0a0a-0000-4000-8000-00000000000a'''
\set B '''0b0b0b0b-0000-4000-8000-00000000000b'''
INSERT INTO auth.users (id) VALUES (:A), (:B);
-- `on_auth_user_created` đã tạo hồ sơ; bỏ đi để `profiles` đi cùng đường với
-- mọi bảng khác (pha 1 ghi dòng của A, pha 3 B tự tạo dòng của mình).
DELETE FROM public.profiles WHERE user_id IN (:A, :B);

-- ── xếp loại ──
-- Bảng có user_id. `may`: chủ được S(elect) I(nsert) U(pdate) D(elete) dòng
-- của mình. `ord`: cha trước con (khoá ngoại).
CREATE TEMP TABLE owned (tbl text PRIMARY KEY, may text NOT NULL, ord int NOT NULL, why text);
INSERT INTO owned VALUES
  ('profiles', 'SIUD', 1, NULL), ('exercises', 'SIUD', 2, 'cộng thư viện chung user_id NULL: xem X1–X4'),
  ('food_items', 'SIUD', 3, 'cộng thư viện chung user_id NULL: xem X1–X4'),
  ('workout_templates', 'SIUD', 4, NULL), ('workout_sessions', 'SIUD', 5, NULL), ('routine_days', 'SIUD', 6, NULL),
  ('meal_entries', 'SIUD', 7, NULL), ('meal_plans', 'SIUD', 8, NULL),
  ('supplements', 'SIUD', 9, NULL), ('supplement_intake_logs', 'SIUD', 10, NULL),
  ('water_logs', 'SIUD', 11, NULL), ('grocery_items', 'SIUD', 12, NULL), ('weight_logs', 'SIUD', 13, NULL),
  ('body_measurements', 'SIUD', 14, NULL), ('sleep_logs', 'SIUD', 15, NULL), ('daily_logs', 'SIUD', 16, NULL),
  ('biometric_samples', 'SIUD', 17, NULL), ('wearable_sources', 'SIUD', 18, NULL), ('progress_photos', 'SIUD', 19, NULL),
  ('scan_history', 'SIUD', 20, NULL), ('habit_nudges', 'SIUD', 21, NULL), ('weekly_reviews', 'SIUD', 22, NULL),
  ('weekly_challenges', 'SIUD', 23, NULL), ('ai_conversations', 'SIUD', 24, NULL),
  ('awards', 'SID', 25, 'huy chương không sửa được, chỉ thu hồi'),
  ('mascot_inventory', 'SU', 26, 'chỉ đổi trạng thái món (trang bị); món và chủ bị trigger khoá — 20260810120000'),
  ('coach_memory', 'SD', 27, 'được dán vào system prompt: chỉ service role ghi, chủ đọc và xoá — 20260811120000'),
  ('ai_credits', 'S', 28, 'hạn mức AI: server ghi'), ('ai_usage', 'S', 29, 'đếm lượt AI: server ghi'),
  ('entitlements', 'S', 30, 'gói trả phí: tự chèn là tự cấp gói — 20260810120000'),
  ('mascot_transactions', 'S', 31, 'sổ xu: server ghi — 20260810120000'),
  ('streak_freezes', 'S', 32, 'mua bằng RPC có khoá — 20260814120000');
-- Bảng không có user_id: quyền đi qua dòng cha.
CREATE TEMP TABLE kids (tbl text PRIMARY KEY, fk text NOT NULL, parent text NOT NULL);
INSERT INTO kids VALUES
  ('ai_messages', 'conversation_id', 'ai_conversations'),
  ('meal_entry_items', 'meal_entry_id', 'meal_entries'),
  ('meal_plan_items', 'meal_plan_id', 'meal_plans');
-- Danh mục: không ai ghi bằng token người dùng.
CREATE TEMP TABLE catalog (tbl text PRIMARY KEY, anon_reads boolean NOT NULL, why text NOT NULL);
INSERT INTO catalog VALUES
  ('exercise_guide_content', true, 'hướng dẫn của bài tập thấy được — bài chung thì cả anon'),
  ('exercise_media', true, 'như trên'), ('exercise_media_content', true, 'như trên'),
  ('reward_prices', false, 'bảng giá thưởng: đã đăng nhập mới đọc'),
  ('shop_prices', false, 'bảng giá cửa hàng: vai authenticated mới đọc');
GRANT SELECT ON owned, kids, catalog TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.anon() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false) $$;
-- Trong một khối DO: đổi sang anon ĐÚNG như Supabase (không sub) trong một lời gọi.
CREATE OR REPLACE FUNCTION pg_temp.become_anon() RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_temp.anon(); SET ROLE anon; END $$;
CREATE OR REPLACE FUNCTION pg_temp.errcode(stmt text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE stmt; RETURN 'ok'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
-- id tất định của dòng thử: (chủ, bảng). Thư viện chung (chủ NULL) là 'shared'.
CREATE OR REPLACE FUNCTION pg_temp.rid(uid uuid, t text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT md5(coalesce(uid::text, 'shared') || '/' || t)::uuid $$;
CREATE OR REPLACE FUNCTION pg_temp.row_sql(t text, uid uuid, row_id uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  cols text[] := '{}'; vals text[] := '{}'; c record; v text; par text;
BEGIN
  FOR c IN SELECT column_name, udt_name, is_nullable, column_default FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = t AND is_generated = 'NEVER' ORDER BY ordinal_position LOOP
    IF c.column_name = 'user_id' THEN
      v := quote_nullable(uid);
    ELSIF c.column_name = 'id' AND c.udt_name = 'uuid' THEN
      v := quote_literal(row_id);
    ELSIF c.is_nullable = 'YES' OR c.column_default IS NOT NULL THEN
      CONTINUE;
    ELSE
      -- Cột có CHECK: một giá trị hợp lệ, không phải 'x'.
      v := CASE t || '.' || c.column_name
        WHEN 'coach_memory.kind' THEN quote_literal('goal')
        WHEN 'coach_memory.fact' THEN quote_literal('Chạy 10 km trong tháng 11')
        WHEN 'routine_days.day_of_week' THEN '1'
        WHEN 'exercise_guide_content.locale' THEN quote_literal('vi')
        WHEN 'exercise_media.kind' THEN quote_literal('image')
        WHEN 'exercise_media_content.locale' THEN quote_literal('vi')
        ELSE NULL END;
      IF v IS NULL AND c.udt_name = 'uuid' THEN
        -- Khoá ngoại NOT NULL: dòng cha CÙNG chủ (id tất định của nó).
        SELECT cl.relname INTO par
        FROM pg_constraint k JOIN pg_class cl ON cl.oid = k.confrelid
        WHERE k.contype = 'f' AND k.conrelid = ('public.' || t)::regclass
          AND k.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = ('public.' || t)::regclass AND attname = c.column_name)];
        IF par IS NULL THEN RAISE EXCEPTION 'row_sql: %.% là uuid NOT NULL không có khoá ngoại', t, c.column_name; END IF;
        v := quote_literal(pg_temp.rid(uid, par));
      END IF;
      v := coalesce(v, CASE c.udt_name
        WHEN 'text' THEN quote_literal('x') WHEN 'date' THEN 'current_date' WHEN 'timestamptz' THEN 'now()'
        WHEN 'int4' THEN '1' WHEN 'numeric' THEN '1' WHEN 'bool' THEN 'false' WHEN 'jsonb' THEN quote_literal('{}') END);
      IF v IS NULL THEN RAISE EXCEPTION 'row_sql: chưa biết sinh giá trị cho %.% (%)', t, c.column_name, c.udt_name; END IF;
    END IF;
    cols := cols || quote_ident(c.column_name);
    vals := vals || v;
  END LOOP;
  RETURN format('INSERT INTO public.%I (%s) VALUES (%s)', t, array_to_string(cols, ', '), array_to_string(vals, ', '));
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon, service_role;

-- ── T: mọi bảng đã được xếp loại, và bật RLS ──
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' ORDER BY 1 LOOP
    ASSERT EXISTS (SELECT 1 FROM owned WHERE tbl = t UNION ALL SELECT 1 FROM kids WHERE tbl = t UNION ALL SELECT 1 FROM catalog WHERE tbl = t),
      format('T0 bảng %s chưa được xếp loại trong owner_rls.test.sql (owned / kids / catalog)', t);
    ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass), format('T1 %s: chưa bật RLS', t);
  END LOOP;
  FOR t IN SELECT tbl FROM owned LOOP
    ASSERT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id'),
      format('T2 %s được xếp vào owned mà không có cột user_id', t);
  END LOOP;
END $$;

-- ── pha 1: service role ghi dòng của A, dòng thư viện chung, dòng danh mục ──
SET ROLE service_role;
DO $$ DECLARE t text; A uuid := '0a0a0a0a-0000-4000-8000-00000000000a'; BEGIN
  FOR t IN SELECT tbl FROM owned ORDER BY ord LOOP EXECUTE pg_temp.row_sql(t, A, pg_temp.rid(A, t)); END LOOP;
  FOR t IN SELECT tbl FROM kids LOOP EXECUTE pg_temp.row_sql(t, A, pg_temp.rid(A, t)); END LOOP;
  -- Thư viện chung, và danh mục cho CẢ bài chung lẫn bài riêng của A.
  EXECUTE pg_temp.row_sql('exercises', NULL, pg_temp.rid(NULL, 'exercises'));
  EXECUTE pg_temp.row_sql('food_items', NULL, pg_temp.rid(NULL, 'food_items'));
  FOREACH t IN ARRAY ARRAY['exercise_guide_content', 'exercise_media', 'exercise_media_content'] LOOP
    EXECUTE pg_temp.row_sql(t, NULL, pg_temp.rid(NULL, t));
    EXECUTE pg_temp.row_sql(t, A, pg_temp.rid(A, t));
  END LOOP;
END $$;
INSERT INTO storage.objects (bucket_id, name) VALUES ('progress-photos', '0a0a0a0a-0000-4000-8000-00000000000a/1.jpg');
RESET ROLE;
-- Giá: migration đã có hàng thì thôi; chưa có thì một hàng để "anon đọc 0" có nghĩa.
INSERT INTO public.reward_prices (reward_key, coins) SELECT 'thu', 1 WHERE NOT EXISTS (SELECT 1 FROM public.reward_prices);
INSERT INTO public.shop_prices (item_key, price) SELECT 'thu', 1 WHERE NOT EXISTS (SELECT 1 FROM public.shop_prices);

-- ── pha 2: B, chưa có dòng nào, tấn công dòng của A ──
DO $$
DECLARE
  t text; k record; n bigint; e text; ins text;
  A uuid := '0a0a0a0a-0000-4000-8000-00000000000a';
  B uuid := '0b0b0b0b-0000-4000-8000-00000000000b';
BEGIN
  PERFORM pg_temp.who(B::text);
  -- Thư viện chung: đọc được, không sửa/xoá/tạo được. TRƯỚC vòng các bảng:
  -- lệnh `UPDATE … SET user_id = B` của O2 mà với tới dòng chung thì cướp nó
  -- (NULL → B), rồi lệnh xoá của O3 xoá nó — X1 sẽ nói "không thấy" thay vì
  -- nói đúng điều đã xảy ra (reverse.py bắt được).
  FOREACH t IN ARRAY ARRAY['exercises', 'food_items'] LOOP
    EXECUTE 'SET ROLE authenticated';
    EXECUTE format('SELECT count(*) FROM public.%I WHERE id = %L', t, pg_temp.rid(NULL, t)) INTO n;
    e := pg_temp.errcode(format('UPDATE public.%I SET name = %L', t, 'B sửa'));
    EXECUTE 'RESET ROLE';
    ASSERT n = 1, format('X1 %s: B không thấy thư viện chung', t);
    EXECUTE format('SELECT count(*) FROM public.%I WHERE id = %L AND name = %L', t, pg_temp.rid(NULL, t), 'x') INTO n;
    ASSERT n = 1, format('X2 %s: B sửa được dòng thư viện chung (%s)', t, e);
    EXECUTE 'SET ROLE authenticated';
    e := pg_temp.errcode(format('DELETE FROM public.%I', t));
    EXECUTE 'RESET ROLE';
    EXECUTE format('SELECT count(*) FROM public.%I WHERE id = %L', t, pg_temp.rid(NULL, t)) INTO n;
    ASSERT n = 1, format('X3 %s: B xoá được dòng thư viện chung (%s)', t, e);
    ins := pg_temp.row_sql(t, NULL, gen_random_uuid());
    EXECUTE 'SET ROLE authenticated';
    e := pg_temp.errcode(ins);
    EXECUTE 'RESET ROLE';
    ASSERT e = '42501', format('X4 %s: B tạo được dòng thư viện chung (user_id NULL) — cần 42501, được %s', t, e);
  END LOOP;

  FOR t IN SELECT tbl FROM owned ORDER BY ord LOOP
    ins := pg_temp.row_sql(t, A, gen_random_uuid());
    EXECUTE 'SET ROLE authenticated';
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id IS NOT NULL', t) INTO n;
    EXECUTE 'RESET ROLE';
    ASSERT n = 0, format('O1 %s: B đọc được dòng của A', t);

    EXECUTE 'SET ROLE authenticated';
    e := pg_temp.errcode(format('UPDATE public.%I SET user_id = %L', t, B));
    EXECUTE 'RESET ROLE';
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id = %L', t, A) INTO n;  -- không phải bảng nào cũng có `id`
    ASSERT e = 'ok' AND n = 1, format('O2 %s: lệnh sửa của B với tới dòng của A (%s)', t, e);

    EXECUTE 'SET ROLE authenticated';
    e := pg_temp.errcode(format('DELETE FROM public.%I', t));
    EXECUTE 'RESET ROLE';
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id = %L', t, A) INTO n;
    ASSERT e = 'ok' AND n = 1, format('O3 %s: lệnh xoá của B với tới dòng của A (%s)', t, e);

    EXECUTE 'SET ROLE authenticated';
    e := pg_temp.errcode(ins);
    EXECUTE 'RESET ROLE';
    ASSERT e = '42501', format('O4 %s: B chèn dòng mang user_id của A — cần 42501 (RLS), được %s', t, e);
  END LOOP;

  FOR k IN SELECT * FROM kids LOOP
    ins := pg_temp.row_sql(k.tbl, A, gen_random_uuid());  -- trỏ vào dòng cha của A
    EXECUTE 'SET ROLE authenticated';
    EXECUTE format('SELECT count(*) FROM public.%I', k.tbl) INTO n;
    EXECUTE 'RESET ROLE';
    ASSERT n = 0, format('K1 %s: B đọc được dòng con trong %s của A', k.tbl, k.parent);

    -- B chưa có dòng cha: mọi dòng lệnh này chạm tới là của A, và khoá ngoại
    -- trỏ tới cha chưa tồn tại thì báo lỗi — lỗi nào cũng là "với tới".
    EXECUTE 'SET ROLE authenticated';
    e := pg_temp.errcode(format('UPDATE public.%I SET %I = %L', k.tbl, k.fk, pg_temp.rid(B, k.parent)));
    EXECUTE 'RESET ROLE';
    EXECUTE format('SELECT count(*) FROM public.%I WHERE id = %L AND %I = %L', k.tbl, pg_temp.rid(A, k.tbl), k.fk, pg_temp.rid(A, k.parent)) INTO n;
    ASSERT e = 'ok' AND n = 1, format('K2 %s: lệnh sửa của B với tới dòng con của A (%s)', k.tbl, e);

    EXECUTE 'SET ROLE authenticated';
    e := pg_temp.errcode(format('DELETE FROM public.%I', k.tbl));
    EXECUTE 'RESET ROLE';
    EXECUTE format('SELECT count(*) FROM public.%I WHERE id = %L', k.tbl, pg_temp.rid(A, k.tbl)) INTO n;
    ASSERT e = 'ok' AND n = 1, format('K3 %s: lệnh xoá của B với tới dòng con của A (%s)', k.tbl, e);

    EXECUTE 'SET ROLE authenticated';
    e := pg_temp.errcode(ins);
    EXECUTE 'RESET ROLE';
    ASSERT e = '42501', format('K4 %s: B chèn dòng con vào %s của A — cần 42501, được %s', k.tbl, k.parent, e);
  END LOOP;

  -- Danh mục: thấy phần của bài chung, KHÔNG thấy phần của bài riêng của A,
  -- không ghi được gì.
  FOR t IN SELECT tbl FROM catalog ORDER BY tbl LOOP
    IF t LIKE 'exercise_%' THEN
      EXECUTE 'SET ROLE authenticated';
      EXECUTE format('SELECT count(*) FROM public.%I WHERE id = %L', t, pg_temp.rid(NULL, t)) INTO n;
      EXECUTE 'RESET ROLE';
      ASSERT n = 1, format('X5 %s: B không thấy danh mục của bài chung', t);
      EXECUTE 'SET ROLE authenticated';
      EXECUTE format('SELECT count(*) FROM public.%I WHERE id = %L', t, pg_temp.rid(A, t)) INTO n;
      EXECUTE 'RESET ROLE';
      ASSERT n = 0, format('X6 %s: B thấy danh mục của bài tập RIÊNG của A', t);
      ins := pg_temp.row_sql(t, NULL, gen_random_uuid());
    ELSIF t = 'reward_prices' THEN ins := 'INSERT INTO public.reward_prices (reward_key, coins) VALUES (''B'', 999)';
    ELSE ins := 'INSERT INTO public.shop_prices (item_key, price) VALUES (''B'', 1)';
    END IF;
    EXECUTE 'SET ROLE authenticated';
    e := pg_temp.errcode(ins);
    EXECUTE 'RESET ROLE';
    ASSERT e = '42501', format('X7 %s: B ghi được vào danh mục — cần 42501, được %s', t, e);
  END LOOP;
  EXECUTE 'SET ROLE authenticated';
  EXECUTE 'SELECT count(*) FROM public.shop_prices' INTO n;
  EXECUTE 'RESET ROLE';
  ASSERT n > 0, 'X8 shop_prices: người đã đăng nhập không đọc được bảng giá';

  -- Ảnh tiến trình trong storage: thư mục đầu của đường dẫn là id người dùng.
  EXECUTE 'SET ROLE authenticated';
  SELECT count(*) INTO n FROM storage.objects;
  e := pg_temp.errcode($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('progress-photos', '0a0a0a0a-0000-4000-8000-00000000000a/B.jpg')$q$);
  PERFORM pg_temp.errcode('DELETE FROM storage.objects');
  EXECUTE 'RESET ROLE';
  ASSERT n = 0, 'P1 B thấy ảnh tiến trình của A trong storage';
  ASSERT e = '42501', format('P2 B tải ảnh vào thư mục của A — cần 42501, được %s', e);
  ASSERT (SELECT count(*) FROM storage.objects WHERE name = '0a0a0a0a-0000-4000-8000-00000000000a/1.jpg') = 1, 'P3 B xoá được ảnh của A';
END $$;

-- ── pha 3: B với dòng của mình — đúng những gì `may` nói, không hơn không kém ──
DO $$
DECLARE
  r record; k record; n bigint; e text; ins text;
  A uuid := '0a0a0a0a-0000-4000-8000-00000000000a';
  B uuid := '0b0b0b0b-0000-4000-8000-00000000000b';
BEGIN
  PERFORM pg_temp.who(B::text);
  FOR r IN SELECT * FROM owned ORDER BY ord LOOP
    ins := pg_temp.row_sql(r.tbl, B, pg_temp.rid(B, r.tbl));
    EXECUTE 'SET ROLE authenticated';
    e := pg_temp.errcode(ins);
    EXECUTE 'RESET ROLE';
    IF strpos(r.may, 'I') > 0 THEN
      ASSERT e = 'ok', format('C1 %s: B không tự chèn được dòng của mình (%s)', r.tbl, e);
    ELSE
      ASSERT e = '42501', format('C1 %s: B tự chèn được dòng của mình — bảng này %s (được %s)', r.tbl, r.why, e);
      EXECUTE 'SET ROLE service_role'; EXECUTE ins; EXECUTE 'RESET ROLE';
    END IF;
    EXECUTE 'SET ROLE authenticated';
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id IS NOT NULL', r.tbl) INTO n;
    EXECUTE 'RESET ROLE';
    ASSERT n = 1, format('C2 %s: B thấy %s dòng mang user_id, cần đúng 1 (của mình)', r.tbl, n);
    EXECUTE 'SET ROLE authenticated';
    EXECUTE format('UPDATE public.%I SET user_id = %L', r.tbl, B);
    GET DIAGNOSTICS n = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    ASSERT (n > 0) = (strpos(r.may, 'U') > 0), format('C3 %s: B %s sửa được dòng của mình, cần %s', r.tbl,
      CASE WHEN n > 0 THEN '' ELSE 'KHÔNG' END, CASE WHEN strpos(r.may, 'U') > 0 THEN 'được' ELSE 'không (' || r.why || ')' END);
  END LOOP;
  FOR k IN SELECT * FROM kids LOOP
    ins := pg_temp.row_sql(k.tbl, B, pg_temp.rid(B, k.tbl));
    EXECUTE 'SET ROLE authenticated';
    e := pg_temp.errcode(ins);
    EXECUTE format('SELECT count(*) FROM public.%I', k.tbl) INTO n;
    EXECUTE 'RESET ROLE';
    ASSERT e = 'ok' AND n = 1, format('C5 %s: B không tự chèn/thấy được dòng con trong %s của mình (%s, thấy %s)', k.tbl, k.parent, e, n);
  END LOOP;
  -- Xoá: con trước, rồi cha theo thứ tự ngược.
  FOR k IN SELECT * FROM kids LOOP
    EXECUTE 'SET ROLE authenticated';
    EXECUTE format('DELETE FROM public.%I', k.tbl);
    GET DIAGNOSTICS n = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    ASSERT n = 1, format('C6 %s: B không xoá được dòng con của mình', k.tbl);
  END LOOP;
  FOR r IN SELECT * FROM owned ORDER BY ord DESC LOOP
    EXECUTE 'SET ROLE authenticated';
    EXECUTE format('DELETE FROM public.%I WHERE user_id IS NOT NULL', r.tbl);
    GET DIAGNOSTICS n = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    ASSERT (n > 0) = (strpos(r.may, 'D') > 0), format('C4 %s: B %s xoá được dòng của mình, cần %s', r.tbl,
      CASE WHEN n > 0 THEN '' ELSE 'KHÔNG' END, CASE WHEN strpos(r.may, 'D') > 0 THEN 'được' ELSE 'không (' || r.why || ')' END);
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id = %L', r.tbl, A) INTO n;
    ASSERT n = 1, format('O5 %s: lệnh xoá dòng của mình kéo theo dòng của A', r.tbl);
  END LOOP;
  -- Kiểm soát của P1–P3: B tải và thấy được ảnh trong thư mục CỦA MÌNH.
  EXECUTE 'SET ROLE authenticated';
  e := pg_temp.errcode($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('progress-photos', '0b0b0b0b-0000-4000-8000-00000000000b/1.jpg')$q$);
  SELECT count(*) INTO n FROM storage.objects;
  EXECUTE 'RESET ROLE';
  ASSERT e = 'ok' AND n = 1, format('P4 B không tải/thấy được ảnh trong thư mục của mình (%s, thấy %s)', e, n);
END $$;

-- ── pha 4: anon ──
DO $$
DECLARE
  t text; n bigint; e text;
BEGIN
  FOR t IN SELECT tbl FROM owned ORDER BY ord LOOP
    PERFORM pg_temp.become_anon();
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id IS NOT NULL', t) INTO n;
    e := pg_temp.errcode(pg_temp.row_sql(t, '0a0a0a0a-0000-4000-8000-00000000000a', gen_random_uuid()));
    EXECUTE 'RESET ROLE';
    ASSERT n = 0, format('N1 %s: anon đọc được dòng của người dùng', t);
    ASSERT e = '42501', format('N2 %s: anon chèn dòng mang user_id của A — cần 42501, được %s', t, e);
  END LOOP;
  FOR t IN SELECT tbl FROM kids UNION ALL SELECT tbl FROM catalog WHERE NOT anon_reads LOOP
    PERFORM pg_temp.become_anon();
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    EXECUTE 'RESET ROLE';
    ASSERT n = 0, format('N3 %s: anon đọc được', t);
  END LOOP;
  PERFORM pg_temp.become_anon();
  SELECT count(*) INTO n FROM storage.objects;
  EXECUTE 'RESET ROLE';
  ASSERT n = 0, 'N4 anon thấy ảnh tiến trình trong storage';
END $$;

\echo 'RLS BẢNG LÕI: T0–T2 · O1–O5 · K1–K4 · X1–X8 · C1–C6 · P1–P4 · N1–N4 xanh trên mọi bảng'
ROLLBACK;
