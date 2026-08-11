# Trước khi đẩy lên App Store

Danh sách này **không phải** việc đang làm. Nó là những thứ đã quyết định hoãn
lại tới sát ngày phát hành, ghi ra đây để không ai phải nhớ, và để không thứ nào
bị phát hiện vào đúng cái tuần bận nhất.

Thứ tự bên dưới là thứ tự phải làm — mỗi mục sau phụ thuộc vào mục trước.

---

## 0. Chạy thật app một lượt

```bash
node tools/live.mjs
```

Dựng bundle web, mở từng màn trong trình duyệt headless ở ba trạng thái (đủ dữ
liệu / tài khoản trống / mọi truy vấn hỏng), rồi khẳng định: không màn nào
trắng, không lỗi runtime, không chữ như `NaN` hay `undefined` lọt ra.

Mất vài phút nên nó không nằm trong `check.mjs`. Nhưng ba lỗi dưới đây đều đã
lọt qua một lần chạy XANH của toàn bộ 47 công cụ tĩnh, và cả ba đều chỉ lộ ra
khi app thật sự chạy:

- Nút "Đăng nhập" không làm gì khi bỏ trống ô — `return` sớm là code hợp lệ.
- 12 nhánh `isError` là code không bao giờ chạy, vì `queryFn` bên dưới nuốt lỗi
  và resolve thành công.
- Một truy vấn hỏng làm trắng toàn bộ app, vĩnh viễn.

Chạy nó trước khi đẩy bất cứ thứ gì.

---

## 1. Deploy — chặn tất cả những thứ còn lại

Mọi thứ đã dựng đều **vô hình** cho tới khi chạy hai lệnh này. Trên project thật,
`coach_memory` chưa tồn tại, `entitlements` chưa tồn tại, và các bản vá bảo mật
kinh tế chưa tồn tại.

```bash
supabase db push
supabase functions deploy
```

- 9 migration chưa áp dụng, cũ nhất là `20260729120000_ai_usage_quota.sql`
- 9 edge function chưa deploy

**Đọc kỹ trước khi chạy:** `claimCall` trong `supabase/functions/_shared/guard.ts`
**fail closed** — không có bảng hạn mức thì không có AI. Nếu sau khi deploy mà AI
trả 503, cách sửa là áp dụng migration hạn mức, **không phải** nới lỏng guard.
Lý do đầy đủ nằm trong chính file đó.

Kiểm tra sau khi deploy: `node tools/deployable.mjs` chỉ xác minh mỗi function có
thư mục, `index.ts` và mục trong `config.toml`. Nó **không** biết gì về project
thật — nó không thể nói cho bạn biết lệnh deploy đã chạy chưa.

---

## 2. Ranh giới free/paid — quyết định, không phải việc code

Đây là thứ phải quyết trước khi viết bất kỳ dòng nào của mục 3 và 4.

**Tình trạng hiện tại:** `useEntitlement` tồn tại và **không màn hình nào dùng
nó**. Toàn bộ luồng entitlement phía server đã xong — Apple verify, webhook,
chống hoàn tiền — nhưng chưa có gì bị khoá. Nghĩa là hôm nay, nếu thanh toán
chạy, người mua Plus sẽ mở khoá đúng con số không.

Hạn mức AI hiện phẳng cho mọi người (`20260729120000_ai_usage_quota.sql`):

| kind | lượt/ngày |
|---|---|
| `ai-coach` | 60 |
| `scan-food` | 40 |
| `ai-meal-suggest` | 30 |
| `ai-smart-nudges` | 30 |
| `ai-weekly-review` | 10 |

**Nguyên tắc đề xuất: không bao giờ khoá việc ghi dữ liệu của chính họ.** Ghi chép
là thứ tạo thói quen và tạo chi phí rời bỏ. Khoá nó là giết retention trước khi
kịp chuyển đổi.

| | Free | Plus |
|---|---|---|
| Ghi ăn/tập/nước/cân/ngủ, biểu đồ, nhắc nhở | ✓ | ✓ |
| Coach AI | ~5 lượt/ngày | rộng rãi |
| Coach nhớ bạn giữa các cuộc trò chuyện | — | ✓ |
| Quét món ăn / barcode | ~3 lượt/ngày | rộng rãi |
| Review tuần, thực đơn, nhắc thông minh | — | ✓ |

Hạ tầng đã sẵn: `claim_ai_call` đã phân hạn mức theo `p_kind`, chỉ cần thêm chiều
`tier` đọc từ bảng `entitlements`.

**Bậc Max $16,66 hiện chưa có gì để bán.** Không có thứ gì trong app đủ sức làm
bậc hai — Plus bán được bằng "AI rộng rãi + coach có trí nhớ", còn Max cần một
thứ *khác về chất* chứ không phải nhiều hơn về lượng. Nếu tới ngày phát hành vẫn
chưa nghĩ ra, **mở một bậc còn hơn mở hai bậc mà bậc trên trống rỗng** — người
dùng nhìn ra ngay, và một bậc trống làm hỏng cả niềm tin vào bậc dưới.

---

## 3. Thư viện IAP + màn hình gói

Cần quyết định thư viện, và nó kéo theo một lần build native.

- Chưa có dependency nào liên quan mua hàng trong `native/package.json`
- Chưa có màn hình paywall / màn hình gói
- Phần server đã xong: `verify-purchase`, `store-webhook`, bảng `entitlements`

Server dùng **App Store Server API + Server Notifications v2**. `verifyReceipt` và
notifications v1 đã bị Apple ngừng hỗ trợ — đừng quay lại chúng vì thấy hướng dẫn
cũ trên mạng dễ làm hơn.

---

## 4. Biến entitlement thành thứ có tác dụng

Sau khi mục 2 đã quyết:

- Nối `useEntitlement` vào các điểm gọi AI
- Thêm chiều `tier` vào `claim_ai_call`
- Màn hình nào bị khoá thì phải nói rõ *tại sao* và mở đường nâng cấp — một nút
  xám không lời giải thích là cách nhanh nhất để bị gỡ app

---

## 5. Thông tin xác thực của Apple

Sáu biến môi trường, **chưa từng được thử với Apple một lần nào**:

```
APPLE_KEY_ID  APPLE_ISSUER_ID  APPLE_BUNDLE_ID  APPLE_PRIVATE_KEY
PRODUCT_ID_PLUS  PRODUCT_ID_MAX
```

Phải thử trong Sandbox trước. Toàn bộ luồng verify được viết dựa trên tài liệu,
không dựa trên một lần chạy thật.

---

## 6. Những thứ App Store sẽ hỏi

- **Xoá tài khoản** — Guideline 5.1.1(v), là điều kiện để được duyệt. Đã dựng:
  `supabase/functions/delete-account`. Chưa deploy (xem mục 1).
- **Export dữ liệu** — đã có trong `src/app/settings.tsx`.
- **Miễn trừ y tế** — đã có trong prompt của coach và màn hình trò chuyện.
- **`.env` đang nằm trong git.** Chưa xử lý vì cần chủ dự án quyết: `git rm
  --cached` là đủ cho tương lai nhưng lịch sử vẫn còn khoá cũ; viết lại lịch sử
  thì sạch nhưng đụng vào mọi bản clone và mọi PR đang mở. **Dù chọn cách nào,
  các khoá trong đó phải được xoay vòng trước ngày phát hành** — một khoá đã lộ
  trong lịch sử git là một khoá đã lộ.

---

## Không thuộc danh sách này

Những thứ dưới đây là phát triển sản phẩm bình thường, làm bất cứ lúc nào, không
phải chờ tới sát ngày phát hành:

- Onboarding
- Widget / Live Activity / Apple Watch
- Mở rộng hàng đợi offline (hiện phủ 3 trong khoảng 30 điểm ghi)
