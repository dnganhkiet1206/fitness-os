# Kiểm trên máy thật — danh sách đi từng bước

**Viết:** 2026-09-08 · cập nhật 2026-09-09 sau bản nâng Hermes · **chưa ai chạy danh sách này.**

Trang này tồn tại vì một lý do hẹp: **215 bước kiểm tự động và một bộ chạy web
không chứng minh được app dùng được trên một chiếc iPhone.** Chúng chứng minh
logic và trạng thái. Chúng không chạy VoiceOver, không dựng `UIVisualEffectView`,
không có ngón tay, không có bộ nhớ bị siết, và không có lớp interop của kiến
trúc mới — nơi A9 đã nổ.

Ba mức bằng chứng, **không được gộp**:

| Mức | Nghĩa là gì |
|---|---|
| **TĨNH** | một bước kiểm đọc mã hoặc chạy hàm |
| **RUNTIME** | app chạy thật trong một trình duyệt |
| **MÁY THẬT** | một người cầm iPhone và làm việc đó |

Mọi ô trong danh sách dưới đây mặc định là **CHƯA KIỂM** cho tới khi có người
điền ngày và máy vào.

---

## 0. Trước khi dựng — điều kiện, và cái chặn

### CHẠY MỌI LỆNH TRONG `native/` — kho này có HAI package.json

Triệu chứng: `npm ls @sentry/react-native` ra `(empty)`,
`ls node_modules/@sentry/react-native` ra "No such file or directory", và
`expo` hỏng lúc phân giải config plugin `@sentry/react-native/expo`.

Đọc ra thì đó **không** phải một phụ thuộc bị thiếu. Gốc kho
(`fitness-os/`) còn một `package.json` thứ hai — dự án web Vite/Capacitor
cũ tên `vite_react_shadcn_ts`, React 18, không liên quan gì tới app Expo.
Nó **không** có `@sentry/react-native`, và nó cũng không có `app.json`. Chạy
`npm ls` hay `npm install` ở đó thì ra đúng ba triệu chứng trên, và cả ba
đều nói thật về thư mục đang đứng chứ không nói gì về app.

| Chạy ở | `npm ls @sentry/react-native` |
|---|---|
| `fitness-os/` | `(empty)` — dự án web cũ |
| `fitness-os/native/` | `@sentry/react-native@7.11.0` ✅ |

**Nên:** `cd native` trước, luôn luôn. Và nếu đã lỡ `npm install` ở gốc thì
nó tạo một `node_modules/` ở gốc — thư mục ấy không dùng cho app Expo.

Khả năng còn lại, nếu đã đứng đúng trong `native/`: `node_modules` cũ. Sentry
vào kho ở commit `150765b`; ai `git pull` qua commit ấy mà chưa cài lại thì
thiếu gói. Chữa bằng `npm install` (hoặc `npm ci`) trong `native/` — **không
phải** bằng cách thêm gì vào `package.json`, thứ đã khai sẵn và đúng.

Bản ghim `~7.11.0` không phải một lựa chọn tự do: nó **bằng đúng** con số
Expo SDK 57 tự ghim trong `node_modules/expo/bundledNativeModules.json`, tức
đúng bản `npx expo install @sentry/react-native` sẽ chọn.

### CHẶN: chưa liên kết dự án EAS

`app.json` không có `extra.eas.projectId`, và `eas.json` đặt
`"appVersionSource": "remote"` — thứ **đòi** một dự án đã liên kết. Nên
`eas build` chưa chạy được ở chế độ không tương tác.

**Cần:** một tài khoản Expo và `eas init` trong `native/` (nó tự ghi
`projectId` vào `app.json`). **Không bịa được** — tôi không tạo ra một UUID dự
án của người khác.

### ~~RỦI RO CAO: Hermes V1 có hồi quy bộ nhớ~~ — ĐÃ NÂNG 2026-09-09

Đã sửa bằng một bản nâng hẹp: `expo` 57.0.6 → **57.0.9**, `react-native` 0.86.0
→ **0.86.2**, và `hermes-compiler` trong lockfile **250829098.0.14 →
250829098.0.16** — đúng bản Expo nêu là bản đầu tiên có bản sửa. Phép kiểm
Hermes của `expo-doctor` biến mất khỏi danh sách đỏ (19/21 → 20/21). Không gói
nào của app đổi. Chi tiết ở `docs/AUDIT_STATE.md`.

**Nhưng đừng đọc điều đó là "bộ nhớ đã ổn".** Doctor đọc SỐ PHIÊN BẢN, nó không
đo bộ nhớ. Mục **E6** bên dưới vẫn là phép đo duy nhất kết luận được — khác biệt
là nay nó chạy **không kèm dấu hỏi**: một kết quả xấu ở E6 giờ nói về app, chứ
không còn lẫn với một hồi quy đã biết của runtime.

### Chưa xác minh được ở đây

`eas.json` khai `channel: preview` / `channel: production`, nhưng
**`expo-updates` không có trong `package.json`**. Tài liệu Expo không nói rõ
build sẽ lỗi, cảnh báo, hay bỏ qua. **Không sửa `eas.json` theo phỏng đoán** —
đọc log của lần `eas build` đầu tiên rồi mới quyết.

### Quyền — đã khai đủ, mỗi cái có câu giải thích

| Quyền | Khai ở đâu | Ghi chú |
|---|---|---|
| HealthKit | plugin `@kingstinct/react-native-healthkit` | **cần Apple Developer Program trả phí**. `EXPO_FREE_TEST=1` gỡ plugin này để dựng bằng Apple ID miễn phí |
| Camera | plugin `expo-camera` | quét mã vạch |
| Face ID | plugin `expo-local-authentication` | khoá app |
| Thông báo | plugin `expo-notifications` | **không có `google-services.json`** → Android push chưa dựng được; iOS push cần tài khoản trả phí |

`./plugins/with-free-test-entitlements.js` gỡ Sign In with Apple và Push khi
`EXPO_FREE_TEST=1`. **Nghĩa là bản dựng miễn phí KHÔNG kiểm được** HealthKit,
đăng nhập Apple, và thông báo đẩy — ba mục dưới đây phải ghi "không áp dụng cho
bản dựng này" chứ không được ghi "đạt".

### Sentry — hai biến, và cái thiếu làm hỏng đúng phần cần đọc

| Biến | Thiếu thì sao |
|---|---|
| `EXPO_PUBLIC_SENTRY_DSN` | `initObservability()` trả về ngay; **không sự cố nào được gửi**. App vẫn chạy đúng |
| `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` | build vẫn xong, nhưng **không tải dSYM lên** → sự cố native về chỉ là địa chỉ, **không có tên hàm**. Với lớp lỗi như A9 đó là mất đúng phần duy nhất cần đọc |

Cả hai đặt làm **EAS secret**, không vào git. Config plugin của Sentry **tự xoá**
`authToken` khỏi config để nó không lọt vào gói app.

---

## A. Khởi động

| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| A1 | Mở lạnh (sau khi cài) | Splash → onboarding, không màn trắng | ☐ |
| A2 | Mở ấm (từ nền) | Về đúng màn đang mở, không dựng lại | ☐ |
| A3 | Nền → tiền cảnh sau 10 phút | Dữ liệu hôm nay tự làm mới | ☐ |
| A4 | Buộc thoát → mở lại | Dữ liệu đã ghi còn nguyên (cache persist) | ☐ |
| A5 | Mở khi **tắt mạng** | Thấy dữ liệu đã cache + dải báo mất mạng; **không** màn trắng | ☐ |
| A6 | Mở lần đầu khi tắt mạng (chưa cache gì) | Thẻ "Không tải được dữ liệu" + nút Thử lại | ☐ |
| A7 | Mở khi mạng chập chờn | Không treo vô hạn ở splash | ☐ |

> A5–A7 là chỗ `Gate` từng làm app trắng màn **vĩnh viễn** khi mỗi truy vấn
> `profiles` hỏng. Bản sửa đã có và bộ chạy web xác nhận, nhưng **mạng thật
> chập chờn khác mạng giả**.

## B. Điều hướng

| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| B1 | 5 tab chính, mỗi tab một lần | Không tab nào trắng | ☐ |
| B2 | **Đổi tab rồi quay lại Hôm nay, rồi chạm vùng vòng sẵn sàng** | Không thoát app | ☐ |
| B3 | Vuốt từ mép trái để quay lại, mọi màn con | Về đúng màn trước | ☐ |
| B4 | Mở/đóng mọi sheet (ghi bữa, ghi ngủ, kế hoạch tuần, bộ sưu tập) | Vuốt xuống đóng được; nút X đóng được | ☐ |
| B5 | Bàn phím: mở ô nhập rồi chạm ra ngoài | Bàn phím đóng, **cú chạm đầu vào nút vẫn ăn** | ☐ |
| B6 | `mascot-room`: vuốt trên sân khấu | **Không** điều hướng đi (cử chỉ back bị tắt cố ý) | ☐ |
| B7 | Đi sâu 3 cấp rồi back liên tục | Về được tới tab gốc, không kẹt | ☐ |

> **B2 là mục quan trọng nhất trong cả trang này.** Đó là thao tác đã tái hiện
> được của A9. Nó được chốt là đã sửa dựa trên xác nhận của chủ dự án trên máy
> thật; đây là lần kiểm lại sau khi đã thêm error boundary và Sentry.

## C. Luồng cốt lõi

| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| C1 | Onboarding 7 bước, tài khoản mới | Mỗi bước đi tiếp được; bước 0 chặn khi chiều cao/cân nặng vô lý **và nói lý do tại ô nhập** | ☐ |
| C2 | Onboarding: bấm "để sau" ở bước Kết nối | Vào được app, không kẹt | ☐ |
| C3 | Hôm nay, tài khoản mới | Vòng sẵn sàng hiện **`—`**, KHÔNG phải `0` | ☐ |
| C4 | Chạm vòng sẵn sàng | Mở ra lời giải thích "Chưa đủ dữ liệu…" | ☐ |
| C5 | Ghi một bữa (4 đường: ảnh · mã vạch · tìm · tay) | Calo cập nhật ngay trên Hôm nay và Dinh dưỡng | ☐ |
| C6 | Ghi một buổi tập có set | Buổi hiện ở lịch sử; điểm sẵn sàng bắt đầu có | ☐ |
| C7 | Ghi giấc ngủ | Không nhận "giấc" dài 26 tiếng | ☐ |
| C8 | Nhập chỉ số sinh trắc | Số vô lý bị chặn, nút Lưu tắt | ☐ |
| C9 | Tiến trình → đặt cân nặng mục tiêu | Lưu và hiện lại sau khi mở lại app | ☐ |
| C10 | Linh vật / cửa hàng / thử thách | Mở được, xu hiện đúng | ☐ |
| C11 | Cài đặt → đổi theme Sáng/Tối/Hệ thống | Đổi ngay, **không** màn nào mất chữ | ☐ |
| C12 | Cài đặt → đổi ngôn ngữ | Không màn nào còn nửa Anh nửa Việt | ☐ |

## D. Dữ liệu

| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| D1 | Tạo → mở lại app → còn không | Còn | ☐ |
| D2 | Sửa một bản ghi | Số tổng cập nhật theo | ☐ |
| D3 | Xoá một bản ghi | Số tổng giảm theo; không còn "bóng ma" | ☐ |
| D4 | Kéo để làm mới trên mỗi tab | Có chỉ báo, có kết thúc | ☐ |
| D5 | **Ghi khi đang tắt mạng, rồi bật mạng lại** | Bản ghi được gửi đi, không mất | ☐ |
| D6 | Trạng thái rỗng của mỗi màn | Nói việc tiếp theo, không chỉ nói "trống" | ☐ |
| D7 | Trạng thái hỏng: bật máy bay giữa lúc tải | "Dữ liệu của bạn vẫn an toàn" + Thử lại | ☐ |

> **D5 là A3 trong sổ lỗi và nó ĐANG MỞ.** Nếu bản ghi biến mất ở đây thì đó
> không phải phát hiện mới — đó là mục đã biết, chưa sửa. Ghi lại số liệu chứ
> đừng mở một mục trùng.

## E. Hành vi máy

| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| E1 | Máy có tai thỏ / Dynamic Island | Không chữ nào chui dưới thanh trạng thái hay thanh home | ☐ |
| E2 | Bàn phím che ô nhập | Màn tự đẩy lên; ô đang gõ nhìn thấy được | ☐ |
| E3 | Cỡ chữ hệ thống lớn nhất | Không chữ nào bị cắt cụt ở nút và thẻ | ☐ |
| E4 | Xoay ngang | App khoá dọc (`orientation: portrait`) — không xoay | ☐ |
| E5 | Cuộn nhanh màn Hôm nay | Không ô trắng, không giật | ☐ |
| E6 | Mở app 20 phút, đi qua mọi tab | Không nóng bất thường, không chậm dần | ☐ |
| E7 | Vùng chạm nhỏ nhất (sao, X, chevron) | Bấm trúng bằng ngón cái | ☐ |

> **E6 nay đọc được.** Hồi quy Hermes đã được gỡ ở mức phiên bản (mục 0), nên
> một kết quả xấu ở đây nói về APP chứ không còn lẫn với một lỗi đã biết của
> runtime. Đây là phép đo duy nhất kết luận được về bộ nhớ.

## F. Trợ năng — **chỉ tick khi đã bật VoiceOver trên máy thật**

| # | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| F1 | VoiceOver: vuốt qua màn Hôm nay | Mọi nút được đọc tên, không nút nào bị bỏ qua | ☐ |
| F2 | VoiceOver: thẻ món ăn | Ngôi sao và nút xoá đọc được **riêng**, không bị nuốt vào thẻ | ☐ |
| F3 | VoiceOver: sheet kế hoạch tuần | Nút đóng có tên và bấm được | ☐ |
| F4 | VoiceOver: hàng hội thoại ở `ai-coach` | Đọc thành nút có tên, không phải một khối chữ | ☐ |
| F5 | Thứ tự focus | Đi từ trên xuống, không nhảy | ☐ |
| F6 | Nút chỉ có icon | Có nhãn, hoặc bị ẩn khỏi cây trợ năng một cách có chủ ý | ☐ |

> A11Y-2 đã sửa bảy chỗ nút-lồng-trong-nút và `tools/a11y-swallow.mjs` canh
> chúng ở mức **TĨNH**. Trên iOS, `Pressable` gộp con của nó thành **một** phần
> tử chọn được, nên chỉ VoiceOver thật mới nói được là đã xong. **Bộ kiểm xanh
> ≠ VoiceOver đọc được.**

---

## G. Sentry — chứng minh sự cố native (chỉ khi có DSN)

Thứ tự bắt buộc. Đừng đảo.

1. Đặt `EXPO_PUBLIC_SENTRY_DSN` + `SENTRY_AUTH_TOKEN`/`ORG`/`PROJECT` làm EAS
   secret, dựng một bản **test có kiểm soát** (đừng làm việc này trên bản người
   dùng thật đang dùng).
2. Mở app, **đi qua vài màn có gọi mạng** — cần breadcrumb thật để kiểm bước 6.
3. Gọi `Sentry.nativeCrash()` từ một chỗ tạm trong bản test. App **phải thoát
   hẳn** — đó là điểm của phép thử; một sự cố JS không chứng minh gì ở đây.
4. Mở lại app. SDK gửi báo cáo của lần chạy trước ở bước này.
5. Mở Sentry, tìm sự cố. **Có tên hàm không?** Không có → dSYM chưa lên, xem
   mục 0.
6. **Đọc breadcrumb bằng mắt.** Không được thấy: UUID · `user_id=eq.…` ·
   `eyJ…` · email · base64 dài · thân request. Được thấy: origin + đường dẫn
   (`/rest/v1/daily_logs`), method, phiên bản app.
7. Chỉ khi bước 6 sạch mới được ghi **MÁY THẬT: đạt** cho Sentry.

> Bước 6 là bước duy nhất chứng minh `beforeBreadcrumb` thật sự chạy trên đường
> native. `beforeSend` **không** chạy cho một sự cố native, nên bộ kiểm tĩnh và
> bộ chạy web không thay được bước này.

---

## Cách ghi một phát hiện

Mỗi mục hỏng ghi đủ: **ID · mức (P0/P1/P2/P3) · màn · quan sát chính xác · mong
đợi · bằng chứng (ảnh/quay màn hình) · độ chắc · tự sửa được không**.

Và một câu hỏi trước khi ghi bất cứ mục nào: **nó có biến mất trên bộ chạy web
không?** Nếu bộ chạy web cũng thấy được thì nó thuộc về bộ kiểm tự động, không
thuộc về trang này.
