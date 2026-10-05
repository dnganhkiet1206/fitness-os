# ĐỀ XUẤT "TÀI SẢN NGỦ QUÊN" — Quét toàn app ASCND

**Ngày:** 02/10/2026 (tối) · **Người quét:** C (+ 3 explorer) · **Trạng thái:** CHỜ KIỆT DUYỆT — chưa code gì cả

Lần quét này tìm những gì app **ĐÃ CÓ nhưng chưa dùng hết** — hạ tầng xây xong bỏ xó, dữ liệu log đều nhưng không ai xem lại, component xịn chỉ dùng 1 chỗ. Tất cả đều có file:dòng chứng minh. (Lần trước là DE-XUAT.md — tìm bug/UX thiếu.)

---

## P0 — Nên làm ngay

### 1. Apple Health chỉ đọc, không ghi ngược — đồng bộ một chiều
- **Cái đã có:** `lib/health.ts:124` xin quyền `toRead` đầy đủ (steps, sleep, workout, biometrics); `lib/health-sync-write.ts` ghi dữ liệu Health vào `daily_logs`.
- **Đang lãng phí:** Grep toàn bộ `lib/health*.ts` = **0 hàm save/write HealthKit** (`saveQuantitySample`/`saveWorkoutSample` = 0 hit). User cân trong app, tập trong app, ghi giấc ngủ trong app — nhưng Apple Health / Apple Watch / app bên thứ ba không bao giờ thấy. `lib/energy.ts:16` thừa nhận thẳng: *"ASCND ghi buổi tập vào cơ sở dữ liệu của chính nó, nên Health không hề biết."* App "ăn" dữ liệu Health mà không "trả" lại.
- **Đề xuất:** Xin thêm write permission (`HKQuantityTypeIdentifierBodyMass`, `HKWorkoutTypeIdentifier`, `HKCategoryTypeIdentifierSleepAnalysis`); ghi ngược sau mỗi lần user log, dùng `external_id` sẵn có để idempotent.
- **Giá trị:** Vòng lặp Health khép kín — dữ liệu ASCND hiện trong Apple Fitness, tăng lý do ở lại ecosystem.
- **Độ lớn:** M · **Ưu tiên:** P0

### 2. AI Coach giàu context nhưng mù về dinh dưỡng + hoàn toàn bị động
- **Cái đã có:** `supabase/functions/ai-coach/index.ts:123-137` — mỗi request server tự fetch profile, `daily_logs` 7 ngày, `sleep_logs`, `workout_sessions`, `biometric_samples`, **40 dòng `coach_memory`** build thành system prompt rất cẩn thận.
- **Đang lãng phí:** (a) Context **thiếu nutrition/protein/weight/soreness** — đúng 3 domain user log đều nhất mà coach không thấy; (b) coach chỉ trả lời khi user tự mở `/ai-coach` — đêm ngủ 5h + readiness đỏ mà không ai gợi ý "hỏi coach".
- **Đề xuất:** Thêm `streak` + `steps` + `protein_avg_7d` + `weight_trend` vào ctx; khi assistant tab phát hiện brief `sleep`/`readiness` đỏ, tự chèn suggestion chip deep-link `/ai-coach?q=…` (cơ chế `?q=` đã có: `app/ai-coach.tsx:169-178`).
- **Giá trị:** Coach từ "chatbot chờ hỏi" thành "huấn luyện viên chủ động" — đúng lời hứa AI của app.
- **Độ lớn:** M · **Ưu tiên:** P0

### 3. Nhắc "nhận thưởng challenge" tồn tại nhưng không bao giờ thành notification
- **Cái đã có:** `lib/challenge-reminders.ts:45` — `pendingClaims` + `claimLine`; cửa sổ claim 7 ngày (`CLAIM_WINDOW_DAYS`) + tool check `tools/claim-window.mjs`.
- **Đang lãng phí:** Chỉ được gọi ở 3 màn in-app. Chính comment đầu file thừa nhận: *"Không có cron để sinh một dòng thông báo lúc thử thách kết thúc"*. User không mở đúng màn trong 7 ngày → **mất thưởng trong im lặng** — đúng cái lỗ file này được viết ra để lấp (#60).
- **Đề xuất:** Thêm reminder key `challengeClaim` vào plan; schedule one-shot vào ngày cuối cửa sổ cho mỗi challenge đã đạt-chưa-nhận.
- **Giá trị:** Không còn ai mất thưởng oan — trust vào hệ thống challenge.
- **Độ lớn:** M · **Ưu tiên:** P0

### 4. Claim thưởng challenge không trigger celebration
- **Cái đã có:** `lib/celebration-queue.ts` + `components/ascnd/celebration-host.tsx` sẵn sàng render; `hooks/use-extras.ts:691` (weekly challenge) đã enqueue award đúng cách.
- **Đang lãng phí:** `hooks/use-community.ts:1195` — `useClaimChallenge().onSuccess` chỉ `invalidateQueries`, **không gọi** `enqueueAward`. User bấm "Nhận thưởng" xong chỉ thấy số xu tăng âm thầm.
- **Đề xuất:** Thêm `enqueueAward` vào `onSuccess` của `useClaimChallenge`.
- **Giá trị:** Khoảnh khắc ăn mừng đúng lúc — rẻ, hiệu quả cao.
- **Độ lớn:** S · **Ưu tiên:** P0

---

## P1 — Đáng làm sớm

### 5. Dinh dưỡng: domain log đều nhất nhưng không có màn insights
- **Cái đã có:** `lib/daily-log-service.ts` gom `fiber_g` + protein/carbs/fat vào `daily_logs` mỗi ngày; `sleep-insights.tsx` (798 dòng) và `exercise-insight.tsx` (566 dòng) là mẫu sẵn.
- **Đang lãng phí:** Sleep có stage bars + debt + findings; exercise có trend verdicts từng động tác. Dinh dưỡng — domain log đều nhất — chỉ là thanh progress bar. `app/weekly-review.tsx:342,368` chỉ phân tích **protein**, carbs/fat/fiber không vào insight.
- **Đề xuất:** Màn `nutrition-insights.tsx` theo mẫu `sleep-insights.tsx`: trung bình 7 ngày protein/fiber vs target, "protein gap", findings tự động.
- **Giá trị:** Biến dữ liệu ăn uống thành lời khuyên hành động được.
- **Độ lớn:** M · **Ưu tiên:** P1

### 6. 12 chỉ số body measurements — log xong mất hút
- **Cái đã có:** `app/log-measurement.tsx:59-72` ghi 12 field (cổ, vai, ngực, eo, hông, bắp tay/đùi/bắp chân L/R, % mỡ) vào `body_measurements`.
- **Đang lãng phí:** Grep toàn codebase — **không một màn nào hiển thị history**, chỉ có settings export. User đo đều mà không bao giờ thấy vòng eo mình đi xuống.
- **Đề xuất:** Màn "Measurements trend" theo mẫu `exercise-insight.tsx`: sparkline từng số đo + delta vs 4/12 tuần trước.
- **Giá trị:** Đây là bằng chứng body-recomp mà user thèm thấy nhất.
- **Độ lớn:** M · **Ưu tiên:** P1

### 7. Progress photos chỉ là gallery — không có before/after
- **Cái đã có:** `app/progress-photos.tsx` (542 dòng) — ảnh + `body_measurements` + weight là bộ ba kể chuyện.
- **Đang lãng phí:** FlatList 2 cột ảnh, grep không có compare/slider. User chụp đều mà không bao giờ được app đặt ảnh tháng 1 cạnh ảnh tháng 6 kèm "eo -4cm".
- **Đề xuất:** "Compare mode": chọn 2 ảnh → đặt cạnh nhau + hiển thị weight/measurement delta giữa 2 mốc.
- **Giá trị:** Khoảnh khắc "wow" giữ chân user dài hạn.
- **Độ lớn:** M · **Ưu tiên:** P1

### 8. Weekly review "quên" giấc ngủ
- **Cái đã có:** `lib/daily-log-service.ts` tính `sleepDebtFrom()` (nợ ngủ 7 ngày) và lưu `sleep_quality` vào `daily_logs`.
- **Đang lãng phí:** `app/weekly-review.tsx:196` select đủ thứ nhưng **không có cột sleep nào**. Sleep debt là tín hiệu phục hồi mạnh nhất (trọng số 0.30 readiness) mà nơi user nhìn lại tuần không nhắc một chữ.
- **Đề xuất:** Thêm section "Giấc ngủ tuần này": avg giờ ngủ, debt, quality trend.
- **Giá trị:** Weekly review đầy đủ 4 trụ: tập – ăn – ngủ – phục hồi.
- **Độ lớn:** S · **Ưu tiên:** P1

### 9. Volume load có tổng tấn mỗi ngày nhưng không có xu hướng
- **Cái đã có:** `daily_logs.volume_load` = Σ(weight×reps) mỗi ngày; `lib/exercise-trend.ts` phân tích e1RM từng động tác.
- **Đang lãng phí:** Không màn nào trả lời "tuần này mình tập nặng hơn tuần trước bao nhiêu %".
- **Đề xuất:** Volume trend chart trong weekly review (7 ngày + sparkline 12 tuần).
- **Giá trị:** Progressive overload là nguyên tắc tập #1 — app nên cho user thấy nó.
- **Độ lớn:** M · **Ưu tiên:** P1

### 10. `EnergyRing` — vòng tổng quan ngày kiểu Apple Fitness — chỉ sống trong mascot-room
- **Cái đã có:** `components/ascnd/energy-ring.tsx` — mỗi segment là 1 tín hiệu ngày (meal/workout/water/sleep/steps), sáng lên khi đạt.
- **Đang lãng phí:** Chỉ 1 importer: `app/mascot-room.tsx:562`. Đây đúng là "today at a glance" mà tab Today đang thiếu.
- **Đề xuất:** Đặt lên đầu tab Today hoặc cạnh brief assistant tab (centre number đã thiết kế sẵn cho reuse).
- **Giá trị:** 1 glyph trả lời "hôm nay mình thế nào" — đúng ngôn ngữ Apple Fitness user quen.
- **Độ lớn:** S · **Ưu tiên:** P1

### 11. Mascot Room + Shop + Challenges bị chôn sâu
- **Cái đã có:** Cả economy loop (shop, weekly challenges, coin balance, mascot-room).
- **Đang lãng phí:** Chính codebase thừa nhận ở `app/settings.tsx:417-435`: *"There were exactly two doors to `/mascot-room`… somebody who turns the mascot off loses the shop, the weekly challenges and the coin balance — while the app keeps paying them coins for quests."* User tắt mascot = mất cả hệ sinh thái dù app vẫn trả coin.
- **Đề xuất:** Đưa tile "Phòng Koa / Shop / Thử thách" lên tab Today (khi có coin chưa tiêu hoặc challenge đang chạy).
- **Giá trị:** Economy loop được dùng thay vì bị chôn.
- **Độ lớn:** M · **Ưu tiên:** P1

### 12. Reminder thông minh đã tính được giờ tốt nhưng vẫn chờ user bấm
- **Cái đã có:** `lib/reminder-timing.ts` (`suggestedTime` từ bedtime/waketime) + `lib/user-rhythm.ts` (giờ user thật sự log, ≥6 quan sát).
- **Đang lãng phí:** Nếu user không bao giờ mở màn Reminders, giờ nhắc vẫn là 4 hằng số hand-typed (supplements 09:00, weighIn 07:00...) — dù app đã biết giờ ngủ/dậy thật. Chính file cảnh báo: *"notification that wakes somebody up is worse than no notification"*.
- **Đề xuất:** Khi user đã lưu bedtime/waketime, tự áp dụng `suggestedTime` cho bedtime/weigh-in ngay lần schedule đầu (one-time, có log).
- **Giá trị:** Nhắc đúng giờ người ta dậy — không đánh thức ai lúc 7h khi họ dậy 8h.
- **Độ lớn:** S · **Ưu tiên:** P1

### 13. Koa chỉ reactive — sáng mở app không có câu chào từ dữ liệu đêm qua
- **Cái đã có:** `lib/assistant-brief.ts` đã tính sẵn signals giàu (sleep, kcal, protein, steps, acwr, daysSinceWorkout); `lib/koa-decide.ts` có context `hour/mood/streak/emptyToday/riskHour`.
- **Đang lãng phí:** Events chỉ emit khi user đang mở app và làm gì đó. Không có khoảnh khắc "sáng mở app, Koa nhìn dữ liệu đêm qua và chào có nội dung" — brief chỉ render khi mở assistant tab.
- **Đề xuất:** Lần mở app đầu tiên trong ngày, gọi `decide` với context từ assistant signal để Koa chào 1 câu có dữ liệu thay vì `idle`/`happy` chung chung.
- **Giá trị:** Koa từ mascot trang trí thành "nó có để ý mình thật".
- **Độ lớn:** M · **Ưu tiên:** P1

---

## P2 — Làm khi rảnh

### 14. Soreness/illness log rồi nhưng không có timeline
- **Cái đã có:** P0-1 (DE-XUAT) vừa thêm morning check-in ghi `soreness_1_10` + `illness_flag` vào `biometric_samples`.
- **Đang lãng phí:** `app/biometrics.tsx:84-99` chỉ vẽ 5 cards (HR, HRV, SpO₂, VO₂max, nhịp thở) — không card nào cho soreness. Dữ liệu mới log sẽ lại chìm.
- **Đề xuất:** Thêm card "Đau nhức / Ốm" vào biometrics (sparkline 1–10 + cờ illness).
- **Giá trị:** Đóng vòng lặp cho P0-1 — log xong phải xem lại được.
- **Độ lớn:** S · **Ưu tiên:** P2

### 15. Supplement adherence tính rồi bỏ xó
- **Cái đã có:** `daily_logs.supplement_taken` / `supplement_planned` được upsert mỗi ngày.
- **Đang lãng phí:** Không màn nào select 2 cột này ngoài recompute. App biết chính xác % tuân thủ mà user không bao giờ thấy.
- **Đề xuất:** Widget "% tuân thủ" vào Today card hoặc weekly review; nudge khi < 50%.
- **Giá trị:** Adherence là thứ quyết định supplement có tác dụng không.
- **Độ lớn:** S · **Ưu tiên:** P2

### 16. Water log nhưng nằm ngoài mọi aggregation
- **Cái đã có:** `app/water.tsx` — màn log nước user dùng hàng ngày.
- **Đang lãng phí:** `water_logs` không vào `daily-log-service.ts`, không vào weekly review, không vào readiness. Nước là metric log đều nhưng không bao giờ được trend hoá.
- **Đề xuất:** Gom water vào daily_logs (ml/day) + avg tuần trong weekly review.
- **Giá trị:** Đóng vòng lặp cho thói quen log đều nhất nhì app.
- **Độ lớn:** S · **Ưu tiên:** P2

### 17. `HeroMetric` chỉ dùng ở sleep-insights
- **Cái đã có:** `components/ascnd/hero-metric.tsx` — pattern "1 con số + caption diễn giải con số CÓ NGHĨA gì".
- **Đang lãng phí:** Chỉ 1 importer (sleep-insights). `app/biometrics.tsx`, `app/steps.tsx` đang tự vẽ hero number thủ công, không có caption.
- **Đề xuất:** Migrate hero number của biometrics/steps sang `HeroMetric`.
- **Giá trị:** Nhất quán + mỗi con số đều "nói" được ý nghĩa.
- **Độ lớn:** S · **Ưu tiên:** P2

### 18. SwipeRow chỉ dùng 4 chỗ — 2 list vẫn dùng nút Trash thủ công
- **Cái đã có:** `components/ascnd/swipe-row.tsx` — spring physics, handover scale, `closeOpenSwipeRow()`.
- **Đang lãng phí:** Chỉ dùng ở 4 chỗ; `weight-log-list.tsx` và `template-list.tsx:362` vẫn dùng nút Trash2 nhỏ.
- **Đề xuất:** Migrate 2 list sang `SwipeRow` (lưu ý: DE-XUAT đã skip vì GlassCard nền trong suốt — cần Kiệt duyệt visual).
- **Giá trị:** UX xoá nhất quán kiểu iOS.
- **Độ lớn:** M · **Ưu tiên:** P2

---

## Ghi nhận nhưng CHƯA đề xuất làm

- **Push notification (server-driven):** `lib/notifications.ts:1-8` — *"All scheduling is device-local — no push server"*, `getExpoPushToken` = 0 hit. Muốn làm streak-sắp-đứt/challenge-sắp-hết-hạn lúc 3h sáng thì cần Expo push + edge function + cron. **Độ lớn L**, cần quyết định hạ tầng của Kiệt trước.
- **IAP:** `lib/backend.ts` có `verifyPurchase`/`storeWebhook` nhưng 0 caller, chưa deploy, chưa nối SDK. Đây là quyết định kinh doanh có chủ ý (LAUNCH.md) — khi launch thì làm.
- **`playNativeHaptic`:** `native/ios/ASCNDHaptics.ts` export nhưng 0 caller (từ #195, sau #194 chuyển sang expo-haptics). Nên xoá cho gọn hoặc giữ làm bridge-validation.
- **Widget TS wiring:** P0-2 DE-XUAT đã nối xong; blocker còn lại là App Group provision trên Apple Developer portal — việc của Kiệt.

## Đã kiểm tra và KHÔNG ngủ quên (khỏi làm lại)
- Readiness "vì sao điểm này" (explainToken → sub-score tiles ở `readiness-gauge.tsx:807-845`) — hiển thị tốt
- Weight trend (smart-goals LineChart), steps/rings (Today), awards auto-grant + celebration fire đúng chỗ
- `app/coach-memory.tsx` đã có cửa từ assistant tab; `app/exercise-guide.tsx` discoverable được
- `integrations/` chỉ có supabase client + types — không có tài sản ngủ

## Ngoài phạm vi
- Dynamic Island Swift/native — Kiệt đang test máy thật
- Scene lifecycle (Expo 57 + Xcode 27) — chờ Kiệt quyết định
- Community (việc của A), file của B
