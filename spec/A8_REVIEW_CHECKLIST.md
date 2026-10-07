# A8 — Checklist review kiến trúc: Today → Workout wiring

Issue: #329 · Người review: D · A8: #272 (chưa có PR tính đến 2026-10-05).

Checklist này là tài liệu review cụ thể cho wiring production
Today → Workout. Mỗi mục: tiêu chí, cách kiểm, trạng thái thực thi
ngày 2026-10-05 trên nhánh `agent/a/workout-slice` (+ baseline RN `fac9ac2`).

Ký hiệu: ✅ đạt · ❌ hỏng · ⏳ chưa có code để kiểm (A8 chưa triển khai).

---

## A8-R1 — Không state trùng lặp

**Tiêu chí.** Một `WorkoutSessionController` duy nhất do `AppServices` sở hữu,
màn Today và màn Workout nhận qua `environment`. Không màn nào tự dựng
controller riêng, không có bản sao "session đang tập" thứ hai.

**Cách kiểm.** Grep `WorkoutSessionController(` trong `apps/ios/ASCND/` —
đúng một call-site (trong `AppServices`). Test: hai màn đọc cùng một
instance (`===`).

**Trạng thái.** ⏳ Chưa có màn thật (placeholder) và `AppServices` chưa
expose controller. Không thể kiểm — A8 phải thỏa tiêu chí này khi nối dây.

**RN baseline.** Session đang tập sống trong store dùng chung; các màn
đọc cùng một nguồn (`native/src/app/(tabs)/workouts/`, `/log-workout`).

## A8-R2 — Không phụ thuộc Lab

**Tiêu chí.** Đường production (không `#if DEBUG`) không import/reference
`LabsView` hay màn thử nào.

**Cách kiểm.** Grep `LabsView` trong `apps/ios/ASCND/` — chỉ xuất hiện
trong khối `#if DEBUG`.

**Trạng thái.** ✅ `RootTabView` hiện dùng `LabsView` đúng trong `#if DEBUG`;
nhánh `#else` là placeholder. A8 phải đặt màn tập thật vào vị trí này,
không được để Lab lọt vào production.

## A8-R3 — Chốt buổi bền (durable finish)

**Tiêu chí.** `commitFinish` ghi bền trước khi trả về cho controller;
kill app giữa chừng không mất buổi đã chốt.

**Cách kiểm.** `GRDBWorkoutStoreTests` (D-7): transaction ghi session +
revision trong một transaction; idempotent — gọi lại cùng revision
không nhân đôi hàng.

**Trạng thái.** ✅ Đã kiểm trong #282 (D-7): inversion bỏ idempotency
guard → double row (test đỏ đúng); `swift test` 128/128 xanh.

## A8-R4 — Hành vi offline

**Tiêu chí.** Append khi offline → vào outbox; có mạng worker đẩy lên;
kill/reopen không mất set, không nhân đôi.

**Cách kiểm.** `AppendIdempotencyFuzzTests` (D-13, PR #357): 60 trials
xen kẽ tick/append/retry/kill với seed cố định — id outbox
`"<buổi>@<số hàng>"` không trùng, giữ id buổi gốc, giữ `date_time` gốc.

**Trạng thái.** ✅ `swift test` 180/180 xanh; inversion (id mới mỗi lần)
đỏ 20 issues đúng chỗ.

## A8-R5 — Khôi phục điều hướng (navigation restoration)

**Tiêu chí.** (a) Tab đang mở được nhớ qua scene thu hồi. (b) Buổi đang
tập dở được resume sau kill: `AppServices` khởi động đọc session
chưa chốt từ GRDB và dựng lại controller.

**Cách kiểm.** (a) `@SceneStorage("root.tab")` tồn tại. (b) Test:
ghi session pending vào GRDB → dựng `AppServices` mới → controller
resume đúng session, sets còn nguyên.

**Trạng thái.** (a) ✅ đã có. (b) ⏳ chưa có code resume — xem follow-up F1.

## A8-R6 — Vòng đời Live Activity

**Tiêu chí.** Bắt đầu buổi → start Live Activity; tick/set mới →
update; chốt/hủy → end. Không để Activity treo sau khi buổi kết thúc.

**Cách kiểm.** Test với fake ActivityKit: start → update(n) → end;
kill giữa chừng → end được gọi (hoặc Activity hết hạn sạch).

**Trạng thái.** ⏳ A8 chưa nối dây (#227 là màn thử của A). Xem follow-up F2.

## A8-R7 — Bàn giao sang Summary

**Tiêu chí.** Sau `commitFinish` thành công, điều hướng sang màn
Summary với đúng bản ghi vừa chốt (không phải đọc lại list rồi đoán).

**Cách kiểm.** Test: finish → router nhận record có id buổi vừa chốt.

**Trạng thái.** ⏳ Chưa có màn Summary. Xem follow-up F3.

---

## Follow-up (test còn thiếu → artifact)

| ID | Nội dung | Gắn với |
|----|----------|---------|
| F1 | Test resume buổi dở sau kill (GRDB → controller) | A8-R5b |
| F2 | Test vòng đời Live Activity qua start/update/end/hủy | A8-R6 |
| F3 | Test handoff Summary nhận đúng record vừa chốt | A8-R7 |
| F4 | Test một-instance: hai màn đọc cùng controller (`===`) | A8-R1 |

Khi A8 (#272) có PR, D chạy lại checklist này trên code thật và
đánh dấu từng mục; mục nào ⏳ mà A8 chưa làm thì BLOCK cho đến khi
có test hoặc được Kiệt miễn.
