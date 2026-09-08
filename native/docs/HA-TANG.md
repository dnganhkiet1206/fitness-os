# Hạ tầng — cái được thêm, và cái phải chứng minh trước

**Đo lần gần nhất:** 2026-09-08.

Luật của trang này chỉ có một câu: **một dịch vụ mới phải chỉ ra được giới hạn
đo được của thứ đang có.** "Ai cũng dùng" không phải một lý do; nó là lý do phổ
biến nhất khiến một app nhỏ mang một hoá đơn của app lớn.

---

## Thứ tự

| # | Dịch vụ | Trạng thái |
|---|---|---|
| 1 | **Sentry** — sự cố native + lỗi JS | SDK đã cài & nối, **kiểm tĩnh + JS xong**; **native CHƯA kiểm** — chờ DSN + một bản dựng iOS thật |
| 2 | **GitHub Actions** — tsc + bộ kiểm | **ĐÃ KIỂM CHỨNG** trên runner thật (lượt #3, `af46909`, success, 9m13s) |
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

### SDK ĐÃ CÀI (2026-09-08) — và ranh giới cũ của tôi đã sai

Vòng trước tôi viết "không cài SDK từ máy này… cài mà không dựng lại thì import
ném lúc chạy". **Cả hai vế đều sai, và cả hai đã được đo:**

**Repo dùng CNG.** Không có `ios/` hay `android/` trong cây — native được sinh
lúc dựng. Nên thêm một native module là một thay đổi CẤU HÌNH, không phải một
thay đổi cần máy dựng tại chỗ.

**Import KHÔNG ném.** `wrapper.js:35` dùng `TurboModuleRegistry?.get('RNSentry')`
— bản **không ném**. `getEnforcing` có trong `NativeRNSentry.js` nhưng chú thích
nguồn của chính Sentry nói nó ở đó *"to pass codegen even if not used"* và nó
không nằm trên đường chạy. Gói còn có `rnlibraries.web.js`, tức có bản cho web.

**Và bài học A9 đã được áp dụng:** `@sentry/react-native` khai `codegenConfig`
`"type": "all"` — có hỗ trợ kiến trúc mới. `@react-native-masked-view` 0.3.2,
thứ đã điều tra trong A9, **không có một dòng nào**. Đó là phép kiểm phải chạy
trước khi thêm bất kỳ native module nào vào app này.

**Bản đã chọn: `~7.11.0`, không phải `latest` (8.25.0).** Danh sách tương thích
của chính Expo cho SDK 57 chốt `~7.11.0`; đó là bản `npx expo install` chọn và
`expo-doctor` kiểm. `sentry-expo` (Expo cũng liệt kê) **không dùng** — bản cuối
của nó là 2024-02-15.

### Đã nối, và nối ở HAI chỗ

| Móc | Chạy cho | Vì sao cần |
|---|---|---|
| `beforeSend: scrubEvent` | sự kiện phía **JS** | lọc cả sự kiện |
| `beforeBreadcrumb: scrubBreadcrumb` | **mọi** breadcrumb | ← chỗ chặn **duy nhất** cho sự cố NATIVE |

Cái thứ hai là cái quan trọng và dễ bỏ sót nhất. Một sự cố native giết tiến
trình: lớp native dựng báo cáo rồi gửi ở lần mở sau, và **`beforeSend` của JS
không bao giờ chạy cho nó**. Thứ duy nhất của JS còn đi được vào báo cáo ấy là
breadcrumb, vì SDK chuyển tiếp từng cái sang native lúc chúng xảy ra.

Thiếu nó thì Sentry vẫn "chạy", vẫn gửi được sự cố native, và mỗi báo cáo mang
theo URL PostgREST có `user_id=eq.<uuid>` cùng tên bảng sức khoẻ. **Chế độ hỏng
tệ nhất ở đây: nó trông như thành công.**

Ba tuỳ chọn được đặt **tường minh** là `false` dù mặc định đã thế —
`sendDefaultPii`, `attachScreenshot`, `attachViewHierarchy` — vì màn hình app
này **là** dữ liệu sức khoẻ, và không bộ lọc chữ nào đọc được một tấm ảnh. Một
mặc định đúng hôm nay có thể đổi ở bản sau mà không ai đọc changelog.
`tracesSampleRate: 0`: trace mang theo tham số của mọi request, tức đúng thứ bộ
lọc đang gỡ ra.

**Không đặt `EXPO_PUBLIC_SENTRY_DSN` thì `initObservability()` trả về ngay** —
app chạy y hệt trước khi có Sentry, không một byte nào rời máy.

### Ba mức "đã kiểm", KHÔNG được gộp

| Mức | Trạng thái | Bằng chứng |
|---|---|---|
| **Tĩnh** | ✅ | `tools/telemetry-scrub.mjs` luật 8: đỏ nếu `@sentry/*` có mà `scrubEvent`/`scrubBreadcrumb` chưa nối, nếu ba tuỳ chọn kia không phải `false`, hoặc nếu có DSN viết thẳng. 4 phép thử ngược, tất cả bắt được |
| **JS / runtime** | ✅ | `scrubBreadcrumb` chạy thật trên hình dạng breadcrumb của app; cổng 215/215 xanh **với SDK đã cài**, gồm cả 6 bước dựng bundle web và mở trình duyệt — tức thêm Sentry không làm hỏng app |
| **Native (iOS)** | ❌ **CHƯA** | Không dựng được iOS ở Linux. Chưa có gì chứng minh sự cố native được bắt, được gửi, hay báo cáo ấy đã sạch |

**Không được gộp ba mức này thành một chữ "đã kiểm chứng".**

**Khoá còn thiếu — chính xác ba thứ, không cái nào được đặt vào git:**

| Thứ | Dùng để làm gì | Đặt ở đâu |
|---|---|---|
| `EXPO_PUBLIC_SENTRY_DSN` | app biết gửi đi đâu | `native/.env` (đã được `.gitignore` bỏ qua) và EAS secret |
| `SENTRY_AUTH_TOKEN` | tải source map + dSYM lúc dựng | **chỉ** EAS secret / CI secret |
| org slug + project slug | đi cùng token ở trên | `app.json` plugin config — công khai được |

Thiếu cái thứ hai thì sự cố native về **không có tên hàm** — chỉ là địa chỉ. Với
đúng lớp lỗi như A9, đó là mất phần duy nhất cần đọc. Nên nó không phải tuỳ chọn.

### Còn lại — và cả ba đều cần thứ không có ở đây

1. Đặt `EXPO_PUBLIC_SENTRY_DSN` (`.env` cục bộ + EAS secret). Chưa đặt thì mọi
   thứ ở trên đã sẵn sàng và **im lặng**.
2. Đặt `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` làm EAS secret.
   Config plugin đọc chúng từ env khi `app.json` không khai — và nó **tự xoá**
   `authToken` khỏi config để khoá không lọt vào gói app.
3. **Một bản dựng iOS thật**, rồi ép một sự cố native (`Sentry.nativeCrash()`),
   rồi đọc báo cáo trên Sentry và **kiểm bằng mắt** rằng không có UUID, token
   hay tên bảng nào trong breadcrumb. Chỉ bước ấy mới đổi ô "Native" ở trên
   thành ✅.

Giữ `crash-log.ts`. Nó không thừa: nó là thứ duy nhất đọc được **khi máy đang
offline**, và nó không gửi gì đi đâu cả.

### ERRBOUND — XONG (2026-09-08)

Mục này từng ghi "chưa làm, cố ý". Đã làm: `AppErrorBoundary` bọc `<Gate />`.
Chi tiết ở `docs/AUDIT_STATE.md`.

Một chỗ nối vào đây: biên **ghi lỗi qua `recordCrash`**, và `recordCrash` nay
lọc qua `telemetry-scrub` trước khi ghi. Lý do là `settings.tsx` có nút "chạm để
gửi đi" gọi `Share.share` với toàn bộ nhật ký — tức nhật ký này **rời khỏi máy**,
và một thông điệp lỗi thật mang theo `user_id=eq.<uuid>` hay một access token.

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
| Bao nhiêu bước bị thế? | đếm `su postgres` không có `\|\|` | **11 / 14** — ⚠️ **con số này SAI**; thật ra là **8**, xem mục CI-PG |
| `pg`, `playwright` ở đâu? | `package.json` | `pg` là devDependency ✅ · **`playwright` không phải phụ thuộc gì cả** — phải cài riêng trên CI |

Hai kết luận, và cả hai đổi hình dạng workflow:

~~**Job phải chạy dưới root**~~ — đúng lúc viết, **không còn đúng**. Điều kiện
ấy đã được sửa ở đúng chỗ của nó (mục CI-PG bên dưới), nên workflow nay chạy
dưới người dùng thường và `sudo` chỉ còn ở hai bước cài gói hệ thống.

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

### Đã chạy thật — và tiền kiểm làm đúng việc

Hai lượt trên runner thật của GitHub, **cả hai đỏ**, và cả hai dừng ở
`ci-preflight` **giây thứ 30** với đúng một dòng nói cái đang thiếu:

```
✗ không nạp được playwright (đã tìm: …/native/node_modules,
  /opt/hostedtoolcache/node/22.23.2/x64/lib/node_modules)
```

Thay vì 6 bước đỏ ở phút thứ mười với sáu stack trace về trình duyệt. Đó là toàn
bộ lý do bước ấy tồn tại.

**Nguyên nhân gốc là của tôi:** `sudo npm install -g playwright` cài vào prefix
npm của root, còn `npm root -g` của người chạy job trỏ vào toolcache của chính
nó — hai chỗ khác nhau; và `sudo npx playwright install` tải trình duyệt về
`/root/.cache/ms-playwright`, thư mục 0700. Đã bỏ `sudo` khỏi đúng hai dòng ấy;
`--with-deps` không cần nó vì Playwright tự leo quyền cho phần apt
(`dependencies.js:356-358`, đọc từ gói đang cài).

**Runner thật đã xác nhận bốn điều kiện còn lại** — PostgreSQL 16, `pg`,
`typescript` + `tsconfig`, và **cây làm việc ghi được** (điều mà ở container chỉ
suy ra được). Chi tiết ở `docs/AUDIT_STATE.md`.

**Lượt #3 (`af46909`) kết thúc `success` sau 9 phút 13 giây** — cả 9 bước xanh,
bộ kiểm in `tất cả đều xanh`, và log có `trên PostgreSQL 16.13 dựng từ toàn bộ
migration`, tức các bước cơ sở dữ liệu chạy thật chứ không bỏ qua. Nên mục này
nay là **ĐÃ KIỂM CHỨNG**, không còn là "đã chuẩn bị".

**Không cần khoá nào.** `GITHUB_TOKEN` là mặc định.

### CI-PG — XONG (2026-09-08), và con số ở trên đã sai

Bảng trên ghi "11/14 không có đường lui". **Sai.** Nó đếm bằng
`grep -c "su postgres"` trừ số dòng có `||`, và ba tệp trong danh sách
(`economic-integrity`, `quest-lifecycle`, `streak-freeze`) đã có nhánh quyền
đúng từ trước. Con số thật là **8**. Một phép đếm chữ không phải một phép đo
hành vi.

**Và `|| pg_ctl` là câu trả lời sai.** `initdb` **từ chối chạy dưới root**, nên
thử-rồi-lui sẽ chạy initdb bằng root ở lần thử thứ hai và nhận
`cannot be run as root` — đổi một lỗi rõ ràng lấy một lỗi khó đọc hơn. Điều kiện
là QUYỀN, nên phép rẽ phải là quyền:

```js
const asPg = sh('id -u postgres').code === 0 && process.getuid() === 0;
const run = (c) => (asPg ? sh(`su postgres -c ${JSON.stringify(c)}`) : sh(c));
```

`chown` cũng phải nằm trong nhánh ấy — dưới người dùng thường nó không có quyền,
và thư mục đã thuộc về chính người đang chạy.

Tám tệp, **sửa và kiểm từng cái**, mỗi cái chạy hai lần và mỗi lần phải thấy
`PostgreSQL 16.13` thật chứ không phải một lần bỏ qua:

| # | Tệp | root | người dùng thường |
|---|---|---|---|
| 1 | `acwr-consistency` | exit 0 · PG thật | exit 0 · PG thật *(trước: exit 1)* |
| 2 | `error-copy` | exit 0 · PG thật | exit 0 · PG thật |
| 3 | `nutrition-averages` | exit 0 · PG thật | exit 0 · PG thật |
| 4 | `readiness-anchor` | exit 0 · PG thật | exit 0 · PG thật |
| 5 | `readiness-confidence` | exit 0 · PG thật | exit 0 · PG thật |
| 6 | `readiness-integrity` | exit 0 · PG thật | exit 0 · PG thật |
| 7 | `workload-volume` | exit 0 · PG thật | exit 0 · PG thật |
| 8 | `workout-sync-integrity` | exit 0 · PG thật | exit 0 · PG thật |

**Một lỗi CI thứ hai, tìm ra khi đang kiểm.** `nutrition-averages` gọi `npx tsc`
với `cwd` là thư mục tạm, nên npx không thấy `node_modules` của dự án và đi ra
registry tìm một gói **tên là `tsc`** — một stub đã ngừng bảo trì, không phải
TypeScript. Trên máy này nó im lặng vì npm cache của root đã có; dưới một người
dùng mới, đo được: `npm error request to https://registry.npmjs.org/tsc failed`.
Đã đổi sang gọi thẳng `node_modules/typescript/bin/tsc`, giữ nguyên `cwd`.

**Và dụng cụ đo của tôi sai một lần nữa.** Phép thử đầu chạy dưới `nobody`, vốn
có HOME `/nonexistent` — nên `npx` hỏng vì lý do đó chứ không vì quyền. Đã đổi
sang một người dùng thường có HOME ghi được, giống runner thật.

**`tools/pg-harness.mjs`** (mới, trong bộ kiểm) giữ tính chất bằng một luật
tĩnh, và nó tìm ra **hai tệp nữa** mà phép phân loại của tôi bỏ sót. Nó phân
biệt đúng chỗ cần: dạng `su … || pg_ctl` vẫn được phép cho lệnh **dừng** (an
toàn ở cả hai chiều, ba tệp dùng nó đã chạy thật dưới người dùng thường) nhưng
**không** cho `initdb`/`start`. Nó cũng phải trừ chính mình — các chuỗi luật của
nó khớp mọi mẫu nó đi tìm.

**Hệ quả: workflow bỏ `sudo` cho bước chạy bộ kiểm.** `sudo` đổi HOME và PATH,
và một bước kiểm chạy dưới môi trường khác môi trường người ta gỡ lỗi là bước
kiểm hỏng theo cách khó tìm nhất. `sudo` chỉ còn ở hai chỗ cài gói hệ thống.

**Và đây là phần CHƯA đo được.** Chạy TOÀN BỘ bộ kiểm dưới một người dùng thường
ở máy này ra **17 bước đỏ** — nhưng cả 17 đều là `EACCES` khi ghi vào cây nguồn
(`typed-routes` viết `.expo/types/router.d.ts`), vì cây ở đây thuộc `root` còn
người thử thì không. Trên một runner thật `actions/checkout` tạo cây thuộc chính
người chạy, nên điều kiện ấy đúng theo thiết kế. Phép đo dứt điểm cần đổi chủ cả
cây, và thao tác đó bị chặn ở môi trường này — nên nó **chưa được chứng minh**,
chỉ được suy ra từ việc mọi lỗi còn lại đều là quyền ghi.

Cái chưa biết ấy được biến thành một lỗi **được chẩn đoán**: `ci-preflight` nay
thử ghi một tệp vào `native/` và nói thẳng nếu không được — một dòng thay cho
mười bảy stack trace. Thử ngược: chạy dưới người dùng không sở hữu cây → đỏ với
đúng câu ấy.

**Ba lần dụng cụ đo sai trong vòng này**, và mỗi lần đều tạo ra một lỗi giả:
`nobody` có HOME `/nonexistent` (npx đi tải gói về) · PATH mặc định của nó trỏ
node 20 chứ không phải 22 (sai runtime) · git từ chối một repo thuộc người khác
("dubious ownership"). Không lần nào là lỗi của mã đang kiểm.

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
