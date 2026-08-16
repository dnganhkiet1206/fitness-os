# Koa — lớp trí tuệ của nhân vật đồng hành

Tài liệu này mô tả **những gì đang có trong code**, kể cả những chỗ chưa làm.
Chỗ nào chưa làm được ghi rõ ở mục [Giới hạn đã biết](#giới-hạn-đã-biết).

---

## 1. Luồng dữ liệu

```
việc người dùng làm            đã đọc được sẵn trong cache
(ghi bữa ăn, buổi tập,          (daily_logs, streak, acwr)
 huy hiệu, lên cấp,                       │
 chạm vào Koa)                            ▼
        │                        lib/user-state.ts
        │                      "đợt này là đợt thế nào"
        │                    situation + confidence
        ▼                                 │
  lib/koa-event.ts  ──────────────────────┤
  sự kiện + magnitude                     │
        │                                 ▼
        │                      hooks/use-koa-context.ts
        │                     giờ · chuỗi · trống? · nhìn? · state
        ▼                                 │
        └──────────► lib/koa-decide.ts ◄──┘
                     một hàm thuần, không state
                                │
                                ▼
                   shouldReact · emotion · intensity
                   gaze · hold · say · because
                                │
                                ▼
                        lib/koa-stage.ts
              dedup · va chạm · holdEmotion · tự dọn
                                │
                                ▼
            lib/koa-idle.ts  →  lib/koa-emotion.ts
            nhịp thở, độ tỉnh     biểu cảm + tư thế
```

Nguyên tắc xuyên suốt: **nhận thức của nhân vật không được tốn thêm truy vấn
nào.** `use-koa-context` và `use-user-state` đọc **cache** của React Query và
không đăng ký observer nào. Đây không phải sở thích — đã từng có bản gọi thẳng
`useDailyStreak()`, và mở màn Huy hiệu là bắn sáu truy vấn mà màn đó không dùng,
chỉ để một con koala biết chuỗi ngày phòng khi có huy hiệu rơi xuống.

Danh sách ngày cho `user-state` **đi ké** truy vấn streak vốn đã đọc tới 400 dòng
rồi vứt đi (`StreakState.loggedDates`).

---

## 2. `lib/user-state.ts` — lớp mới

Trả lời **"đợt này là đợt thế nào"**, không bao giờ trả lời "họ đã bỏ bê cái gì".

| situation | nghĩa | dựa trên |
|---|---|---|
| `settling_in` | chưa đủ lịch sử để có "bình thường của chính họ" | `< MIN_HISTORY_DAYS` (14) |
| `steady` | đang đúng nhịp của chính họ | mặc định |
| `slipping` | thấp hơn nền của **chính họ**, và không phải vì lỡ một ngày | `recent < baseline × 0.6` |
| `returning` | vừa quay lại sau một đợt vắng thật | vắng ≥ 3 ngày, ghi lại trong 2 ngày qua |
| `overreaching` | tải tập chạy trước xa thói quen | `acwr ≥ 1.5` |
| `stalled` | vẫn đi tập, mà các con số đứng yên | ≥ 8 buổi **có tạ** / 56 ngày, không PR, khối lượng không nhích |

### `stalled` cần HAI tín hiệu, và chỉ đếm buổi có tạ

Chỉ "không có PR" là tín hiệu tồi và càng tệ khi người ta càng khoẻ: PR thưa dần
một cách tự nhiên, nên một mình nó sẽ chấm mọi người tập lâu năm là chững. Chỉ
"khối lượng phẳng" cũng tồi: người cố ý tập ít set nặng hơn di chuyển ít tổng tạ
hơn mà vẫn mạnh lên. Hai tín hiệu cùng chiều qua 8 tuần vẫn đi tập thì mới nói.

`use-health-sync` **cố ý** ghi `volume_load: 0` cho buổi nhập từ đồng hồ — chạy
bộ không có tổng tạ. Không lọc thì mọi người chạy bộ đều bị chấm là chững; đó
không phải plateau, đó là lỗi đơn vị.

Và nó xếp **dưới** `slipping`: chững lại là chuyện của người **vẫn đang tập**.
Nói với người vừa tập ít hẳn đi rằng công sức của họ không có kết quả là nói sai
vào đúng lúc tệ nhất.

### Ba chốt chặn, và đó mới là phần việc thật

1. **Lỡ một ngày không phải một xu hướng.** `DROP_FRACTION = 0.4` được đặt từ ca
   nó phải sống sót: tuần hoàn hảo lỡ một ngày còn 6/7 (85.7%), lỡ hai ngày còn
   5/7 (71.4%) — cả hai phải im lặng.
2. **Phải có nền đã.** Dưới 14 ngày thì `confidence: 'none'` và **mọi** nhánh
   phía sau phải cư xử đúng như với người lạ.
3. **Đo với chính họ, không đo với ai.** Không có một ngưỡng tuyệt đối nào trong
   file. Bản đầu tiên tôi viết có (`baseline - 0.25`) và `tools/user-state.mjs`
   bắt được ngay: người tập 2 buổi/tuần có thể **ngừng hẳn** một tuần mà vẫn
   được chấm là bình thường, vì một phần tư của thang "mỗi ngày" là gần hết cả
   nhịp sống của họ.

`MIN_BASELINE = 1/7` không phải mức nghiêm khắc để chỉnh — nó là số học: không
thể phát hiện sụt giảm ở một tần suất vốn dưới một lần mỗi tuần.

### Cơ sở của thiết kế

Cơ chế chuỗi ngày và nhân vật tỏ ra thất vọng hoạt động qua **introjected
regulation** — áp lực người ta tự đặt lên mình bằng cảm giác tội lỗi. Nó mua
được sự tuân thủ ngắn hạn và dự báo **kém hơn** động lực tự chủ về việc duy trì
lâu dài; ảnh hưởng của cảm xúc tiêu cực lên việc tiếp tục hành vi bị điều tiết
bởi **self-compassion**, thứ mà một app không thể cung cấp bằng cách trông buồn
bã. Đó là lý do file này mô tả *hoàn cảnh* chứ không phân loại *con người*, và
không có `lazy` trong bảng.

---

## 3. Mascot phản ứng với những gì

### Sự kiện (`lib/koa-event.ts` → `lib/koa-decide.ts`)

| loại | ai bắn | phản ứng |
|---|---|---|
| `day_complete` | `use-quest-autoclaim` | `celebrate`, có lời |
| `personal_record` | `use-extras`, `log-workout` | `proud`, nhìn vào **con số** trước rồi mới nhìn người |
| `award_earned` | `use-extras` | `celebrate`/`proud` theo hạng |
| `level_up` | `use-quest-autoclaim` | theo độ lớn |
| `comeback` | `use-streak-guard` | `happy` — **không** phải pháo hoa |
| `streak_saved` | `use-streak-guard` | `rested` |
| `koa_greeted` | `components/ascnd/mascot.tsx` | xem dưới |
| `quest_done` | *(miễn)* | đã có peek trên thẻ |
| `streak_at_risk` | *(miễn)* | mặt lo do `baseEmotion` giữ suốt buổi tối |

Hai mục "miễn" nằm trong `KIND_EXEMPT` của `tools/koa-decide.mjs` **kèm lý do**.
Thêm loại thứ mười mà quên nối là hỏng bước kiểm tra — đúng hình dạng lỗi mà
`koa_greeted` đã mắc: có nhánh quyết định đầy đủ, không ai bắn, cú chạm vào Koa
chạy hoạt ảnh cố định suốt.

### Lời chào khi chạm vào Koa

Đây là tương tác **duy nhất người dùng chủ động bắt đầu**, nên là chỗ duy nhất
nhân vật có thể đáp lại *họ* thay vì đáp lại điểm số.

| bối cảnh | phản ứng | vì sao |
|---|---|---|
| 22h–6h | `sleep`, khẽ | nhân vật bật dậy lúc 2h sáng là nhân vật không có trạng thái |
| `returning` (đủ tin cậy) | `happy` + lời đón | khoảnh khắc mong manh nhất trong cả sản phẩm |
| `overreaching` | `idle`, **không lời** | một cú nhảy hớn hở ở đây là lời chào duy nhất có thể đẩy người ta tới chấn thương |
| `slipping` · `stalled` | **y hệt người bình thường** | đổi sắc mặt vì tuần của bạn khó khăn, hay vì mức tạ một tháng nay không nhích, là bình phẩm về nó |
| `confidence: 'none'` | y hệt người lạ | chưa đủ dữ liệu thì không được đoán |

Dedup theo `greet:<ngày>` — "lần đầu chào hôm nay". Mọi cú chạm sau vẫn có cú
nhảy và vẫn mở phòng: cú nhảy là sự xác nhận rằng một cú chạm đã tới nơi, và
thứ đó không phải để hạn chế.

---

## 4. Khuôn mặt được giữ (`baseEmotion`)

Thứ tự: đang ghi buổi tập → sinh nhật → đêm khuya → **chuỗi đang lâm nguy** →
lạnh → mirror ngày hôm nay.

**Chuỗi ngày không còn chấm điểm sắc mặt.** Bản cũ đọc
`mood === 'tired' ? (streak === 0 ? 'sad' : 'tired')`, mà `useMascotMood` trả
`tired` cho một ngày *mới chỉ trống* (qua trưa chưa ăn, qua 18h chưa tập). Nên
người cài app sáng nay, mở lúc 18h30, gặp một hình vẽ ở `floatPt: 0,
droopDeg: 10` — gục xuống, bất động, rõ ràng là buồn, trước khi họ làm bất cứ
điều gì. Và chính chuỗi ngày là số hạng quyết định điều đó, tức nhân vật buồn
hơn với **người có ít thứ để mất hơn**.

`worry` là trạng thái duy nhất được phép trông lo lắng, và nó có ba khoá: chuỗi
đã đủ dài để app từng gọi là thành tựu (≥ 3 ngày), hôm nay **thật sự** trống chứ
không phải chưa đọc được, và **buổi tối của chính người đó** đang cạn
(`user-rhythm`, không phải một con số gõ cứng). Hỏi khi vẫn còn kịp trả lời là
việc khác hẳn với tỏ ra thất vọng sau đó.

---

## 5. Điều chỉnh độ khó buổi tập

`lib/load-progression.ts` — autoregulation theo RPE. App đã lưu **cả hai vế** từ
lâu mà chưa bao giờ đặt cạnh nhau: mức gắng sức mẫu tập *kê ra* (`rpe`,
`effortRange`) và mức người ta *báo lại* (`session_rpe`, thang 6–10).

Đây là **gợi ý, không bao giờ là thay đổi.** Không dòng nào ghi vào mẫu tập.
Hiển thị ở `log-workout` ngay trên hàng chọn RPE — đúng lúc người ta sắp quyết
định để bao nhiêu ký lên thanh đòn.

**Guardrails, và đó mới là phần việc:**

- dưới **3 buổi** cùng mẫu tập thì không kết luận gì. Một buổi nặng bất thường
  có thể là một đêm mất ngủ, một ca làm dài, một bữa ăn nặng trước đó;
- lệch phải từ **1 điểm** RPE trở lên — thang này tự báo bằng số nguyên, dưới
  một điểm là đọc nhiễu;
- **không bao giờ đề xuất tăng** khi `overreaching`, khi `returning`, hay khi
  điểm sẵn sàng đỏ. Thấy nhẹ *không* phải bằng chứng phản bác một đợt tăng tải —
  nó thường là cảm giác của đợt tăng tải lúc đang đi vào;
- nhưng **không cổng nào được bịt lời khuyên GIẢM**. Đây là kiểu hỏng dễ xảy ra
  nhất: ai đó thêm một cổng chặn cho nhánh tăng rồi áp cho cả khối. `tools/load-progression.mjs`
  quét 120 tổ hợp cho riêng bất biến này;
- bước nhảy là **tỉ lệ**, chặn ở 10% — bài học `DROP_FRACTION` của vòng trước:
  một bước tuyệt đối thì nghiêm khắc với người đẩy 30 kg và vô nghĩa với người
  gánh 140.

## 6. Cá nhân hoá đang có

- `lib/personal-model.ts` — Beta bandit trên 5 thói quen + đồng hồ sinh hoạt
  vòng tròn, lưu trên **máy** (AsyncStorage), tự quên dần (halving quá `CAP`).
- `lib/user-rhythm.ts` — giờ người này thật sự làm từng việc; **từ chối kết
  luận** dưới 6 quan sát hoặc dưới 0.6 đồng thuận.
- `lib/mascot-budget.ts` — hạn ngạch xuất hiện: cooldown + trần ngày.
- `lib/user-state.ts` — mới, mô tả ở trên.

---

## 7. Kiểm tra

| bước | kiểm cái gì |
|---|---|
| `tools/user-state.mjs` | 25 ca có đáp án cụ thể + quét 0–120 ngày × 4 nhịp |
| `tools/load-progression.mjs` | 12 ca + quét 120 tổ hợp cho hai bất biến trái chiều |
| `tools/challenge-reward.mjs` | chạy thật một tuần lượt focus, đếm số lần ăn mừng |
| `tools/entry-points.mjs` | mọi màn có lối vào; lối vào không-điều-kiện được kiểm tận nơi |
| `tools/write-day.mjs` | lệnh ghi đọc ngày lúc chạy, không phải lúc render |
| `tools/write-confirmed.mjs` | mọi update/delete xác nhận có dòng bị chạm |
| `tools/focus-effects.mjs` | không useFocusEffect nào phụ thuộc hàm đổi danh tính mỗi render |
| `tools/koa-decide.mjs` | thứ tự cường độ, va chạm, lời chào theo bối cảnh, chuỗi-không-chấm-mặt, mọi loại sự kiện đều có người bắn |
| `tools/personal-record.mjs` | emitter được **quét ra** chứ không phải danh sách gõ tay |
| `tools/koa-breath.mjs` | nhịp thở đo thật trong trình duyệt |
| `tools/mascot-face.mjs` | không hai biểu cảm nào trùng bộ lớp |
| `tools/live.mjs` | 25 màn × 3 trạng thái, không màn trắng |

Mọi luật mới đều được **phá thử trên bản đã ship** và phải đỏ.

---

## Giới hạn đã biết

1. **`stalled` không phân biệt được plateau với deload có chủ ý.** Người đang cố
   ý giảm tải một chu kỳ sẽ được đọc là chững. Nó chỉ ảnh hưởng tới giọng của
   nhân vật chứ không phải một chẩn đoán, nhưng đây là giới hạn thật và app chưa
   có chỗ nào để nói "tôi đang deload".
2. **Điều chỉnh độ khó chỉ đọc `session_rpe` của cả buổi**, không đọc RPE từng
   set (`rpe` per set tồn tại nhưng chỉ được ghi ở bảng ngày trong tuần). Nên nó
   nói được "buổi này nặng hơn mức đặt" chứ chưa nói được "bài nào nặng".
3. **Ghép buổi với mẫu tập bằng TÊN**, vì `workout_sessions` lưu `template_name`
   chứ không lưu id. Đổi tên mẫu tập là mất lịch sử so sánh của nó.
4. **`emotion: 'sad'` giờ không còn đường tới từ trạng thái thật.** Nó vẫn nằm
   trong bảng biểu cảm và `DEV_EMOTIONS` để thử hoạt ảnh. Đây là lựa chọn có ý
   thức, không phải sót.
5. **Chạm vào Koa giữa lúc đang có phản ứng lớn hơn** thì lời chào bị bỏ và
   đánh dấu đã xử lý — tức hôm đó không còn lời chào. Đây là hệ quả của luật
   "cái lớn giành sân, cái nhỏ bị bỏ chứ không xếp hàng" áp cho mọi sự kiện, chứ
   không phải một nhánh riêng bị quên.
6. **`useUserState` đọc cache và không đăng ký observer**, nên khi streak được
   fetch lại, component không tự render lại vì lý do đó. Đây là đúng thiết kế đã
   ghi ở `use-koa-context`, và cái giá là trạng thái có thể trễ một lần render.
