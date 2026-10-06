# Behavior: Workout & Rest Timer

Nguồn chân lý hành vi cho buổi tập và đồng hồ nghỉ. Rút từ baseline `fac9ac2`
(RN) — bản iOS native (issue #228) phải giữ đúng các luật này.

**Nguyên tắc:** đây là product requirement, tách khỏi implementation artifact.
Ví dụ: "±15s" là requirement; "bridge 7 tham số" là artifact của RN.

## 1. Rest timer

### Bắt đầu / kết thúc

- **RT-1:** Nghỉ chỉ bắt đầu khi tick ON một set có `restSecs > 0`.
- **RT-2:** Untick (bỏ chọn) không sinh nghỉ — nghỉ thuộc về việc hoàn thành
  một set, không thuộc về việc đổi ý.
- **RT-3:** `restSecs = 0` → không mở thẻ nghỉ.
- **RT-4:** Đồng hồ suy từ `endsAt` tuyệt đối (`ceil((endsAt-now)/1000)`), không
  đếm tick. Foreground lại thì tính lại.
- **RT-5:** Hết giờ → hiện tick "xong" đúng 1 giây rồi đóng. Nếu đã quá hạn
  khi app ở nền → đóng ngay, không hiện tick.
- **RT-6:** Khi nghỉ kết thúc: haptic success + kết thúc Live Activity — đúng
  một lần.

### Điều chỉnh ±15s

- **RT-7:** Cộng/trừ trên thời gian THỰC còn lại (suy từ `endsAt`, không dùng
  số đang render). Clamp `[1, 600]`. **Không thể kết thúc nghỉ bằng −15**
  (min là 1, không phải 0). Cộng thêm → `total` cũng tăng; trừ bớt → `total`
  giữ nguyên.
- **RT-8:** Chỉ nút "Bỏ qua" (quyết định chủ động) mới kết thúc nghỉ. **Chạm
  ra ngoài KHÔNG kết thúc** — một cử chỉ vô tình không được phép làm việc mà
  chỉ một quyết định mới được làm.

### Hiển thị

- **RT-9:** Số hiển thị bị đóng băng khi thẻ mờ dần — không bao giờ flash "0s".
- **RT-10:** 5 giây cuối vòng chuyển đỏ (trừ khi đang pause).
- **RT-11:** Vòng xả cạn (drain), không đổ đầy.
- **RT-12:** Khối "tiếp theo": tên bài + "set n/t". Vắng ở set cuối — không bịa.
- **RT-13:** Thẻ hiện khi và chỉ khi đang có nghỉ.
- **RT-15:** Nhãn: `<60s` → `"45s"`; `>=60s` → `"1:30"`; default rest 90s.
- **RT-16:** Rest từng hàng chỉnh được, clamp `[0, 600]`, step 15.

### Island pause

- **RT-14:** Intent pause từ Dynamic Island → đóng băng số còn lại. Trong app
  **không có nút resume** — resume chỉ từ Island. Unmount màn hình → kết thúc
  Live Activity (rest không sống lâu hơn màn hình).

## 2. Workout state

### Set

- **WS-1:** Một hàng = một set. Số set clamp 1..20. Hàng mới: `warmup: false`
  (template không mang warm-up).
- **WS-2:** Set "đếm" khi có reps (1..1000) hoặc hold (`"45s"`, 1..3600s).
  `"0"`, `"abc"`, `"8.5"`, `"-5"` → hàng chưa xong, bị loại.
- **WS-3:** Cân nặng là tuỳ chọn. Ô trống = bodyweight, đóng góp 0 vào volume —
  set vẫn được ghi.
- **WS-4:** Warm-up là toggle từng hàng, không lan sang hàng mới ("Add set"
  luôn tạo hàng `warmup: false`).
- **WS-14:** Không xoá được hàng cuối cùng.

### Volume & PR

- **WS-5:** Volume = Σ(kg × reps). **Warm-up bị loại** — vì volume nuôi load
  windows → readiness score.
- **WS-7:** Phát hiện PR đọc history TRƯỚC khi insert (nếu không session tự so
  với chính nó). Lỗi đọc history → buổi vẫn lưu, `pr_detected=false`.
- **WS-8:** Luật PR:
  - Warm-up không bao giờ được tính PR.
  - Kỷ lục cân: `w > topWeight + 0.05kg` (epsilon chống phantom do round-trip
    kg↔lb).
  - Kỷ lục reps: theo bucket cân 0.05kg; mức tạ chưa từng dùng → KHÔNG phải
    kỷ lục; `reps > prev` → kỷ lục.
  - Buổi đầu tiên của một bài → không kỷ lục.
  - Tối đa 1 kỷ lục/bài. Match bài theo tên chuẩn hoá, không theo id.

### Lưu trữ

- **WS-9:** Một đường ghi duy nhất (`useLogWorkoutSession`). Không có `date` →
  now; `date` khác hôm nay → stamp 12:00 trưa (tránh lệch ngày UTC/DST).
- **WS-10:** Offline → xếp hàng durable, toast "đã xếp hàng" (không nói "đã
  lưu"). Không claim PR khi offline.
- **WS-11:** Chốt buổi có latch chống double-submit; user đã bấm X trong lúc
  save → không pop nhầm màn hình.
- **WS-6:** Guard biên hợp lý chỉ kiểm hàng sẽ ghi; hàng trống không khoá nút.
- **WS-12:** Đánh số set reset theo từng bài.
- **WS-13:** Gõ tay tên bài xoá exerciseId đã pick.
- **WS-15:** Chip plan hôm nay là "đề xuất, không áp đặt" — một tap điền form,
  biến mất sau khi dùng.

## 3. RPE

- **RPE-1:** Buổi: chip 6–10, bấm là chọn. Default 7.
- **RPE-2:** Builder (per-exercise): stepper 5–10, default 7.
- **RPE-3:** `session_rpe` = RPE buổi; per-set rpe chỉ ghi khi 1..10.
- **RPE-4:** Tóm tắt effort của template là khoảng `[min,max]`, không phải
  trung bình.

## 4. "Lần trước"

- **LT-1:** Nguồn: 14 ngày sessions gần nhất.
- **LT-2:** Khớp bài theo tên chuẩn hoá.
- **LT-3:** Warm-up bị loại trước khi tính. Bài chỉ có warm-up → không có
  performance.
- **LT-4:** "Lần trước" = session gần nhất có bài đó. Hiện một lần mỗi bài,
  ở hàng bắt đầu bài.
- **LT-5:** Ngày session tính theo lịch địa phương.
- **LT-6:** Hold được tính là set có làm (0 volume nhưng tăng setCount).

## Mơ hồ đã biết (mở issue needs-clarification, không đoán)

1. **WS-5:** hold `"45s"` làm volume hiển thị thành `NaN` → hiện "—".
2. **WS-10:** đường offline đánh rơi flag `warmup`.
3. **WS-12:** hàng tên trống liên tiếp gom thành một bài.
4. **RPE-1:** issue #221 yêu cầu "bấm lại bỏ chọn" — giá trị khi bỏ chọn chưa
   quyết định.
