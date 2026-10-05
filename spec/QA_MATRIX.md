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

## Template read model (A6)

| Feature | Behavior | Rule ID | RN | Swift | Vector | Automated test | iPhone | Owner |
|---|---|---|---|---|---|---|---|---|
| TodayPlan | routine_days + templates → plan, local-first | TPL-1 | ✅ use-library.ts:349,387 | 🔲 #285 mở | 🔲 | 🔲 | 🔲 | A |
| Expand sets | kẹp [1,20], khoá "<bài>-<hiệp>" | TPL-2 | ✅ day-plan.tsx:547 | 🔲 #285 mở | 🔲 | 🔲 | 🔲 | A |
| routineIndex | (getDay()+6)%7, Thứ Hai = 0 | TPL-3 | ✅ local-date.ts:188 | 🔲 #285 mở | 🔲 | 🔲 | 🔲 | A |
| Rest/unplanned | is_rest thắng template_id; template xoá → unplanned ≠ rest | TPL-4 | ✅ week-plan.tsx:306-313 | 🔲 #285 mở | 🔲 | 🔲 | 🔲 | A |
| sets hỏng | sets không đọc được → coi như thiếu = 1 hiệp (không rớt bài) | TPL-5 | ✅ (bug) day-plan.tsx:555 | 🔲 #285 mở | 🔲 | unreadableSetCountKeepsTheExercise | 🔲 | A |

## Today (A7)

| Feature | Behavior | Rule ID | RN | Swift | Vector | Automated test | iPhone | Owner |
|---|---|---|---|---|---|---|---|---|
| Ngày thật | today theo múi người dùng; clockTick đổi ngày qua nửa đêm | TD-1 | ✅ — | 🔲 #290 mở | 🔲 | 🔲 | 🔲 | A |
| Local-first | load() hiện cache ngay, refresh() từ server, refreshError khi hỏng | TD-2 | ✅ — | 🔲 #290 mở | 🔲 | 🔲 | 🔲 | A |
| Trạng thái ngày | todo/done/missed/rest/unplanned | TD-3 | ✅ week-strip.tsx:137 | 🔲 #290 mở | 🔲 | 🔲 | 🔲 | A |
| Đã tập | hợp server (14 ngày, múi người dùng) + máy (loggedSessionId, offline OK) | TD-4 | ✅ useWorkoutSessions(14) | 🔲 #290 mở | 🔲 | 🔲 | 🔲 | A |
| Chốt trùng máy khác | tick được, chốt bị từ chối (loggedElsewhere) — chặn buổi thứ hai | TD-5 | ✅ day-plan.tsx:1297 | 🔲 #290 mở | 🔲 | 🔲 | 🔲 | A |

## App wiring (A8)

| Feature | Behavior | Rule ID | RN | Swift | Vector | Automated test | iPhone | Owner |
|---|---|---|---|---|---|---|---|---|
| Today → Workout | màn thật nối vào AppServices, Lab chỉ debug | APP-1 | 🔲 | 🔲 #272 chưa có PR | 🔲 | 🔲 | 🔲 | A |

## Session lifecycle (A9)

| Feature | Behavior | Rule ID | RN | Swift | Vector | Automated test | iPhone | Owner |
|---|---|---|---|---|---|---|---|---|
| Dọn khi hết phiên | mọi đường (đăng xuất/token hết/bị xoá/đổi TK) → dữ liệu người cũ rời máy | SL-1 | ✅ use-auth.tsx:53 | 🔲 #293 mở | 🔲 | switchingAccountsRunsCleanup | 🔲 | A |
| Thứ tự dọn | bỏ hàng đợi → xoá tiến độ ngày → xoá cache kế hoạch → gán lại user sync | SL-2 | ✅ query-client.ts:94 | 🔲 #293 mở | 🔲 | 🔲 | 🔲 | A |
| Đổi tài khoản | đổi userId cũng dọn (RN chỉ dọn khi SIGNED_OUT — native mạnh hơn, có chủ đích) | SL-3 | ✅ (thiếu) use-auth.tsx:112 | 🔲 #293 mở | 🔲 | switchingAccountsRunsCleanup | 🔲 | A |
| Gate màn | RootGate: đọc phiên → chờ; chưa đăng nhập → SignIn; đã đăng nhập → tabs .id(userId) | SL-4 | ✅ — | 🔲 #293 mở | 🔲 | 🔲 | 🔲 | A |

## Dynamic Island hardening (A10)

| Feature | Behavior | Rule ID | RN | Swift | Vector | Automated test | iPhone | Owner |
|---|---|---|---|---|---|---|---|---|
| Khôi phục sau kill | app terminate khi đang nghỉ → mở lại khôi phục | DI-1 | 🔲 | 🔲 #274 chưa có PR | 🔲 | 🔲 | 🔲 | A/B |

## Personal Records (A11)

| Feature | Behavior | Rule ID | RN | Swift | Vector | Automated test | iPhone | Owner |
|---|---|---|---|---|---|---|---|---|
| Kỷ lục weight | nặng hơn topWeight + 0.05kg | PR-1 | ✅ personal-record.ts:189 | 🔲 #298 mở | ✅ personal-record.json PR-1 | run-personal-record.mjs PR-1 | 🔲 | D/A |
| Kỷ lục reps | nhiều reps hơn ở mức tạ đã dùng | PR-2 | ✅ personal-record.ts:189 | 🔲 #298 mở | ✅ personal-record.json PR-2 | run-personal-record.mjs PR-2 | 🔲 | D/A |
| Warmup | khởi động không bao giờ là kỷ lục (RN đánh rơi cờ → native mang theo, có chủ đích) | PR-3 | ✅ (bug) use-fitness-data.ts:375 | 🔲 #298 mở | ✅ personal-record.json PR-3 | sessionWarmupDoesNotPostARecord | 🔲 | D/A |
| Không lịch sử | bài chưa từng tập → không kỷ lục | PR-4 | ✅ personal-record.ts:189 | 🔲 #298 mở | ✅ personal-record.json PR-4 | run-personal-record.mjs PR-4 | 🔲 | D/A |
| Epsilon 0.05kg | chống kỷ lục ma khi đổi kg↔lb | PR-5 | ✅ personal-record.ts:141 | 🔲 #298 mở | ✅ personal-record.json PR-5 | run-personal-record.mjs PR-5 | 🔲 | D/A |
| Một/bài, xếp hạng | mỗi bài một kỷ lục, tạ thắng reps, xếp theo gain | PR-6/7 | ✅ personal-record.ts:189 | 🔲 #298 mở | ✅ personal-record.json PR-6/7 | run-personal-record.mjs PR-6/7 | 🔲 | D/A |
| Sắp xếp ổn định | như Array.prototype.sort | PR-10 | ✅ personal-record.ts | 🔲 #298 mở | 🔲 | 🔲 | 🔲 | A |

## Append (A12)

| Feature | Behavior | Rule ID | RN | Swift | Vector | Automated test | iPhone | Owner |
|---|---|---|---|---|---|---|---|---|
| Điều kiện nối | appending = logged && pendingReady && !future | AP-1 | ✅ day-plan.tsx:1329 | 🔲 #307 mở | ✅ append.json AP-1 | run-append.mjs AP-1 | 🔲 | D/A |
| Viết lại cả hàng | native dựng lại toàn bộ hàng, upsert qua outbox (RN: đọc → cộng mảng → update) | AP-2 | ✅ use-fitness-data.ts:599 | 🔲 #307 mở | ✅ append.json AP-2 | run-append.mjs AP-2 | 🔲 | D/A |
| Idempotent | native có (id outbox "<buổi>@<số hàng>"); RN không (timeout → nối hai lần) | AP-3 | ✅ (thiếu) use-fitness-data.ts:599 | 🔲 #307 mở | 🔲 | 🔲 | 🔲 | A |
| Offline | RN: nút tắt + lỗi; native: chạy được, lưu máy gửi sau (có chủ đích) | AP-4 | ✅ day-plan.tsx:1434 | 🔲 #307 mở | ✅ append.json AP-2c | run-append.mjs AP-2c | 🔲 | D/A |
| Volume/RPE | RN cộng addedVolume (gồm warmup); native tính lại bỏ warmup (có chủ đích) | AP-5 | ✅ use-fitness-data.ts | 🔲 #307 mở | 🔲 | 🔲 | 🔲 | A |

## Còn thiếu (ô trống cần lấp)

### Vector chưa có
- RT-1, RT-2, RT-3, RT-4, RT-5, RT-6, RT-8, RT-9, RT-11, RT-12, RT-13, RT-14 (rest timer behavior) — Owner: D
- WS-1, WS-3, WS-4, WS-6, WS-7, WS-9, WS-10, WS-11, WS-12, WS-13, WS-14, WS-15 — Owner: D
- RPE-1..4, LT-1..5 — Owner: D
- H1–H5 — Owner: D (sau khi B chốt root cause)
- TPL-1..4, TD-1..4, TD-6, SL-1/2/4, DI-1, PR-10, AP-3, AP-5 — Owner: D (sau khi A chốt PR)

### Swift chưa merge
- Tất cả PR #238, #242, #244, #251, #252 đều đang MỞ — Owner: A/B
- PR #285 (A6), #290 (A7), #293 (A9), #298 (A11), #307 (A12) đang MỞ; #272 (A8), #274 (A10) chưa có PR — Owner: A

### iPhone chưa test
- Tất cả — chỉ Kiệt được điền ✅
