# GĐ1 — Daily Plan + Today gọn

- **Mock:** `docs/design/mocks/daily-plan-today.html`.
- **Duyệt:** Kiệt duyệt **có điều kiện** ngày 21/10/2026 (#527). Duyệt hướng sản phẩm và UX. **Chưa duyệt merge production.**
- **Nhánh:** `claude/gd1-daily-plan`, PR để **nháp**.

## Phạm vi

- Today có **một việc chính**: hành động, lý do bằng số liệu thật, tối đa **hai** phương án.
- **Daily Plan Engine** dùng luật, không AI. Today, widget và lời nhắc đọc **cùng** một kết quả.
- Nghỉ hay quay lại đều **không bị phạt**. Gains đã đạt giữ nguyên.
- Thu gọn Today:
  - giữ lịch tuần ("Tuần của Koa") và ghi nhanh calo / đạm / nước;
  - đưa sẵn sàng chi tiết, bước chân, thực phẩm bổ sung và kế hoạch ăn vào "Thêm".

## Luật (`ASCNDCore/Today/DailyPlan.swift`)

Đọc từ trên xuống, dừng ở luật đầu tiên đúng:

| # | Khi | Việc chính |
|---|---|---|
| 0 | Chưa đọc xong lịch / ngày | Không đoán (giữ chỗ, không nút) |
| 1 | Có buổi đang dở | Tiếp tục |
| 2 | Chưa có lịch | Lên lịch tuần |
| 3 | Còn buổi trong lịch hôm nay **chưa tập** (kể cả khi đã tập một buổi khác) | Quay lại (≥ 3 ngày nghỉ) hoặc bắt đầu buổi |
| 4 | Đã tập hôm nay | Ghi bữa sau tập nếu biết đạm còn thiếu ≥ 20 g; không thì xem tiến bộ |
| 5 | Ngày nghỉ đã đặt | Hồi phục |
| 6 | Ngày trống | Buổi kế tiếp trong lịch; không có thì ghi tự do |

## Bốn điều kiện của Kiệt và cách đáp ứng

**01 · "Đã tập" không chặn buổi thứ hai.**
- Mỗi buổi đã ghi "trả" cho đúng **một** buổi trong lịch cùng mẫu (`template_id`).
- Buổi tự do không trả cho buổi nào.
- Luật 3 đứng **trước** luật 4.

**02 · Sẵn sàng đỏ không tự động là "tập nhẹ".**
- "Tập nhẹ hơn" chỉ được **đề xuất** khi đủ cả bốn điều:
  - điểm thấp;
  - độ tin không thấp;
  - điểm của **đúng hôm nay**;
  - **≥ 2** chỉ số cùng lệch (ngủ, HRV, nhịp tim nghỉ).
- Thiếu dữ liệu, dữ liệu cũ, hoặc chỉ một chỉ số lệch: không nói gì.
- Chọn "Tập nhẹ hơn" thì chỉ đổi buổi hôm nay (bớt một hiệp mỗi bài). Không sửa mẫu, không giảm tạ.

**03 · Phương án thay thế.**
- Lưu ở bảng mới `plan_day_overrides` (Kiệt chọn 21/10).
- **Dời buổi:** ghi hai hàng trong **một** giao dịch outbox. Ngày gốc thành nghỉ (`moved_to`), ngày đích nhận đúng buổi đó (`moved_from`).
- **Chọn ngày đích:** ngày trống gần nhất trong 6 ngày; không còn ngày trống thì mới chọn ngày nghỉ.
- **Không chồng buổi:** ngày đích đã có buổi thì từ chối (`.conflict`).
- **Đổi thành ngày nghỉ:** ghi lại quyết định, không xoá buổi.
- **Thống kê đọc cùng lịch đã áp:** Gains, ngày lỡ, lời nhắc.

**04 · Chỉ hiện Gains, chưa xoá XP.**
- XP, cửa hàng và phần thưởng **không đụng tới** ở GĐ1.

## Ba quyết định của Kiệt (21/10)

- **Chuỗi ngày ghi:** bỏ khỏi Today. Không xoá dữ liệu hay tính năng streak.
- **Mất pump và tụt hạng:** bỏ. Thay bằng chào mừng quay lại.
- **Tập nhẹ hơn:** bớt một hiệp mỗi bài trong buổi hiện tại. Không sửa mẫu, không tự giảm tạ, bỏ qua được.

"Tuần của Koa" dựa trên lịch thật. Chỉ đánh dấu xong khi có buổi tập ghi thật.

## Nghiệm thu trước khi merge

| Mục | Trạng thái |
|---|---|
| Unit test đủ 8 luật, kể cả khi nhiều luật cùng đúng | ✅ `DailyPlanTests` (16 test) |
| Kiểm 6 trạng thái của mock | 🟡 Đã kiểm trên simulator (21/10, tài khoản test): **có buổi, chưa tập** và **đang tập dở**. Chưa kiểm: phục hồi thấp (cần ≥ 7 mẫu HRV / nhịp tim nghỉ), ngày nghỉ, quay lại, đã tập xong, chưa có lịch. Các trạng thái này mới có unit test (`DailyPlanTests`, `DailyPlanInputTests`) |
| Kiểm thao tác lịch: dời buổi, đổi ngày nghỉ, không trùng, mẫu gốc giữ nguyên | ✅ Core (`DayOverridesTests`, `LighterSessionTests`). ⏳ Trên app: chờ deploy migration. Trước khi deploy, app **không hiện** nút dời / nghỉ (`overridesSupported`) |
| Today, widget, lời nhắc dùng chung kết quả | ✅ `DailyPlanSource` → `AppServices.dailyPlan`. Widget đọc câu trạng thái từ đó; lời nhắc đọc cùng lịch đã áp (`plannedByOffset`). Có test |
| Kiểm loading, lỗi, dữ liệu cũ | 🟡 Luật 0 có test. Thẻ tính ngay từ kế hoạch cache (đã thấy trên simulator lúc mạng chậm). Chưa kiểm khi mất mạng hẳn |
| Parity / CI và kiểm trên iPhone thật | ⏳ iPhone thật đang bị chặn (`CONSTRAINTS_AND_DEFERRED.md` mục 1) |

**Còn chặn:** migration `20261020140000_plan_day_overrides` **chưa deploy**, cần lệnh duyệt rõ ràng.

## Phần 1: đã xong (Core, dữ liệu)

- `DailyPlan`: engine cùng 16 test.
- `DayOverride`, `Reschedule`, `PlanEditor.postpone` / `makeRest`.
- Kế hoạch ngày, Gains và lời nhắc đều đọc lớp đổi lịch.
- Migration, backend đọc và ghi.
- `LighterSession` và `WorkoutFlow.setLighterToday`.
- Bỏ tụt hạng, mất pump và câu nhắc ngày 6.

## Phần 2: đề xuất cách làm (nối dây + UI)

1. **Một nguồn kết quả.** `DailyPlanSource` (app, `@MainActor @Observable`, một lần mỗi phiên trong `AppServices`):
   - dựng `DailyPlan.Input` từ `WorkoutFlow`: kế hoạch đã áp đổi lịch, buổi đang dở, các buổi đã ghi hôm nay theo `template_id`, `Reschedule.target`;
   - `missedDays` lấy từ `koaGainsNow`;
   - sẵn sàng lấy từ `ReadinessBook`;
   - đạm lấy từ dinh dưỡng hôm nay;
   - xuất `result`.
2. **Phục hồi → `Recovery`.** Hàm thuần trong Core, từ `ReadinessInput` + `ReadinessResult`:
   - ngủ < 80 % mục tiêu;
   - HRV thấp hơn trung bình 28 ngày ≥ 15 % (cần ≥ 7 mẫu);
   - nhịp tim nghỉ cao hơn ≥ 5 nhịp/phút (cần ≥ 7 mẫu).
   Kèm test.
3. **Today gọn** (`TodayPlanHero` thay thẻ Koa và thẻ buổi tập):
   - Koa nhỏ cùng dòng "hạng · Gains";
   - thẻ việc chính có lý do và phương án;
   - dải Tuần của Koa;
   - một khối ghi nhanh;
   - "Thêm".
   Bỏ chuỗi ngày ghi khỏi đầu trang.
4. **Widget** ghi tiêu đề và lý do từ `result` vào `TodayWorkoutWidgetData`.
5. **Lời nhắc:** `plannedByOffset` lấy từ lịch đã áp; câu của lời nhắc hôm nay lấy từ `result`.
6. **Màn quay lại** dạng sheet bỏ đi. Luật ④ trên Today thay thế; đo bằng `comeback_shown`.
7. **Kiểm 6 trạng thái trên simulator** bằng tài khoản test có sẵn (dữ liệu test, được sửa), có chụp màn. Cập nhật bảng nghiệm thu.
