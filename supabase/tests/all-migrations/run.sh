#!/usr/bin/env bash
# Áp MỌI migration lên MỘT cụm Postgres 16 tạm (AUD-13). Không đụng project
# Supabase nào.
#
#   bash supabase/tests/all-migrations/run.sh
#
# Hai bộ hiện có tách đôi: `community/run.sh` chỉ áp `*_community_*`,
# `core/run.sh` áp phần còn lại — không bộ nào thấy hai nửa đụng nhau (bảng
# trùng tên, phụ thuộc chéo, thứ tự tên tệp sai). Bộ này áp TẤT CẢ, theo thứ
# tự tên tệp — đúng thứ production có — lên một cụm duy nhất, rồi khẳng định
# schema dựng được. Chỉ áp migration, không chạy kịch bản: đỏ ở đây là
# schema production không dựng được từ đầu.
#
# Stub ở `stub.sql` là hợp của hai stub tách đôi, trừ các bảng public đứng
# chỗ (migration lõi thật tạo chúng trước mọi migration cộng đồng dùng tới).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PORT="${PG_PORT:-55463}"
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
MIGDIR="${ALL_MIG_DIR:-$ROOT/supabase/migrations}"  # trỏ vào một bản khác để thử đột biến
DIR="$(mktemp -d /var/tmp/ascnd-all-XXXX)"
RUNAS=()
if [ "$(id -u)" = 0 ]; then id postgres >/dev/null 2>&1 || useradd -m postgres; chown postgres "$DIR"; RUNAS=(su postgres -c); fi
run() { if [ ${#RUNAS[@]} -gt 0 ]; then "${RUNAS[@]}" "$*"; else bash -c "$*"; fi; }
run "$BIN/initdb -D $DIR/data -A trust -U postgres >/dev/null"
run "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log -w start >/dev/null"
trap 'run "$BIN/pg_ctl -D $DIR/data stop -m fast >/dev/null"; rm -rf "$DIR"' EXIT
P=(psql -h "$DIR" -p "$PORT" -U postgres -q -v ON_ERROR_STOP=1)
"${P[@]}" -f "$HERE/stub.sql"
n=0
for m in "$MIGDIR"/*.sql; do "${P[@]}" -f "$m" >/dev/null; n=$((n + 1)); done
tables="$("${P[@]}" -At -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")"
policies="$("${P[@]}" -At -c "SELECT count(*) FROM pg_policies")"
"${P[@]}" -c "DO \$\$ BEGIN ASSERT (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') > 0, 'không có bảng public nào sau khi áp migration'; END \$\$;"
echo "ÁP $n MIGRATION LÊN MỘT CỤM: ĐÚNG ($tables bảng public, $policies policy)"
