#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# PHÉP THỬ NGƯỢC cho bài Recipe (#7).
#
#   bash supabase/tests/community/recipe.reverse.sh
#
# Phá MỘT lớp bảo vệ trong `share_recipe`, chạy lại `community_recipe.test.sql`,
# và đòi nó đỏ ĐÚNG kịch bản canh lớp ấy. Xanh mà phá được thì test rỗng nghĩa.
#
# Nó đã bắt được một cái thật, trước khi có gì vào repo: R1 ("anon không gọi
# được") bản đầu so MÃ LỖI 42501 — và với anon thì `auth.uid()` là null nên thân
# hàm tự ném "not signed in" với ĐÚNG mã ấy. Cấp quyền cho anon mà R1 vẫn xanh.
# Nay R1 hỏi thẳng `has_function_privilege`.
#
# Cần Postgres 16 cục bộ và quyền root (cụm tạm chạy dưới user `postgres`),
# như `run.sh`. Không đụng project Supabase nào.
# ════════════════════════════════════════════════════════════════════════════
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
M="$ROOT/supabase/migrations/20260929120000_community_recipe.sql"
try() {  # $1 nhãn · $2 biểu thức sed · $3 chuỗi phải xuất hiện trong lỗi
  local DIR PORT="${PG_PORT:-55471}" out; DIR="$(mktemp -d /var/tmp/ascnd-rv-XXXX)"; chown postgres "$DIR"
  su postgres -c "$BIN/initdb -D $DIR/data -A trust -U postgres >/dev/null"
  su postgres -c "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log start >/dev/null"; sleep 1
  local P=(psql -h "$DIR" -p "$PORT" -U postgres -q -v ON_ERROR_STOP=1)
  "${P[@]}" -f "$ROOT/supabase/tests/community/supabase-stub.sql" >/dev/null
  # mọi migration cộng đồng TRỪ bản Recipe thật — bản ấy được áp ở dòng dưới, đã bị phá
  for m in "$ROOT"/supabase/migrations/*_community_*.sql; do [ "$m" = "$M" ] || "${P[@]}" -f "$m" >/dev/null; done
  sed "$2" "$M" | "${P[@]}" -f - >/dev/null 2>&1
  out="$(cd /var/tmp && "${P[@]}" -f "$HERE/community_recipe.test.sql" 2>&1)"
  su postgres -c "$BIN/pg_ctl -D $DIR/data stop -m fast >/dev/null"; rm -rf "$DIR"
  if grep -q "$3" <<<"$out"; then echo "✓ $1 — đỏ đúng: $3"
  elif grep -q "21 KỊCH BẢN XANH" <<<"$out"; then echo "✗ $1 — VẪN XANH (test rỗng nghĩa)"
  else echo "✗ $1 — đỏ SAI chỗ: $(grep -m1 -oE 'R[0-9]+[^"]*' <<<"$out")"; fi
}
try 'bỏ chốt "bữa của chính mình"'   's/ AND e.user_id = v_uid//'                                    'R14 chia sẻ được bữa của NGƯỜI KHÁC'
try 'lấy tổng của BỮA thay vì các dòng' "s/(SELECT coalesce(sum((x->>'kcal')::numeric), 0) FROM jsonb_array_elements(v_ingredients) x)/(SELECT total_kcal FROM meal_entries WHERE id = p_entry_id)/" 'R12 thẻ lấy tổng của bữa'
try 'cho anon gọi'                     's/FROM PUBLIC, anon;/FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION public.share_recipe(uuid, text, text, text) TO anon;/' 'R1 anon gọi được'
try 'bỏ quyền của người đã đăng nhập' 's/^GRANT EXECUTE ON FUNCTION public.share_recipe(uuid, text, text, text) TO authenticated;//' 'R1b người đã đăng nhập KHÔNG gọi được'
try 'bịa khối lượng cho dòng gõ tay'   's/CASE WHEN f.id IS NOT NULL AND f.serving_g > 0 AND it.servings > 0/CASE WHEN true/;s/THEN round(it.servings \* f.serving_g) END/THEN round(it.servings * coalesce(f.serving_g, 100)) END/' 'R10 dòng gõ tay bị bịa khối lượng'
try 'nhân kcal thêm một lần với servings' "s/'kcal',      round(coalesce(it.kcal, 0)),/'kcal',      round(coalesce(it.kcal, 0) * it.servings),/" 'R5 macro trên thẻ không khớp bữa'
try 'bỏ chốt bữa rỗng'                 's/IF v_n = 0 THEN/IF false THEN/'                               'R15 bữa rỗng vẫn đăng được'
