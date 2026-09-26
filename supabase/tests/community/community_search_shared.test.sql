-- Tìm công thức và tìm người trên CÙNG một tệp ca với fixture của thế giới giả
-- (#130): `search_cases.json`, cũng được `native/tools/search-parity.mjs` chạy
-- qua `RPC_FIXTURES` trong cổng. Hai bản của một nghĩa — SQL thật và bản dịch
-- JS cho live.mjs — trước đây không gì so với nhau: fixture trôi thì live.mjs
-- xanh trên một hành vi server không có.
--
-- Đường dẫn tệp đến qua biến môi trường SEARCH_CASES (run.sh và b_reverse.py
-- đặt nó), vì run.sh chạy mỗi bộ từ /var/tmp. Thiếu biến thì SC0 đỏ, không im.
--
-- Một giao dịch rồi ROLLBACK, như community_find_recipes.test.sql: hồ sơ và
-- bài của bộ này không được lọt vào phép đếm của bộ khác. Kết quả của hàm được
-- LỌC về dòng của bộ này (id fefefefe…): các bộ trước để lại hồ sơ, và một
-- "pham" của bộ khác không phải là điều tệp ca nói tới.
\set ON_ERROR_STOP 1
BEGIN;
\set cases `cat "$SEARCH_CASES" 2>/dev/null || echo '{}'`
CREATE TEMP TABLE sc AS SELECT :'cases'::jsonb AS j;
GRANT SELECT ON sc TO authenticated;
DO $$ BEGIN
  ASSERT (SELECT jsonb_array_length(coalesce(j->'recipes'->'cases', '[]')) > 0 AND jsonb_array_length(coalesce(j->'profiles'->'cases', '[]')) > 0 FROM sc),
    'SC0 không đọc được search_cases.json — biến môi trường SEARCH_CASES (run.sh, b_reverse.py)';
END $$;

INSERT INTO auth.users SELECT ('fefefefe-0000-0000-0000-0000000003' || lpad(g::text, 2, '0'))::uuid FROM generate_series(1, 30) g;
INSERT INTO community_profiles (user_id, handle, display_name) VALUES
  ('fefefefe-0000-0000-0000-000000000301', 'sc_viewer', 'Người xem'),
  ('fefefefe-0000-0000-0000-000000000302', 'sc_author', 'Người nấu');
INSERT INTO community_profiles (user_id, handle, display_name, is_official)
SELECT ('fefefefe-0000-0000-0000-0000000003' || lpad((10 + i)::text, 2, '0'))::uuid, p->>'handle', p->>'display_name', coalesce((p->>'official')::boolean, false)
FROM sc, jsonb_array_elements(j->'profiles'->'people') WITH ORDINALITY AS t(p, i);
-- Mới nhất trước: bài thứ i cũ hơn bài thứ i-1 một phút.
INSERT INTO community_posts (id, author_id, kind, payload, visibility, created_at)
SELECT ('fefefefe-0000-0000-0000-0000000004' || lpad(i::text, 2, '0'))::uuid, 'fefefefe-0000-0000-0000-000000000302', 'recipe',
       jsonb_build_object('title', t), 'public', now() - (i || ' minutes')::interval
FROM sc, jsonb_array_elements_text(j->'recipes'->'titles') WITH ORDINALITY AS x(t, i);

CREATE OR REPLACE FUNCTION pg_temp.who(u text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false) $$;
SELECT pg_temp.who('fefefefe-0000-0000-0000-000000000301'); SET ROLE authenticated;
DO $$ DECLARE c jsonb; got jsonb; BEGIN
  FOR c IN SELECT jsonb_array_elements(j->'recipes'->'cases') FROM sc LOOP
    SELECT coalesce(jsonb_agg(p.payload->>'title' ORDER BY r.n), '[]') INTO got
    FROM public.community_find_recipes(c->>'q') WITH ORDINALITY AS r(post_id, n)
    JOIN public.community_posts p ON p.id = r.post_id
    WHERE p.id::text LIKE 'fefefefe-%';
    ASSERT got = c->'expect', format('SC1 tìm công thức %s (%s): SQL trả %s, tệp ca đòi %s', to_json(c->>'q'), c->>'why', got, c->'expect');
  END LOOP;
  FOR c IN SELECT jsonb_array_elements(j->'profiles'->'cases') FROM sc LOOP
    SELECT coalesce(jsonb_agg(r.handle ORDER BY r.n), '[]') INTO got
    FROM public.community_search_profiles(c->>'q') WITH ORDINALITY AS r(user_id, handle, display_name, mascot_id, is_official, bio, i_follow, n)
    WHERE r.user_id::text LIKE 'fefefefe-%';
    ASSERT got = c->'expect', format('SC2 tìm người %s (%s): SQL trả %s, tệp ca đòi %s', to_json(c->>'q'), c->>'why', got, c->'expect');
  END LOOP;
END $$;
RESET ROLE;
\echo TẤT CẢ 3 KỊCH BẢN TÌM KIẾM CHUNG ĐÚNG (SC0–SC2, mỗi ca của search_cases.json một lần)
ROLLBACK;
