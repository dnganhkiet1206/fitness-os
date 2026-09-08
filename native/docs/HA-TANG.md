# Hạ tầng — cái được thêm, và cái phải chứng minh trước

**Đo lần gần nhất:** 2026-09-08.

Luật của trang này chỉ có một câu: **một dịch vụ mới phải chỉ ra được giới hạn
đo được của thứ đang có.** "Ai cũng dùng" không phải một lý do; nó là lý do phổ
biến nhất khiến một app nhỏ mang một hoá đơn của app lớn.

---

## Thứ tự

| # | Dịch vụ | Trạng thái |
|---|---|---|
| 1 | **Sentry** — sự cố native + lỗi JS | bộ lọc riêng tư **XONG**; SDK chờ khoá + máy dựng native |
| 2 | **GitHub Actions** — tsc + 211 bước | workflow **XONG**, chưa chạy lần nào |
| 3 | Expo OTA | sau khi có hạ tầng phát hành |
| 4 | PostHog | sau |
| 5 | Resend | sau |
| 6 | Vercel + Cloudflare | chỉ khi thật sự có web/landing/admin |

**Không thêm:** Stripe · Clerk · Upstash/Redis · Pinecone · một backend/auth/CSDL
thứ hai. Không phải vì chúng tệ, mà vì chưa có phép đo nào nói stack hiện tại
không làm được việc chúng làm. Ngày có phép đo ấy, nó được ghi vào đây trước khi
gói được cài.

---

## 1. Sentry

### Nhu cầu đã chứng minh — nó nằm trong sổ lỗi của chính repo này

A9 là app **thoát hẳn** khi chạm vùng vòng tròn sẵn sàng sau khi đổi tab. Cách
duy nhất để xác nhận nó, ghi ở `SO-GHI-LOI.md` A9:

> Máy thật: **Cài đặt → Quyền riêng tư & Bảo mật → Phân tích & Cải tiến → Dữ
> liệu phân tích**, mở mục `ASCND-…` đúng ngày.

Tức là: chủ dự án phải **cầm máy, tự đi vào Cài đặt của iOS, và đọc bằng mắt.**
Đó không phải một quy trình — đó là chỗ trống mà một quy trình phải lấp.

### Giới hạn của thứ đang có, đo được

`src/lib/crash-log.ts` đã có và làm đúng việc của nó. Nhưng nó có bốn giới hạn,
và cả bốn đều là chỗ A9 rơi qua:

| Giới hạn | Vì sao nó chặn đúng lớp lỗi cần nhất |
|---|---|
| **Chỉ bắt lỗi JS** | Nó gắn vào `ErrorUtils`, thứ chỉ tồn tại trong JS runtime. A9 là `EXC_BAD_ACCESS` trong lớp interop của kiến trúc mới — tiến trình chết trước khi JS biết. `ErrorUtils` **không bao giờ** chạy. |
| **Nằm trên máy người dùng** | Không ai đọc được trừ khi chính người ấy mở màn Cài đặt và gửi đi. |
| **Giữ 5 mục** | Đủ thấy một lỗi lặp lại, không đủ dựng một dòng thời gian. |
| **Không gộp** | Không phân biệt được "một người gặp" với "ba trăm người gặp", tức không xếp được thứ tự sửa. |

Không giới hạn nào sửa được bằng cách viết thêm mã trong app: cái thiếu là một
đường ra khỏi máy và một chỗ gộp lại. Đó đúng là thứ Sentry là.

### Đã làm xong ở đây — không cần khoá

**`src/lib/telemetry-scrub.ts`** — bộ lọc riêng tư, thuần, **không import
Sentry**. Kiểu dữ liệu khớp cấu trúc với `beforeSend`, nên ngày cài SDK nó được
truyền thẳng vào.

Vì sao viết TRƯỚC: SDK của React Native tự thêm breadcrumb cho mọi lời gọi mạng,
và mạng của app này là PostgREST. Một URL bình thường của nó là

```
https://<ref>.supabase.co/rest/v1/daily_logs?select=*&user_id=eq.6f1c…&date=eq.2026-09-08
```

— người này là ai, họ đọc **bảng sức khoẻ** nào, vào ngày nào. Nặng hơn:
`scan-food` gửi `image_base64`, nên một chuỗi lọt vào breadcrumb là **bức ảnh
bữa ăn** nằm trong hệ thống của bên thứ ba. Bật theo dõi rồi mới lọc là đã gửi
đi một lần — và cái đã gửi thì không gọi về được.

Luật, và cả hai chiều đều được kiểm:

- **Bỏ**: toàn bộ query string · UUID (kể cả trong *path* của ảnh Storage) ·
  JWT · `Bearer …` · khoá `sb_*` · email · data URL ảnh · base64 ≥120 ký tự ·
  khối `user` **toàn bộ** · thân + query + header của request.
- **Giữ**: origin + path (`/rest/v1/daily_logs`) · tên bảng · kiểu ngoại lệ ·
  stack · method · phiên bản app · tên màn hình.

Chiều thứ hai không phải phần thêm: một bộ lọc ẩn quá tay biến mọi báo cáo thành
`[đã ẩn]` và ngày cần đọc thì không đọc được gì. `tools/telemetry-scrub.mjs`
chạy thật cả ba hàm; **năm phép thử ngược** đều đỏ đúng chỗ đã dự đoán, trong đó
một phép hạ ngưỡng base64 xuống 8 để chứng minh chiều "ẩn quá tay" cũng bị bắt.

Một chi tiết có lý do: **JWT phải bị bắt trước luật base64 chung**, vì JWT cũng
là ba khối base64 — để luật rộng chạy trước thì một khoá và một bức ảnh ẩn thành
cùng một khối, và hai chuyện ấy cần hai phản ứng khác nhau.

Và `beforeSend` phải được **nối vào**: luật 7 của bước kiểm đỏ nếu `@sentry/*`
xuất hiện trong `package.json` mà `scrubEvent` không được truyền làm `beforeSend`
ở đâu cả. Một bộ lọc viết xong rồi để đó lặng lẽ hơn hẳn việc không có bộ lọc —
vì có tệp thì người ta tin là đã xong.

### Dừng ở đây, và đây là ranh giới

**Không cài SDK từ máy này.** `@sentry/react-native` là một native module: cài nó
đòi một bản dựng native, và môi trường này là Linux không dựng được iOS. Cài mà
không dựng lại thì import ném lúc chạy — tức đổi một app đang chạy lấy một app
không mở được, để lấy một tính năng chưa dùng được.

**Khoá còn thiếu — chính xác ba thứ, không cái nào được đặt vào git:**

| Thứ | Dùng để làm gì | Đặt ở đâu |
|---|---|---|
| `EXPO_PUBLIC_SENTRY_DSN` | app biết gửi đi đâu | `native/.env` (đã được `.gitignore` bỏ qua) và EAS secret |
| `SENTRY_AUTH_TOKEN` | tải source map + dSYM lúc dựng | **chỉ** EAS secret / CI secret |
| org slug + project slug | đi cùng token ở trên | `app.json` plugin config — công khai được |

Thiếu cái thứ hai thì sự cố native về **không có tên hàm** — chỉ là địa chỉ. Với
đúng lớp lỗi như A9, đó là mất phần duy nhất cần đọc. Nên nó không phải tuỳ chọn.

### Ba bước còn lại, khi có khoá và có máy dựng

1. `npx expo install @sentry/react-native` · thêm plugin vào `app.json`.
2. Gọi `Sentry.init` cạnh `installCrashHandler()`, **no-op khi không có DSN** —
   không đặt DSN thì app chạy y hệt hôm nay, và đó là điều kiện để bản thêm này
   an toàn.
3. `beforeSend: scrubEvent` — bước kiểm sẽ đỏ nếu quên.

Giữ `crash-log.ts`. Nó không thừa: nó là thứ duy nhất đọc được **khi máy đang
offline**, và nó không gửi gì đi đâu cả.

### Một việc chưa làm, cố ý ghi ra

`src/` **không có `ErrorBoundary`** — chỉ có một câu nhắc về nó trong chú thích
của `crash-log.ts`. Một lỗi khi dựng cây làm app trắng màn thay vì hiện một thứ
gì đó. Đó là việc về giao diện chứ không phải về hạ tầng, cần một màn hình được
thiết kế, nên nó không bị nhét vào vòng này.

---

## 2. GitHub Actions

### Nhu cầu đã chứng minh

211 bước chỉ chạy khi có người nhớ chạy chúng, từ đúng thư mục, trên một máy đủ
công cụ. Vòng trước đã có một lần cổng **đỏ 2/211** và nó chỉ được phát hiện vì
có người chạy tay.

### Giới hạn của thứ đang có

Không có gì cả — không `.github/`, không CI. `package.json` có `lint`, và
`npx expo lint` báo `Cannot find module 'eslint'` **rồi vẫn thoát 0**.

### Đã đo trước khi viết workflow

| Câu hỏi | Đo bằng gì | Kết quả |
|---|---|---|
| Bộ kiểm cần gì? | đếm trong `tools/` | **14** bước cần PostgreSQL, **6** cần Playwright |
| Thiếu PostgreSQL thì sao? | đọc mã | **5** bước in "BỎ QUA" rồi **vẫn thoát 0** |
| Chạy dưới người dùng thường thì sao? | `su nobody -c 'node tools/acwr-consistency.mjs'` | **exit 1**: `su: Authentication failure` |
| Bao nhiêu bước bị thế? | đếm `su postgres` không có `\|\|` | **11 / 14**. Ba bước kia có `\|\| pg_ctl` nên chạy được dưới mọi người dùng |
| `pg`, `playwright` ở đâu? | `package.json` | `pg` là devDependency ✅ · **`playwright` không phải phụ thuộc gì cả** — phải cài riêng trên CI |

Hai kết luận, và cả hai đổi hình dạng workflow:

**Job phải chạy dưới root**, nếu không 11 bước hỏng vì một lý do không liên quan
gì tới mã vừa sửa — đúng điều phần đầu `check.mjs` cảnh báo: *"the check failing
for a reason that has nothing to do with what it checks."*

**Một job xanh không đủ để tin.** Nếu runner thiếu PostgreSQL, 5 bước bỏ qua
trong im lặng và dấu tích vẫn xanh — nói "211 bước đều xanh" trong khi năm bước
chưa chạy một dòng SQL. Và không ai đọc log của một job đã xanh.

### Đã làm xong

- **`.github/workflows/quality-gate.yml`** — `ubuntu-24.04` (ghim, vì
  `postgresql-16` là gói của noble), `npm ci` **có** devDependencies, cài
  PostgreSQL 16 và Chromium tường minh, rồi tiền kiểm → `tsc` → 211 bước.
- **`tools/ci-preflight.mjs`** — biến "bỏ qua trong im lặng" thành một lần hỏng
  **to và sớm**. Kiểm: PostgreSQL, `node_modules/pg`, `su postgres` **có chạy
  được không** (thử thật, không đoán theo uid), playwright, **và bản Chromium**
  (có thư viện mà thiếu trình duyệt thì 6 bước hỏng ở phút thứ mười), typescript,
  tsconfig.
- **`tools/ci-workflow.mjs`** — trong 211 bước. Nó **phân tích** YAML chứ không
  dò chữ, và nó canh chỗ dễ mục nhất: cổng vẫn chạy mà thôi chặn. Sáu phép thử
  ngược, tất cả đỏ đúng chỗ: `|| true` · `continue-on-error` · `npm ci
  --omit=dev` · tiền kiểm bị đẩy xuống sau bộ kiểm · mất `working-directory` ·
  gọi một tool không tồn tại.

`ci-preflight` **không** nằm trong 211 bước, và đó là chủ ý: trên máy của người
đang viết mã, thiếu PostgreSQL là chuyện bình thường và bỏ qua là đúng.

### Phải nói thẳng

**Workflow chưa từng chạy.** Không có runner ở nơi nó được viết. Mọi dòng trong
nó là một giả định cho tới lần chạy đầu tiên — nên nó được viết để hỏng **to và
sớm**: tiền kiểm là bước đầu, và một giả định sai lộ ra trong ba mươi giây kèm
câu nói đúng cái đang thiếu, thay vì sau mười lăm phút bằng một stack trace về
`initdb`.

**Không cần khoá nào.** `GITHUB_TOKEN` là mặc định.

### Việc còn mở

Thêm `|| pg_ctl` cho 11 bước gọi `su postgres` không có đường lui. Nó tốt hơn
`sudo`: nó giúp cả người chạy trên máy mình mà không phải root. Chưa làm vòng
này vì đó là 11 tệp đang chạy đúng, và đổi chúng cần một vòng riêng có thử
ngược cho từng tệp.

---

## 3–6. Còn lại

**Expo OTA** — chỉ có nghĩa khi đã có kênh phát hành và bản dựng ký được. Chưa
có, nên bàn bây giờ là bàn về một thứ chưa tồn tại.

**PostHog** — phân tích sản phẩm là câu hỏi "người dùng làm gì", và câu ấy chỉ
đáng tiền khi đã có đủ người dùng để câu trả lời khác nhau giữa các nhóm.

**Resend** — Supabase Auth đã gửi email xác thực. Resend đáng thêm khi có email
**giao dịch** mà Auth không gửi (biên nhận, nhắc nhở) — chưa có cái nào.

**Vercel + Cloudflare** — chưa có web/landing/admin. Thêm hạ tầng web cho một
app chỉ có native là trả tiền cho một thứ không ai truy cập.
