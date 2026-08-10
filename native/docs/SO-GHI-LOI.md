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

### A3. Ghi khi mất mạng không sống sót

| | |
|---|---|
| **Bằng chứng** | Đo thật, chép nguyên trong `src/lib/offline.ts`: server giữ đúng một bản 250 ml, ngắt mạng, bấm +8 → 16.5 oz, **không có gì được ghi**, và nối lại sau 30 giây vẫn không gửi. |
| **Đã làm** | Chặn phần *nói dối*: `offlineNow()` bỏ qua bản vá lạc quan khi offline. App không còn hiển thị con số sai. |
| **Chưa làm** | Ghi offline vẫn mất. Cách sửa thật: persist mutation cache + đặt `mutationKey` + `setMutationDefaults` cho **~30 mutation**. |
| **Rủi ro** | Một call site đặt sai key thì mutation đó **âm thầm** ngừng resume — không lỗi, không cảnh báo, chỉ là dữ liệu biến mất. Ba mươi chỗ để sai. Cần một cách kiểm tự động chứng minh cả 30 chỗ đều đúng **trước khi** bắt đầu, không phải sau. |

### A4. `.env` nằm trong git

| | |
|---|---|
| **Bằng chứng** | Chạy **từ gốc repo**, không phải từ `native/` — file nằm ở gốc: `git ls-files .env` trả về `.env`, `git check-ignore -v .env` không khớp luật nào. (Chạy nhầm từ `native/` thì cả hai đều im lặng, và im lặng ở đây trông y hệt "đã sạch".) |
| **Hiện tại** | Chỉ chứa giá trị công khai (anon key), nên **chưa lộ gì**. |
| **Vì sao vẫn ghi** | Nguy hiểm là thói quen: người tiếp theo thêm một secret thật vào file đó sẽ publish nó mà không biết. |
| **Còn thiếu để sửa** | Quyết định của chủ dự án: chỉ `git rm --cached` (lịch sử vẫn còn) hay viết lại lịch sử. Cái thứ hai đụng vào mọi clone và mọi PR đang mở — **không được tự quyết**. |

### A5. Bucket `progress-photos` không giới hạn dung lượng hay kiểu file

| | |
|---|---|
| **Bằng chứng** | Bucket được tạo bằng `INSERT INTO storage.buckets (id, name, public)` và không gì khác (`20260212045102_….sql:60`); không có `file_size_limit` hay `allowed_mime_types` ở bất kỳ migration nào. |
| **Hậu quả** | Lưu trữ và băng thông đều tính tiền, và policy theo user không quan tâm file lớn cỡ nào. |
| **Còn thiếu để sửa** | Một migration đặt giới hạn là dễ. Chọn **con số** thì không: quá thấp là chặn ảnh iPhone thật. Cần biết kích thước ảnh thực tế app tạo ra (`use-progress-photos.ts` upload JPEG chưa nén lại) trước khi chốt. |

### A6. `delete-account` chưa tồn tại

| | |
|---|---|
| **Bằng chứng** | Không có thư mục trong `supabase/functions/`, không có mục trong `supabase/config.toml`. |
| **Hiện tại không hỏng gì** | Nút trong Cài đặt đã gọi nó và đã nói đúng "máy chủ chưa bật chức năng này" khi nhận 404. |
| **Trạng thái** | Đây là **việc chưa làm**, không phải lỗi. Đặc tả đầy đủ ở `docs/connecting-a-backend.md` §3, gồm cả bước xoá file Storage mà cascade không với tới. |

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
