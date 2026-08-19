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

## 1b. Hồ sơ đã tạo trước bản sửa mục tiêu dinh dưỡng

Ba con số trong `profiles` được tính sai và đã sửa trong code, nhưng **code chỉ
sửa những gì tính từ giờ trở đi**. Hàng nào đã nằm trong bảng thì vẫn giữ số cũ:

- `tdee_target_kcal` có thể dưới sàn an toàn (1200 nữ / 1500 nam). Trong vùng
  quét 401.940 hồ sơ, **7.438 hồ sơ** rơi vào diện này — thấp nhất là
  1058 kcal/ngày cho phụ nữ 45kg, dưới cả chuyển hoá cơ bản của chính họ.
- `macro_protein_g` có thể tính trên cân nặng tổng thay vì chặn ở BMI 30.
- `macro_fiber_g` là 30 với mọi người, thay vì 14g/1000kcal.

**Cách sửa cho một tài khoản:** mở *Sửa hồ sơ* → bấm **Tính lại**. Một chạm, và
nó chạy đúng chuỗi tính mới.

Cố tình **không** viết migration SQL cho việc này. Muốn sửa hàng loạt thì phải
chép lại toàn bộ phép tính (Mifflin-St Jeor → hệ số vận động → sàn calo → chặn
BMI 30 → bù trừ macro) sang SQL, và hai bản sao của cùng một phép tính là thứ
chắc chắn sẽ lệch nhau. Nếu đến lúc phát hành mà số tài khoản đủ lớn để không
nhắc từng người được, cách đúng là chạy một script Node **gọi thẳng
`src/lib/fitness-calc.ts`** chứ không phải viết lại nó bằng SQL.

---

## 1c. Hai chỗ đã biết là chưa xong, không phải lỗi

Ghi ra để lần sau không phải điều tra lại từ đầu.

**Vòng Move không chỉnh được.** Apple hỏi mức vận động lúc cài đặt rồi tự tính
mục tiêu, và mỗi thứ Hai lại đề xuất mức mới theo tuần vừa rồi. App này để một
hằng số 300 kcal cho tất cả mọi người. 300 là con số Apple thường bắt đầu, nên
nó không sai — nhưng nó không phải là mục tiêu của riêng ai. Cách sửa đúng là
cho người dùng chỉnh, theo đúng khuôn `useStepsGoal` đã có sẵn
(`AsyncStorage` + clamp + `useSyncExternalStore`); phần còn thiếu là chỗ để bấm.
Cố tình **không** suy ra từ hệ số vận động: PAL bao gồm cả nhiệt sinh do ăn
(5–15% tuỳ tỉ lệ macro, và app này kê chế độ nhiều đạm nên nằm ở đầu trên),
trừ ngược ra sẽ sai cả trăm kcal trên một mục tiêu 300 kcal.

**Kiểm tra ngưỡng không bắt được lỗi "số hợp lý nhưng sai người".**
`src/lib/plausible.ts` chặn 600 bpm và 7500 kg. Nó không chặn được 175 kg gõ
nhầm cho người 75 kg, vì 175 kg là cân nặng có thật. Bắt được loại đó cần so
với lịch sử của chính người đó, với ngưỡng phải nới ra theo khoảng cách giữa
hai lần đo — và không có tài liệu nào nói ngưỡng đó là bao nhiêu. Đoán một con
số sẽ đổi một lỗi nhìn thấy được lấy một luật lặng lẽ từ chối dữ liệu thật.
Nút xoá từng dòng vẫn là cách sửa cho loại này.

**Bảo hiểm chuỗi** thêm một migration nữa vào hàng chờ:
`20260814120000_streak_freeze.sql` (bảng `streak_freezes`, RPC `buy_streak_freeze`
và `use_streak_freeze`, một dòng giá trong `shop_prices`). Cho đến khi
`supabase db push` chạy, bảng đó không tồn tại trên production — app đã được
viết để chịu được điều đó: đọc bảo hiểm hỏng thì coi như KHÔNG có bảo hiểm nào,
và streak vẫn chạy đúng như trước. Nút mua sẽ báo lỗi cho tới lúc deploy.

---

## 2. Ranh giới free/paid — quyết định, không phải việc code

Đây là thứ phải quyết trước khi viết bất kỳ dòng nào của mục 3 và 4.

**Tình trạng hiện tại:** `useEntitlement` có **đúng một** chỗ dùng —
`use-quest-autoclaim.ts` gọi nó để quyết định có diễn màn Koa nhô lên sau thẻ
hay không. Toàn bộ luồng entitlement phía server đã xong — Apple verify,
webhook, chống hoàn tiền — nhưng **chưa có gì bị khoá cả**, kể cả màn diễn đó:
hằng số `PEEK_TIER` đang là `null`.

Đó là chủ ý. Chưa có IAP, chưa có paywall, và `store-webhook` **có mã nguồn
nhưng chưa được deploy lên project nào** — nên chưa có gì ghi vào bảng
`entitlements`, và hôm nay một phép thử tier chỉ có nghĩa là "tắt với **mọi**
tài khoản" — không phải mô hình kinh doanh, mà là một tính năng chưa ai từng
nhìn thấy. Đổi `PEEK_TIER` về `'max'` là một từ, đúng vào ngày có thứ để bán.

Chỗ gate đầu tiên vẫn cố ý được chọn là thứ **không phải chức năng**: coin vẫn
tự động vào ví ở mọi bậc, vì khoá phần thưởng mà người ta kiếm được bằng cách
ghi chép món ăn của chính họ là một loại app khác. Thứ sẽ bị khoá là buổi diễn.

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

**Và một biến thứ bảy: `APPLE_ENV`.** Mặc định là `production`. Server chỉ chấp
nhận quyền lợi đến từ môi trường được liệt kê ở đây — `production`, `sandbox`,
hoặc cả hai ngăn bằng dấu phẩy.

Trước khi có nó, `fetchTransaction` hỏi production rồi hỏi tiếp sandbox vô điều
kiện. Mua trong sandbox không mất một đồng nào và người mua tự đặt
`appAccountToken`, nên bất kỳ ai có một bản TestFlight đều tự cấp được `max`
cho tài khoản bất kỳ — đo được ở cả `store-webhook` lẫn `verify-purchase`.

Nên trong lúc thử Sandbox thì đặt `APPLE_ENV=sandbox`. **Còn khi nộp duyệt thì
đây là một quyết định phải cân**: người của App Review mua thật trong sandbox
nhưng gọi vào chính backend production này. Xem *Chain Q — PRODUCT SEMANTICS
REQUIRED, PS-1* trong `docs/FORENSIC-AUDIT.md` — mọi hàng được cấp từ sandbox đều mang
`store = 'apple-sandbox'`, nên dù chọn cách nào cũng vẫn tìm và thu hồi lại được.

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
- Mở rộng hàng đợi offline. Hiện phủ **7** loại thao tác ghi — nước, buổi tập,
  cân nặng, bữa ăn, sinh trắc, giấc ngủ, số đo — trong khoảng 30 điểm ghi của
  app. (Dòng này từng ghi "3", đúng vào lúc nó được viết; các vòng sau mở rộng
  hàng đợi mà không cập nhật lại đây.)
