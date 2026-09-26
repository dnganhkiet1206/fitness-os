#!/usr/bin/env bash
# Chạy THẬT RLS của các bảng LÕI trên một cụm Postgres 16 tạm (#148, bước đầu
# của #132). Không đụng project Supabase nào.
#
#   bash supabase/tests/core/run.sh
#
# Khác `community/run.sh`: migration lõi đầu tiên (`20260212040248`) dựng hơn
# hai mươi bảng cùng lúc và các migration sau vá chúng chéo nhau, nên ở đây KHÔNG
# áp "mọi migration". MIGS là đúng các tệp tạo hoặc đổi quyền của bảng đang
# được kiểm; `core_migs_complete` bên dưới đỏ nếu một migration khác nhắc tới
# một trong các bảng ấy mà chưa có tên trong MIGS.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PORT="${PG_PORT:-55451}"
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
# shellcheck source=migs.sh
. "$HERE/migs.sh"
MIGDIR="${CORE_MIG_DIR:-$ROOT/supabase/migrations}"  # reverse.py trỏ vào một bản đã đột biến
core_migs_complete "$MIGDIR"
DIR="$(mktemp -d /var/tmp/ascnd-core-XXXX)"
RUNAS=()
if [ "$(id -u)" = 0 ]; then id postgres >/dev/null 2>&1 || useradd -m postgres; chown postgres "$DIR"; RUNAS=(su postgres -c); fi
run() { if [ ${#RUNAS[@]} -gt 0 ]; then "${RUNAS[@]}" "$*"; else bash -c "$*"; fi; }
run "$BIN/initdb -D $DIR/data -A trust -U postgres >/dev/null"
run "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log -w start >/dev/null"
trap 'run "$BIN/pg_ctl -D $DIR/data stop -m fast >/dev/null"; rm -rf "$DIR"' EXIT
P=(psql -h "$DIR" -p "$PORT" -U postgres -q -v ON_ERROR_STOP=1)
bad="$(grep -nH 'SET ROLE anon' "$HERE"/*.test.sql | grep -vE '^[^:]+:[0-9]+:[[:space:]]*--' | grep -v 'pg_temp.anon(); SET ROLE anon' || true)"
if [ -n "$bad" ]; then echo "SET ROLE anon thiếu pg_temp.anon() đứng trước:"; echo "$bad"; exit 1; fi
"${P[@]}" -f "$HERE/stub.sql"
for m in "${MIGS[@]}"; do "${P[@]}" -f "$MIGDIR/$m"; done
for t in "$HERE"/*.test.sql; do (cd /var/tmp && "${P[@]}" -f "$t"); done
