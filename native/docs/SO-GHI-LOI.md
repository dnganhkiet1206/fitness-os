# Sổ ghi lỗi — và luật không được sửa

**Luật:** cái gì **chứng minh được** thì sửa. Cái gì chưa chứng minh được thì
**ghi vào đây và không ai được đụng vào** — cho tới khi có đủ hai thứ:

1. bằng chứng rằng nó thật sự là lỗi, và
2. một cách sửa đã được chứng minh là đúng và **không phá phần còn lại**.

Thiếu một trong hai thì để nguyên. Một bản sửa cho thứ không hỏng là một thay
đổi có rủi ro và không có lợi ích — trên một dự án hơn 42 nghìn dòng, đó là cách
mất nhiều nhất trong một lần.

Mỗi mục dưới đây ghi **file và dòng**, để người sau kiểm lại trong một phút chứ
không phải suy lại trong một giờ. Ngày rà: 2026-08-03.

---

## A. Đã chứng minh là lỗi — nhưng **chưa** chứng minh được cách sửa an toàn

Được phép sửa **sau khi** phần "còn thiếu" ở mỗi mục được giải quyết. Chưa đủ
thì vẫn nằm ở đây.

### ~~A1. Bản ghi giấc ngủ sai là vĩnh viễn~~ — ĐÃ SỬA 2026-08-10

| | |
|---|---|
| **Bằng chứng** | `src/app/log-sleep.tsx:66` dùng `.insert()`, không upsert theo gì cả. Không có màn hình nào liệt kê giấc ngủ để xoá — `grep "from('sleep_logs')" src/hooks` chỉ ra `useTodayData.ts:75,173`, cả hai đều là đọc. |
| **Hậu quả** | `daily-log-service.ts:62-69` đọc `order(waketime desc).limit(1)`, nên một bản ghi log sau **che** bản ghi đúng log trước. Và `sleepDebt7d` (`daily-log-service.ts:148-155`) trung bình 7 ngày, nên một đêm sai kéo điểm sẵn sàng lệch suốt một tuần. |
| **Còn thiếu để sửa** | Xoá cần một danh sách để bấm vào, mà màn hình ngủ chưa có. Nghĩa là: thêm danh sách + nút xoá + recompute **ngày đó và hôm nay** (lý do ở `use-fitness-data.ts`, hàm `useDeleteWorkoutSession`). Đó là ba thay đổi, không phải một. |
| **Rủi ro nếu làm ẩu** | Giấc ngủ vào readiness qua **hai** đường — đêm qua và nợ ngủ 7 ngày — nên recompute thiếu một ngày là để lại một điểm số sai mà không có gì trông như hỏng. |
| **Đã sửa thế nào** | `useDeleteSleepLog` + danh sách đêm trên `/sleep-insights`, dựng lại ngày của đêm đó **và hôm nay** (cùng luật `useDeleteWorkoutSession`). `tools/correctable.mjs` giữ luật, và nó đếm **theo từng hook** — bản đầu đếm theo tệp nên hook bên cạnh cứu được hook thiếu. |

### ~~A2. Mẫu sinh trắc sai là vĩnh viễn, và độc hại lâu hơn~~ — ĐÃ SỬA 2026-08-10

| | |
|---|---|
| **Bằng chứng** | `src/hooks/use-biometrics.ts:52` dùng `.insert()`. Màn hình `/biometrics` chỉ vẽ biểu đồ từ `history` (`src/app/biometrics.tsx:50`) — không có hàng nào để xoá. |
| **Hậu quả** | `hrv_history_28d` (`daily-log-service.ts:143`) là **đường cơ sở z-score 28 ngày** của điểm sẵn sàng. Gõ nhầm HRV 450 thay vì 45 làm lệch đường cơ sở đó trong 28 ngày — lâu hơn và khó nhận ra hơn cả A1. |
| **Còn thiếu để sửa** | Giống A1: cần danh sách trước, rồi mới có chỗ đặt nút xoá. |
| **Ghi chú** | Đây là mục có giá trị cao nhất trong nhóm A. Nhưng "giá trị cao" không phải là giấy phép làm vội. |
| **Đã sửa thế nào** | `useDeleteBiometricSample` + danh sách lần đo trên `/biometrics`, dựng lại ngày của mẫu đó và hôm nay. Cùng lúc `body_measurements` cũng có `useDeleteBodyMeasurement` (không nuôi `daily_logs` nên không cần dựng lại). |

### A3. Ghi khi mất mạng không sống sót — CƠ CHẾ ĐÃ CÓ 2026-08-10, ĐANG MỞ RỘNG

| | |
|---|---|
| **Bằng chứng** | Đo thật, chép nguyên trong `src/lib/offline.ts`: server giữ đúng một bản 250 ml, ngắt mạng, bấm +8 → 16.5 oz, **không có gì được ghi**, và nối lại sau 30 giây vẫn không gửi. |
| **Đã làm** | Chặn phần *nói dối*: `offlineNow()` bỏ qua bản vá lạc quan khi offline. App không còn hiển thị con số sai. |
| **Chưa làm** | Ghi offline vẫn mất. Cách sửa thật: persist mutation cache + đặt `mutationKey` + `setMutationDefaults` cho **~30 mutation**. |
| **Rủi ro** | Một call site đặt sai key thì mutation đó **âm thầm** ngừng resume — không lỗi, không cảnh báo, chỉ là dữ liệu biến mất. Ba mươi chỗ để sai. Cần một cách kiểm tự động chứng minh cả 30 chỗ đều đúng **trước khi** bắt đầu, không phải sau. |
| **Đã làm 2026-08-10** | Điều kiện trên được tôn trọng: `tools/offline-durable.mjs` viết **trước**. Và thiết kế tránh hẳn "30 mutationFn" — tài liệu TanStack gọi cách đó là gần như bất khả thi với 20+ mutation. Thay vào đó **một khoá, một hàm mặc định**, thứ thay đổi là *dữ liệu*: `OfflineWrite` là object thuần, không bắt closure, không giữ `user` từ hook. Thao tác được **đặt tên** chứ không phải ghi bảng thô, vì có việc không chỉ là một câu lệnh — ghi buổi tập còn phải dựng lại readiness, và hàng đợi insert thô sẽ replay insert rồi lặng lẽ bỏ bước dựng lại. |
| **Đã chuyển 3/30** | `water_logs`, `workout_sessions`, `weight_logs` — những chỗ thật sự xảy ra ở nơi mất sóng. **Chưa chuyển** phần còn lại; luật trong công cụ áp cho mọi chỗ *đã* dùng khoá, chưa ép mọi chỗ *phải* dùng. Đây là mở rộng dần, không phải đã xong. |

### ~~A4. `.env` nằm trong git~~ — ĐÃ ĐÓNG 2026-09-08

| | |
|---|---|
| **Bằng chứng lúc mở** | Chạy **từ gốc repo**, không phải từ `native/`: `git ls-files .env` trả về `.env`, `git check-ignore -v .env` không khớp luật nào. (Chạy nhầm từ `native/` thì cả hai đều im lặng, và im lặng ở đây trông y hệt "đã sạch".) |
| **Đã sửa phần theo dõi** | Commit `ce8c73f` gỡ tệp khỏi git. Đo lại 2026-09-08: `git ls-files .env` **rỗng**, và `git check-ignore -v .env` nay khớp `.gitignore:38`. Tệp cũng không còn trên đĩa. |
| **Phần lịch sử — đã đo, KHÔNG cần viết lại** | Mục này từng để mở với câu "chỉ `git rm --cached` (lịch sử vẫn còn) hay viết lại lịch sử". Nay đã đọc mọi bản `.env` từng được commit, **chỉ lấy tên biến**: `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`. Cả ba là giá trị công khai theo thiết kế (khoá publishable ship trong client), và cả ba mang tiền tố `VITE_` của project Lovable cũ — thứ mà bằng chứng runtime 2026-09-08 cho thấy **không còn phân giải được**. |
| **Vì sao đóng chứ không "để đó"** | Viết lại lịch sử đụng vào mọi clone và mọi PR đang mở. Cái giá ấy chỉ đáng cho một secret THẬT bị lộ, và ở đây không có secret nào — nên để mục này mở là để một việc nguy hiểm nằm trong danh sách việc-nên-làm mà không ai dám đụng. |
| **Luật còn lại** | `.gitignore` gốc dòng 37–40 giữ `.env`, `.env.*`, chừa `!.env.example`. Khoá thật đi vào EAS secret / Supabase secret, không vào tệp nào trong repo. |
| **Trạng thái** | **ĐÓNG.** Mở lại chỉ khi có bằng chứng một secret THẬT từng nằm trong lịch sử. |

### ~~A5. Bucket `progress-photos` không giới hạn dung lượng hay kiểu file~~ — ĐÃ SỬA 2026-08-10

| | |
|---|---|
| **Bằng chứng** | Bucket được tạo bằng `INSERT INTO storage.buckets (id, name, public)` và không gì khác (`20260212045102_….sql:60`); không có `file_size_limit` hay `allowed_mime_types` ở bất kỳ migration nào. |
| **Hậu quả** | Lưu trữ và băng thông đều tính tiền, và policy theo user không quan tâm file lớn cỡ nào. |
| **Còn thiếu để sửa** | Một migration đặt giới hạn là dễ. Chọn **con số** thì không: quá thấp là chặn ảnh iPhone thật. Cần biết kích thước ảnh thực tế app tạo ra (`use-progress-photos.ts` upload JPEG chưa nén lại) trước khi chốt. |
| **Đã sửa thế nào** | Đúng thứ tự đó: **chặn đầu vào trước, chốt số sau**. `src/lib/photo-size.ts` giới hạn cạnh dài 1920 qua `pictureSize` của `CameraView` + `quality 0.6` — dùng thứ `expo-camera` đã có, không thêm `expo-image-manipulator` (native module, phải rebuild). Rồi bucket đặt **5 MiB + chỉ `image/jpeg`**, tức khoảng gấp đôi trường hợp xấu nhất app tạo được. |
| **Cái bẫy suýt dính** | `getAvailablePictureSizesAsync` trả **khác nhau theo nền tảng**: Android cho `"1920x1080"`, iOS cho tên preset AVFoundation (`photo`, `high`…). Hàm chỉ parse `WxH` trông hoàn toàn đúng, qua mọi test viết theo Android, và **âm thầm để iOS ở mặc định** — đúng nền tảng app này nhắm tới, và là nền tảng có mặc định lớn nhất. `tools/photo-budget.mjs` chạy hàm thật trên 9 ca của cả hai nền tảng. |
| **Chưa đo trên máy thật** | Trần đầu vào là thật và phép tính là số học thường, nhưng chưa có iPhone nào chụp qua đoạn code này. Nếu ảnh thật tiến gần 5 MiB thì thứ cần xem lại là `MAX_EDGE`, không phải con số bucket. |

### ~~A6. `delete-account` chưa tồn tại~~ — ĐÃ VIẾT 2026-08-10

| | |
|---|---|
| **Bằng chứng** | Không có thư mục trong `supabase/functions/`, không có mục trong `supabase/config.toml`. |
| **Hiện tại không hỏng gì** | Nút trong Cài đặt đã gọi nó và đã nói đúng "máy chủ chưa bật chức năng này" khi nhận 404. |
| **Trạng thái** | Đã viết theo đúng đặc tả `docs/connecting-a-backend.md` §3. Danh tính lấy từ token qua `requireUser`; Storage xoá **theo từng trang** trước khi xoá auth user (`list` mặc định 100 file — người dùng lâu năm sẽ sót phần sau); không xoá tay bảng nào; mọi nhánh lỗi trả 5xx. `tools/deployable.mjs` giữ luật, gồm cả việc mọi function đều phải có mục trong `config.toml`. **Vẫn cần deploy** — viết xong không phải là đã bật. |

### A7. Xoá buổi tập không dựng lại các ngày ở giữa

| | |
|---|---|
| **Bằng chứng** | `useDeleteWorkoutSession` dựng lại ngày của buổi tập và hôm nay, không dựng các ngày ở giữa. Đã ghi rõ ngay trong code. |
| **Vì sao cố ý** | Tối đa 14 lần dựng × 11 truy vấn mỗi lần, để sửa một điểm readiness quá khứ vốn đã là sản phẩm của *thời điểm nó được tính* chứ không phải một sự thật về ngày đó. |
| **Trạng thái** | Quyết định có chủ ý, không phải sót. Muốn đổi thì phải trả lời trước: readiness của một ngày đã qua **nên** nghĩa là gì. |

### A8. Android không có blur thật sau status bar

| | |
|---|---|
| **Bằng chứng** | `StatusScrim` chỉ dựng `BlurView` khi `Platform.OS === 'ios'`. Tài liệu Expo SDK 57 (`sdk/blur-view`): trên Android phải bọc **nội dung cần làm mờ** trong `BlurTargetView` rồi truyền ref của nó vào `BlurView`, kèm `blurMethod`. Để mặc định thì nó "results in a view with a semi-transparent background" — đúng cái tấm xám mà thiết kế cấm. |
| **Vì sao chưa sửa** | Sửa đúng không nằm trong file backdrop mà nằm ở **mọi trang**: mỗi ScrollView phải được bọc `BlurTargetView` và trả ref ngược lên. Đó là sửa 25 trang cho một nền tảng chưa được kiểm thử lần nào trong dự án này. |
| **Hậu quả thật** | Trên Android status bar chỉ được *phủ tối 12%*, không được *tách*. Nội dung cuộn qua bị làm mờ màu chứ không bị làm nhoè. Chữ trắng cỡ lớn vẫn có thể lẫn với icon. |
| **Trạng thái** | Giới hạn có chủ ý, đã ghi trong `status-scrim.tsx`. Cấm "sửa" bằng cách bật `blurMethod` mà không có `BlurTargetView` — làm vậy chỉ đổi tấm phủ đen thành tấm xám. |

---

### ~~A9. App thoát khi chạm vùng vòng tròn sẵn sàng sau khi đổi tab~~ — ĐÃ SỬA 2026-09-08

| | |
|---|---|
| **Triệu chứng** | Người dùng báo, lặp lại được: sang tab khác → quay lại Hôm nay → chạm vùng vòng tròn sẵn sàng → **app thoát ngay lập tức**. Không hộp thoại, không lỗi. Chạm liên tục **không rời màn** thì không bao giờ hỏng — 50 cú chạm ở hai tốc độ, 0 lỗi. Chuyến đi vòng qua tab khác là điều kiện bắt buộc. |
| **Bằng chứng** | `@react-native-masked-view/masked-view@0.3.2` (bản `latest` trên npm) chứa đúng bốn tệp iOS. Toàn gói **không có một chuỗi nào** trong `ComponentView`, `Fabric`, `codegen`, `react/renderer`, `RCT_NEW_ARCH` — kiểm bằng `grep -ril` trên cả gói. `RNCMaskedViewManager.m` là `RCT_EXPORT_MODULE()` + `- (UIView *)view` trần; `RNCMaskedView.m` làm việc của nó trong `didUpdateReactSubviews` bằng `self.maskView = [self.reactSubviews firstObject]`. Cả hai đều là API của kiến trúc **cũ**. `podspec` còn ghi `:ios => "9.0"`. |
| **Vì sao điều đó là lỗi ở đây** | App chạy RN 0.86 / Expo SDK 57, `newArchEnabled` không bị tắt trong `app.json` → kiến trúc mới. Kiến trúc cũ đã bị gỡ khỏi RN từ 0.82, nên gói này chỉ có thể chạy qua **lớp interop** (`RCTLegacyViewManagerInteropComponentView`). Fabric **tái sử dụng** (recycle) component view; `react-native-screens` tháo cây của một tab khi tab đó bị bỏ chọn và dựng lại từ pool khi quay về — tức chuyến đi vòng qua tab **chính là** một sự kiện recycle. `RNCMaskedView` không có `prepareForRecycle`, không có `mountChildComponentView`/`unmountChildComponentView`. |
| **Thượng nguồn nói gì** | reactwg/react-native-new-architecture, thảo luận #80: *"We cannot find the right fabric method to get the reactSubviews and assign the first view to the `self.maskView`."* Đúng một dòng ấy là dòng làm việc trong tệp đang chạy. Một cách sửa được đề xuất năm 2022 (dùng `mountChildComponentView`) — và **chưa từng được phát hành**: 0.3.2 vẫn không có nó. |
| **Bán kính** | Không chỉ Hôm nay. `StatusScrim` dựng một `MaskedView` trên **mọi màn có inset trên, ở iOS** (`screen.tsx:424,509` và `index.tsx:2479`). Khác biệt là hộp của nó không bao giờ đổi kích thước, nên không có gì chọc vào mặt nạ sau khi nó bị recycle. Cái ở `index.tsx:1832` thì nằm trong `<Expander open={!heroOpen}>` — hộp co giãn theo **đúng cú chạm được báo**. |
| **Đã bác bỏ (đừng đi lại)** | (1) NaN trong hình học SVG — 0/50 cú chạm. (2) Vòng lặp bố cục `Expander` ↔ `CardDeck.onHeight` — chỉ 3 phần tử được ghi style, không phải hàng trăm. (3) Cây kính bị tháo/dựng lại khi chạm — **0 lần** trên 20 cú chạm. (4) `[unowned self]` trong `expo-blur/BlurEffectView.draw` — có thật và đúng triệu chứng, nhưng cần một lần dealloc mà đường này không tạo ra. (5) Lỗi JS — nhật ký sự cố trong app rỗng, và nó bắt được mọi lỗi JS. |
| **Còn thiếu để sửa** | Một trong hai, và cả hai đều cần máy thật để xác nhận: **(a)** nâng phụ thuộc — 21 gói đang trễ, trong đó `react-native-screens` 4.25.2 → 4.26.0 và `react-native` 0.86.0 → 0.86.3, đúng chỗ các bản vá lỗi recycle đổ về; **(b)** bỏ `MaskedView` khỏi màn Hôm nay. (b) chắc chắn hơn nhưng đụng vào một lớp đã đo kỹ, và `status-scrim.tsx` đã ghi vì sao không thể thay mặt nạ bằng nhiều tấm kính chồng lên nhau ("cost four live effect views, compounded the material's tint from 22% to 37%, and banded"). |
| **Cách xác nhận trong 30 giây** | Máy thật: **Cài đặt → Quyền riêng tư & Bảo mật → Phân tích & Cải tiến → Dữ liệu phân tích**, mở mục `ASCND-…` đúng ngày. Nếu dòng đầu là `RCTComponentViewRegistry: Attempt to recycle a mounted view` hoặc `EXC_BAD_ACCESS` trong `RNCMaskedView` / `RCTLegacyViewManagerInteropComponentView` thì mục này đúng. Nếu không, mục này sai và phải chuyển xuống C. |
| **NGUYÊN NHÂN GỐC (chốt bởi chủ dự án, 2026-09-08)** | Đường dựng KHÁC NHAU giữa hai theme. Bản tối dựng lớp kính/lớp phủ; bản sáng bỏ lớp ấy đi. Hai theme đi hai đường dựng khác nhau, và chính chỗ lệch đó làm app thoát trên iOS. |
| **Trạng thái theme bị ảnh hưởng** | Cả hai — nhưng chỉ ở CHỖ LỆCH giữa chúng, không phải ở một theme riêng. Vì thế nó chỉ xuất hiện sau khi bản sáng ra đời, và chỉ khi người dùng đi qua một sự kiện dựng lại (đổi tab rồi quay lại, hoặc đổi theme). |
| **~~Đã sửa thế nào~~** | ~~Cho hai theme dùng CHUNG một đường dựng thay vì cho bản sáng bỏ bớt lớp.~~ — **CÂU NÀY SAI. Xem ĐÍNH CHÍNH ngay dưới bảng (2026-09-09).** |
| **Kiểm chứng** | Chủ dự án xác nhận trên máy thật, 2026-09-08: thao tác đã lặp lại được (đổi tab → về Hôm nay → chạm vùng vòng tròn) không còn làm app thoát. Phần này VẪN ĐÚNG — thứ sai là câu giải thích vì sao. |
| **`MaskedView` thì sao** | KHÔNG phải nguyên nhân gốc, và **không được gỡ hay thay chỉ vì sự cố này**. Phần điều tra ở trên vẫn đúng như một phép đo — gói 0.3.2 thật sự không có mã kiến trúc mới — nhưng nó mô tả một *điều kiện*, không phải nguyên nhân. Chỉ mở lại nếu có bằng chứng ĐỘC LẬP mới. |
| **Trạng thái** | **ĐÓNG.** Không được xếp A9 là P0 đang mở sau mốc này. |

#### ĐÍNH CHÍNH 2026-09-09 — bản sửa ghi ở trên chưa từng có trong repo

Người dùng báo màn Hôm nay **vẫn thoát**. Truy lại thì dòng "đã sửa thế nào" ở
trên không có một commit nào đứng sau.

| | |
|---|---|
| **Commit đóng A9** | `12362b9`. Diffstat của nó: `docs/AUDIT_STATE.md`, `docs/SO-GHI-LOI.md`, `tools/check.mjs`, `tools/theme-shape.mjs`. **Không một tệp `.tsx` nào.** |
| **Truy rộng hơn, không dựa vào một commit** | `git log -S"m.lit" --all -- 'native/src/**'`: mọi commit từng đổi một dòng có `m.lit` đều là commit **dựng bản sáng**, cái cuối cùng là `b9037ab` (**06/09**). Tám commit ngày 08/09 đều có **0** dòng ± chứa `m.lit`. Và không commit nào từ `45e89f8` tới nay chạm cây dựng của Hôm nay ngoài `99c65fa`, vốn chỉ đổi MÀU của cung. |
| **Vậy ngày 08/09 đã sửa cái gì trên màn Hôm nay** | `f7a3341` + `ddfbcd7` — nút-trong-nút. Chúng CÓ chạm `today-meals.tsx` và `dashboard-cards.tsx`, cả hai đều nằm trên màn Hôm nay, và đó là thay đổi mã **duy nhất** ở màn ấy trước lần kiểm máy thật. |
| **Đọc lại A9 thế nào cho đúng** | Bằng chứng máy thật là thật và ở nguyên. Thứ không có bằng chứng là phép GÁN nguyên nhân: cơ chế được nêu tên — "hai đường dựng" — chưa từng được đụng vào, nên nó không thể là thứ đã sửa. Ở đây KHÔNG kết luận cái nào trong hai cái làm triệu chứng biến mất; chưa đủ dữ liệu để nói. |
| **Và bảng số ở `AUDIT_STATE.md` không phải một phép đo** | Đếm node cả trang KHÔNG lặp lại được. Cùng một bản dựng, không đổi một dòng nào, ba lần chạy: bản sáng `931 / 931 / 942`, bản tối `1084 / 1084 / 1073`. Con số `1.073 → 1.031` là **một mẫu** của một thước đo nhiễu ±11, không phải một số đo. Một phép so sánh trước/sau bằng thước ấy đã suýt làm tôi báo ngược kết quả. |
| **Đã làm gì ở lượt này** | Bỏ chỗ lệch ở `ReadinessGauge` — hai nhánh nằm **đúng dưới** thao tác lặp lại được của A9. Cả hai node nay được dựng ở cả hai theme; bản sáng tô rỗng (`opacity` 0, nền trong suốt, bóng tắt cả iOS lẫn Android). |
| **Đo bằng thước nhắm đúng hai node đó** | Trước: tối `<circle stroke-width=10>` 1 / sáng 0, hào quang 168×168 tối 1 / sáng 0. Sau: **tối 1 / sáng 1 ở cả hai**. Bản tối không đổi một giá trị nào — `opacity` vẫn `0.25`, nền vẫn `rgba(255,217,61,0.05)`, bóng vẫn `rgb(255,217,61)`. Bản sáng: `opacity` `0`, nền `rgba(0,0,0,0)`, bóng `rgba(0,0,0,0) 0px 0px 0px 0px`. |
| **Còn lại, chưa làm** | `ambient-light.tsx:140`, `glass-card.tsx:154`, `liquid-glass.tsx:174` vẫn gỡ cây con ở bản sáng trên màn Hôm nay; `assistant-aura.tsx` ở màn Trợ lý. Bốn chỗ ấy vẫn nằm trong danh sách của `tools/theme-shape.mjs`, mỗi chỗ một lý do hiệu năng có thật (chúng là những lớp `<Svg>` phủ kín màn hình, khác hẳn hai node vừa sửa). |
| **Trạng thái sau đính chính** | A9 giữ nguyên **ĐÓNG** theo quyết định của chủ dự án — không tự ý mở lại. Nhưng ĐIỀU KIỆN của nó **chưa hết**, và hồ sơ trước đây nói ngược lại. |

---

### ~~A10. Đường AI nuốt lỗi ở bốn chỗ, và cả bốn đều tiêu tiền~~ — ĐÃ SỬA 2026-09-08

| | |
|---|---|
| **Triệu chứng** | Không có triệu chứng. Đó chính là mục này: bốn chế độ hỏng khác nhau trên đường gọi AI, không cái nào để lại một dòng log phân biệt được, và cả bốn đều xảy ra SAU khi nhà cung cấp đã tính tiền. |
| **A. Thân 200 không phải JSON** | Năm function không-stream đều viết `const d = await res.json();` rồi mới `recordTokens(...)`. Thứ tự ấy đúng — không đọc thì không biết số — nhưng `res.json()` **ném** khi bên kia trả 200 kèm một trang HTML của proxy, một thân rỗng, hay JSON cụt. Cú ném nhảy thẳng ra `catch` ngoài cùng, **trước** dòng ghi sổ. Kết quả: lượt gọi đã được phục vụ, `ai_usage` trống, và không có cả dòng `UNMETERED` — nó chỉ hiện ra là `ai_failed`, thứ trông y hệt lỗi mạng. |
| **B. `ASCND_AI_TIMEOUT_MS` gõ sai** | `Number(Deno.env.get(...) ?? 20_000)` tin vào một chuỗi do người gõ. **Đo được:** `setTimeout(fn, NaN)` chạy sau **0 ms**. `Number("")` là 0, `Number("20s")` là NaN — nên `supabase secrets set ASCND_AI_TIMEOUT_MS=20s` huỷ MỌI request trước khi nó rời máy, ở cả sáu function cùng lúc. Và nó không trông như lỗi cấu hình: mỗi bên đều "không trả lời", vòng dự phòng chạy hết danh sách, log đầy `ai provider unreachable`, người đọc đi tìm một sự cố mạng không tồn tại. |
| **C. `response.body!` trong `ai-coach`** | Dấu `!` đọc ra là "một 2xx thì luôn có thân", và HTTP không hứa thế: 204/205 có `ok === true` và `body === null`. `.tee()` trên null ném `TypeError` → `catch` ngoài → 500, và nhánh `meterStream` **không bao giờ chạy**. |
| **D. Bốn import chết** | `aiUrl`/`aiKey`/`aiModel`/`aiVisionModel` được import vào cả sáu function và không dùng ở đâu cả. Vô hại lúc chạy — nhưng chúng là đúng những cái tên một bản sửa vội sẽ với tay tới, và `aiUrl()` mặc định vẫn trỏ về gateway cũ. |
| **Đã sửa thế nào** | (A) `aiPayload()` gộp `res.json()` + `recordTokens` thành **một** lời gọi, nên không còn cách nào đọc được thân mà bỏ qua sổ; thân không đọc được ⇒ ghi 0 (tức nói `UNMETERED`) rồi trả `null`, và chỗ gọi trả 502 `ai_incomplete`. (B) giá trị không phải số dương rơi về 20000 **và in ra tên biến sai**. (C) `!response.body` ⇒ ghi 0 rồi 502. (D) cả sáu chỉ còn import `callAI`. |
| **Kiểm chứng** | `tools/ai-provider.mjs`, 14 nhóm luật, chạy **mã thật** trên `fetch`/`Deno.env` giả. Bốn phép thử ngược, mỗi luật mới một phép, tất cả đều bắt được — chi tiết ở `docs/AUDIT_STATE.md`. |
| **Chưa kiểm được** | Hành vi của **nhà cung cấp thật**. Bước kiểm chứng minh logic của mình đúng với một nhà cung cấp cư xử theo từng kiểu; nó không chứng minh nhà cung cấp thật cư xử theo kiểu nào. Bảy phép khói ở `docs/AI-TRIEN-KHAI.md` mục 5 là phần ấy, và chúng cần một bản deploy. |
| **Không được mở lại** | Đừng biến 502 `ai_incomplete` trở lại thành 200 rỗng; đừng bịa một con số token khi nhà cung cấp không gửi `usage`; đừng viết lại sáu function để đổi nhà cung cấp. Ba điều này có lý do viết sẵn ở `docs/AI-TRIEN-KHAI.md` mục 7. |

---

### ~~A11. Vòng Sẵn Sàng vẽ `0` khi chưa đo được gì~~ — ĐÃ SỬA 2026-09-08

| | |
|---|---|
| **Triệu chứng** | Tài khoản mới, chưa có dữ liệu: hero "Sẵn Sàng" trên màn Hôm nay vẽ số **`0`** giữa vòng tròn. Lời giải thích *"Chưa đủ dữ liệu để tính điểm sẵn sàng…"* có tồn tại nhưng nằm trong `<Expander open={detailOpen}>`, tức **thu lại mặc định** — người mới không thấy nó. |
| **Bằng chứng** | Ảnh chụp bản dựng thật, `tools/live.mjs --shots`, trạng thái `empty`. |
| **Vì sao là lỗi, không phải sở thích** | App **tự mâu thuẫn với chính nó**. `/progress` dùng `CURRENT —` và `CHANGE —` cho "chưa đo", `RECORDS 0` cho một phép đếm THẬT; huy chương dùng `Earned 0/29` — cũng đếm thật. Vòng hero là chỗ **duy nhất** trong app vẽ `0` cho "chưa đo". |
| **Và engine đứng ngược lại** | `computeReadiness` trả "không có điểm" chứ không trả điểm kém khi thiếu số đo — `tools/readiness-confidence.mjs` đã canh đúng điều đó. Giao diện đang nói một câu mà engine cố ý từ chối nói. |
| **Vì sao nó nặng hơn một chi tiết** | Đây là app sức khoẻ, và `0` là chữ số app dùng cho một điểm thật. Nó đọc thành "điểm sẵn sàng của bạn là 0" — đáy thang — cho một người chưa làm gì sai. |
| **Đã sửa thế nào** | `HeroRing` nhận thêm `placeholder?: string`; `EmptyHero` truyền `—` và bỏ trống caption (hai gạch chồng nhau không nói thêm gì). **KHÔNG** đổi `value: number` thành `string`: prop ấy có lý do ghi sẵn — dấu phân cách theo ngôn ngữ và cú đếm khớp nét quét vòng — và canary của `live.mjs` từng bắt một hồi quy ở đúng chỗ đó. |
| **Kiểm chứng** | Dựng lại và chụp lại: vòng nay hiện một gạch, không còn `0`. Bộ chạy 32 màn × 3 trạng thái vẫn xanh. `EmptyHero` chỉ dùng ở đúng MỘT chỗ nên bán kính là một màn. |
| **Trạng thái** | **ĐÓNG.** |

### ~~A12. Bản dựng iOS chết ở `RuntimeScheduler.h` vì một annotation viết cho Xcode 27~~ — ĐÃ VÁ 2026-09-09

| | |
|---|---|
| **Triệu chứng** | `xcodebuild` thoát 65 với đúng hai lỗi, dòng 53 và 61 của `node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI-Cxx/include/RuntimeScheduler.h`: *"'RuntimeScheduler' cannot be annotated with either SWIFT_RETURNS_RETAINED or SWIFT_RETURNS_UNRETAINED because it is not returning a SWIFT_SHARED_REFERENCE type"*. |
| **Mồi nhử** | Ngay trước đó patch-package in *"Patch file created for expo-modules-jsi@57.0.3 applied to expo-modules-jsi@57.1.0"*. Cảnh báo ấy có thật nhưng **không liên quan**: patch cũ chỉ đụng `JavaScriptCodable+Date.swift`, không đụng `RuntimeScheduler.h`. `diff` bản cài với bản gốc 57.1.0 cho ra **giống hệt** ở cả hai tệp — patch cũ đã thành **no-op** từ khi thượng nguồn nhận cùng bản sửa `abs()` → `.magnitude` ở 57.0.5 (expo/expo#49039). |
| **Gốc thật** | `expo-modules-jsi` ≥ **57.0.5** annotate cả hai constructor bằng `SWIFT_RETURNS_RETAINED` để dập một **cảnh báo mới của Xcode 27** (expo/expo#49120, ghi thẳng trong CHANGELOG của gói). Swift 6.2.3 (Xcode 26.2) xét **kiểu trả về** để hợp lệ hoá annotation ấy; constructor trả về `void`, nên nó thành **lỗi cứng**. Đã có bốn báo cáo: expo/expo#49214, #49426, **#49667 (đúng "Xcode 26.2 / Swift 6.2.3")**, và #49740 — PR gỡ annotation, **đã bị bỏ**. |
| **Nó vào kho lúc nào** | Bản nâng Hermes (`fb53951`) đưa `expo` 57.0.6 → 57.0.9, thứ đòi `expo-modules-core ~57.0.8`. npm lấy bản mới nhất trong dải là **57.0.17**, và core 57.0.17 dịch `expo-modules-jsi` từ `~57.0.8` sang `~57.1.0` — **một bản PATCH của core kéo theo một MINOR của jsi**. Lúc ấy tôi báo cáo *"không gói nào của app đổi"*: đúng về `dependencies`, **sai về cây thật**. |
| **Vì sao không lùi phiên bản** | Annotation có từ **57.0.5**, không phải 57.1.0. Lùi jsi về 57.0.8 vẫn đỏ. Lùi tới 57.0.4 thì phải kéo `expo-modules-core` về 57.0.5 và `expo` về 57.0.6 — tức **trả lại hồi quy bộ nhớ Hermes** đã sửa ở fb53951. Và canary SDK 58 (2026-09-08) **vẫn giữ nguyên** annotation, nên không có bản nào để chạy tới. |
| **Đã sửa thế nào** | `patches/expo-modules-jsi+57.1.0.patch`: annotation thành **có điều kiện theo toolchain**, không gỡ hẳn — `#if defined(__apple_build_version__) && __apple_build_version__ >= 18000000` (clang Xcode 27 là 1800.x, Xcode 26.x là 1700.x). Gỡ hẳn sẽ làm cảnh báo Xcode 27 quay lại đúng lúc chủ dự án nâng máy; đây là lý do annotation tồn tại và nó được giữ. Patch cũ `+57.0.3` bị **xoá** vì đã chứng minh là no-op, không phải vì nó vướng. |
| **Kiểm chứng** | Tiền xử lý hai chiều: không có `__apple_build_version__` → constructor **trần**; ép `=18000000` → `__attribute__((swift_attr("returns_retained")))` **còn nguyên**. `clang++ -std=c++20 -fblocks -fsyntax-only` xanh ở cả hai nhánh. Trả header về bản gốc rồi chạy `npx patch-package`: `expo-modules-jsi@57.1.0 ✔`, **cảnh báo lệch phiên bản biến mất**. |
| **Chưa kiểm được ở đây** | Chẩn đoán Swift **không tái hiện được trên Linux** — clang mã nguồn mở không chạy ClangImporter của Swift. Bằng chứng ở đây là bản dựng iOS thật của chủ dự án, cộng bốn báo cáo trùng khớp ở thượng nguồn. |
| **Trạng thái** | **ĐÓNG** — chủ dự án xác nhận 2026-09-09: hai lỗi ấy biến mất, bản dựng đi tiếp và dừng ở A13. Ngưỡng `18000000` rơi đúng khe giữa clang **1700** (Xcode 26.2) và **2100** (Xcode 26.4), nên sau khi nâng máy annotation BẬT LẠI và patch cho ra kết quả tiền xử lý y hệt bản gốc — không cần nhớ gỡ nó để nâng. Gỡ hẳn khi thượng nguồn tự guard (theo dõi expo/expo#49214). |


### A13. `JavaScriptRuntime.swift` — 7 lỗi data race, cùng gốc toolchain với A12 — MỞ, KHÔNG VÁ

| | |
|---|---|
| **Triệu chứng** | Sau khi A12 được vá, Xcode 26.2 / Swift 6.2.3 báo **7 lỗi** trong `node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/JavaScriptRuntime.swift`: `sending 'resultPtr'/'thisPtr'/'argumentsPtr' risks causing data races` — dòng 193, 786, 787, 789, 829, 830, 831. |
| **Cơ chế** | `JavaScriptActor` là `@globalActor`, và `assumeIsolated` nhận `operation: @JavaScriptActor () -> T` — một closure **đã bị cô lập**. Truyền `UnsafeMutablePointer<facebook.jsi.Value>` (pointee là kiểu C++, không Sendable) vào đó là *gửi* nó qua ranh giới cô lập, tức phân tích **region-based isolation**. |
| **Điểm quyết định** | **Expo ĐÃ áp đúng biện pháp chuẩn**: `nonisolated(unsafe) let resultPtr = resultPtr` ở dòng 188, 777–779, 820–822. Lỗi rơi ở **chỗ DÙNG** (193, 786–789, 829–831), không ở chỗ khai. Nghĩa là Swift **6.2.3 không tôn trọng** `nonisolated(unsafe)` cho giá trị gửi vào closure global-actor; **6.3 thì có**. Không có cách viết nào khác diễn đạt được — đây là khác biệt của TRÌNH BIÊN DỊCH, không phải của mã. |
| **Gốc** | Giống A12: máy ở **Xcode 26.2 / Swift 6.2.3**, Expo SDK 56+ đòi **Xcode 26.4 / Swift 6.3**. expo/expo#47539 cho thấy **SDK 57 trên Xcode 26.3 / Swift 6.2.4 cũng đỏ** với cùng họ chẩn đoán (`sending 'emitter'…` trong `expo-modules-core`). |
| **Không có phiên bản nào cứu** | `nonisolated(unsafe)` trong tệp này: 57.0.3→57.0.7 có **7**, 57.0.8→57.1.0 có **10**, canary SDK 58 có **10**. Lùi phiên bản chỉ BỚT phòng vệ. Và **10 tệp** trong `expo-modules-core` dùng cùng mẫu — cả dòng SDK 57 nhắm Swift 6.3. |
| **Vì sao KHÔNG vá** | Mọi lối vá khả dĩ — `@unchecked Sendable`, `@preconcurrency`, `nonisolated`, tắt kiểm tra concurrency — đều gỡ một bảo đảm an toàn luồng khỏi mã chạy **mỗi lời gọi host function**. Đó là đổi một lỗi biên dịch lấy một lỗi chỉ hiện dưới tải, ở tầng native: **đúng lớp lỗi A9**. Maintainer Expo cũng nói thẳng patch-package ở đây *"hide the real cause and may break on CI"*. |
| **Cách sửa** | **Nâng Xcode lên 26.4+.** Nó gỡ cả A12 lẫn A13, và làm patch của A12 thành vô hiệu (annotation bật lại, giống bản gốc). |
| **Quan sát chưa đủ kết luận** | 16 chỗ `weak let` trong `expo-modules-core`/`expo-modules-jsi`, gồm cả khai báo thuộc tính. Maintainer Expo nói cú pháp ấy *"landed in Swift 6.3"*. **Nhưng bản dựng không báo lỗi nào ở đó** — hoặc 6.2.3 nhận nó, hoặc trình biên dịch dừng trước. Ghi để để mắt, **không dùng làm căn cứ**. |
| **Trạng thái** | **MỞ.** Đóng khi máy nâng lên 26.4+ và bản dựng đi qua. Không sửa mã nào cho mục này. |


---

## B. **Chưa** chứng minh được — cấm sửa, cấm dùng làm căn cứ cho việc khác

Những mục này tôi nói ra mà **không** kiểm từ nguồn. Chúng có thể đúng. Chúng
không được dùng để biện minh cho một thay đổi nào.

*Rà 2026-08-03: B1 và B3 đã kiểm được và rời khỏi nhóm này — B1 đúng, B3 hoá ra
là lỗi thật và nặng hơn tôi nghĩ. Giữ lại tiêu đề gạch ngang thay vì xoá, để
lần sau không ai mất công kiểm lại từ đầu. Tỉ lệ 1 đúng / 1 sai trên hai mục là
lý do nhóm B tồn tại: đoán thì 50%, kiểm thì 100%.*

### ~~B1. "App Store Review Guideline 5.1.1(v)"~~ — ĐÃ KIỂM 2026-08-03, ĐÚNG

Đã đọc trang guideline. Nguyên văn mục 5.1.1(v) *Account Sign-In*: *"If your
app supports account creation, you must also offer account deletion within the
app."* Trích dẫn cũ đúng. Đã bỏ phần ghi chú "nhớ lại" trong
`docs/connecting-a-backend.md` §3 và thay bằng nguyên văn kèm ngày đọc.

### B2. "Playwright khớp route theo thứ tự đăng ký ngược"

Suy ra từ **một** lần quan sát (một handler chung đăng ký sau nuốt mất một
handler cụ thể đăng ký trước), không đọc trong tài liệu nào. Nó giải thích đúng
hiện tượng đã gặp và công cụ đo đã được viết lại để không phụ thuộc vào nó nữa.
**Không** được dùng làm cơ sở cho một công cụ đo mới.

### ~~B3. Thứ tự Postgres xử lý `NO ACTION` khi xoá tài khoản~~ — ĐÃ CHẠY THỬ, LÀ LỖI THẬT, ĐÃ SỬA

Chạy thử trên PostgreSQL 16.13 dựng từ đúng DDL trong `supabase/migrations/`:
`NO ACTION` được kiểm ở **cuối lệnh**, và dòng tham chiếu vẫn còn ở thời điểm
đó. `DELETE FROM auth.users` **hỏng hẳn**, không phụ thuộc thứ tự chèn.

Nghiêm trọng hơn: cùng ràng buộc đó chặn cả việc **xoá một món ăn đang nằm
trong kế hoạch bữa ăn** — một thao tác người dùng làm được ngay hôm nay
(`meal-plans.tsx:95` ghi `food_item_id`). Đã sửa bằng
`20260803120000_meal_plan_item_food_fk.sql` (SET NULL, khớp với bảng anh em
`meal_entry_items` vốn đã khai như vậy từ migration đầu tiên).

**Bài học về cách kiểm, không phải về Postgres:** lần chạy đầu bộ thử của tôi
báo `= n` (đã SET NULL) *trước khi* áp migration, tức là "không có lỗi". Lý do:
glob quét `supabase/migrations/*.sql` nuốt luôn file migration tôi **vừa viết
xong**. Bộ thử đã áp bản sửa rồi mới đo. Kiểm một bản sửa thì tập "trước" phải
được dựng từ mọi thứ **trừ** bản sửa đó — nếu không, mọi bản sửa đều trông như
không cần thiết.

### B4. `hrv_history_28d` không gộp theo ngày

`daily-log-service.ts:143` đọc **mọi** mẫu trong 28 ngày, không giới hạn, không
gộp theo ngày. Ai log 5 mẫu một ngày sẽ chi phối đường cơ sở z-score hơn ai log
1 mẫu. Đó **có thể** là lệch, cũng **có thể** là đúng ý (nhiều mẫu = nhiều tin
cậy hơn).

**Chưa chứng minh được là lỗi.** Cần: dữ liệu thật về việc người dùng log bao
nhiêu mẫu một ngày. Không có nó thì mọi "sửa" chỉ là đổi một lựa chọn thiết kế
sang một lựa chọn thiết kế khác.

### B5. Độ sâu của shop (F6)

Đã đánh dấu **"Opinion only"** từ đợt audit. Cần khoảng 2 tuần analytics thật
trước khi động vào điều hướng. Chưa có analytics thì không có gì để chứng minh.

### B6. 174 màu ghi cứng ngoài `constants/ascnd` (F9)

Đếm được, nhưng **không phải lỗi người dùng nhìn thấy**. Là nợ kỹ thuật. Sửa
174 chỗ là 174 cơ hội làm lệch một màu mà không ai nhận ra cho tới lúc render.
Chỉ làm khi có một lý do cụ thể (ví dụ: làm theme sáng), không làm vì gọn.

---

## C. Đã kiểm và **KHÔNG** phải lỗi — cấm "sửa"

Mục này quan trọng ngang nhóm A. Mỗi cái dưới đây **trông** như lỗi, và người
tiếp theo đọc code sẽ tưởng là lỗi. Chúng đã được kiểm. Đừng sửa lại.

### C1. `useToggleSupplement` invalidate `daily_log` mà không recompute

`use-library.ts:62` ghi `supplement_intake_logs` rồi
`invalidateQueries(['daily_log'])` mà không gọi `recomputeDailyLog` — tức là nạp
lại đúng cái dòng cũ chưa được tính lại. Trông y hệt lớp lỗi đã sửa ở
`useDeleteWorkoutSession`.

**Không phải lỗi.** `grep -rn "supplement_taken\|supplement_planned" src/` cho ra
**0 nơi đọc** ngoài chính file ghi ra chúng (`daily-log-service.ts`). Thêm
recompute vào đây là nhét **11 truy vấn** vào sau mỗi lần tích một checkbox, để
chữa một cột không màn hình nào hiển thị.

Nếu sau này có màn hình đọc hai cột đó thì mục này thành lỗi thật. Kiểm bằng
đúng lệnh grep trên trước khi kết luận.

### C2. `.limit(1)` gọi **trước** `.order(...)` ở `daily-log-service.ts:66`

Truy vấn giấc ngủ chuỗi `.limit(1).order('waketime', desc)`, còn truy vấn sinh
trắc ngay dưới chuỗi ngược lại `.order(...).limit(1)`. Trông như một trong hai
lấy nhầm hàng.

**Không phải lỗi**, và chứng minh được trong 5 giây:

```bash
node -e "
const { PostgrestClient } = require('@supabase/postgrest-js');
const c = new PostgrestClient('http://x/rest/v1');
const norm = (q) => { const u = new URL(q.url.toString());
  return u.pathname + '?' + [...u.searchParams.entries()].map(([k,v])=>k+'='+v).sort().join('&'); };
console.log(norm(c.from('t').select('a').limit(1).order('w', { ascending: false })));
console.log(norm(c.from('t').select('a').order('w', { ascending: false }).limit(1)));
"
```

Cả hai in ra `?limit=1&order=w.desc&select=a`. `limit` và `order` là hai tham số
URL độc lập; thứ tự **gọi** không đổi truy vấn, và PostgREST luôn `ORDER BY` rồi
mới `LIMIT`. Hai dòng đó cùng nghĩa: "bản ghi mới nhất trong ngày, lấy một".

*(Lần chạy đầu tôi so hai chuỗi URL bằng `===` và nó trả `false` — chỉ vì thứ tự
tham số khác nhau. Suýt nữa thì tôi báo một lỗi không tồn tại. Đó là lý do lệnh
ở trên sắp xếp tham số trước khi so.)*

### C3. Xoá buổi tập rồi log lại có farm được coin không

**Không.** Tiến độ thử thách *có* tụt lại — `use-extras.ts:427` ghi giá trị đếm
lại và đặt `completed_at: null` — nhưng dòng sổ cái dùng
`challengeRefKey(tier, weekStart, challenge_key)`, cố định theo tuần và unique
theo user, nên lần trả thưởng thứ hai là insert trùng và bị nuốt
(`use-extras.ts:444`). Huy hiệu đã nhận thì không bị thu hồi: chúng ghi lại
rằng một việc **đã xảy ra**, và app không có khái niệm "chưa xảy ra" ngược lại.

### C4. Xoá mẫu tập có mất buổi tập đã log không

**Không.** `workout_sessions.template_id` khai
`REFERENCES public.workout_templates(id) ON DELETE SET NULL`, nên buổi tập ở
lại, chỉ mất liên kết mẫu.

### C5. "Có bảng không cascade khi xoá tài khoản"

**Sai — đây là báo động giả của chính tôi.** Regex đầu chỉ khớp dạng
`ALTER TABLE … ADD CONSTRAINT`, nên báo `profiles`, `mascot_inventory`,
`mascot_transactions`, `meal_entry_items` không có cascade. Chúng khai
`ON DELETE CASCADE` **inline trong `CREATE TABLE`**.

Kiểm lại cả hai dạng DDL: **31/31 bảng đều có đường về `auth.users`** — 27 trỏ
thẳng (17 inline, 10 bằng `ALTER TABLE`), 4 qua bảng cha. Nếu tôi tin lần đọc
đầu, `delete-account` đã được viết với một danh sách xoá tay 31 bảng không cần
thiết — và danh sách đó sẽ mục ruỗng ngay lần thêm bảng tiếp theo.

---

## Cách dùng sổ này

- Sửa xong một mục ở **A** → chuyển nó vào commit message, xoá khỏi đây.
- Chứng minh được một mục ở **B** → chuyển sang **A** kèm bằng chứng, rồi mới
  bàn cách sửa.
- Bác bỏ được một mục ở **B** → chuyển sang **C** kèm cách kiểm lại, để người
  sau không mất công một lần nữa.
- **Không** xoá mục nào khỏi **C**. Mục ở C tồn tại để chặn một bản sửa sai, và
  nó chỉ làm được việc đó khi còn ở đó.

Kiểm tự động: `node tools/check.mjs` — 10 bước, mỗi bước **tự kiểm mẫu của chính
nó** trước khi tin vào một lần chạy sạch. Lý do: một phép kiểm đã âm thầm ngừng
khớp thứ gì sẽ báo thành công, và điều đó không phân biệt được với một codebase
lành mạnh — nhưng tệ hơn nhiều.
