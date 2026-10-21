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
| Kiểm 6 trạng thái của mock | ✅ Giao diện: cả 6 trạng thái hiển thị đúng mock trên simulator (21/10, giao diện tối; cờ Debug `ASCND_DEBUG_DAILYPLAN=planned/low/rest/comeback/done/none`). ✅ Dữ liệu thật: "có buổi, chưa tập" và "đang tập dở". Các trạng thái khác có unit test cho đường dữ liệu. ✅ Giao diện sáng (21/10, đổi tạm Cài đặt → Sáng rồi trả về Tối): đọc rõ, nút chính đậm, dải tuần rõ |
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

## Hồi quy GĐ1: mất mạng, lỗi, gửi lại (chỉ thị #527, 21/10 14:26)

**Yêu cầu:**
- Kiểm phục hồi khi mất mạng, lỗi, gửi lại; gửi lại không tạo bản ghi trùng hay lời nhắc trùng.
- Thử dời / nghỉ **chỉ ở máy hoặc dev**, không deploy migration.

**Mốc chạy:** commit `8d2f9d8b` (nhánh `claude/gd1-daily-plan`, PR nháp #641).

| Ca | Kết quả | Bằng chứng |
|---|---|---|
| R1 Hàng đợi nhận lại cùng lệnh dời (app chết giữa lượt): không thêm hàng | **PASS** | `GD1RegressionTests.reEnqueueingTheSameEntriesAddsNothing` |
| R2 Áp lại lệnh server đã nhận: không đổi gì | **PASS** | `GD1RegressionTests.reApplyingIsIdempotent` |
| R3 Bấm hai lần (dời / nghỉ): lần hai bị từ chối, không có lệnh thứ hai | **PASS** | `GD1RegressionTests.doubleTapNeverWritesTwice` |
| R4 Mất mạng rồi đồng bộ: cùng một lịch, không hai buổi | **PASS** | `GD1RegressionTests.offlineThenSyncedShowsTheSamePlan` |
| R5 Lên lịch nhắc lại nhiều lần: cùng kế hoạch, tối đa 1 lời nhắc tập mỗi ngày, không trùng khoá | **PASS** | `GD1RegressionTests.remindersAreStableAndOnePerDay`; bộ lên lịch thật xoá hết lời nhắc đang chờ trước khi thêm (`NotificationReminderScheduler.replaceAll`) |
| R6 Đọc phục hồi lỗi: không tín hiệu, không gợi ý tập nhẹ | **PASS** | `GD1RegressionTests.recoveryReadFailureGivesNoSuggestion` |
| R7 Chưa đọc được kế hoạch: không đoán, không nút | **PASS** | `GD1RegressionTests.unreadPlanNeverGuesses` |
| W1 Bộ gửi lên server: `day-override` → `plan_day_overrides`, upsert theo (người, ngày); từ chối hàng của người khác / ngày hỏng | **PASS** | `RemoteWriterTests.planEditsTargetTheirTables` |
| D1 SQL thật: dời T4 → T5 rồi gửi lại y hệt → vẫn 2 hàng, đúng nội dung | **PASS** | `supabase/tests/core/day_overrides.test.sql` |
| D2 SQL thật: đổi thành nghỉ rồi gửi lại → 1 hàng | **PASS** | như trên |
| D3 SQL thật: ngày nghỉ mang buổi, dời từ chính nó → CHECK 23514 | **PASS** | như trên |
| D4 SQL thật: B không thấy / không sửa được hàng của A (RLS) | **PASS** | như trên, cùng `owner_rls.test.sql` T0–T2 … và `parent_fk.test.sql` F12–F14 |
| D5 SQL thật: xoá mẫu → ngày nhận buổi đi theo; ngày nghỉ đã chọn ở lại | **PASS** | như trên |
| A1 Dời / nghỉ **trên app** với backend dev ở máy | **BLOCKED** | Kiệt 21/10: bỏ phương án dựng Supabase dev bằng Docker vì máy không đủ tài nguyên (đã thử `supabase start`, tải image quá lâu). Logic và dữ liệu đã PASS bằng R1–R4, W1, D1–D5. Còn lại: lần đầu chạy trên app khi migration được deploy (cần duyệt), hoặc trên một máy / CI có Supabase dev |
| A2 Mất mạng hẳn trên simulator (Today, ghi bữa / buổi rồi gửi lại) | **BLOCKED** | Simulator không có công tắc mạng riêng; tắt mạng của máy Mac là đổi cài đặt hệ thống (agent không làm). Đường mã có test (R1–R7, và bộ test outbox / `SyncWorker` sẵn có) |

**Lệnh đã chạy:**
```sh
# Swift (từ apps/ios/Packages/<gói>)
swift test                                  # ASCNDKit: 1638/1638
swift test --filter GD1RegressionTests      # 7/7
swift test --filter RemoteWriterTests       # ASCNDBackend: 25/25
# SQL thật trên Postgres 16 ở máy (không đụng project nào)
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PG_BIN=/opt/homebrew/opt/postgresql@16/bin bash supabase/tests/core/run.sh
#   → "ĐỔI LỊCH THEO NGÀY: D1–D5 xanh", "RLS BẢNG LÕI … xanh trên mọi bảng", "KHOÁ NGOẠI TỚI DÒNG CHA: F1–F14 xanh"
```

**CI:**
- Lượt xanh gần nhất trước đợt hồi quy là commit `0f312348`:
  - `app-macos` + `core-linux`: https://github.com/dnganhkiet1206/fitness-os/actions/runs/39569723816
  - `gate`: https://github.com/dnganhkiet1206/fitness-os/actions/runs/39569721998
  - `sql`: https://github.com/dnganhkiet1206/fitness-os/actions/runs/39569722276
- CI của đợt hồi quy (commit `1503f8ef`, gồm test `8d2f9d8b`): **xanh toàn bộ**.
  - `app-macos` + `core-linux`: https://github.com/dnganhkiet1206/fitness-os/actions/runs/39620542709
  - `gate`: https://github.com/dnganhkiet1206/fitness-os/actions/runs/39620533252 và https://github.com/dnganhkiet1206/fitness-os/actions/runs/39620542663
  - `sql` (chạy D1–D5): https://github.com/dnganhkiet1206/fitness-os/actions/runs/39620542706
