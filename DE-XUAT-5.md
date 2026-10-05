# ĐỀ XUẤT ĐỢT 5 (DE-XUAT-5) — Bug hunt sâu

**Ngày:** 03/10/2026 (đêm) · **Người quét:** C (+ 4 explorer song song: logic / state / integration / regression) · **Trạng thái:** 10/10 DONE — đã push hết

Vòng này đi sâu vào logic, state races, integration — các mảng ít được cover ở DE-XUAT-3/4. Tất cả findings đều có file:dòng chứng minh. Theo honesty rule của Kiệt: chỉ báo cái chứng minh được, không bịa thêm.

---

## P0 — Sai dữ liệu sức khoẻ, làm ngay

### 1. HealthKit write-back ↔ import feedback loop: workout duplicate + sleep đã xoá sống lại
- **Evidence:**
  - Write: `src/lib/health.ts:112-122` (xin quyền write workout+sleep), `src/hooks/use-fitness-data.ts:475-498` (write sau mỗi save), `src/app/log-sleep.tsx:279`. Samples đóng dấu `HKExternalUUID: ascnd:<recordId>` (`lib/health.ts:628-631`) nhưng **read path không bao giờ check**.
  - Import không filter: `lib/health.ts:571-595` (`getRecentWorkouts`, 7 ngày), `lib/health.ts:444-543` (`getLastNightSleep`, 36h).
  - Upsert workout: `src/hooks/use-health-sync.ts:199-210` — sample do app tự ghi có HealthKit UUID mới → không conflict → **thêm 1 row thứ hai** cho cùng buổi tập (`source: APPLE_SOURCE`, `sets: []`, `volume_load: 0`). Path sleep có manual-overlap guard (`:140-187`), path workout **không có**.
  - Xoá không dọn mirror: `use-fitness-data.ts:1163-1184` (`useDeleteSleepLog`) chỉ xoá DB row; bản HealthKit còn → sync sau re-import như `APPLE_SOURCE` → **đêm đã xoá sống lại**, làm lệch `sleepDebt7d` (sleep = 0.30 readiness).
- **Fix:** (a) Lọc samples của chính app khi import (check `HKExternalUUID` metadata); (b) thêm manual-overlap guard cho workout như sleep path; (c) xoá/đánh dấu mirror HealthKit khi xoá sleep log.
- **Commit:** `0f6211a` (đã push)

---

## P1 — Bug thật

### 2. Xoá 1 set → `session_rpe` bị ghi đè thành 1 (lệch readiness/ACWR)
- **Evidence:** `src/hooks/use-fitness-data.ts:763-766` — `session_rpe: Math.max(1, ...left.map((x) => Number(x.rpe) || 0))`. App chỉ hỏi RPE 1 lần cho cả buổi (`app/log-workout.tsx:123`), per-set rpe luôn `null` → kết quả luôn = 1. `sessionLoad` = rpe × reps → load xẹp ~8× → lệch `trainingLoad7d/28d` → ACWR → readiness. Chính file ở `:709` thừa nhận không dựng lại được `session_rpe` từ sets — nhưng `:763` lại làm đúng việc đó.
- **Fix:** Giữ nguyên `row.session_rpe` khi xoá set (xoá set không đổi cảm nhận RPE cả buổi).
- **Commit:** `265d57c` (đã push, gộp với #3-4)

### 3. Xoá 1 set → warm-up sets bị tính vào `volume_load`
- **Evidence:** `src/hooks/use-fitness-data.ts:759-761` — recompute không loại warm-up, trong khi path lưu buổi (`:418-423`) loại trừ rõ ràng ("a rehearsal is not the session's work"). Mâu thuẫn luật của chính file.
- **Fix:** Thêm warm-up exclusion khi recompute (cùng commit với #2).
- **Commit:** `265d57c` (đã push, gộp với #2,4)

### 4. Concurrent unticks clobber nhau — 1 untick mất lặng lẽ
- **Evidence:** `src/hooks/use-fitness-data.ts:715-783` — read-modify-write: `select` row, cắt set cuối, `update` lại. `day-plan.tsx:1904` (checkbox) và `:1215-1237` (Alert confirm) không có `cutSet.isPending` guard. Race: 2 mutations đọc cùng `[s1,s2]`, cùng cắt `s2`, cùng ghi `[s1]` → 1 set sống sót dù user đã untick cả hai; `invalidate()` → `proven` re-tick row đã untick.
- **Fix:** Disable checkbox/confirm khi `cutSet.isPending` (guard ở `toggle`, kèm haptic).
- **Commit:** `265d57c` (đã push, gộp với #2-3)

### 5. `loadConversation` race — hiện sai conversation, reply lưu nhầm chỗ
- **Evidence:** `src/hooks/use-coach-chat.tsx:214-241` — await fetch xong mới set `convoIdRef`/`setConversationId`/`setMessages`, không có generation guard (trong khi `send` có `loadingRef`). `ai-coach.tsx:431-434` tap history row không guard. Race: tap A rồi B nhanh → B hiện → A resolve sau đè lên → user thấy A, `send()` tiếp lưu vào A qua `convoIdRef`.
- **Fix:** Generation counter, drop stale resolutions.
- **Commit:** `695032c` (đã push, gộp với #6)

### 6. Mutation `onSuccess` → `nav.back()` sau khi màn đã đóng — pop nhầm màn
- **Evidence:** Mọi sheet X luôn active; React Query mutations sống qua unmount → `onSuccess` chạy sau khi user đã back → `nav.back()` pop màn đang ở trên cùng. `nav-guard.ts` chỉ dedupe trong transition. Codebase đã đặt tên class này ở `change-password.tsx:35-38` và fix bằng `useOperation` — các màn sau vẫn làm: `log-meal.tsx:500-508`, `log-sleep.tsx:286-297`, `log-biometrics.tsx:196-201`, `log-workout.tsx:556-564` (`finish()`), `log-weight.tsx:150` (qua `use-weight-write.ts:92-97`), `food-editor.tsx:134-139` + `:154-159`, `edit-profile.tsx:327-331`. Trigger: tap Save rồi tap X trước khi request xong (dễ trên mạng chậm).
- **Fix:** Hook `useMountedRef` mới + guard 7 màn (log-meal/sleep/biometrics/workout/weight, food-editor, edit-profile).
- **Commit:** `695032c` (đã push, gộp với #5)

### 7. Widget "Today's Workout" payload luôn báo full progress
- **Evidence:** `src/hooks/use-fitness-data.ts:1270-1271` — `completedExercises: sets.length, totalExercises: sets.length` → Swift vẽ full bar + "12/12" vĩnh viễn. Kép: (a) progress vô nghĩa by construction; (b) `sets` đếm set entries, không phải exercises. `nextExerciseName` (khai báo trong `widget-data.ts`) không bao giờ được populate.
- **Fix:** Đếm distinct exercises thay vì set rows (truthful, không fake 100%).
- **Commit:** `87732a4` (đã push, gộp với #8-10)

---

## P2 — Đáng làm

### 8. `ai-meal-suggest` ở log-meal luôn trả tiếng Việt (thiếu `lang`)
- **Evidence:** Server đọc `lang` (`supabase/functions/ai-meal-suggest/index.ts:27,110`); caller `log-meal.tsx:412-417` gửi `{ meal_type, date, tzOffset }` không có `lang` (dù `lang` có trong scope `:84`). Caller sibling `ai-meal-suggest.tsx:53-62` có gửi.
- **Fix:** Thêm `lang` vào params (1 dòng).
- **Commit:** `87732a4` (đã push, gộp với #7,9,10)

### 9. `useRecentMeals` chỉ trông chờ RLS, không `.eq('user_id')`
- **Evidence:** `src/hooks/use-nutrition.ts:1037-1053` — query duy nhất trong file không có `.eq('user_id')`. RLS đã bật và đúng (migration `20260212040248:88-89`), PostgREST apply RLS trước LIMIT → không leak hôm nay. Nhưng defense-in-depth: thêm explicit filter cho nhất quán.
- **Fix:** Thêm `.eq('user_id', user!.id)` (1 dòng).
- **Commit:** `87732a4` (đã push, gộp với #7-8,10)

### 10. `scan-barcode` `onScanned` navigate sau unmount
- **Evidence:** `src/app/scan-barcode.tsx:56-80` — async handler: `lockedRef` → await `lookupBarcode()` → `setPendingScan` + `nav.back()`/`nav.replace`. X ở `:93`,`:126` cho user rời giữa lookup → continuation muộn pop/replace nhầm màn. `scan-food.tsx:76-84` guard bằng `useOperation`; `scan-barcode.tsx` không.
- **Fix:** Bọc `onScanned` trong `useOperation` như scan-food.
- **Commit:** `87732a4` (đã push, gộp với #7-9)

---

## Đã kiểm tra và KHÔNG vấn đề (khỏi làm lại)
- Regression check: widget memoization (1cee141) deps đúng, context vẫn flow, gates bar-track/water-glass pass + negative-tested; Stepper migration (17fee87) giữ behavior; ExplainerSheet (3a0b6d8) byte-identical; 01c7fa8/a1d1216/9660229/5b4dad6 đều đúng → **0 regression**
- Notifications: dedup queue, reminder dates, MAX_PENDING trim, sign-out cancel — clean
- Health-sync upsert idempotency, recomputeDailyLog CAS guards — clean
- Water add/remove isPending guards, meal delete self-heal, append-to-session guard — clean
- Query invalidation, optimistic rollbacks, subscriptions cleanup — clean (đã verify DE-XUAT-4)

## Ngoài phạm vi
- Dynamic Island Swift — Kiệt đang test máy thật
- Scene lifecycle Expo 57/Xcode 27 — chờ Kiệt quyết
- Community (việc của A), file của B/D
- 4 migrations pending `supabase db push`
