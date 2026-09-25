#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# PHÉP THỬ NGƯỢC cho các bộ của A (#15): nền móng, Progress, Thử thách, Quyền
# riêng tư, Thông báo, Tìm người, Lịch sử thử thách. Cùng khuôn với `recipe.reverse.sh` của B.
#
#   bash supabase/tests/community/a-suites.reverse.sh
#
# Mỗi dòng `try` phá MỘT lớp bảo vệ trong một migration, dựng lại cụm, chạy
# đúng một bộ test, và đòi nó đỏ ĐÚNG kịch bản canh lớp ấy. Xanh khi đã phá là
# test rỗng nghĩa; đỏ ở kịch bản khác là test đo nhầm chỗ.
#
# Những gì nó đã bắt được, trước khi vào repo:
#   · foundation #21, challenges C4/C14 — ghi và kiểm trong CÙNG một câu nối
#     bằng AND: Postgres không hứa thứ tự tính, phép đếm chạy trước lệnh ghi.
#   · privacy V4 — UPDATE có WHERE đọc cột nên Postgres áp cả policy SELECT;
#     mở toang policy UPDATE mà vẫn xanh.
#   · challenges C19/C20, notifications N20 — so MÃ LỖI khi anon gọi, trong khi
#     với anon `auth.uid()` là null và thân hàm tự ném 42501. Cấp quyền cho
#     anon mà vẫn xanh. Nay hỏi thẳng `has_function_privilege`.
#   · notifications N10 — chỉ đếm sau lượt theo dõi LẠI; UNIQUE giữ con số là 1
#     kể cả khi trigger dọn đã mất. Nay có N10a ngay sau lượt bỏ.
#   · challenges C9 — không phải lỗi của test mà của STUB: Supabase cấp sẵn
#     EXECUTE trên mọi hàm mới cho anon và authenticated, stub thì không, nên
#     mọi `REVOKE … FROM anon, authenticated` chưa từng được đo. Stub nay có
#     đúng dòng default privileges ấy.
#
# Cụm khởi động bằng `pg_ctl -w` (đợi tới khi nhận kết nối), không `sleep 1`:
# một máy chậm hay một cụm khác đang chạy làm `sleep` hụt, và dòng ấy đọc ra
# "đỏ SAI chỗ" cho một lỗi không liên quan gì tới test.
#
# Cần Postgres 16 cục bộ và quyền root, như `run.sh`. Không đụng project nào.
# ════════════════════════════════════════════════════════════════════════════
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
MIG="$ROOT/supabase/migrations"
BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PORT="${PG_PORT:-55473}"
fails=0

try() {  # $1 nhãn · $2 tệp migration bị phá · $3 biểu thức sed · $4 bộ test · $5 chuỗi phải có trong lỗi
  local DIR out m; DIR="$(mktemp -d /var/tmp/ascnd-ra-XXXX)"
  if [ "$(id -u)" = 0 ]; then id postgres >/dev/null 2>&1 || useradd -m postgres; chown postgres "$DIR"; fi
  su postgres -c "$BIN/initdb -D $DIR/data -A trust -U postgres >/dev/null"
  su postgres -c "$BIN/pg_ctl -w -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log start >/dev/null"
  local P=(psql -h "$DIR" -p "$PORT" -U postgres -q -v ON_ERROR_STOP=1)
  "${P[@]}" -f "$HERE/supabase-stub.sql" >/dev/null
  # Đúng thứ tự tên tệp, bản bị phá thế chỗ bản thật — migration sau có thể
  # dựa vào migration trước.
  for m in "$MIG"/*_community_*.sql; do
    if [ "$(basename "$m")" = "$2" ]; then sed "$3" "$m" | "${P[@]}" -f - >/dev/null 2>&1
    else "${P[@]}" -f "$m" >/dev/null; fi
  done
  out="$(cd /var/tmp && "${P[@]}" -f "$HERE/$4" 2>&1)"
  su postgres -c "$BIN/pg_ctl -D $DIR/data stop -m fast >/dev/null"; rm -rf "$DIR"
  if grep -qF "$5" <<<"$out"; then echo "✓ $1 — đỏ đúng: $5"
  elif grep -q "ĐÚNG" <<<"$out"; then echo "✗ $1 — VẪN XANH (test rỗng nghĩa)"; fails=$((fails + 1))
  else echo "✗ $1 — đỏ SAI chỗ: $(grep -m1 -E 'ERROR' <<<"$out")"; fails=$((fails + 1)); fi
}

F=20260927120000_community_foundation.sql
try 'bài: thêm policy UPDATE'            $F 's/^CREATE POLICY "Authors delete their own posts"/CREATE POLICY "open" ON public.community_posts FOR UPDATE TO authenticated USING (true);\n&/' community_foundation.test.sql '21 '

G=20260928120000_community_progress.sql
try 'progress: chỉ số tắt vẫn vào payload' $G 's/^  IF p_waist THEN/  IF true THEN/'                                            community_progress.test.sql 'P1 '
try 'progress: tính cả set khởi động'   $G "s/AND coalesce((e->>'warmup')::boolean, false) = false/AND true/"                  community_progress.test.sql 'P8 '

C=20260930120000_community_challenges.sql
try 'thử thách: đếm buổi thay vì ngày'   $C 's/count(DISTINCT ((s.date_time/count(((s.date_time/'                         community_challenges.test.sql 'C6 '
try 'thử thách: bỏ chốt nhận hai lần'    $C 's/IF v_claimed IS NOT NULL THEN/IF false THEN/'                            community_challenges.test.sql 'C13 '
try 'thử thách: hàm đo cho client gọi'   $C 's/FROM PUBLIC, anon, authenticated;/FROM PUBLIC, anon;/'                   community_challenges.test.sql 'C9 '
try 'thử thách: anon đọc tổng quan'      $C 's/^REVOKE EXECUTE ON FUNCTION public.community_challenges_overview(integer) FROM PUBLIC, anon;/GRANT EXECUTE ON FUNCTION public.community_challenges_overview(integer) TO anon;/' community_challenges.test.sql 'C19 '
try 'thử thách: anon nhận thưởng'        $C 's/^REVOKE EXECUTE ON FUNCTION public.claim_community_challenge(uuid, integer) FROM PUBLIC, anon;/GRANT EXECUTE ON FUNCTION public.claim_community_challenge(uuid, integer) TO anon;/' community_challenges.test.sql 'C20 '

V=20260930130000_community_privacy.sql
try 'riêng tư: SELECT mở'                $V 's/FOR SELECT TO authenticated USING (auth.uid() = user_id)/FOR SELECT TO authenticated USING (true)/' community_privacy.test.sql 'V2 '
try 'riêng tư: UPDATE mở'                $V 's/USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)/USING (true) WITH CHECK (true)/' community_privacy.test.sql 'V4 '
try 'riêng tư: bỏ CHECK hiển thị'        $V "s/ CHECK (default_visibility IN ('public', 'followers'))//"            community_privacy.test.sql 'V5 '

N=20260930140000_community_notifications.sql
try 'thông báo: client tự ghi'           $N 's/^ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;/&\nCREATE POLICY "open" ON public.community_notifications FOR INSERT TO authenticated WITH CHECK (true);/' community_notifications.test.sql 'N1 '
try 'thông báo: bỏ dọn khi bỏ thích'     $N "s/WHERE kind = 'like' AND post_id = OLD.post_id/WHERE false AND post_id = OLD.post_id/" community_notifications.test.sql 'N3 '
# Hai lớp: bỏ chốt trong trigger thì CHECK (user_id <> actor_id) chặn — và vì
# chặn bằng lỗi, chính lượt TỰ THÍCH hỏng theo. Chốt trong trigger là thứ giữ
# cho việc tự thích bài mình vẫn chạy.
try 'thông báo: tự báo cho mình'         $N 's/IF v_to IS NULL OR v_to = v_actor/IF v_to IS NULL/'                     community_notifications.test.sql 'community_notifications_check'
try 'thông báo: bỏ dọn khi xoá bình luận' $N 's/comment_id uuid REFERENCES public.community_comments(id) ON DELETE CASCADE/comment_id uuid/' community_notifications.test.sql 'N8 '
try 'thông báo: bỏ dọn khi bị ẩn'        $N 's/WHEN (NEW.hidden AND NOT OLD.hidden)/WHEN (false)/'                      community_notifications.test.sql 'N9 '
try 'thông báo: bỏ dọn khi bỏ theo dõi'  $N "s/WHERE kind = 'follow' AND user_id = OLD.followee_id/WHERE false AND user_id = OLD.followee_id/" community_notifications.test.sql 'N10a '
try 'thông báo: SELECT mở'               $N 's/USING (auth.uid() = user_id AND NOT public.community_blocked_between(user_id, actor_id))/USING (true)/' community_notifications.test.sql 'N11 '
try 'thông báo: thêm policy UPDATE'      $N 's/^ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;/&\nCREATE POLICY "open" ON public.community_notifications FOR UPDATE TO authenticated USING (true);/' community_notifications.test.sql 'N13 '
try 'thông báo: RPC đánh dấu hộp người khác' $N 's/WHERE user_id = v_uid AND read_at IS NULL;/WHERE read_at IS NULL;/'         community_notifications.test.sql 'N14 '
try 'thông báo: RLS bỏ lọc chặn'         $N 's/ AND NOT public.community_blocked_between(user_id, actor_id))/)/'       community_notifications.test.sql 'N16 '
try 'thông báo: trigger bỏ lọc chặn'     $N 's/     OR public.community_blocked_between(v_to, v_actor) THEN/     THEN/' community_notifications.test.sql 'N18 '
try 'thông báo: anon gọi RPC'            $N 's/^REVOKE EXECUTE ON FUNCTION public.community_mark_notifications_read() FROM PUBLIC, anon;/GRANT EXECUTE ON FUNCTION public.community_mark_notifications_read() TO anon;/' community_notifications.test.sql 'N20 '

S=20260930160000_community_search.sql
# Hàm TÌM được định nghĩa lại ở migration #37 (bỏ dấu), nên đột biến của nó phải
# nhắm vào tệp ấy — phá bản cũ thì bản mới ghi đè và phép phá thành vô nghĩa.
# Hàm GỢI Ý chỉ có ở tệp #19.
U=20260930170000_community_search_unaccent.sql
try 'tìm: bỏ lọc chặn'                  $U '0,/^    AND NOT public.community_blocked_between(v_uid, p.user_id)$/s//    AND true/' community_search.test.sql 'S2 '
try 'tìm: không thoát ký tự đại diện'   $U 's/^  v_pat := replace.*$/  v_pat := v_q;/' community_search.test.sql 'S4 '
try 'tìm: không loại chính mình'        $U '0,/  WHERE p.user_id <> v_uid/s//  WHERE true/' community_search.test.sql 'S2 '
try 'tìm: nới trần 20 → 21'             $U 's/  LIMIT 20;/  LIMIT 21;/' community_search.test.sql 'S8 '
try 'gợi ý: đếm cả bài chỉ-theo-dõi'    $S "s/x.author_id = p.user_id AND x.visibility = 'public' AND NOT x.hidden/x.author_id = p.user_id AND NOT x.hidden/" community_search.test.sql 'G1 '
try 'gợi ý: đếm cả bài bị ẩn'           $S "s/x.author_id = p.user_id AND x.visibility = 'public' AND NOT x.hidden/x.author_id = p.user_id AND x.visibility = 'public'/" community_search.test.sql 'G1 '
try 'gợi ý: không loại người đã theo dõi' $S 's/      AND NOT EXISTS (SELECT 1 FROM public.community_follows f WHERE f.follower_id = v_uid AND f.followee_id = p.user_id)//' community_search.test.sql 'G1 '
try 'tìm: anon gọi được'                $U 's/^REVOKE EXECUTE ON FUNCTION public.community_search_profiles(text) FROM PUBLIC, anon;/GRANT EXECUTE ON FUNCTION public.community_search_profiles(text) TO anon;/' community_search.test.sql 'S10 '

# Bảng đích := bảng nguồn: translate() thành phép dịch KHÔNG làm gì mà SQL vẫn hợp lệ.
# (Bản đầu sinh SQL hỏng, cả migration dừng và hàm cũ còn nguyên — đỏ đúng câu
# nhưng vì một lý do khác: đúng dạng rỗng nghĩa của #14.)
try 'không dấu: gập không bỏ dấu'      $U "s/^    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaeeeeeeeeeeeeeeeeeeeeeeeiiiiiiiiiiiooooooooooooooooooooooooooooooooooouuuuuuuuuuuuuuuuuuuuuuuyyyyyyyyyyyddd'));$/    'àÀáÁạẠảẢãÃâÂầẦấẤậẬẩẨẫẪăĂằẰắẮặẶẳẲẵẴAèÈéÉẹẸẻẺẽẼêÊềỀếẾệỆểỂễỄEìÌíÍịỊỉỈĩĨIòÒóÓọỌỏỎõÕôÔồỒốỐộỘổỔỗỖơƠờỜớỚợỢởỞỡỠOùÙúÚụỤủỦũŨưƯừỪứỨựỰửỬữỮUỳỲýÝỵỴỷỶỹỸYđĐD'));/" community_search.test.sql 'U1 '
try 'không dấu: không gập chuỗi tìm'   $U "s/  v_q   text := public.community_fold(btrim(coalesce(p_q, '')));/  v_q   text := lower(btrim(coalesce(p_q, '')));/" community_search.test.sql 'U3 '
try 'không dấu: hàm gập mở cho anon'   $U 's/^REVOKE EXECUTE ON FUNCTION public.community_fold(text) FROM PUBLIC, anon, authenticated;/GRANT EXECUTE ON FUNCTION public.community_fold(text) TO anon;/' community_search.test.sql 'U6 '

H=20260930180000_community_challenge_history.sql
# `m.user_id = auth.uid()` một mình KHÔNG có phép phá: RLS của bảng thành viên
# đã lọc về dòng của mình, nên bỏ nó thì vẫn xanh — đúng, vì nó là lớp thứ hai.
# Phép phá dưới gỡ CẢ HAI lớp (DEFINER bỏ qua RLS, và bỏ điều kiện) để đo rằng
# H2 canh đúng chỗ khi cả hai cùng mất.
try 'lịch sử: gồm cả chưa nhận'         $H 's/ AND m.claimed_at IS NOT NULL//'                                     community_challenge_history.test.sql 'H1 '
try 'lịch sử: DEFINER và bỏ lọc mình'   $H 's/^SECURITY INVOKER$/SECURITY DEFINER/; s/WHERE m.user_id = auth.uid() AND /WHERE /' community_challenge_history.test.sql 'H2 '
try 'lịch sử: thưởng hiện tại thay sổ'  $H 's/coalesce(t.amount, 0)::integer/c.reward_coins/'                        community_challenge_history.test.sql 'H3 '
try 'lịch sử: bỏ ghép sổ = rơi dòng 0 xu' $H 's/LEFT JOIN public.mascot_transactions/JOIN public.mascot_transactions/' community_challenge_history.test.sql 'H4 '
try 'lịch sử: cũ nhất đứng đầu'         $H 's/ORDER BY m.claimed_at DESC/ORDER BY m.claimed_at ASC/'               community_challenge_history.test.sql 'H5 '
try 'lịch sử: anon gọi được'            $H 's/^REVOKE EXECUTE ON FUNCTION public.community_challenge_history() FROM PUBLIC, anon;/GRANT EXECUTE ON FUNCTION public.community_challenge_history() TO anon;/' community_challenge_history.test.sql 'H9 '

echo
if [ "$fails" -eq 0 ]; then echo "MỌI PHÉP THỬ NGƯỢC ĐỀU ĐỎ ĐÚNG CHỖ"; else echo "$fails PHÉP THỬ NGƯỢC HỎNG"; exit 1; fi
