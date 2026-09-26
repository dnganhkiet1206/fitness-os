#!/usr/bin/env bash
# Đo `community_find_recipes` ở 50 000 bài (#116). KHÔNG nằm trong run.sh hay
# cổng: số ms tuỳ máy, nên đây là phép đo để người đọc chạy lại, không phải một
# phép thử đỏ/xanh. Số đã đo và quyết định nằm ở đầu
# `20261001160000_community_find_recipes_one_fold.sql`.
#
#   bash supabase/tests/community/perf_find_recipes.sh
#
# Cụm Postgres 16 tạm như run.sh: 500 người, 50 000 bài (10% recipe, 1/7 chỉ-
# người-theo-dõi), người xem theo dõi 59 người, ANALYZE. Không đụng project
# Supabase nào.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
DIR="$(mktemp -d /var/tmp/ascnd-perf-XXXX)"
PORT="${PG_PORT:-55441}"
RUNAS=()
if [ "$(id -u)" = 0 ]; then id postgres >/dev/null 2>&1 || useradd -m postgres; chown postgres "$DIR"; RUNAS=(su postgres -c); fi
run() { if [ ${#RUNAS[@]} -gt 0 ]; then "${RUNAS[@]}" "$*"; else bash -c "$*"; fi; }
run "$BIN/initdb -D $DIR/data -A trust -U postgres >/dev/null"
run "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log -w start >/dev/null"
trap 'run "$BIN/pg_ctl -D $DIR/data stop -m fast >/dev/null"; rm -rf "$DIR"' EXIT
P=(psql -h "$DIR" -p "$PORT" -U postgres -q -v ON_ERROR_STOP=1)
"${P[@]}" -f "$HERE/supabase-stub.sql"
for m in "$ROOT"/supabase/migrations/*_community_*.sql; do "${P[@]}" -f "$m"; done
"${P[@]}" <<'SQL'
INSERT INTO auth.users SELECT ('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid FROM generate_series(1, 500) g;
INSERT INTO community_profiles (user_id, handle, display_name)
  SELECT ('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'user' || g, 'Người ' || g FROM generate_series(1, 500) g;
WITH names AS (SELECT ARRAY['Cơm gà áp chảo','Phở bò tái','Salad cá ngừ','Bún chả Hà Nội','Gà nướng mật ong','Bánh mì trứng','Cháo yến mạch chuối','Ức gà luộc','Súp bí đỏ','Sinh tố bơ'] a)
INSERT INTO community_posts (author_id, kind, payload, visibility, created_at)
SELECT ('00000000-0000-4000-8000-' || lpad((1 + g % 500)::text, 12, '0'))::uuid,
       CASE WHEN g % 10 = 0 THEN 'recipe' ELSE 'workout' END,
       CASE WHEN g % 10 = 0 THEN jsonb_build_object('title', (SELECT a[1 + (g/10) % 10] FROM names) || ' ' || g) ELSE '{}'::jsonb END,
       CASE WHEN g % 7 = 0 THEN 'followers' ELSE 'public' END,
       now() - (g || ' minutes')::interval
FROM generate_series(1, 50000) g;
INSERT INTO community_follows (follower_id, followee_id)
  SELECT '00000000-0000-4000-8000-000000000001', ('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid FROM generate_series(2, 60) g;
ANALYZE;
SQL
ME=00000000-0000-4000-8000-000000000001
echo "== thời gian gọi hàm, vai authenticated (lượt đầu nguội, hai lượt sau ấm)"
for q in ga 'ga ap chao' zzzz; do
  "${P[@]}" -c "SELECT set_config('request.jwt.claim.sub','$ME',false), set_config('request.jwt.claim.role','authenticated',false);" \
    -c "SET ROLE authenticated;" -c "\timing on" \
    -c "SELECT count(*) FROM community_find_recipes('$q');" -c "SELECT count(*) FROM community_find_recipes('$q');" -c "SELECT count(*) FROM community_find_recipes('$q');" \
    2>&1 | grep -E "^Time|^ +[0-9]+$" | tr '\n' ' '; echo " ← '$q'"
done
# Câu bên trong hàm, chép từ migration mới nhất và thay v_uid/v_pat bằng hằng —
# EXPLAIN không nhìn được vào trong một hàm plpgsql.
for q in ga 'ga ap chao' zzzz; do
  echo "== EXPLAIN (ANALYZE, BUFFERS) — '$q'"
  "${P[@]}" -c "EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT p.id FROM community_posts p WHERE p.kind = 'recipe' AND (p.author_id = '$ME' OR (NOT p.hidden AND NOT community_blocked_between('$ME', p.author_id) AND (p.visibility = 'public' OR EXISTS (SELECT 1 FROM community_follows f WHERE f.follower_id = '$ME' AND f.followee_id = p.author_id)))) AND community_fold(p.payload->>'title') LIKE ANY (ARRAY['$q%', '% $q%']) ORDER BY p.created_at DESC, p.id LIMIT 30;" \
    | grep -E "Limit|Scan|Rows Removed|Buffers|Execution"
done
