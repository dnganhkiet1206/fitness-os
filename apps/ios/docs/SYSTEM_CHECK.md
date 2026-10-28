# Bot kiểm hệ thống

Kiệt yêu cầu 28/10: một bot kiểm **nhánh `native/ios-rewrite`, server Supabase, Sentry, PostHog** và báo khi có việc. Bot **chỉ đọc**: không deploy, không ghi database, không sửa issue Sentry, không in giá trị secret.

- Logic: `.github/scripts/system-check.mjs` (Node 22, không phụ thuộc gói nào).
- Tự động: `.github/workflows/system-check.yml`.

## Kiểm gì

| Phần | Kiểm | Mức báo |
|---|---|---|
| Nhánh | CI trên commit đầu nhánh (bỏ qua `e2e`, `periphery`, `analyze-swift`, `swiftlint`); PR mở: xung đột, CI đỏ, đứng yên quá 3 ngày | 🔴 CI đỏ · 🟡 PR có vấn đề |
| Server | hàm `ACTIVE`; hàm có trong repo mà chưa deploy (trừ `verify-purchase`, `store-webhook`, `admin-art`); **mã đang chạy so với nhánh** (tải về rồi so từng tệp); migration chưa áp; secret `ASCND_AI_*` đủ và không còn `LOVABLE_API_KEY`; mỗi hàm trả lời request không token (401/400, không phải 5xx); `supabase db advisors` (bảo mật / hiệu năng) | 🔴 hàm chết, thiếu secret, advisor ERROR · 🟡 mã lệch, migration chưa áp, cảnh báo advisor |
| Sentry `ascnd-fitness/apple-ios` | lỗi **mới** trong 24 giờ (crash `EXC_*` / `fatal` thì 🔴); lỗi chưa xử lý nhiều nhất 7 ngày | 🔴 / 🟡 |
| PostHog | người dùng và sự kiện 24 giờ, so với cùng ngày tuần trước; sự kiện nhiều nhất; `$exception` | 🟡 khi có `$exception` |

## Chạy ở đâu

- **Tự động** (workflow): sau mỗi commit lên `native/ios-rewrite`. Bot đợi CI của commit ấy xong (tối đa 45 phút) rồi mới kiểm. Có thể bấm tay: `gh workflow run "Bot kiểm hệ thống" --ref native/ios-rewrite`. Lịch hằng ngày lúc 08:00 giờ Việt Nam chỉ chạy khi tệp workflow nằm trên **nhánh mặc định** của repo.
- **Báo cáo:**
  - Summary của lượt chạy.
  - Một issue duy nhất "🤖 Bot kiểm hệ thống" (nhãn `system-check`), thân issue là báo cáo mới nhất.
  - Comment lên #527 **chỉ khi danh sách việc thay đổi**.
- **Chạy tay** (agent nào cũng được, cần `gh` và `supabase` CLI đã đăng nhập):

  ```sh
  node .github/scripts/system-check.mjs                       # in báo cáo Markdown
  SENTRY_AUTH_TOKEN=… POSTHOG_PERSONAL_API_KEY=… node .github/scripts/system-check.mjs
  ```

## Secret cho workflow

Kiệt tự thêm ở Settings › Secrets and variables › Actions. Thiếu secret nào thì phần ấy ghi "bỏ qua":

| Secret | Lấy ở đâu | Quyền |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com › Account › Access Tokens | token tài khoản (CLI dùng cho `functions list/download`, `secrets list`, `db query`, `db advisors`) |
| `SENTRY_AUTH_TOKEN` | ascnd-fitness.sentry.io › Settings › Auth Tokens (Personal / Organization token) | `project:read`, `event:read` |
| `POSTHOG_PERSONAL_API_KEY` | us.posthog.com › Settings › Personal API keys | `query:read` |

## Lần chạy đầu (28/10, trên máy, chưa có token Sentry / PostHog)

- 🟡 Mã đang chạy lệch nhánh ở `_shared/ai.ts` / `guard.ts`: #722 đã deploy nhưng chưa merge.
- ~~🟡 Migration `20261020140000` (`plan_day_overrides`) chưa áp.~~ Đã áp 28/10 (Kiệt duyệt).
- 🟡 Advisors: 73 cảnh báo bảo mật (`function_search_path_mutable`, `*_security_definer_function_executable`, `auth_leaked_password_protection`) và 114 cảnh báo hiệu năng (`auth_rls_initplan`, `duplicate_index`). Chưa xử lý; cần một đợt riêng.
- 🟢 8 hàm chạy, trả lời đúng; secret AI đủ.
