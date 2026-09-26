#!/usr/bin/env bash
# Đo `community_search_profiles` ở 50 000 hồ sơ (#119), anh em của
# `perf_find_recipes.sh` (#116). KHÔNG nằm trong run.sh hay cổng: số ms tuỳ
# máy. Số đã đo và quyết định nằm ở đầu
# `20261001170000_community_search_profiles_one_fold.sql`.
#
#   bash supabase/tests/community/perf_search_profiles.sh
#
# Cụm Postgres 16 tạm: 50 000 hồ sơ tên Việt có dấu (họ + đệm + tên), 1 000
# dòng chặn, ANALYZE. Không đụng project Supabase nào.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
DIR="$(mktemp -d /var/tmp/ascnd-perf-XXXX)"
PORT="${PG_PORT:-55442}"
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
INSERT INTO auth.users SELECT ('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid FROM generate_series(1, 50000) g;
WITH n AS (SELECT ARRAY['Nguyễn','Trần','Lê','Phạm','Hoàng','Huỳnh','Phan','Vũ','Võ','Đặng','Bùi','Đỗ','Hồ','Ngô','Dương','Lý'] ho,
                  ARRAY['Văn','Thị','Minh','Ngọc','Thanh','Quốc','Hữu','Gia','Bảo','Khánh'] dem,
                  ARRAY['An','Bình','Châu','Dũng','Giang','Hà','Hải','Hùng','Khoa','Lan','Linh','Long','Mai','Nam','Nga','Phúc','Quân','Sơn','Thảo','Trang','Tú','Vy','Yến'] ten)
INSERT INTO community_profiles (user_id, handle, display_name)
  SELECT ('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'user' || g,
         n.ho[1 + g % 16] || ' ' || n.dem[1 + (g / 16) % 10] || ' ' || n.ten[1 + (g / 160) % 23]
  FROM generate_series(1, 50000) g, n;
INSERT INTO community_blocks (blocker_id, blocked_id)
  SELECT ('00000000-0000-4000-8000-' || lpad((1 + g * 7)::text, 12, '0'))::uuid, ('00000000-0000-4000-8000-' || lpad((2 + g * 11)::text, 12, '0'))::uuid
  FROM generate_series(1, 1000) g;
ANALYZE;
SQL
ME=00000000-0000-4000-8000-000000000001
echo "== thời gian gọi hàm, vai authenticated (lượt đầu nguội, hai lượt sau ấm)"
for q in ga nguyen 'linh' user123 zzzz; do
  "${P[@]}" -c "SELECT set_config('request.jwt.claim.sub','$ME',false), set_config('request.jwt.claim.role','authenticated',false);" \
    -c "SET ROLE authenticated;" -c "\timing on" \
    -c "SELECT count(*) FROM community_search_profiles('$q');" -c "SELECT count(*) FROM community_search_profiles('$q');" -c "SELECT count(*) FROM community_search_profiles('$q');" \
    2>&1 | grep -E "^Time|^ +[0-9]+$" | tr '\n' ' '; echo " ← '$q'"
done
# Tách chi phí trên cùng bảng, chuỗi trượt: mỗi dòng một điều kiện riêng.
echo "== tách chi phí, chuỗi trượt 'zzzz' (lượt ấm thứ hai)"
for cond in "true" \
            "p.handle LIKE 'zzzz%'" \
            "community_fold(p.display_name) LIKE 'zzzz%' OR community_fold(p.display_name) LIKE '% zzzz%'" \
            "community_fold(p.display_name) LIKE ANY (ARRAY['zzzz%', '% zzzz%'])" \
            "NOT community_blocked_between('$ME', p.user_id)"; do
  "${P[@]}" -c "\timing on" -c "SELECT count(*) FROM community_profiles p WHERE $cond;" -c "SELECT count(*) FROM community_profiles p WHERE $cond;" \
    2>&1 | grep -E "^Time" | tail -1 | tr '\n' ' '; echo " ← $cond"
done
echo "== nhánh handle: chỉ mục UNIQUE có dùng được cho LIKE 'x%' không"
"${P[@]}" -c "EXPLAIN (COSTS OFF) SELECT 1 FROM community_profiles p WHERE p.handle LIKE 'user123%';"
"${P[@]}" -c "SELECT datcollate FROM pg_database WHERE datname = current_database();"
