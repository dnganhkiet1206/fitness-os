#!/usr/bin/env bash
# Chạy THẬT migration cộng đồng trên một cụm Postgres tạm, rồi mọi bộ kịch bản
# phân quyền (chặn hai chiều, tự ẩn khi bị báo cáo, không tự gắn dấu xác
# minh, không bịa được số trên thẻ…). Cần Postgres 16 cục bộ; không đụng
# project Supabase nào.
#
#   bash supabase/tests/community/run.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
DIR="$(mktemp -d /var/tmp/ascnd-pg-XXXX)"
PORT="${PG_PORT:-55439}"
RUNAS=()
if [ "$(id -u)" = 0 ]; then id postgres >/dev/null 2>&1 || useradd -m postgres; chown postgres "$DIR"; RUNAS=(su postgres -c); fi
run() { if [ ${#RUNAS[@]} -gt 0 ]; then "${RUNAS[@]}" "$*"; else bash -c "$*"; fi; }
run "$BIN/initdb -D $DIR/data -A trust -U postgres >/dev/null"
run "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log start >/dev/null"
trap 'run "$BIN/pg_ctl -D $DIR/data stop -m fast >/dev/null"; rm -rf "$DIR"' EXIT
sleep 1
P=(psql -h "$DIR" -p "$PORT" -U postgres -q -v ON_ERROR_STOP=1)
"${P[@]}" -f "$HERE/supabase-stub.sql"
# MỌI migration cộng đồng, theo thứ tự tên tệp — migration Progress/Recipe của
# giai đoạn 2 tự được áp ở đây mà không ai phải sửa script này.
for m in "$ROOT"/supabase/migrations/*_community_*.sql; do "${P[@]}" -f "$m"; done
# MỌI bộ kịch bản, theo thứ tự tên tệp (foundation trước) — bộ của Progress và
# Recipe tự chạy ở đây mà không ai phải sửa script này.
for t in "$HERE"/*.test.sql; do (cd /var/tmp && "${P[@]}" -f "$t"); done

# Seed tài khoản chính thức: chạy HAI lần, phải ra đúng 3 bài, dấu xác minh
# bật, và mọi bài tập trỏ vào thư viện chung.
OFF=0ff1c1a1-0000-0000-0000-00000000a5cd
"${P[@]}" -c "INSERT INTO auth.users VALUES ('$OFF'); INSERT INTO public.exercises (user_id, name) SELECT NULL, n FROM unnest(ARRAY['Bench Press','Overhead Press','Dumbbell Curl','Pull-up','Barbell Row','Lat Pulldown','Barbell Squat','Romanian Deadlift','Leg Press']) n;"
(cd /var/tmp && "${P[@]}" -v official=$OFF -f "$ROOT/supabase/seed/community-official.sql" && "${P[@]}" -v official=$OFF -f "$ROOT/supabase/seed/community-official.sql")
"${P[@]}" -c "DO \$\$ BEGIN
  ASSERT (SELECT count(*) FROM community_posts WHERE author_id = '$OFF') = 3, 'seed: phải đúng 3 bài sau hai lần chạy';
  ASSERT (SELECT is_official FROM community_profiles WHERE user_id = '$OFF'), 'seed: chưa có dấu xác minh';
  ASSERT NOT EXISTS (SELECT 1 FROM community_posts p, jsonb_array_elements(p.payload->'exercises') e WHERE p.author_id = '$OFF' AND (e->>'library')::boolean IS NOT TRUE), 'seed: có bài tập không thuộc thư viện';
  ASSERT (SELECT count(*) FROM community_challenges WHERE title = '30 ngày kỷ luật') = 1, 'seed: phải đúng 1 thử thách sau hai lần chạy';
END \$\$;"
echo "SEED TÀI KHOẢN CHÍNH THỨC ĐÚNG"
