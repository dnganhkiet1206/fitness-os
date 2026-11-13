# ASCND — Beta gate: những quyết định chỉ Kiệt mới đưa được

Soạn: 2026-11-12 (sau audit Round 2, tip `b19e9822`).
Nguồn: `files/audit-output/round-2/07-release-gate.md` (beta gate B-1..B-6, 0/6 pass),
`01-executive-report.md` §7–§9, `02-findings-register.md` (AUD-01/02/06/14/47/48, R2-OPS-01).
Mục đích: Kiệt chỉ cần chọn A/B/C cho từng mục — không cần đọc lại 130 findings.
Không có code nào được sửa khi soạn tờ này; đây là bản chuẩn bị quyết định, không phải bản sửa lỗi.

Beta kín (test account, đã công khai rủi ro) chỉ được mở khi B-1..B-6 đều pass,
hoặc Kiệt chấp nhận bằng văn bản từng mục còn fail. Beta với dữ liệu thật của người dùng
hiện là NO-GO, chủ yếu vì B-4.

## 1. #241 — Đăng xuất xóa dữ liệu offline chưa sync (AUD-06, B-4) — QUAN TRỌNG NHẤT

Hiện trạng đã verify trong code: `Outbox.dropAllOnSignOut()` xóa cả pending + dead + in-flight;
bản xác nhận đăng xuất chỉ ghi "You'll need to sign in again", không nhắc dữ liệu chưa gửi.
Không chỉ đăng xuất chủ động: hết hạn token, đổi mật khẩu ở máy khác, xóa tài khoản ở nơi khác
cũng kích hoạt cùng đường xóa. Quyết định #241 vẫn treo trong cả 4 chỗ comment trong code.

- **A. Giữ hàng đợi qua đăng xuất, sync lại khi đăng nhập lại** (khuyến nghị) — workout offline
  sống sót qua sign-out + sign-in rồi sync. Effort S–M, B làm sau khi Kiệt chọn.
- **B. Chặn đăng xuất cho tới khi đã sync, trừ khi người dùng đồng ý rõ ràng** — UI báo còn
  dữ liệu chưa gửi và xin xác nhận trước khi xóa.
- **C. Vẫn xóa, nhưng hiện số lượng bản ghi đã xóa** — chỉ chấp nhận được cho test account,
  không dùng cho dữ liệu thật.

Kèm theo, không cần Kiệt quyết riêng: `dropAllOnSignOut` hiện xóa KHÔNG giới hạn theo user
(R2-SYNC-01) — có thể xóa nhầm row của tài khoản *kế tiếp* khi đổi tài khoản. Fix S, B làm:
giới hạn delete theo user đăng xuất, hoặc bỏ hẳn delete nếu Kiệt chọn A.

## 2. Ranh giới tin cậy của rewards (AUD-02 / AUD-03, B-3) — quyết định cho launch

Hiện trạng: RPC `claim_quest_reward` không verify server-side; key `ch:`/`w:` tự bịa được.
Tính lại ở tip: **800 coin + ~800 XP/ngày bịa được, +195 coin one-time; mua hết shop 51 món
(12.500 coin) trong ~16 ngày script**. Achievement thì tự INSERT là có. Hôm nay coin chỉ là
cosmetic, nhưng sẽ thành CRITICAL ngay khi coin khóa tính năng trả phí hay giải thưởng.

- **A. Validate server-side** (khuyến nghị cho launch) — server tự kiểm tra hoàn thành trước khi
  trả thưởng; test suite pin hành vi này. Effort M, B làm.
- **B. Chấp nhận chính thức là rủi ro còn lại** — ghi dated note trong
  `CONSTRAINTS_AND_DEFERRED.md`, chỉ dùng cho beta test account và công khai với tester.
  Không dùng cho launch có người dùng thật.

## 3. Streak freeze — mua được nhưng không xài được (AUD-14, B-2)

Hiện trạng đã thu hẹp ở Round 2: đường mua qua UI đã chết (không màn nào render),
nhưng RPC `buy_streak_freeze` vẫn gọi trực tiếp được (150 coin, tối đa 2), và không có
caller nào của `use_streak_freeze` — mua xong không tiêu được.

- **A. Port guard sang native, làm cho tiêu được** — freeze được dùng khi miss 1 ngày, có test
  simulator. Effort S–M. Chỉ chọn nếu Kiệt muốn giữ tính năng này.
- **B. Tắt hẳn đường mua cho tới khi guard được port** (khuyến nghị nếu chưa ưu tiên tính năng)
  — gate RPC + gỡ controller chết, để không còn RPC nào bán món không xài được.

## 4. Backup / PITR + câu privacy "30 ngày" (AUD-01, R2-OPS-09, B-1) — chỉ Kiệt làm được

Không ai trong team có quyền Supabase live (PAT GitHub cũng hết hạn từ 30/10), nên mục này
chỉ Kiệt verify được trên dashboard. Đây là remediation #1 trong báo cáo.

Checklist 5–10 phút cho Kiệt (không cần code):
1. Supabase dashboard → Database → Backups: PITR có bật không, retention bao nhiêu ngày?
2. Chạy restore drill lên một project throwaway, ghi lại RPO/RTO đo được.
3. Đối chiếu `legal-content.json:485` — câu "backup có thể giữ tới 30 ngày" hiện không có
   bằng chứng nào trong repo; nếu dashboard không có backup 30 ngày thì sửa câu này cho đúng
   thực tế, hoặc bật backup cho khớp câu chữ.

## 5. Scheduled CI không bao giờ chạy (R2-OPS-01, launch-blocking)

Hiện trạng: default branch `main` không có workflow nào (`git ls-tree origin/main
.github/workflows/` trống; tip main từ 25/08 là app Vite cũ). GitHub chỉ chạy `schedule`
từ default branch, nên system-check daily, E2E/a11y nightly có thể *chưa từng chạy*.
Push/PR trigger trên `native/ios-rewrite` vẫn chạy, nên đây là lỗi cadence, không phải outage toàn bộ.
Audit dặn: **không tự ý đổi default branch**.

- **A. Merge 7 workflow sang `main`** (khuyến nghị) — thay đổi cơ học, effort S.
- **B. Đổi default branch sang `native/ios-rewrite`** — blast radius lớn nhất.
- **C. Workflow tối thiểu trên `main` chỉ để dispatch các check thật** — ít xâm lấn nhất.

Sau khi chọn: cần 7 ngày liên tiếp có scheduled `system-check` + E2E/a11y nightly trong Actions history
mới tính là pass.

## 6. 20 kiểm chứng production (AUD-48, B-5) — chỉ Kiệt làm được

0/20 mục được verify ở cả 2 vòng audit (không credential, không dashboard). Danh sách + cách kiểm
từng mục ở `files/audit-output/round-2/04-production-verification.md`. Kiệt chạy khi có quyền
dashboard, hoặc ghi defer rõ ràng từng mục. Đây là việc chặn beta, không phải việc code.

## Không cần Kiệt quyết — giao thẳng cho B

- **B-6, `verify-purchase` fail-open (AUD-47, MEDIUM):** nhánh `!ent` không kiểm tra lỗi upsert
  → sửa thành 500 + test staging với DB error giả lập. Effort S. Hiện đã giảm nhẹ vì function
  chưa có caller và chưa deploy theo thiết kế.
- **Error reporting (R2-OPS-03, P1, launch-blocking):** Sentry hiện chỉ bắt crash, zero manual
  reporting — sync/AI/DB/auth/latency/HealthKit đều không phát hiện được. Effort M, B làm theo
  acceptance criteria trong register (synthetic sync failure → Sentry event < 5 phút).

## Sau khi Kiệt chọn

1. Ghi từng quyết định + ngày vào decision log của `07-release-gate.md` (audit yêu cầu:
   chấp nhận không fix phải có văn bản ghi ngày + rủi ro còn lại — "sửa sau" không có ngày
   không tính là chấp nhận).
2. B nhận việc theo thứ tự: #241 (B-4) → rewards (B-3) → streak freeze (B-2) →
   verify-purchase (B-6) → error reporting → scheduled CI (sau quyết định mục 5).
3. Kiệt verify B-1 + B-5 trên dashboard (mục 4, 6).
4. Re-gate: beta kín chỉ mở khi 6/6 pass hoặc đã chấp nhận bằng văn bản từng mục còn fail;
   launch vẫn NO cho tới khi đủ 11 mục L-1..L-11.

## Những gì KHÔNG nằm trong tờ này (đã có ở brief sáng 12/11, không nhắc lại)

- 5 đề xuất trong brief sáng (readiness HRV ban đêm, Estimated 1RM, tải cardio Watch, QA Koa
  #861–#868 + test Region→Vietnam) — vẫn chờ Kiệt chọn, không đưa lại vào đây.
- Video #2 fitness-autopsy, verdict V4 bench-press — vẫn chờ Kiệt, không nhắc lại.
