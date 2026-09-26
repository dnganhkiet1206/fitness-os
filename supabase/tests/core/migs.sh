# Migration áp cho bộ lõi, theo thứ tự tên tệp, và các bảng chúng phủ (#148).
# Dùng chung cho run.sh và reverse.py.
MIGS=(
  20260212060013_6726b054-a435-4559-9b7d-fd7eec6f8f41.sql
  20260811120000_coach_memory.sql
)
TABLES=(coach_memory ai_conversations ai_messages)
# Một migration khác nhắc tới bảng đang kiểm (thêm policy, GRANT, đổi cột) mà
# không có trong MIGS thì bộ này đo một bảng không còn giống production.
# Ngoại lệ có lý do: `20260213054439` chỉ thêm khoá ngoại tới auth.users và chỉ
# mục — không đổi quyền — và nó ALTER hàng chục bảng lõi khác mà stub không dựng.
MIGS_SKIP_OK=(20260213054439_f0be4936-6e44-45c3-93e0-5c6871ce7670.sql)
core_migs_complete() {
  local dir="$1" f base t missing=0
  for f in "$dir"/*.sql; do
    base="$(basename "$f")"
    for t in "${TABLES[@]}"; do
      grep -qw "$t" "$f" || continue
      if [[ " ${MIGS[*]} ${MIGS_SKIP_OK[*]} " != *" $base "* ]]; then
        echo "migration $base nhắc tới bảng $t mà không có trong MIGS (supabase/tests/core/migs.sh)"; missing=1
      fi
    done
  done
  return $missing
}
