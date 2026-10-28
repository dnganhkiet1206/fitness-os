# ASCND — app fitness

ASCND là app fitness của Kiệt, có Koa làm linh vật. App theo dõi buổi tập, dinh dưỡng, giấc ngủ, nước và tiến bộ, kèm một lớp AI (Insight, Koa Coach).

**Sản phẩm đang phát triển: app iOS native** ở `apps/ios` (SwiftUI). Nhánh tích hợp là `native/ios-rewrite`; điều phối và báo cáo ở issue #527.

| Thư mục | Là gì |
|---|---|
| `apps/ios/` | App iOS native (SwiftUI, xcodegen) — **nơi làm việc chính** |
| `supabase/` | Backend: migration, edge function (AI, …) |
| `native/` | App React Native cũ — tham chiếu hành vi + bộ kiểm `native/tools/check.mjs` (CI "Cổng chất lượng") |
| `spec/` | Vector test dùng chung (golden) |
| `marketing/` | Trang giới thiệu |
| `docs/` | ADR, quy trình chung |

App web Lovable cũ (React + Vite + Capacitor) đã gỡ khỏi nhánh này ngày 28/10/2026 — còn trong lịch sử git. Các hàm AI vẫn gọi gateway Lovable (`supabase/functions/_shared/ai.ts`), nên **không xoá dự án Lovable**.

## Bắt đầu ở đâu

Đọc `AGENTS.md` (mọi agent) hoặc `apps/ios/CLAUDE.md`, rồi theo thứ tự:
`apps/ios/docs/CONSTRAINTS_AND_DEFERRED.md` → `apps/ios/docs/PRODUCT_DECISION_V1.md` → `apps/ios/docs/AGENT_SESSION.md`.

## Kiểm nhanh

```bash
(cd apps/ios/Packages/ASCNDKit && swift test)
(cd native && npm ci && node tools/check.mjs)
(cd apps/ios && xcodegen generate)   # rồi build theo apps/ios/docs/AGENT_SESSION.md §6
```
