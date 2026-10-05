# QA Matrix — Native Rewrite

Bảng cho biết **chính xác còn thiếu gì**. Mỗi luật một dòng.

**Quy ước cột:**
- **RN:** ✅ = có trong baseline `fac9ac2` (kèm file:dòng). 🔲 = chưa có.
- **Swift:** số PR đã cài (✅ = đã merge, 🔲 = PR mở/chưa có).
- **Vector:** tệp trong `spec/vectors` + rule ID.
- **Automated test:** tên test cụ thể.
- **iPhone:** ✅ chỉ khi **Kiệt** báo. Agent không tự điền.

## Rest timer

| Feature | Behavior | Rule ID | RN | Swift | Vector | Automated test | iPhone | Owner |
|---|---|---|---|---|---|---|---|---|
| Rest ±15 | kẹp [1,600], tính từ endsAt | RT-7 | ✅ day-plan.tsx:424 | 🔲 #238 mở | ✅ sync? không — rest-timer.json RT-7 | run.mjs RT-7 | 🔲 | A/B |
| Rest bắt đầu | tick ON set có restSecs>0 | RT-1 | ✅ day-plan.tsx:1139 | 🔲 #238 mở | 🔲 | 🔲 | 🔲 | B |
| Rest untick | bỏ chọn không sinh nghỉ | RT-2 | ✅ day-plan.tsx:1142 | 🔲 #238 mở | 🔲 | 🔲 | 🔲 | B |
| Rest 0s | không mở thẻ | RT-3 | ✅ day-plan.tsx:1139 | 🔲 #238 mở | 🔲 | 🔲 | 🔲 | B |
| Đồng hồ | suy từ endsAt tuyệt đối | RT-4 | ✅ day-plan.tsx:195 | 🔲 #238 mở | 🔲 | 🔲 | 🔲 | B |
| Hết giờ | tick "xong" 1s rồi đóng | RT-5 | ✅ day-plan.tsx:203 | 🔲 #238 mở | 🔲 | 🔲 | 🔲 | B |
| Kết thúc | haptic + end Live Activity 1 lần | RT-6 | ✅ day-plan.tsx:221 | 🔲 #238 mở | 🔲 | 🔲 | 🔲 | B |
| Bỏ qua | chỉ nút Bỏ qua, không chạm ngoài | RT-8 | ✅ day-plan.tsx:405 | 🔲 #238 mở | 🔲 | 🔲 | 🔲 | B |
| Số đóng băng | không flash 0s khi fade | RT-9 | ✅ rest-timer.tsx:132 | 🔲 #238 mở | 🔲 | 🔲 | 🔲 | B |
| Vòng đỏ 5s | trừ khi pause | RT-10 | ✅ rest-timer.tsx:90 | 🔲 #238 mở | ✅ rest-timer.json RT-10 | run.mjs RT-10 | 🔲 | B |
| Vòng xả cạn | drain không fill | RT-11 | ✅ rest-timer.tsx:141 | 🔲 #238 mở | 🔲 | 🔲 | 🔲 | B |
| Khối tiếp theo | tên + set n/t, vắng ở cuối | RT-12 | ✅ rest-timer.tsx:255 | 🔲 #238 mở | 🔲 | 🔲 | 🔲 | B |
| Thẻ hiện | khi và chỉ khi left!==null | RT-13 | ✅ rest-timer.tsx:185 | 🔲 #238 mở | 🔲 | 🔲 | 🔲 | B |
| Island pause | đóng băng, resume chỉ từ Island | RT-14 | ✅ day-plan.tsx:293 | 🔲 #251 mở | 🔲 | 🔲 | 🔲 | B |
| Nhãn nghỉ | 45s / 1:30 / 0s | RT-15 | ✅ prescription.ts:36 | 🔲 #238 mở | ✅ rest-timer.json RT-15 | run.mjs RT-15 | 🔲 | B |
| Rest từng hàng | clamp [0,600] step 15 | RT-16 | ✅ day-plan.tsx:1252 | 🔲 #238 mở | ✅ rest-timer.json RT-16 | run.mjs RT-16 | 🔲 | B |

## Workout state

| Feature | Behavior | Rule ID | RN | Swift | Vector | Automated test | iPhone | Owner |
|---|---|---|---|---|---|---|---|---|
| Set | 1 hàng = 1 set, clamp 1..20 | WS-1 | ✅ log-workout.tsx:96 | 🔲 #244 mở | 🔲 | 🔲 | 🔲 | B |
| Set đếm | reps 1..1000 hoặc hold 45s | WS-2 | ✅ rep-entry.ts:51 | 🔲 #244 mở | ✅ workout-state.json WS-2 | run.mjs WS-2 | 🔲 | B |
| Cân nặng | tuỳ chọn, trống = bodyweight | WS-3 | ✅ log-workout.tsx:425 | 🔲 #244 mở | 🔲 | 🔲 | 🔲 | B |
| Warm-up | toggle từng hàng, không lan | WS-4 | ✅ log-workout.tsx:380 | 🔲 #244 mở | 🔲 | 🔲 | 🔲 | B |
| Volume | Σ(kg×reps), loại warm-up | WS-5 | ✅ use-fitness-data.ts:421 | 🔲 #244 mở | ✅ workout-state.json WS-5 | run.mjs WS-5 | 🔲 | B |
| Guard biên | chỉ kiểm hàng sẽ ghi | WS-6 | ✅ log-workout.tsx:466 | 🔲 #244 mở | 🔲 | 🔲 | 🔲 | B |
| PR | đọc history trước insert | WS-7 | ✅ use-fitness-data.ts:352 | 🔲 #244 mở | 🔲 | 🔲 | 🔲 | B |
| Luật PR | epsilon 0.05kg, bucket, warm-up loại | WS-8 | ✅ personal-record.ts:139 | 🔲 #244 mở | ✅ workout-state.json WS-8 | run.mjs WS-8 | 🔲 | B |
| Ghi buổi | một đường duy nhất | WS-9 | ✅ use-fitness-data.ts:308 | 🔲 #244 mở | 🔲 | 🔲 | 🔲 | A/B |
| Offline | xếp hàng, không claim PR | WS-10 | ✅ log-workout.tsx:611 | 🔲 #242 mở | 🔲 | 🔲 | 🔲 | A |
| Chốt buổi | latch chống double-submit | WS-11 | ✅ log-workout.tsx:601 | 🔲 #244 mở | 🔲 | 🔲 | 🔲 | B |
| Đánh số set | reset theo bài | WS-12 | ✅ log-workout.tsx:463 | 🔲 #244 mở | 🔲 | 🔲 | 🔲 | B |
| Tên bài tay | xoá exerciseId | WS-13 | ✅ log-workout.tsx:378 | 🔲 #244 mở | 🔲 | 🔲 | 🔲 | B |
| Xoá hàng | không xoá hàng cuối | WS-14 | ✅ log-workout.tsx:430 | 🔲 #244 mở | 🔲 | 🔲 | 🔲 | B |
| Chip plan | đề xuất không áp đặt | WS-15 | ✅ log-workout.tsx:161 | 🔲 #244 mở | 🔲 | 🔲 | 🔲 | B |

## RPE

| Feature | Behavior | Rule ID | RN | Swift | Vector | Automated test | iPhone | Owner |
|---|---|---|---|---|---|---|---|---|
| RPE buổi | chip 6–10, default 7 | RPE-1 | ✅ log-workout.tsx:70 | 🔲 #244 mở | 🔲 | 🔲 | 🔲 | B |
| RPE builder | stepper 5–10 | RPE-2 | ✅ workout-set-sheet.tsx:185 | 🔲 #244 mở | 🔲 | 🔲 | 🔲 | B |
| Ghi RPE | session_rpe + per-set 1..10 | RPE-3 | ✅ use-fitness-data.ts:413 | 🔲 #244 mở | 🔲 | 🔲 | 🔲 | B |
| Effort range | [min,max] không trung bình | RPE-4 | ✅ prescription.ts:105 | 🔲 #244 mở | 🔲 | 🔲 | 🔲 | B |

## Lần trước

| Feature | Behavior | Rule ID | RN | Swift | Vector | Automated test | iPhone | Owner |
|---|---|---|---|---|---|---|---|---|
| Nguồn | 14 ngày sessions | LT-1 | ✅ use-exercise-insights.ts:54 | 🔲 #244 mở | 🔲 | 🔲 | 🔲 | B |
| Khớp bài | tên chuẩn hoá | LT-2 | ✅ exercise-performance.ts:202 | 🔲 #244 mở | 🔲 | 🔲 | 🔲 | B |
| Loại warm-up | trước khi tính | LT-3 | ✅ exercise-performance.ts:189 | 🔲 #244 mở | 🔲 | 🔲 | 🔲 | B |
| Session gần nhất | một lần mỗi bài | LT-4 | ✅ log-workout.tsx:212 | 🔲 #244 mở | 🔲 | 🔲 | 🔲 | B |
| Ngày địa phương | localDateStr | LT-5 | ✅ exercise-performance.ts:122 | 🔲 #244 mở | 🔲 | 🔲 | 🔲 | B |
| Hold | tính là set có làm | LT-6 | ✅ exercise-performance.ts:189 | 🔲 #244 mở | ✅ workout-state.json LT-6 | run.mjs LT-6 | 🔲 | B |

## Sync/Outbox (ADR-0003)

| Feature | Behavior | Rule ID | RN | Swift | Vector | Automated test | iPhone | Owner |
|---|---|---|---|---|---|---|---|---|
| Lỗi vĩnh viễn | 10 codes + WrongAccount/Unusable | OB-1 | ✅ offline-write.ts:357 | 🔲 #242 mở | ✅ sync.json OB-1 | run-sync.mjs OB-1 | 🔲 | A |
| Retry delay | 1000×2^n, trần 30s | OB-2 | ✅ offline-write.ts:734 | 🔲 #242 mở | ✅ sync.json OB-2 | run-sync.mjs OB-2 | 🔲 | A |
| Retry/giveUp | offline vô hạn, còn lại <3 | OB-3 | ✅ offline-write.ts:733 | 🔲 #242 mở | ✅ sync.json OB-3 | run-sync.mjs OB-3 | 🔲 | A |

## Forensic #227 (H1–H5)

| Feature | Behavior | Rule ID | RN | Swift | Vector | Automated test | iPhone | Owner |
|---|---|---|---|---|---|---|---|---|
| ±15 sai process | AppIntent trong extension | H1 | ✅ (bug) RestTimerIntents.swift:87 | 🔲 #252 mở | 🔲 | 🔲 | 🔲 | B |
| Ring nhảy chunk | style tự vẽ không animate | H2 | ✅ (bug) RestTimerLiveActivity.swift:174 | 🔲 #252 mở | 🔲 | 🔲 | 🔲 | B |
| Hai nguồn sự thật | TS + ContentState | H3 | ✅ (bug) rest-live-activity.ts | 🔲 #251 mở | 🔲 | 🔲 | 🔲 | B |
| Vòng lệch chiều | app rút, Island đầy | H4 | ✅ (bug) rest-timer.tsx:141 | 🔲 #252 mở | 🔲 | 🔲 | 🔲 | B |
| State lệch | suspend lỡ ping | H5 | ✅ (bug) day-plan.tsx:378 | 🔲 #251 mở | 🔲 | 🔲 | 🔲 | B |

## Còn thiếu (ô trống cần lấp)

### Vector chưa có
- RT-1, RT-2, RT-3, RT-4, RT-5, RT-6, RT-8, RT-9, RT-11, RT-12, RT-13, RT-14 (rest timer behavior) — Owner: D
- WS-1, WS-3, WS-4, WS-6, WS-7, WS-9, WS-10, WS-11, WS-12, WS-13, WS-14, WS-15 — Owner: D
- RPE-1..4, LT-1..5 — Owner: D
- H1–H5 — Owner: D (sau khi B chốt root cause)

### Swift chưa merge
- Tất cả PR #238, #242, #244, #251, #252 đều đang MỞ — Owner: A/B

### iPhone chưa test
- Tất cả — chỉ Kiệt được điền ✅
