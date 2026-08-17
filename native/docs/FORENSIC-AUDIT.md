# Sổ audit pháp y

Sổ này khác `SO-GHI-LOI.md`. Sổ kia ghi những thứ **chưa** chứng minh được và vì
thế cấm đụng vào. Sổ này ghi những thứ **đã** chứng minh được — mỗi mục có
nguyên nhân gốc, bản sửa tối thiểu, và một phép kiểm tự động đã được chạy thử
trên cả bản hỏng lẫn bản sửa.

**Luật của sổ:** không mục nào được ghi vào đây vì "code có thể tốt hơn". Mỗi
mục phải nói được: gõ gì thì hỏng, đáng lẽ ra sao, thực tế ra sao.

Bộ kiểm: `node tools/check.mjs` (92 bước). Ngày rà: 2026-08-17.

---

## Vòng 1 — Độ bền của lệnh ghi khi mất mạng, và chốt gửi một lần

Tất cả tám mục dưới đây nằm trên **một dòng chảy**: người dùng ghi lại một việc
đã xảy ra → hàng đợi ghi bền → phát lại → `daily_logs` → điểm sẵn sàng → thẻ
Today. Chúng được sửa cùng lô vì chúng hỏng theo cùng một kiểu và một bản sửa
lẻ tẻ sẽ để lại đúng hình dạng cũ ở chỗ bên cạnh — đó là lịch sử đã lặp lại hai
lần trong repo này (`localDayRangeISO`, và `localDaysAgoStr`).

---

### BUG-01 — Kết thúc buổi tập trong tuần: mất trắng khi không có sóng

| | |
|---|---|
| **AREA** | Workout → daily log → readiness · `src/components/ascnd/day-plan.tsx` |
| **SEVERITY** | P1 — mất dữ liệu |
| **STATUS** | ĐÃ SỬA |

**TRIGGER**
Mở tuần tập → chọn một ngày → tick từng set trong lúc tập (tầng hầm phòng gym,
không sóng) → bấm "Hoàn thành".

**EXPECTED**
Buổi tập được giữ lại và tự gửi khi có mạng, như sheet ghi tự do đã làm.

**ACTUAL**
Nút xám đi và ở nguyên đó. Không toast, không lỗi, không lời nào. Mở lại app
hôm sau: buổi tập không tồn tại, và điểm resume dưới `dayProgressKey` — bản sao
duy nhất còn lại — đã bị xoá theo phiên trước hoặc vô dụng.

**ROOT CAUSE**
`useLogWorkoutSession` cần mạng **hai lần**: đọc lịch sử để tìm kỷ lục, rồi
insert. Offline React Query tạm dừng nó, `isPending` giữ nguyên true vĩnh viễn,
nên `canFinish` thành false. Mutation tạm dừng *có* được lưu xuống AsyncStorage,
nhưng nó không mang `mutationKey`, nên lần khởi động sau nó quay về mà không có
`mutationFn` nào để nhận biến — và bị vứt đi trong im lặng.

Chính header của `useLogWorkoutSession` nói có **hai** màn hình kết thúc buổi
tập. Chỉ một trong hai được cấp đường ghi bền. Và màn bị bỏ sót là màn người ta
dùng **trong lúc đang tập**, tức là màn có xác suất mất sóng cao hơn, không phải
thấp hơn.

**AFFECTED MODULES**
`day-plan.tsx` → `use-fitness-data.ts` → `offline-write.ts` → `daily-log-service.ts`

**EVIDENCE**
`grep -n "offline" src/components/ascnd/day-plan.tsx` → 0 kết quả (trước khi sửa).
`src/app/log-workout.tsx` mô tả đúng cơ chế hỏng này trong chú thích của chính nó
và sửa nó *cho riêng mình*.

**FIX**
Thêm `queue` (`mutationKey: [...OFFLINE_WRITE_KEY]`, không `mutationFn` cục bộ)
và một nhánh `offlineNow()` phát ra `kind: 'workout'` với đúng hình dạng `sets`
mà đường online ghi. `dateTime` theo đúng luật của đường online: ngày **đang
xem**, đóng dấu 12:00 giờ địa phương khi đó không phải hôm nay — nửa đêm là ranh
giới app này đã dính hai lần, buổi trưa là điểm xa nó nhất về cả hai phía.
Không tuyên bố kỷ lục nào: kỷ lục là một phép so với lịch sử, và offline thì
không có lịch sử để so.

**VERIFICATION**
`tools/offline-submit.mjs` luật 2 — phát biểu theo **hook** chứ không theo danh
sách file, nên màn thứ ba nào ghi buổi tập cũng thừa hưởng luật mà không ai phải
nhớ. Chạy thử: gỡ bản sửa ra → đỏ đúng file này.

**REGRESSION RISK**
Thấp. Đường online không đổi một dòng. `logged` giờ tính cả `queue.isPending` —
điều đó cố ý: từ chỗ người dùng đứng thì buổi tập **đã** được ghi, và một nút
còn sống trong lúc chờ sóng là một nút ghi buổi tập lần thứ hai khi có sóng.

---

### BUG-02 — Chạm hai lần khi offline: buổi tập được ghi hai lần

| | |
|---|---|
| **AREA** | Workout · `src/app/log-workout.tsx` |
| **SEVERITY** | P1 — dữ liệu nhân đôi, lan xuống điểm sẵn sàng và phần thưởng |
| **STATUS** | ĐÃ SỬA |

**TRIGGER**
Offline → điền sheet ghi buổi tập → chạm "Lưu" hai lần nhanh (khoảng 150 ms).

**EXPECTED** Một buổi tập.
**ACTUAL** Hai `workout_sessions` cho một buổi, không một dấu hiệu nào.

**ROOT CAUSE**
`canSave` đọc `save.isPending || save.isSuccess` — mutation **online**. Offline
cú chạm đi tới `queue`, một mutation khác, mà không chỗ nào đọc trạng thái. Nên
cái chốt tồn tại để chặn lần gửi thứ hai đang canh đúng con đường không được đi.

`router.back()` chỉ **bắt đầu** một animation; sheet vẫn được gắn và vẫn nhận
chạm suốt thời gian đó. Và trên nhánh này nút không đổi gì cả — không spinner,
không dấu tick, vẫn nguyên chữ "Lưu" — tức đúng hình dạng *mời gọi* cú chạm thứ
hai. `finish()` có chốt riêng nên `router.back()` không chạy hai lần, vì vậy hậu
quả duy nhất là im lặng: hai thao tác trong hàng đợi, hai insert khi có sóng.

**AFFECTED MODULES**
Một buổi tập ma không phải một dòng thừa. `useDeleteWorkoutSession` liệt kê
chính xác những gì nó làm dịch chuyển: `daily_logs.volume_load`, cửa sổ tải 7
ngày và 28 ngày (tức tỉ lệ acute:chronic dưới điểm sẵn sàng), số buổi trọn đời
mở khoá linh vật, các mốc huy hiệu 1/10/50/100, và thử thách `workouts_N`.

**EVIDENCE**
Hàng đợi **cố ý** không idempotent cho `kind: 'workout'` — hai buổi trong một
ngày là chuyện có thật — nên không có gì ở phía dưới gỡ lại được.
So sánh: `log-meal.tsx` và `log-biometrics.tsx` an toàn *miễn phí*, vì chúng cho
cả hai đường đi qua **cùng một** mutation.

**FIX** `canSave` cộng thêm `!queue.isPending && !queue.isSuccess`.

**VERIFICATION** `tools/offline-submit.mjs` luật 1.

**REGRESSION RISK**
Thấp. Một mutation bị tạm dừng giữ `isPending` cho tới khi gửi được, và đó đúng
là khoảng thời gian nút phải đóng.

---

### BUG-03 — Chạm hai lần khi offline: một đêm thành hai bản ghi, và pop nhầm màn

| | |
|---|---|
| **AREA** | Sleep → readiness · `src/app/log-sleep.tsx` |
| **SEVERITY** | P1 |
| **STATUS** | ĐÃ SỬA |

**TRIGGER** Offline → ghi giấc ngủ → chạm "Lưu" hai lần nhanh.

**EXPECTED** Một đêm, một lần đóng sheet.
**ACTUAL** Hai `sleep_logs` cho một đêm, hai toast, và `router.back()` chạy hai
lần — pop luôn cả **màn hình phía sau** sheet, đưa người dùng tới chỗ họ không
hề yêu cầu.

**ROOT CAUSE** Cùng BUG-02: guard đọc `save`, nhánh offline đi qua `queue`. Ở
đây không có chốt `leaving` như log-workout, nên cả điều hướng cũng hỏng.

Nửa đắt hơn là bản ghi thừa. `sleep_logs` **cố ý** không có ràng buộc duy nhất
cho dòng nhập tay — hai giấc ngủ trưa trong một ngày là hai dòng thật — nên
không gì từ chối nó. Sau đó `daily-log-service` lấy `waketime` **mới nhất** làm
đêm qua, còn `sleepDebt7d` chia trung bình trên một số dòng vừa mọc thêm một
phần tử ma. Giấc ngủ chiếm 0.30 điểm sẵn sàng, và số hạng nợ ngủ mang sai số ấy
đi suốt một tuần.

**FIX** Biểu thức `disabled` cộng `queue.isPending || queue.isSuccess`.
`save.isPending` được giữ **trên dòng neo** vì `tools/plausible.mjs` neo chốt
kiểm tính hợp lý của màn này theo đúng chuỗi ký tự đó — một luật có mốc neo bị
trôi là một luật không kiểm gì cả. (Đây là lần đầu bộ kiểm bắt được chính bản
sửa của tôi.)

**VERIFICATION** `tools/offline-submit.mjs` luật 1 + `tools/plausible.mjs`.

---

### BUG-04 — Chạm hai lần khi offline: pop nhầm màn (số đo cơ thể)

| | |
|---|---|
| **AREA** | Navigation · `src/app/log-measurement.tsx` |
| **SEVERITY** | P3 |
| **STATUS** | ĐÃ SỬA |

Cùng hình dạng, rẻ nhất trong nhóm: `body_measurements` upsert theo
`(user_id, date)` nên dữ liệu an toàn. Cái không an toàn là điều hướng — nhánh
offline gọi `router.back()` ngay trong thân hàm, nên cú chạm thứ hai pop cả màn
phía sau, kèm hai toast "sẽ đồng bộ".

Vẫn sửa, vì để lại đúng một trường hợp của một lớp lỗi là để lại cái mẫu mà
người sau sẽ chép.

---

### BUG-05 — Ô cân nặng trên Today: nút vẫn sống, và biểu mẫu không đóng

| | |
|---|---|
| **AREA** | Weight → adaptiveTDEE · `src/components/ascnd/today-widgets.tsx` |
| **SEVERITY** | P3 |
| **STATUS** | ĐÃ SỬA (một nửa; nửa còn lại là quyết định, xem dưới) |

**TRIGGER** Offline → mở ô cân nặng trên Today → nhập số → bấm "Ghi".

**ACTUAL** Toast báo đã lưu, nhưng biểu mẫu **ở nguyên đó với số vẫn còn trong
ô**, cách một cú chạm nữa là một lệnh ghi thứ hai.

**ROOT CAUSE** Hai tầng. (a) `disabled` đọc `logWeight` (online), không đọc
`queue`. (b) `setEditing(false)` được viết để đóng biểu mẫu, nhưng
`showLogger = editing || todayWeight == null`, và ở lần cân **đầu tiên trong
ngày** `todayWeight` là null — và không có sóng thì nó sẽ không thôi null.

**FIX** `disabled` cộng `queue.isPending || queue.isSuccess`.

**KHÔNG sửa, có lý do:** không vá lạc quan giá trị vào cache để đóng biểu mẫu.
`lib/offline.ts` là luật nói rằng một mutation bị tạm dừng **không bao giờ**
rollback, nên một số cân lạc quan sẽ nằm lại trong cache đã persist như một lần
cân không ai thực hiện. Đóng nút là nửa trung thực; toast đã nói xong phần còn
lại.

---

### BUG-06 — Phát lại lần cân dùng động từ khác đường online, và bị từ chối

| | |
|---|---|
| **AREA** | Offline replay · `src/lib/offline-write.ts` |
| **SEVERITY** | P2 — mất dữ liệu, im lặng |
| **STATUS** | ĐÃ SỬA |

**TRIGGER** Hai đường, cả hai đều bình thường:
1. Cân lúc sáng khi có mạng → chiều sửa lại số khi mất mạng → có sóng lại.
2. Mất mạng, cân sai, sửa lại ngay, vẫn mất mạng → có sóng lại.

**EXPECTED** Số cuối cùng người dùng nhập là số được lưu.
**ACTUAL** (1) Bản sửa bị từ chối, biến mất. (2) Bản **đầu** lọt, bản sửa bị từ
chối — tức số sống sót đúng là số bị sai. Ngược hoàn toàn.

**ROOT CAUSE** `case 'weight'` dùng `.insert()` trong khi đường online
(`useLogWeight`) từ đầu vẫn là `.upsert(…, { onConflict: 'user_id,date' })`.
`weight_logs` mang `UNIQUE (user_id, date)`
(`20260212044110_….sql:14`, và lại lần nữa ở `20260213054439_….sql:83`), nên hai
động từ này không phải hai cách viết của một việc: gặp ngày đã có dòng thì insert
bị **từ chối**.

Và không gì nói ra. Lệnh ghi phát lại bên trong `resumePausedMutations`, thứ
không thuộc màn hình nào, nên cú từ chối là một mutation error không ai hứng.

**AFFECTED MODULES** `weight_logs` → `profiles.weight_kg` (`syncProfileWeight`)
→ dải BMI, thang biểu đồ, và `adaptiveTDEE` — hồi quy bình phương tối thiểu 14
ngày đang đặt mục tiêu calo.

**FIX** Đổi sang `.upsert(…, { onConflict: 'user_id,date' })`, khớp đúng đường
online.

**REGRESSION RISK** Không có đường nào để bản phát lại ghi đè một số **mới hơn**:
app không có chỗ nào nhập cân nặng cho ngày quá khứ, nên dòng duy nhất mà upsert
này có thể rơi vào là dòng của chính ngày nó — đúng dòng nó sinh ra để sửa.

**VERIFICATION** `tools/offline-submit.mjs` luật 3, đọc ràng buộc **từ
`supabase/migrations/`** chứ không từ quy ước, và tự dừng nếu không đọc được
ràng buộc của `weight_logs` (một regex khớp 0 kết quả sẽ cho qua mọi codebase).

---

### BUG-07 — Cửa sổ ngày lấy theo UTC: biểu đồ mất một ngày ở rìa

| | |
|---|---|
| **AREA** | Date boundary · `src/hooks/use-fitness-data.ts` (5 hook), `src/app/coach-memory.tsx` |
| **SEVERITY** | P3 |
| **STATUS** | ĐÃ SỬA |

**TRIGGER** Mở tab Tiến trình / màn Bước chân vào buổi chiều ở Los Angeles, hoặc
trước bình minh ở Hà Nội.

**ACTUAL** Đo thật (`TZ=… node`):

```
America/Los_Angeles 20:30    UTC → 2026-08-04    local → 2026-08-03
Asia/Ho_Chi_Minh    03:30    UTC → 2026-08-02    local → 2026-08-03
```

Phía tây Greenwich, ngày cũ nhất rụng khỏi mọi biểu đồ từ giữa chiều — trung
bình "14 ngày" lấy trên 13. Phía đông, mọc thêm ngày thứ 15 trước bình minh.
Không lỗi, không rỗng: con số chỉ đơn giản được tính trên một cửa sổ khác với
cửa sổ mà nhãn của nó hứa.

**ROOT CAUSE** `daysAgoISO(days).split('T')[0]` — `toISOString()` đổi sang UTC
trước, nên chuỗi đó là ngày **theo UTC**, đem so với một cột `date` thật.

**EVIDENCE — và điều làm mục này đáng ghi**
Bản sửa **đã có sẵn trong repo**. `weight-changes.tsx` mang một chú thích về
đúng lỗi này — *"lúc 01:00 ở Hà Nội, 'ba ngày trước' ra thành bốn ngày trước"* —
tìm ra ở đó, sửa ở đó bằng `localDaysAgoStr`, và để nguyên ở **năm hook nuôi
chính nó**. Đúng lịch sử của `localDayRangeISO`: viết cho nhật ký dinh dưỡng, bỏ
sót ba hook khác trong nhiều tuần.

Chỗ thứ sáu thì in ra màn hình: `coach-memory.tsx` hiện
`last_confirmed.split('T')[0]`, tức ngày hôm trước với bất cứ gì được xác nhận
trước 07:00 giờ Hà Nội — một cái ngày người dùng đọc được, lệch một ngày, trên
đúng màn hình có chủ đề là *coach nhớ gì và nhớ từ bao giờ*.

**FIX** `localDaysAgoStr(days)` cho cửa sổ; `localDateStr(new Date(ts))` để hiển
thị. `daysAgoISO` ở lại — `date_time` là `timestamptz` và một mốc thời gian tuyệt
đối mới là phép so đúng cho nó.

**VERIFICATION** `tools/day-window.mjs` có luật thứ ba, kèm 5 ca tự kiểm.

---

### BUG-08 — Buổi tập được gom theo ngày UTC: app nói người đang tiến bộ rằng họ chững lại

| | |
|---|---|
| **AREA** | Progression → mascot → Today · `src/lib/user-state.ts`, `src/app/(tabs)/assistant.tsx` |
| **SEVERITY** | P2 |
| **STATUS** | ĐÃ SỬA |

**TRIGGER** Người tập sáng sớm (trước 07:00 ở UTC+7 — giờ tập phổ biến nhất).

**EXPECTED** Buổi tập lúc 06:00 thứ Hai thuộc về thứ Hai.
**ACTUAL** Thuộc về Chủ nhật, nên **mọi** buổi tập của họ già đi một ngày.

**ROOT CAUSE** `progressionOf` lấy ngày của buổi tập bằng
`(s.date_time ?? '').slice(0, 10)` — ngày theo UTC — rồi đem so với `today`, vốn
là ngày địa phương. Trộn hai hệ.

Không phải chuyện thẩm mỹ. Cửa sổ 56 ngày được **chia đôi** ở giữa
(`PROGRESS_DAYS / 2`), và một buổi tập nằm trên đường chia sẽ nhảy từ nửa
`recent` sang nửa `older` khi bị già đi một ngày — đúng hai cái trung bình mà
kết luận "chững lại" được rút ra từ đó.

`assistant.tsx` có cùng lỗi ở một chỗ đau hơn: biểu đồ nhịp tim nghỉ gom mẫu
theo `String(smp.date_time).slice(0, 10)`. Nhịp tim nghỉ được **đo vào sáng
sớm** — tức đúng những số đo mà biểu đồ này nói về, là những số đo dễ bị xếp
nhầm sang hôm trước nhất.

**EVIDENCE** `goal-training.ts` đã được sửa cho đúng lớp lỗi này, và
`tools/goal-training.mjs` chạy thật ở `Asia/Ho_Chi_Minh` để chứng minh. Luật
được chứng minh ở đó và để nguyên ở đây — lần thứ ba trong sổ này.

**FIX** `localDateStr(new Date(...))` ở cả hai chỗ.

**VERIFICATION** Ca mới trong `tools/user-state.mjs`, chạy trong **tiến trình
thật có TZ**, và **có răng ở cả hai đầu**: tám buổi tập với buổi nặng nằm đúng
trên đường chia ở ngày thứ 27 →

```
gom theo giờ người tập:  recent 6000 vs older 5000  ⇒ tăng 20%, KHÔNG chững
gom theo UTC:            recent 5000 vs older 5800  ⇒ không nhích, CHỮNG
```

Chạy thử với bản đã ship: đỏ, đúng câu *"app nói một người đang tiến bộ rằng họ
đã chững lại"*.

---

## Đã kiểm và **KHÔNG** phải lỗi — trong vòng này

Ghi lại để người sau không kiểm lại từ đầu.

### N1. `log-meal.tsx` và `log-biometrics.tsx` không có lỗ hổng chạm hai lần

Cả hai cho đường online và đường offline đi qua **cùng một** mutation, nên một
mutation bị tạm dừng giữ `isPending` và nút tự đóng. Đây là hình dạng đúng, và
là lý do luật trong `offline-submit.mjs` được viết theo "mutation nào được
`.mutate()` trong nhánh offline" chứ không theo tên biến.

### N2. `case 'measurement'` và `case 'meal'` trong hàng đợi không cần sửa

`measurement` đã upsert theo `(user_id, date)`. `meal` tự đúc `entryId` phía
client nên idempotent theo khoá chính. `water` insert là **đúng**: `water_logs`
chỉ có index thường trên `(user_id, date)`, vì nhiều cốc trong một ngày là nhiều
dòng thật — và luật đọc ràng buộc từ schema nên nó tự loại trường hợp này.

### N3. `todayKeys` không chứa `today_water_logs` — không phải sót

Không lệnh ghi nào ngoài chính nước làm đổi danh sách cốc nước, và hai mutation
nước tự invalidate cả hai khoá trong `onSettled`.

---

## Vòng 2 — Chain B: HealthKit → đồng bộ → `daily_logs` → điểm sẵn sàng

Bảy mục, một dòng chảy. Ngày rà: 2026-08-17. Bộ kiểm: 92 bước.

**Lifecycle đã trace, và các lối vào có thật** (đọc code, không suy đoán):

```
_layout.tsx <HealthAutoSync/>  → useAutoHealthSync  (silent, mount + AppState 'active', tiết lưu 15')
(tabs)/index.tsx  chip "Đồng bộ"        → useHealthSync #1  (có guard isPending)
(tabs)/index.tsx  nút "Kết nối Health"  → useHealthSync #1  (KHÔNG guard — BUG-14)
health-source-card.tsx                  → useHealthSync #2  (có guard)
onboarding-flow.tsx                     → chỉ xin quyền, không đồng bộ
```

**Ba mutation đồng bộ cùng sống một lúc.** Đó là tiền đề của BUG-09 và BUG-15,
và là lý do mọi lệnh ghi trong chuỗi này phải idempotent chứ không chỉ "thường
thì không sao".

---

### LỚP LỖI: `PARTIAL-INDEX-CONFLICT-CLASS`

> Một `upsert` chốt vào **index duy nhất riêng phần** không bao giờ chạy được.
> Postgres chỉ suy luận được index riêng phần làm arbiter khi câu lệnh nhắc lại
> vị từ của nó; `on_conflict` của PostgREST chỉ gửi được danh sách cột. Kết quả
> là `ERROR 42P10`, mọi lần, cho mọi người.

**Số instance trong repo: 2** — quét toàn bộ `onConflict` trong `src/` đối chiếu
với mọi ràng buộc duy nhất trong `supabase/migrations/`. Cả hai đều ở Chain B
(BUG-09a, BUG-09b). Bảy `onConflict` còn lại chốt vào ràng buộc thường và đúng.

**Canonical solution:** `UNIQUE (cols)` thường thay cho index riêng phần. Nó giữ
**nguyên** ngữ nghĩa mà index riêng phần được viết ra để có — Postgres mặc định
coi NULL là khác nhau (`NULLS DISTINCT`), nên dòng nhập tay (`external_id IS
NULL`) vẫn lặp lại tự do.

**Regression guard:** `tools/health-sync.mjs` luật 1.

---

### BUG-09 — Import giấc ngủ và buổi tập từ Apple Health chưa từng ghi được một dòng nào

| | |
|---|---|
| **AREA** | HealthKit → `sleep_logs` / `workout_sessions` · `use-health-sync.ts:144,170` + `20260809120000_health_provenance.sql` |
| **SEVERITY** | P0 — cả một tính năng không tồn tại, và app báo là đã chạy |
| **STATUS** | ĐÃ SỬA |

**TRIGGER** Bất kỳ lần đồng bộ nào có giấc ngủ hoặc buổi tập từ đồng hồ.

**EXPECTED** Đêm qua vào `sleep_logs`, buổi chạy vào `workout_sessions`, lần
đồng bộ thứ hai là no-op.

**ACTUAL** Không dòng nào. Toast xanh *"Đã đồng bộ"* bên trên.

**ROOT CAUSE** Đo thật, PostgreSQL 16.13 dựng từ **mọi** migration trong repo,
chạy đúng câu lệnh PostgREST sinh ra cho
`.upsert(…, { onConflict: 'user_id,external_id' })`:

```
ERROR:  there is no unique or exclusion constraint matching the
        ON CONFLICT specification
→ sleep_logs: 0 dòng.  workout_sessions: 0 dòng.
```

Thứ duy nhất phủ hai cột đó là `sleep_logs_external_uidx` /
`workout_sessions_external_uidx` — **riêng phần**, `WHERE external_id IS NOT
NULL`.

**AFFECTED MODULES** Giấc ngủ là số hạng **0.30** của điểm sẵn sàng và trước
lần import này không có nguồn nào ngoài gõ tay. Buổi tập từ đồng hồ nuôi
`workout_count` và `daysSinceWorkout` — hai thứ mà `use-health-sync.ts` tự nói
là *"cả hai đang trả lời không trong khi câu trả lời là có"*.

**EVIDENCE — vì sao không ai thấy**
Không call site nào đọc `error`. Lệnh bị từ chối không thành promise rejected,
không tới `onError`, không dừng lượt chạy. Migration tạo ra hai index ấy mở đầu
bằng *"một lần đồng bộ chạy hai lần không được đẻ ra hai bản của mọi thứ"* — và
nó đẻ ra **không bản nào**.

**FIX** `20260817120000_health_import_conflict_target.sql`: bỏ hai index riêng
phần, thay bằng `UNIQUE (user_id, external_id)` thường. Đo lại trên cùng
instance:

```
index riêng phần + ON CONFLICT trần      → ERROR 42P10
UNIQUE thường    + ON CONFLICT trần      → INSERT 0 1, rồi INSERT 0 1
                                           còn ĐÚNG MỘT dòng, đã cập nhật (420 → 431)
UNIQUE thường    + hai dòng external_id NULL → INSERT 0 2, giữ cả hai
```

**VERIFICATION** `tools/health-sync.mjs` luật 1. Gỡ migration ra → đỏ đúng ba
upsert, kèm tên index riêng phần đang chắn đường.

**REGRESSION RISK** Ràng buộc mới **chặt hơn** ràng buộc cũ đúng ở chỗ nó thật
sự tồn tại. Rủi ro thật là dữ liệu cũ: nếu một tài khoản đã có hai dòng cùng
`(user_id, external_id)` thì `ADD CONSTRAINT` sẽ hỏng — không thể xảy ra, vì
đường duy nhất ghi `external_id` khác NULL là hai upsert này, và chúng chưa bao
giờ ghi được gì.

---

### BUG-10 — `daily_logs`: truy vấn hỏng bị đọc thành "chưa có dòng nào"

| | |
|---|---|
| **AREA** | sync → `daily_logs` · `use-health-sync.ts:196-206` |
| **SEVERITY** | P1 — mất dữ liệu, im lặng, kèm báo thành công |
| **STATUS** | ĐÃ SỬA |

**TRIGGER** Bất kỳ lần đồng bộ nào mà `select` của `daily_logs` hỏng — mạng
chập, timeout, RLS từ chối — hoặc hai lượt đồng bộ chạy chồng nhau.

**EXPECTED** Ba trường hợp, ba hành vi:
`A` truy vấn xong, không có dòng → insert.
`B` truy vấn xong, có dòng → update.
`C` truy vấn **hỏng** → không được coi là A.

**ACTUAL** C bị coi là A. `error` bị destructure bỏ đi, `existing` thành
`undefined`, nhánh insert chạy vào bảng có `UNIQUE (user_id, date)`, bị từ chối
— và lệnh insert đó **cũng** không đọc error. Bước chân của ngày hôm đó biến
mất, lượt đồng bộ báo thành công.

**ROOT CAUSE** Bốn lỗi trong tám dòng:
1. `{ data: existing }` — error bị bỏ;
2. cả `update` lẫn `insert` đều không đọc error;
3. read-then-write là một cuộc đua với chính nó — có **ba** mutation đồng bộ
   cùng sống, hai lượt cùng select, cùng không thấy gì, cùng insert;
4. `update(...).eq('id', existing.id)` gọi tên một dòng bằng id đọc từ một vòng
   trước.

**FIX** Một `upsert` trên khoá tự nhiên. Không đọc trước, không id, không cửa
sổ giữa hai lệnh, và xung đột do database xử lý. `upsert` chỉ ghi các cột có
trong payload nên luật "một cột một người ghi" (`recomputeDailyLog` giữ danh
sách riêng) không đổi.

**VERIFICATION** `tools/health-sync.mjs` luật 2 + 3. Trả lại hình dạng cũ → đỏ
5 dòng.

**REGRESSION RISK** `write-confirmed.mjs` có một mục EXEMPT cho
`use-health-sync.ts:daily_logs:update`; nó thành mục chết và **bộ kiểm tự bắt
được** ngay lượt chạy đầu. Đã gỡ, kèm ghi chú vì sao rủi ro cũng đi theo.

---

### BUG-11 — Số đo sinh trắc mang giờ ĐỒNG BỘ, không phải giờ đo

| | |
|---|---|
| **AREA** | HealthKit → `biometric_samples` → readiness · `health.ts:getLatestBiometrics` |
| **SEVERITY** | P1 — dữ liệu cũ được chấm như dữ liệu hôm nay |
| **STATUS** | ĐÃ SỬA |

**TRIGGER** Đồng bộ vào một ngày mà đồng hồ chưa ghi số đo mới.

**EXPECTED** Nhịp tim nghỉ đồng hồ tính hôm thứ Ba là số đo của **thứ Ba**.

**ACTUAL** `date_time: new Date().toISOString()` — giờ của lần đồng bộ. Cửa sổ
truy vấn rộng **7 ngày**, nên số đo thứ Ba đồng bộ chiều thứ Sáu được ghi là số
đo chiều thứ Sáu.

**ROOT CAUSE** `latestQuantity` trả về `samples[0]?.quantity` và vứt phần còn
lại của mẫu đi. `BaseSample` mang sẵn `startDate` và `uuid`; không phải suy ra,
chỉ cần giữ lại.

**AFFECTED MODULES** `daily-log-service` chọn số đo của hôm nay bằng
`localDayRangeISO` rồi lấy cái mới nhất → số đo cũ được chấm như hôm nay; nhịp
tim nghỉ chiếm **0.20** điểm sẵn sàng, **0.25** khi thiếu HRV. Và
`hrv_history_28d` / `rhr_history_28d` — đường cơ sở z-score của hai số hạng lớn
nhất — có mọi điểm nằm ở giờ đồng bộ chứ không phải giờ đo.

**FIX** `latestQuantity` trả `{ value, at, uuid }`. Dòng được đóng dấu bằng mẫu
**mới nhất** trong các mẫu góp mặt: đó là thời điểm sau nó không còn gì mới
trong dòng, tức đúng câu hỏi `daily-log-service` đang hỏi.

**VERIFICATION** `tools/health-sync.mjs` luật 4.

---

### BUG-12 — Mỗi lần app lên foreground lại chèn thêm một bản sao cùng hai con số

| | |
|---|---|
| **AREA** | `biometric_samples` → readiness baseline |
| **SEVERITY** | P1 — làm hỏng đường cơ sở của số hạng lớn nhất; tăng vô hạn |
| **STATUS** | ĐÃ SỬA |

**TRIGGER** Dùng app bình thường. `useAutoHealthSync` chạy mỗi lần vào
foreground, tiết lưu 15 phút.

**EXPECTED** Một số đo, một dòng.

**ACTUAL** Apple tính nhịp tim nghỉ **một lần mỗi ngày** và HRV SDNN vài lần.
Lệnh ghi là `.insert()` trần, không danh tính, không kiểm trùng. Một ngày cầm
điện thoại lên vài chục lần là vài chục dòng chở đúng hai con số ấy.

**ROOT CAUSE** `20260809120000_health_provenance.sql` cấp `external_id` cho
`sleep_logs` và `workout_sessions` — hai trong **ba** bảng mà cùng lượt đồng bộ
này ghi vào. Bảng thứ ba bị bỏ quên.

**AFFECTED MODULES** Không phải chuyện dung lượng. `daily-log-service` dựng
`hrv_history_28d` từ mọi dòng trong cửa sổ, `readiness-engine` chấm hôm nay
bằng robust z-score trên nền đó, trọng số 0.30. Một nền gồm phần lớn là **một
giá trị lặp lại** có độ lệch tuyệt đối trung vị gần bằng 0 — và MAD là **số
chia**: nó biến dao động thường ngày thành z-score cực đoan.

**Liên quan tới `SO-GHI-LOI.md` B4** (*"hrv_history_28d không gộp theo ngày"*,
xếp là chưa chứng minh được). B4 nói về **người dùng** log nhiều mẫu một ngày —
đó vẫn là một lựa chọn thiết kế. Mục này khác hẳn: **app tự chèn** bản sao của
cùng một số đo, không ai chọn thế cả. Sửa mục này không giải quyết B4, và B4 vẫn
ở nguyên chỗ cũ.

**FIX** Migration thêm `external_id` + `UNIQUE (user_id, external_id)` cho
`biometric_samples`; `getLatestBiometrics` đặt `hk:<uuid của mẫu mới nhất>`;
lệnh ghi thành `upsert`. Đồng bộ không thấy gì mới → cập nhật đúng dòng đã ghi.
Một chỉ số đổi → mẫu mới nhất đổi → id đổi → dòng **mới**, không đè lên dòng cũ.

**VERIFICATION** Chạy thật trên PostgreSQL 16.13 dựng từ mọi migration: gửi cùng
một câu lệnh hai lần → `bio_apple = 1`; hai dòng `manual` (external_id NULL) →
giữ cả hai. `tools/health-sync.mjs` luật 4 giữ phía code.

---

### BUG-13 — Sáu trên bảy lệnh ghi trong lượt đồng bộ không có ai nghe

| | |
|---|---|
| **AREA** | `use-health-sync.ts` toàn bộ `mutationFn` |
| **SEVERITY** | P1 — partial success được báo là full success |
| **STATUS** | ĐÃ SỬA |

**ACTUAL** Chỉ `biometric_samples.insert` đọc `error`. `sleep_logs.select`,
`sleep_logs.upsert`, `workout_sessions.upsert`, `daily_logs.select`,
`daily_logs.update`, `daily_logs.insert` — không cái nào. Lượt chạy đi tiếp tới
`onSuccess`, rung một cái, hiện *"Đã đồng bộ"*.

**Và nó không thử lại.** `useAutoHealthSync` đóng dấu `LAST_SYNC_KEY` **trước**
khi chạy (có chủ ý, để một lần hỏng không retry mỗi lần foreground) — nên một
lượt hỏng-trong-im-lặng cũng giữ nguyên khoảng 15 phút, y như một lượt thành
công.

Đây là thứ đã giấu BUG-09 suốt từ đầu. Một lượt đồng bộ không thể hỏng là một
lượt đồng bộ không đáng tin khi nó nói là đã xong.

**FIX** Mọi lệnh ghi và mọi select hứng `error` và ném. Ba trạng thái tách bạch
trở lại: xong hẳn / hỏng / không có gì để ghi.

**VERIFICATION** `tools/health-sync.mjs` luật 2, quét chính file này (bên ngoài
tầm của `write-confirmed.mjs` — vốn chỉ nhìn update/delete — và của
`empty-vs-failed.mjs` — vốn chỉ nhìn queryFn).

---

### BUG-14 — `maybeSingle()` coi "khớp NHIỀU HƠN MỘT" là "không có dòng nào"

| | |
|---|---|
| **AREA** | sync → `sleep_logs` · `use-health-sync.ts:122` |
| **SEVERITY** | P2 |
| **STATUS** | ĐÃ SỬA |

**TRIGGER** Người dùng đã tự ghi **hai** giấc ngủ (ví dụ hai giấc trưa) trong
cửa sổ ±12 giờ quanh giờ đi ngủ mà đồng hồ báo.

**EXPECTED** "Đêm này đã có người ghi tay" → để yên.

**ACTUAL** `maybeSingle()` báo lỗi khi khớp nhiều hơn một dòng; lỗi bị bỏ,
`manual` thành nullish, và đêm của đồng hồ được ghi **đè lên trên**. Hai dòng
cho một đêm: `daily-log-service` lấy `waketime` mới nhất làm *đêm qua*, còn
`sleepDebt7d` chia trung bình trên một số dòng vừa mọc thêm phần tử ma — sai số
đi suốt một tuần, ở số hạng chiếm 0.30 điểm sẵn sàng.

**ROOT CAUSE** `maybeSingle()` có **ba** đường ra cùng trông như "không có
dòng": không khớp gì, truy vấn hỏng, khớp nhiều hơn một. Chỉ đường đầu là giấy
phép để ghi.

**FIX** `.limit(1)` + đọc `error` + kiểm `length === 0`.

**VERIFICATION** `tools/health-sync.mjs` luật 3 cấm `maybeSingle()` trong file
này.

---

### BUG-15 — Hai lối vào không có chốt, nên một lượt đồng bộ thành hai

| | |
|---|---|
| **AREA** | `activity-rings.tsx`, `use-health-sync.ts:attempt` |
| **SEVERITY** | P2 |
| **STATUS** | ĐÃ SỬA |

**(a) Nút "Kết nối Health"** trên thẻ Activity rỗng: không `disabled`, không
spinner, không đổi nhãn. Và nó chỉ hiện ra cho người **chưa có dữ liệu sức khoẻ
nào** — tức lượt đồng bộ chậm nhất app từng chạy: sheet xin quyền, sáu truy vấn
HealthKit, tới năm lệnh ghi, rồi một lần dựng lại 11 truy vấn. Vài giây không có
gì nhúc nhích, trên đúng cái nút mà cả mục đích là làm cho có gì đó xảy ra.

**(b) `useAutoHealthSync.attempt()`** có ba `await` trước khi gọi `mutate()`, và
hai người gọi có thể bắn cách nhau một frame (effect lúc mount, và listener
AppState đăng ký trong chính effect đó — khởi động thẳng vào foreground chạy cả
hai). `isPending` chỉ đúng **sau** `mutate()`, còn dấu thời gian bền chỉ được
ghi ở bên kia các `await` — nên cả hai lượt đọc cùng một `last`, cùng lọt, cùng
chạy.

**FIX** (a) `connectPending` + spinner. (b) một cờ ở module scope, đặt trước
`await` đầu tiên và xoá trong `finally`.

**Ghi chú thẳng thắn:** sau BUG-09→13 thì hai lượt chạy chồng nhau đã **không
còn làm hỏng dữ liệu** — mọi lệnh ghi giờ đều idempotent. Sửa tiếp vì cái giá
còn lại là thật: hai lần xin quyền, mười hai truy vấn HealthKit và hai lần dựng
lại 11 truy vấn cho một kết quả.

---

### BUG-16 — Quest bước chân ẩn thêm một giờ sau lần kết nối Health đầu tiên

| | |
|---|---|
| **AREA** | sync → `useStepsAvailable` → `useDailyQuests` |
| **SEVERITY** | P3 |
| **STATUS** | ĐÃ SỬA |

`useStepsAvailable` trả lời *"đã từng có bước chân nào tới tài khoản này chưa"*
và được cache **một giờ**, đúng vì câu trả lời gần như không bao giờ đổi. Khoảnh
khắc nó **có** đổi là lượt đồng bộ đầu tiên ghi được bước chân — và không ai báo
cho nó. `onSuccess` invalidate `steps_history` mà không invalidate
`steps_available`.

Trong một giờ đó `useDailyQuests` vẫn loại quest bước chân: ngày kẹt ở 4/5, 10
xu và 12 XP không lấy được, và khoảnh khắc "xong hết" của Koa không bắn được —
đúng những thứ mà `useStepsAvailable` được viết ra để dẹp, quay lại trong đúng
một giờ của đúng cái ngày người ta vừa kết nối đồng hồ.

**FIX** Thêm một dòng invalidate. **VERIFICATION** `invalidate-keys.mjs` giữ
việc khoá đó trỏ đúng một truy vấn có thật.

---

## Chain B — đã chứng minh là lỗi, **CHƯA** sửa

### BUG-17 — `daily_logs.steps` của ngày đã qua là "số lúc mở app lần cuối", không phải tổng của ngày

| | |
|---|---|
| **SEVERITY** | P2 |
| **STATUS** | XÁC NHẬN — CHƯA SỬA (có chủ ý, xem dưới) |

**TRIGGER** 21:00 mở app lần cuối (9.000 bước) → đi bộ thêm → hôm sau 10:00 mới
mở lại.

**ACTUAL** `getTodaySteps()` chỉ hỏi **hôm nay** (`setHours(0,0,0,0)` → bây
giờ), nên hàng của hôm qua giữ 9.000 vĩnh viễn dù người ta đi 12.500. Không có
đường nào trong app quay lại hoàn tất một ngày đã đóng.

**AFFECTED** biểu đồ bước chân 14 ngày, thử thách tuần `steps_50k`, huy hiệu
`steps_10k`.

**Vì sao chưa sửa:** bản sửa đúng là backfill có giới hạn — khi ngày địa phương
đã đổi so với lần đồng bộ cuối thì hỏi thêm tổng của **hôm qua** — và nó cần một
hàm cửa sổ ngày mới trong `health.ts` cùng một quyết định về việc đi ngược bao
xa. Đó là năng lực mới, không phải một dòng sửa, và lô này đã có bảy mục. Không
gộp vào để tránh phá một lô đang xanh.

**Đây là mục đầu tiên của vòng sau.**

---

## Chain B — đã kiểm và **KHÔNG** phải lỗi

### N4. `recomputeDailyLog` chỉ chạy khi `bio || sleep || workouts` — không phải sót

`steps` / `active_kcal` / `active_minutes` không phải đầu vào của điểm sẵn sàng,
và `recomputeDailyLog` không ghi ba cột đó. Bỏ qua là đúng và tiết kiệm 11 truy
vấn.

### N5. `requestHealthPermissions()` trả `true` khi người dùng **từ chối** — không sửa được ở đây

Apple cố ý không trả lời câu "được đọc hay không" (`health.ts` đã ghi lý do:
nói "anh không được đọc" là làm lộ việc dữ liệu tồn tại). Nhánh sau đó đọc về
rỗng và ném *"No health data found"*, tức app đã phân biệt được
`permission denied` với `no data` **ở mức duy nhất iOS cho phép**. Không được
"sửa" bằng cách đoán.

### N6. `volume_load: 0` cho buổi tập nhập từ đồng hồ — cố ý

Đã kiểm ở `tools/user-state.mjs`: người chạy bộ không bao giờ bị chấm là chững
lại. ACWR là tổng khối lượng; bịa một con số cho buổi chạy sẽ làm hỏng đúng chỉ
số mà cả màn hình đó tồn tại để đáng tin.

### N7. `asPercent` cho SpO₂ — không phải bug, là guard có chủ ý

Quyết định đơn vị theo **giá trị** (0.7–1.0 là phân số, 70–100 là phần trăm; hai
dải không giao nhau). Đã có ghi chú giải thích vì sao không tin tài liệu
`HKUnit.percent()`.

---

## Cách dùng sổ này

- Sửa xong một mục → giữ nguyên nó ở đây kèm cách kiểm lại. Sổ này là **hồ sơ**,
  không phải danh sách việc.
- Mục ở phần "KHÔNG phải lỗi" tồn tại để chặn một bản sửa sai. Không xoá.
- Nghi một mục sai → chạy lại đúng lệnh trong ô **VERIFICATION** trước, rồi mới
  bàn.
