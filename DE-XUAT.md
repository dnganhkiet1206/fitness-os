# ĐỀ XUẤT THAY ĐỔI — Quét toàn app ASCND

**Ngày:** 02/10/2026 (tối) · **Người quét:** C (+ 3 explorer) · **Trạng thái:** CHỜ KIỆT DUYỆT — chưa code gì cả

Quét read-only toàn bộ `native/src/`, docs product, và đối chiếu quyết định của Kiệt. Codebase nhìn chung đã rất kỷ luật (311 gates xanh) — dưới đây là những chỗ còn sót, đều có bằng chứng file:dòng cụ thể.

---

## P0 — Nên làm ngay

### 1. Điểm sẵn sàng đang "mù" với ốm/đau — thêm check-in đau nhức
- **Vấn đề hiện tại:** `readiness-engine.ts:202` (soreness > 6 trừ điểm), `:368` (illness → trần 35, pain ≥ 7 → trần 45) — 3 nhánh logic tồn tại nhưng **không màn nào hỏi user**. `daily-log-service.ts:639-641` ghi cứng `soreness_today: undefined, illness_flag: false`. User đang ốm/vẹo lưng vẫn có thể nhận readiness xanh.
- **Đề xuất thay đổi:** Thêm 1 câu hỏi optional trong `log-biometrics.tsx` hoặc `log-sleep.tsx` buổi sáng: "Hôm nay có ốm/đau nhức không?" (scale 1-10 + toggle ốm). Nếu Kiệt không muốn hỏi thêm → xoá 3 nhánh chết cho code trung thực.
- **Lý do:** Readiness là metric headline của app. Một điểm xanh sai lúc user ốm phá hỏng niềm tin vào cả hệ số.
- **Độ lớn:** M · **Ưu tiên:** P0

### 2. Nối dữ liệu thật vào 2 widgets iOS
- **Vấn đề hiện tại:** `src/native/ios/widget-data.ts` đã có `pushTodayWorkout()` / `pushStreakReadiness()` nhưng **0 caller** trong toàn bộ `src/` — 2 widgets Kiệt đã duyệt ("Buổi tập hôm nay" + "Streak + Readiness") đang chạy bằng mock data của Swift.
- **Đề xuất thay đổi:** Gọi 2 hàm push từ `use-fitness-data.ts` (sau khi có template/sessions hôm nay, streak, readiness). Fire-and-forget, không crash app nếu native chưa sẵn.
- **Lý do:** Widget là mặt tiền trên Home Screen; hiện mock data là tính năng "chết" về mặt giá trị. (Lưu ý: Swift vẫn cần App Group provision + EAS build mới hiện thật — phần TS làm trước để sẵn.)
- **Độ lớn:** M · **Ưu tiên:** P0

### 3. Gợi ý nhắc "Koa để ý" đang bịa giờ ngủ của user
- **Vấn đề hiện tại:** `app/reminders.tsx:59-70` hiện "Koa để ý: bạn đi ngủ lúc 23:00" dựa trên `profile.sleep_target_bedtime` — nhưng onboarding **không hề hỏi** giờ ngủ (grep = 0 hit), 23:00 chỉ là DB default. Comment `lib/reminder-timing.ts:10-11` còn ghi sai: "onboarding flow asks for a bedtime".
- **Đề xuất thay đổi:** Chỉ hiện gợi ý khi giá trị do user tự nhập/sửa (hoặc đổi copy thành "giờ mặc định"); sửa comment stale. Hoặc hỏi giờ ngủ/dậy trong onboarding (kết hợp đề xuất #10).
- **Lý do:** App đang bịa một thói quen của user rồi gán cho Koa "để ý" — mất niềm tin đúng lúc tính năng smart cần tin cậy nhất.
- **Độ lớn:** S · **Ưu tiên:** P0

---

## P1 — Đáng làm sớm

### 4. Virtualize thư viện bài tập
- **Vấn đề hiện tại:** `app/exercises.tsx:290` render toàn bộ thư viện bằng `map` trong ScrollView; `hooks/use-library.ts:204-209` không `.limit()` — ~200+ hàng (GlassCard + Pressable + Icon) mount cùng lúc.
- **Đề xuất thay đổi:** Chuyển sang `FlatList`/`FlashList` với `getItemLayout`, giữ group header kiểu SectionList.
- **Lý do:** Đây là list dài duy nhất không virtualize (nutrition đã `.slice()`, search đã `.limit(20)`). Drop frame trên máy yếu khi mở màn + gõ search.
- **Độ lớn:** M · **Ưu tiên:** P1

### 5. Swipe-to-delete cho hàng bài tập và template
- **Vấn đề hiện tại:** `app/exercises.tsx:135-143` xoá bằng nút Trash2 mỗi hàng + `Alert.alert`; template ở `(tabs)/workouts/index.tsx:141-153` cũng vậy. App đã có pattern chuẩn `components/ascnd/swipe-row.tsx` (dùng ở `sessions.tsx:218`).
- **Đề xuất thay đổi:** Bọc hàng trong `SwipeRow` với action Xoá; giữ Alert chỉ cho trường hợp thật sự nguy hiểm.
- **Lý do:** Đúng muscle-memory iOS, bớt nút rác trên mỗi hàng, bớt 1 modal chặn flow.
- **Độ lớn:** M · **Ưu tiên:** P1

### 6. Kế hoạch bữa ăn đánh rơi chất xơ
- **Vấn đề hiện tại:** `app/meal-plan.tsx:462` hiện footnote xin lỗi "ghi từ kế hoạch ăn thì không có chất xơ". Rò rỉ 3 tầng: bảng `meal_plan_items` thiếu cột `fiber_g`; wizard không select fiber (`meal-plan-wizard.tsx:138`); `use-nutrition.ts:988,1000` ghi cứng `fiber_g: 0`. Trong khi tab Dinh dưỡng có mục tiêu fiber.
- **Đề xuất thay đổi:** Thêm cột `fiber_g` (migration), select + lưu trong wizard, cộng dồn khi log; xoá footnote.
- **Lý do:** Dữ liệu đã có ở nguồn (`food_items`); chỉ thiếu ống dẫn. Footnote xin lỗi là nợ UX nhìn thấy mỗi ngày.
- **Độ lớn:** M · **Ưu tiên:** P1

### 7. Pull-to-refresh cho tab Dinh dưỡng
- **Vấn đề hiện tại:** `(tabs)/nutrition.tsx:371` load `useDailyLog()` (remote) nhưng không có `RefreshControl`; tab chính (`index.tsx:1600`) đã có.
- **Đề xuất thay đổi:** Gắn `RefreshControl` gọi refetch/invalidate của daily log (pattern có sẵn).
- **Lý do:** Đúng iOS convention; nhật ký ăn dễ stale sau khi log từ màn khác.
- **Độ lớn:** S · **Ưu tiên:** P1

### 8. Thiếu nút xoá (×) ở ô search tab Dinh dưỡng
- **Vấn đề hiện tại:** `(tabs)/nutrition.tsx:754` thiếu `clearButtonMode`, trong khi `exercises.tsx:159` và `food-list.tsx:146` đều có `"while-editing"`.
- **Đề xuất thay đổi:** Thêm `clearButtonMode="while-editing"` (1 dòng).
- **Lý do:** Nhất quán nội bộ, chuẩn iOS cho search field.
- **Độ lớn:** S · **Ưu tiên:** P1

### 9. Thiếu haptic khi lưu cân nặng
- **Vấn đề hiện tại:** `app/log-weight.tsx:151,220` — nút Lưu → `nav.back()` không rung. Đối chứng: log-sleep (`:282`) và log-biometrics (`:174,181`) đều có `Haptics.success()`.
- **Đề xuất thay đổi:** `Haptics.success()` khi mutation thành công (trong callback, tránh rung trước khi mạng xong).
- **Lý do:** Nhất quán mọi màn log khác; xác nhận xúc giác cho hành động 1 lần/ngày.
- **Độ lớn:** S · **Ưu tiên:** P1

### 10. Màn "gặp Koa" trong onboarding là interstitial trang trí
- **Vấn đề hiện tại:** `components/ascnd/onboarding-flow.tsx:616-626` — 1 bước trong luồng 13 bước chỉ vẽ Koa + 2 dòng chữ, không hỏi/không nhập gì. Bước duy nhất không thu thập dữ liệu.
- **Đề xuất thay đổi:** Bỏ màn này (gộp lời chào vào welcome), **hoặc** thay bằng màn hỏi giờ đi ngủ/dậy — vừa cấp dữ liệu thật cho đề xuất #3, vừa đúng nghĩa "màn trả lại".
- **Lý do:** Mỗi bước thừa trong onboarding là một điểm rơi user.
- **Độ lớn:** S · **Ưu tiên:** P1

---

## P2 — Làm khi rảnh

### 11. Thiếu haptic ở màn Grocery
- **Vấn đề hiện tại:** `app/grocery.tsx` không import haptics; toggle checkbox (`:207`) và nút thêm (`:132`) đều câm.
- **Đề xuất thay đổi:** `Haptics.light()` cho toggle, `light()`/`selection()` cho nút thêm.
- **Lý do:** Checklist đi siêu thị — rung nhẹ = xác nhận đã tick.
- **Độ lớn:** S · **Ưu tiên:** P2

### 12. Debounce ô search thư viện bài tập
- **Vấn đề hiện tại:** `app/exercises.tsx:87` filter đã `useMemo` nhưng list chưa virtualize (#4) → mỗi phím gõ re-render ~200+ hàng.
- **Đề xuất thay đổi:** Debounce search ~200-250ms (pattern đã có ở `nutrition.tsx:776`), hoặc gộp vào #4.
- **Lý do:** Giảm jank khi gõ trên máy cũ; rẻ, không đổi UX.
- **Độ lớn:** S · **Ưu tiên:** P2

### 13. Onboarding hiện "Nước 2500.0 ml mỗi ngày"
- **Vấn đề hiện tại:** `onboarding-flow.tsx:850-853` — `.toFixed(1)` ép thành "2500.0 ml" (dấu thập phân vô nghĩa với ml; chỉ hợp lý cho oz).
- **Đề xuất thay đổi:** ml → số nguyên có dấu nhóm (`toLocaleString`); oz → 1 số lẻ.
- **Lý do:** Màn payoff của onboarding; số trông như bug làm giảm tin vào các số còn lại.
- **Độ lớn:** S · **Ưu tiên:** P2

### 14. Dòng "8,0 hours of sleep a night" sai locale + ghi cứng
- **Vấn đề hiện tại:** `onboarding-flow.tsx:855` — `fillCopy(i18n.obPlanSleep, { h: '8,0' })`: user tiếng Anh đọc "8,0 hours" (dấu phẩy sai); số ghi cứng trong khi `profiles.sleep_target_hours` tồn tại.
- **Đề xuất thay đổi:** Lấy từ `sleep_target_hours` (default 8), định dạng theo locale.
- **Lý do:** Copy sai locale ngay onboarding tạo ấn tượng "dịch cho có".
- **Độ lớn:** S · **Ưu tiên:** P2

---

## Đã kiểm tra và KHÔNG có vấn đề (ghi để khỏi làm lại)
- Keyboard tránh che input (KAV phủ kín form), expo-image 100%, haptics đã gom qua `lib/haptics.ts`
- Empty/loading/error/offline states tốt ở các flows đã quét (log-meal, diary, water, grocery, supplements, shop, challenges, scan-food, sessions, smart-goals, weekly-review, settings)
- AI quota message đã fix đúng (không còn hiện tiếng Việt cho user Anh)
- Tab bar đã là UIKit native; rest-timer tick có bail-out; Reduce Motion được tôn trọng

## Ngoài phạm vi (không đề xuất)
- Dynamic Island Swift/native — Kiệt đang test máy thật
- Scene lifecycle (Expo 57 + Xcode 27) — chờ Kiệt quyết định
- Community (việc của A), file của B
