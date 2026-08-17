# Sổ audit pháp y

Sổ này khác `SO-GHI-LOI.md`. Sổ kia ghi những thứ **chưa** chứng minh được và vì
thế cấm đụng vào. Sổ này ghi những thứ **đã** chứng minh được — mỗi mục có
nguyên nhân gốc, bản sửa tối thiểu, và một phép kiểm tự động đã được chạy thử
trên cả bản hỏng lẫn bản sửa.

**Luật của sổ:** không mục nào được ghi vào đây vì "code có thể tốt hơn". Mỗi
mục phải nói được: gõ gì thì hỏng, đáng lẽ ra sao, thực tế ra sao.

Bộ kiểm: `node tools/check.mjs` (91 bước). Ngày rà: 2026-08-17.

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

## Cách dùng sổ này

- Sửa xong một mục → giữ nguyên nó ở đây kèm cách kiểm lại. Sổ này là **hồ sơ**,
  không phải danh sách việc.
- Mục ở phần "KHÔNG phải lỗi" tồn tại để chặn một bản sửa sai. Không xoá.
- Nghi một mục sai → chạy lại đúng lệnh trong ô **VERIFICATION** trước, rồi mới
  bàn.
