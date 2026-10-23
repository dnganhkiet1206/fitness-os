# Trang hỗ trợ ASCND (tĩnh)

Site tĩnh cho những gì App Store và luồng tài khoản cần (#527, 23/10/2026), cộng landing ở trang gốc (Kiệt yêu cầu 23/10). Không blog, không đo lường, không thu email; app chưa phát hành nên landing chỉ ghi "Sắp có trên App Store".

| Trang | Đường dẫn (en · vi · es) | Vì sao |
|---|---|---|
| Chính sách quyền riêng tư | `/privacy/` · `/vi/privacy/` · `/es/privacy/` | App Store Connect bắt buộc (`TESTFLIGHT-CHECKLIST.md` bước 3–4) |
| Điều khoản sử dụng | `/terms/` … | Đi cùng chính sách; gồm miễn trừ sức khoẻ |
| Landing (trang gốc) | `/` · `/vi/` · `/es/` | Giới thiệu sản phẩm, cuộn kiểu trang Apple |
| Trợ giúp | `/help/` … | Support URL của App Store |
| Đặt lại mật khẩu | `/reset-password/` … | Link "Quên mật khẩu?" dùng được cả khi không mở trên iPhone có app |
| Xoá tài khoản | `/delete-account/` … | Apple yêu cầu lối xoá tài khoản xem được từ ngoài app |
| Giới thiệu | `/about/` … | Ngắn |

## Build

```sh
node apps/site/build.mjs                              # ra apps/site/dist (không cần npm install)
SITE_URL=http://localhost:4321 node apps/site/build.mjs && python3 -m http.server 4321 --directory apps/site/dist
```

Nguồn dữ liệu — **một nguồn duy nhất cho mỗi thứ**:
- Văn bản pháp lý: `apps/ios/ASCND/Resources/legal-content.json` (đúng bản app hiện ở Cài đặt → Chính sách & Pháp lý). Sửa luật ở RN `legal-content.ts` rồi chạy `apps/ios/tools/legal-content/gen.mjs`; web tự theo.
- Supabase host + key publishable: `apps/ios/Config/Backend.xcconfig`.
- Chữ riêng của site: `content/{en,vi,es}.json`. Tên miền, email hỗ trợ, tên đơn vị vận hành: `site.config.json`.

## Đổi tên miền

Đường dẫn trong trang đều tính từ `siteUrl`, nên đổi miền (vd. `ascnd.pages.dev` → `help.ascnd.app`, hay GitHub Pages `…github.io/fitness-os`) chỉ cần:
1. `siteUrl` trong `site.config.json`;
2. `ASCND_SITE_HOST` trong `apps/ios/Config/Backend.xcconfig` (app dùng cho link Trợ giúp / Quyền riêng tư / Điều khoản và redirect đặt lại mật khẩu);
3. danh sách Redirect URLs của Supabase Auth (mục dưới).

## Hosting miễn phí (Kiệt chọn, Kiệt tạo tài khoản)

| Lựa chọn | Địa chỉ | Cần gì | Ghi chú |
|---|---|---|---|
| **Cloudflare Pages** (đề xuất) | `ascnd.pages.dev` | Tài khoản Cloudflare, nối repo; build `node apps/site/build.mjs`, output `apps/site/dist` | Không cần sửa `.github/workflows`; gắn tên miền riêng sau rất dễ |
| Vercel | `ascnd.vercel.app` | Tài khoản Vercel, như trên | Tương tự |
| GitHub Pages | `dnganhkiet1206.github.io/fitness-os` | Repo public (đang public); một workflow deploy | Phải sửa `.github/workflows/**` → cần Kiệt duyệt; địa chỉ có đường con `/fitness-os` (build đã hỗ trợ) |

## Đặt lại mật khẩu: cần đổi cấu hình Supabase (production, cần Kiệt duyệt)

App xin link bằng PKCE: mã xác minh nằm **trong app trên iPhone**, nên web không đổi được `?code=` lấy phiên. Trang web xử lý cả hai, nhưng chỉ đặt được mật khẩu trên web khi email mang `token_hash`:

1. **Auth → URL Configuration → Redirect URLs:** thêm `https://<site>/reset-password/` (và `/vi/…`, `/es/…`, hoặc `https://<site>/**`).
2. **Auth → Email Templates → Reset Password:** đổi link thành
   ```
   {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery
   ```
   (thay cho `{{ .ConfirmationURL }}`). Trang web chỉ gọi `POST /auth/v1/verify` khi người dùng bấm Lưu, nên máy quét link trong hộp thư không làm cháy link.
3. App: `SupabaseAuthAPI.recoveryRedirect` → `https://<site>/reset-password/`; "Mở trong app ASCND" trao `ascnd:///auth?type=recovery&token_hash=…`, app đổi bằng `verifyOTP(tokenHash:type:.recovery)` (làm trong PR nối app).

Chưa đổi mẫu email thì link vẫn mang `?code=` → trang hiện "Mở link này trên iPhone" + nút mở app (đúng như hôm nay).

| Link mang | Trang làm gì |
|---|---|
| `token_hash` | Form mật khẩu mới → verify → `PUT /auth/v1/user` → đăng xuất phiên web |
| `#access_token` (implicit) | Form, dùng token thẳng |
| `code` (PKCE) | "Mở link này trên iPhone" + nút `ascnd:///auth?type=recovery&code=…` |
| `error_code=otp_expired` … | "Link đã hết hạn" + cách xin link mới |
| không có gì | Hướng dẫn "Quên mật khẩu?" trong app (cũng là bản không JS) |

Bảo mật trang: không tải gì từ bên thứ ba, CSP chỉ cho nói chuyện với Supabase, `Referrer-Policy: no-referrer`, `noindex`, token bị gỡ khỏi thanh địa chỉ ngay khi đọc (giữ trong `sessionStorage` của tab để đổi ngôn ngữ không mất link).

## Trước khi bỏ chữ "Bản nháp"

- [ ] Kiệt duyệt văn bản pháp lý (đây **không** phải tư vấn pháp lý). Luật áp dụng hiện ghi Delaware, Mỹ — kế thừa từ RN, cần Kiệt xác nhận.
- [ ] `supportEmail` và `operatorName` trong `site.config.json` (đang trống → trang hiện ô "chưa đặt").
- [ ] `draft: false`.

## Ảnh

- **Màn hình app** (`src/img/app/{vi,en,es}-{today,nutrition,progress}.jpg`): chụp thật trên simulator bằng tài khoản test, mỗi ngôn ngữ một bộ, đặt trong khung iPhone vẽ bằng CSS. Chụp lại khi giao diện app đổi: `apps/site/tools/capture-app-screens.sh`. Chữ viết tắt tên tài khoản ở màn Hôm nay được làm mờ.
- **Tranh Koa** (`scene-*.jpg`, `koa.png`, `icon.png`): lấy từ app (`Assets.xcassets`, `docs/design/today/mock/koa-idle.png`), không phải ảnh stock. Koa là tranh của Kiệt: không vẽ lại khi chưa có mock được duyệt.
- **Thang hạng** (landing): vẽ bằng HTML/CSS theo `MascotRules.ranks` (tên, màu) và `KoaGains.thresholds` (mốc Gains). Đổi hạng trong app thì sửa `ranks` trong `build.mjs`.
