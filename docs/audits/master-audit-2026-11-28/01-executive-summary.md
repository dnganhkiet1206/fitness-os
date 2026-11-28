# Report 1 — Executive Summary

ASCND Master Technical Audit — 2026-11-28 (read-only investigation, mission assigned by Kiệt 2026-11-28 ~00:27 CST).
Evidence base: `native/ios-rewrite` @ `5e673df3` (merge PR #1013, 2026-11-24 17:28 UTC). Repo: github.com/dnganhkiet1206/fitness-os (PUBLIC).
Method: 8 workers read-only, fanned out in parallel; every claim traces to branch + SHA + file path + line, PR/issue number, migration id, workflow run, or public source URL. Nothing was modified. Full detail lives in Reports 2–12 and competitor deliverables C01–C10 in this directory; working files are in `working/`.

## 1. Sức khỏe tổng thể — app lớn, chạy nhanh, verification chạy sau code

ASCND là một app iOS native thực sự lớn và đang phát triển rất nhanh: 4.077 file trong repo, 923 file Swift / 193.518 dòng trong `apps/ios`, 101 migrations, 68 bảng, 12 Edge Functions, 3.521 key i18n. Từ tip của audit backend R2 (`b19e9822`, 12/11) tới tip này: 567 commit, 12 migrations mới, 9 vùng Swift mới (StoreKit, admin UI native, 3D viewer, Koa room/weather), 2 workflow mới, ~40 PR Koa đã merge.

Điểm mạnh thật: đợt R3 (#875) và các batch Koa (#955–#1013) đã đóng trong code những lỗi sắc nhất — mất dữ liệu khi sign-out (AUD-06), bán freeze không xài được (AUD-14), claim trùng trả đủ tiền (K-01/AUD-64), coach gợi ý món dị ứng (K-02), quick reply bịa ngày 0 kcal (K-03), hệ số giảm tạ (K-04), fail-open của verify-purchase (AUD-47). Không tìm thấy regression nào trong 130 finding backend và 60 finding Koa. Không có secret nào trong cây tại tip.

Điểm yếu thật: **code đi trước verification một khoảng lớn**. 20/60 finding Koa là "resolved (code)" nhưng chưa từng chạy kiểm chứng trên simulator/thiết bị; 0/20 production check đã đóng; scheduled CI chưa từng chạy lần nào; backup/PITR chưa từng được verify mà câu privacy trong app lại khẳng định có backup 30 ngày. App có thể build (CI push/PR xanh ở tip) nhưng chưa có bằng chứng nào cho thấy nó chạy đúng trên thiết bị thật, và chưa có bằng chứng nào cho thấy backend production đang ở trạng thái mà code mô tả.

## 2. Kiến trúc hiện tại (đã xác minh)

- **Frontend:** SwiftUI native, 4 tab (Today/Workouts/Nutrition/Progress), Community trong Progress. Điểm nối duy nhất `AppServices.swift` — nay 2.084 dòng, 68 factory `make*`, là importer duy nhất của Backend/Store. Không phát hiện circular dependency.
- **Backend:** Supabase duy nhất qua `ASCNDBackend`; outbox 1 làn at-least-once, sign-out PARK outbox (đã sửa AUD-06); SQLite GRDB 1 file; HealthKit CHỈ ĐỌC (`shareTypes` rỗng); **không StoreKit end-to-end** (xem dưới), không APNs, không Realtime; AI chỉ qua 8 Edge Function.
- **Thay đổi so với bản đồ cũ (tip `5e92ee2b`):** StoreKit client **đã tồn tại** (`StoreKitClient` StoreKit 2 + `PurchaseCoordinator` + `PaywallView`, PR #920) — bản đồ cũ sai ở điểm này; admin/moderation **đã vào app iOS** (10 file Community mới + `SupabaseModeration.swift`, shield button staff-gated) — nhưng upload art vẫn hỏng phía server (`admin-art` 404); app nay đọc `tempo.json`; Motion Kit đã có CI (8 workflow).
- **Legacy:** RN đóng băng ở `fac9ac2` nhưng logic trùng lặp vẫn tồn tại (`readiness-engine.ts`, `session-load.ts`, `koa-*.ts`). Chỉ 1 commit chạm `native/src` từ lúc khảo sát bản đồ. Phân loại LEGACY, không khuyến nghị xóa trong đợt này.

## 3. Mối quan tâm bảo mật nghiêm trọng nhất

0 CRITICAL, 5 HIGH — cả 5 đều là **lỗi trust đã CONFIRMED** (Report 5, SEC-01–SEC-05): reward keys tự bịa mint tới 800 coin + 800 XP/ngày; achievements tự cấp bằng INSERT trực tiếp; challenge claim kiểm tra trên row do client tự viết, không deadline; vật phẩm giới hạn rank mua được qua RPC trực tiếp; readiness và aggregate ngày do client tính rồi client ghi, nhưng lại được AI dùng làm ground truth. 17 mục đã FIXED từ R2. Không có service-role key, private key hay token nào trong cây tại tip (chỉ publishable key công khai theo thiết kế).

## 4. Production readiness — verdict: CHƯA SẴN SÀNG public

- **Beta gate: 3/6** code-resolved (B-2/B-4/B-6), 1 mở (B-1 backups). **Launch gate: 3/11.** Cả hai đều FAIL.
- **Đường mua hàng vẫn cụt phía server:** probe mới 2026-11-28 (anon key) cho thấy `verify-purchase`, `store-webhook`, `admin-art` vẫn 404 — giống hệt 21/11. Client StoreKit đã xong, deploy + Apple env là bước duy nhất còn chặn.
- **Backup/PITR chưa verify** (`pitr_enabled: false, backups: []` theo record 12/11, không có bằng chứng mới hơn) — và câu privacy đã ship khẳng định backup 30 ngày là **sai** (D-23). Đây là finding nhạy cảm nhất về mặt pháp lý/niêm yết.
- **CI/CD:** scheduled CI 0 lần chạy trong toàn bộ lịch sử (default branch vẫn `main`, `main` không có `.github/`); E2E 100 lần chạy gần nhất đều skipped (label gate); **không có branch protection** trên `main` lẫn `native/ios-rewrite`; không có release job, staging, hay rollback runbook.
- **Observability:** không có bằng chứng error reporting đang sống (Sentry/PostHog liveness UNVERIFIED); bot system-check chưa từng đọc production.
- **Testing:** 326 file test Swift (~2.747 case), 41 file SQL scenario, 5 file test Deno (~32 block) — nhưng 10/12 Edge Function không có test Deno nào; E2E là cửa yếu nhất.
- **Cần Mac/simulator/thiết bị/dashboard để kết luận:** toàn bộ hành vi runtime, Instruments/perf, migration đã apply thật, function versions, secrets/providers, production logs.

## 5. Nợ kỹ thuật lớn nhất

1. `AppServices.swift` 2.084 dòng — monolith factory duy nhất (đã tăng từ 1.819).
2. Trust model client-asserted cho rewards/achievements/readiness (5 HIGH).
3. 549 branch (486 đã merge, 28 xóa an toàn đã chứng minh, 14 superseded, 7 cần recovery, 4 uncertain) — vệ sinh repo, không phải rủi ro chạy.
4. Tài liệu: 77 doc, chỉ 3 ADR, 23 mâu thuẫn doc-vs-code; không có ADR-04 ghi lại directive 17/11 (bỏ RN/parity, plan-first); root AGENTS.md vẫn chỉ agent dùng RN đã bỏ làm reference.
5. `main` vẫn là default branch trong khi app sống ở `native/ios-rewrite` — gốc của scheduled-CI chết và là quyết định cần Kiệt (không tự đổi).

## 6. Rủi ro cao nhất (top 5)

1. **Privacy text sai về backup** (D-23 + AUD-01): app khẳng định backup 30 ngày trong khi PITR tắt — rủi ro App Store / niềm tin người dùng.
2. **Reward-trust defects** (SEC-01–05): kinh tế trong app (coin/XP/achievement/rank) có thể bị mint/forged từ client — càng để lâu càng khó sửa dữ liệu.
3. **Đường mua hàng cụt** (SEC-16): StoreKit client xong, server chưa deploy — không bán được, và `verify-purchase` chưa từng được test với lỗi DB.
4. **Không có safety net vận hành:** scheduled CI chết, không branch protection, không error reporting đã verify — regression có thể vào lặng lẽ.
5. **Report-excerpt oracle** (W3 §10 mục 3): migration `20261117070000` tạo oracle, `20261117170000` sửa cùng ngày — nhưng phiên bản nào đang live là UNVERIFIED; đây là check dashboard khẩn nhất.

## 7. Đối thủ — cơ hội lớn nhất (tóm tắt C01–C10)

Không đối thủ nào đóng vòng training + recovery + nutrition (Fitbod bỏ qua biometrics/nutrition, MacroFactor mảng training chưa verify, WHOOP không có food logging). Progressive overload minh bạch chưa ai chiếm (Strong/Hevy-free thủ công, Fitbod/JEFIT AI mờ/paywall, StrongLifts một chương trình). 24 cơ hội đã map (O-01–O-24) với ADOPT/ADAPT/INNOVATE/AVOID; chiến lược khác biệt là tích hợp (5 vòng lặp: readiness→plan, food→training, coach có căn cứ, Koa-as-interface, community hỗ trợ) chứ không phải số lượng tính năng. Chi tiết ở C08–C10.

## 8. Bước tiếp theo (xem Report 11, 12)

P0: (1) backup/PITR hoặc sửa câu privacy; (2) deploy 3 Edge Function + Apple env/products; (3) sửa hoặc chính thức chấp nhận rủi ro reward-trust; (4) dashboard verification sprint; (5) quyết định default branch / scheduled CI; (6) branch protection. Mọi mục trong Report 12 đều cần Kiệt duyệt rõ ràng trước khi làm.

## Appendix — Quality gates (§14 mission)

| Gate | Status | Evidence / reason |
|---|---|---|
| Correct repository confirmed | ✅ PASS | `dnganhkiet1206/fitness-os`, ID 1156734344, PUBLIC, gh auth as dnganhkiet1206 |
| native/ios-rewrite inspected directly | ✅ PASS | Tip `5e673df3`, 4.077 files, 923 Swift / 193.518 lines |
| main compared against primary branch | ✅ PASS | Report 6 §5: 11 unique commits, all Lovable web, no migrations/native/docs |
| All branch pagination completed | ✅ PASS | 549 branches, API pp. 1–6 + p.7 empty, identical to `git ls-remote --heads` |
| Branch classifications evidence-backed | ✅ PASS | Report 6 §2–§4; 4 UNCERTAIN kept, not guessed |
| Relevant PRs and issues reviewed | ✅ PASS | 581 merged, 2 open (#1009, #1014), 32 closed-unmerged, 6 targeted main |
| Architecture mapped from actual source | ✅ PASS | Report 2 (W2, import-grep verified) |
| Feature implementation status verified | ✅ PASS | Report 3, 30-row matrix with call-site tracing |
| Supabase production status verified | ⚠️ PARTIAL | Probe live 2026-11-28 (9/12 deployed, 3×404); dashboard-only items NOT_VERIFIED |
| Accessible database objects inspected | ✅ PASS | 101 migrations, 68 tables, 137 policies from repo text |
| RLS and authorization reviewed | ✅ PASS | Report 4 §4–§5 + Report 5 SEC-01–17 |
| Edge Functions inspected | ✅ PASS | 12 inventoried + fresh probe; deploy metadata dashboard-only |
| Storage policies reviewed | ⚠️ PARTIAL | Repo SQL/config only; dashboard policies NOT_VERIFIED |
| Security risks documented | ✅ PASS | Report 5: 36 findings, 0 CRITICAL / 5 HIGH |
| CI/CD workflows investigated | ✅ PASS | Report 8: 9 workflows, full run history via Actions API |
| Tests evaluated | ✅ PASS | 326 Swift files counted; no coverage % claimed |
| Production readiness assessed | ✅ PASS | Report 10 scorecard; FAIL where evidence supports it |
| Historical documentation preserved | ✅ PASS | Nothing deleted/rewritten/moved; statuses are classifications only |
| ADRs reconciled | ✅ PASS | Report 7 §2: 3 ADRs; ADR-04 missing for the 17/11 directive |
| Previous audit findings checked | ✅ PASS | Report 9: 130 backend + 60 Koa + gates, all re-verified at tip |
| Remediation roadmap completed | ✅ PASS | Report 11 (P0–P3) |
| Branch deletion candidates presented | ✅ PASS | Report 6 §6 + Report 12 (approval only — nothing deleted) |
| No unauthorized changes performed | ✅ PASS | Read-only throughout; no pushes, merges, PRs, issue edits, deploys |

**NOT_VERIFIED (giới hạn môi trường, không phải lỗi phương pháp):** mọi hành vi runtime (cần Xcode/simulator/thiết bị thật); Instruments/perf; trạng thái migration đã apply thật, function versions, secrets, providers, production logs (cần Supabase dashboard); liveness của Sentry/PostHog; 4 branch UNCERTAIN; 4 finding backend UNVERIFIED (AUD-32/44/79, R2-ECO-07, R3-TEST-01/OPS-01). W4 là static-only ở vòng này (clone bị chặn bởi runtime notice); W3/W6 dùng GitHub API per-file reads (clone thất bại do disk space). Các mục này được ghi rõ trong từng report thay vì đoán.
