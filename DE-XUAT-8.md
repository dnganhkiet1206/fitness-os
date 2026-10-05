# ĐỀ XUẤT ĐỢT 8 (DE-XUAT-8) — Targeted pickup round

**Ngày:** 03/10/2026 (đêm) · **Người quét:** C · **Trạng thái:** DONE — đã push

Vòng pickup có mục tiêu (không phải audit rộng). Nhặt các items DEFER nhưng fix được từ DE-XUAT-6/7, + một sweep cuối.

---

## Part 1a — `.eq('user_id')` defense-in-depth (DE-XUAT-7 #8) ✅ DONE

RLS đã guard tất cả, nhưng convention của codebase là filter explicit. 12 sites đã fix (2 sites `meal_entry_items` KHÔNG có cột `user_id` — RLS guard qua parent table, bỏ qua đúng).

**Commit:** _(đang thực hiện)_

| # | File | Query | Thay đổi |
|---|------|-------|----------|
| 1 | use-nutrition.ts | `food_items` select (useFavoriteFoods) | + `.eq('user_id', user!.id)` |
| 2 | use-nutrition.ts | `food_items` delete (useDeleteFoodItem) | + `useAuth()` + filter |
| 3 | use-nutrition.ts | `food_items` update (useToggleFavoriteFood) | + filter |
| 4 | use-nutrition.ts | `meal_entries` select (useDeleteMealItem) | + filter |
| 5 | use-extras.ts | `weekly_challenges` update | + filter |
| 6 | use-extras.ts | `grocery_items` update | + filter |
| 7 | use-extras.ts | `grocery_items` delete | + filter |
| 8 | use-water.ts | `water_logs` delete | + filter |
| 9 | use-progress-photos.ts | `progress_photos` delete | + filter |
| 10 | use-coach-chat.tsx | `ai_conversations` update | + filter (`session!.user.id`) |
| 11 | ai-coach.tsx | `ai_conversations` delete | + filter (`session!.user.id`) |
| 12 | use-library.ts | `supplements` delete | + `useAuth()` + filter |

## Part 1b — TextInput a11y labels (DE-XUAT-6 #14) ✅ DONE

**Commit:** _(đang thực hiện)_

**edit-profile.tsx** (9 sites): name, tdee_target_kcal, 4 macro fields, water target, sleep target, disliked foods — tất cả đã có `accessibilityLabel` từ Field label.

**change-password.tsx** (2 sites): new password, confirm password — đã thêm.

## Part 2 — Final sweep: KHÔNG tìm thấy bug mới

Sweep tập trung vào mechanical consistency và các file vừa sửa. Không phát hiện bug mới nào đủ tiêu chuẩn "real, verifiable, safely fixable". Các sites `.eq('id')` còn lại đều thuộc: (a) bảng không có `user_id` (guard qua parent), (b) file của A/B/D, hoặc (c) đã có RLS + không phải pattern defense-in-depth của codebase.

**Kết luận honesty:** Sau 8 vòng (~60 items fixed), không còn bug nào tôi tự fix an toàn được nữa.
