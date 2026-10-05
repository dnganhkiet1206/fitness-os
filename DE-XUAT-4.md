# ĐỀ XUẤT ĐỢT 4 (DE-XUAT-4) — Bug + UX + UI

**Ngày:** 03/10/2026 (đêm) · **Người quét:** C (+ 4 explorer song song: bugs / ux / ui / data-flow) · **Trạng thái:** 14/14 DONE — đã push hết

Lần quét này tập trung bug thật + UX + UI, tránh trùng DE-XUAT-3 (10/10 done). Tất cả findings đều có file:dòng chứng minh. Theo honesty rule của Kiệt: chỉ báo cái chứng minh được, không bịa thêm.

---

## P0 — Bug/UI gãy, làm ngay

### 1. Meal servings sheet chữ đen trên nền đen ở light mode
- **Evidence:** `src/components/ascnd/today-meals.tsx:1182` — `sheet: { backgroundColor: '#1b1b1f' }` hardcoded; text bên trong đọc theme tokens (`c.foreground` = `#1a1917` ở light).
- **Đo:** title `#1a1917` trên `#1b1b1f` = 1.02:1 (invisible) ở light mode. Dark mode OK (14.66:1). Không có comment giải thích.
- **Fix:** surface theme-aware (`c.card` hoặc material), giữ dark mode nguyên.
- **Commit:** `f58d6b9` (đã push)

---

## P1 — Bug thật / UX gãy

### 2. `routine-day:*` resume-point keys không user-scoped, sống sót sau sign-out
- **Evidence:** `src/lib/local-date.ts:237-239` — `dayProgressKey()` không có user id. `src/lib/query-client.ts` `USER_KEYS` không chứa `routine-day`. `src/components/ascnd/day-plan.tsx:865-913` đọc/ghi trực tiếp.
- **Vấn đề:** User A tick sets → sign-out → user B sign-in cùng máy, mở cùng template cùng ngày → thấy ticks của A như resume point của mình. Rò rỉ health data cross-account (cùng lớp với DE-XUAT-3 #1).
- **Fix:** Thêm `routine-day:` prefix vào sign-out wipe (hoặc user-scope keys).
- **Commit:** `5b4dad6` (đã push)

### 3. Today sleep card hiện giấc ngủ trưa, readiness dùng giấc đêm
- **Evidence:** `src/hooks/use-today-data.ts:71-86` (`useTodaySleep`) — `.order('waketime', desc).limit(1)` = giấc kết thúc muộn nhất (nap). `src/lib/daily-log-service.ts:516` (`recomputeDailyLog`) — dùng `mainSleep()` = giấc DÀI NHẤT (night). Gate `tools/main-sleep.mjs` chỉ pin rule ở daily-log-service, không cover query này.
- **Vấn đề:** Ngày có đêm 8h + nap 1h → card hiện nap (60 phút), readiness tính từ đêm (480 phút). App tự mâu thuẫn trên màn chính. `log-sleep.tsx:91-92` còn prefill nhầm giờ nap.
- **Fix:** `useTodaySleep` dùng cùng logic `mainSleep` (longest), không phải latest waketime.
- **Commit:** `a1d1216` (đã push)

### 4. Challenges: hiện "no challenges" trong lúc loading, lỗi không có retry
- **Evidence:** `src/app/challenges.tsx:25` — chỉ destructure `data`, không đọc `isPending`/`isError`. `:69,105-107` — `challenges?.length > 0 ? list : empty card`.
- **Vấn đề:** Đang load → hiện "không có challenge" (sai sự thật). Query lỗi → kẹt vĩnh viễn ở empty, không có LoadFailed/retry.
- **Fix:** Phân biệt pending/error/empty; thêm `LoadFailed` + retry.
- **Commit:** `a31532b` (đã push)

### 5. Nút "Cho phép camera" chết sau permanent denial
- **Evidence:** `src/app/scan-food.tsx:160-176`, `src/app/scan-barcode.tsx:82-93` — nút gọi `requestPermission()` nhưng không check `canAskAgain`.
- **Vấn đề:** Sau permanent denial, `requestPermission()` resolve mà không hiện dialog → bấm không có gì xảy ra, không lối thoát (chỉ còn Cancel).
- **Fix:** Khi `!canAskAgain`, hiện nút "Mở Settings" (`Linking.openSettings()`).
- **Commit:** `c4155cf` (đã push)

### 6. weekly-review: 4 màu hardcoded, invisible/sai ở light mode
- **Evidence:** `:686` line chart `#ffd93d` (1.38:1 trên nền trắng, invisible); `:91,579,634,636` `#dc2f2f` (dark mode muddy, bypass `destructive`); `:655` `#ef7c26`, `:663` `#b45cff` (light mode drift).
- **Fix:** Dùng tokens (`c.destructive`, `metricOrange`, `metricPurple`, readiness colors). Một commit.
- **Commit:** `5458cf3` (đã push)

### 7. AI meal-suggest: màu macro sai hệ thống MACRO_TINT
- **Evidence:** `src/components/ascnd/ai-meal-suggest.tsx:126-129` — protein `c.primary` (bạc), fat `#b45cff` (tím, không phải màu macro). `MACRO_TINT` document: protein=`metricRose`, carbs=`metricOrange`, fat=`metricBlue`, fiber=`readinessGreen` ("màu của bốn chất, ở MỘT chỗ").
- **Fix:** Dùng `MACRO_TINT` tokens.
- **Commit:** `1e7c534` (đã push)

### 8. Weight-goal nút "Done" invisible ở light mode
- **Evidence:** `src/components/ascnd/weight-goal-dialog.tsx:341-343` — `backgroundColor: '#f5f5f5'` trên `c.background` light `#f7f4ef` = 1.01:1 (không thấy biên nút).
- **Fix:** Dùng `primary`/`primaryForeground` tokens.
- **Commit:** `9d8f8b6` (đã push)

---

## P2 — Đáng làm

### 9. Sleep/Nutrition Insights: flash "no data" trong lúc loading
- **Evidence:** `src/app/sleep-insights.tsx:75,228` (không đọc `isPending`, `!stats` → EmptyState ngay); `src/app/nutrition-insights.tsx:43,103` (tương tự).
- **Fix:** Hiện skeleton/loading khi `isPending`, chỉ EmptyState khi load xong mà trống. Một commit (cùng pattern).
- **Commit:** `f70c60d` (đã push)

### 10. UTC date bugs: nutrition-history + measurements-trend
- **Evidence:** `src/hooks/use-today-data.ts:190` — `toISOString().split('T')[0]` bound cột local-date (owner UTC+7 mở app 00:00-07:00 → lệch 1 ngày, "7-day" hiện 8 ngày). `src/app/measurements-trend.tsx:67` — `new Date(p.t).toISOString().split('T')[0]` plot sai ngày (gate `day-window.mjs` không bắt được form `new Date(p.t)`).
- **Fix:** Dùng `localDateStr()`. Một commit (cùng pattern).
- **Commit:** `9660229` (đã push)

### 11. Day-switch ghi state ngày cũ vào key ngày mới
- **Evidence:** `src/components/ascnd/day-plan.tsx:865` (read effect: `setLoaded(false)` async) vs `:948-958` (write-back chạy với closure cũ: `loaded=true`, state ngày cũ, `storeKey` mới).
- **Vấn đề:** Kill app trong window → key ngày mới giữ ticks ngày cũ vĩnh viễn. Path deterministic khi blob corrupt.
- **Fix:** Gate write-back bằng ref ghi nhận key mà state được load từ.
- **Commit:** `01c7fa8` (đã push)

### 12. AI meal-suggest lỗi: hiện "no ideas" như kết quả rỗng, không retry
- **Evidence:** `src/app/log-meal.tsx:416-419` — `onError` chỉ `setSuggestions([])`; `:730-732` hiện `nAiNoIdeas` giống hệt kết quả rỗng thật.
- **Fix:** State `suggestError`, hiện retry button khi lỗi.
- **Commit:** `511e216` (đã push)

### 13. `?date=` không validate → save crash với RangeError
- **Evidence:** `src/app/log-meal.tsx:98` — `dateParam ?? localDateStr()` không validate; `diaryStampAt` gọi `.toISOString()` trên Date invalid → throw trong save handler (`:518`). Cùng màn hình validate `meal` param (`:118-129`), `diary.tsx:75-77` validate `date` param — đây là gap.
- **Fix:** Validate `dateParam` (format YYYY-MM-DD, ≤ today) như diary.
- **Commit:** `ad500e1` (đã push)
- **Caveat:** cần deep link thủ công mới trigger; in-app links luôn valid.

### 14. Health source card hardcode dark destructive
- **Evidence:** `src/components/ascnd/health-source-card.tsx:12` — `TINT = '#ff3b5c'` (= dark `destructive`; light là `#de0b44`).
- **Fix:** `c.destructive`.
- **Commit:** `675296d` (đã push)

---

## SKIP — có lý do, không làm

| # | Item | Lý do skip |
|---|------|-----------|
| S1 | Spanish ternaries (27+ chỗ `vi?...:...` bypass i18n) | Real (P1) nhưng cần 27+ bộ 3 ngôn ngữ vi/en/es mới. Scope lớn, rủi ro dịch sai. Nên làm dedicated i18n pass. |
| S2 | today-training.tsx + workout-picker-sheet.tsx bypass GLYPH_TINT | File của D (`[D] issue 221`). Không đụng phạm vi D. Đã note để route sang D. |
| — | DE-XUAT-3 items | Đã done, không làm lại. |

## Đã kiểm tra và KHÔNG vấn đề (khỏi làm lại)
- Query invalidation sau mutations: đủ (nutrition, water, fitness, sleep, profile, grocery, meal-plan)
- Optimistic rollbacks: đúng (patchDiary, patchWater, useOnlineMutation)
- Subscriptions: tất cả có cleanup, không leak
- AsyncStorage: mọi setItem đều có getItem tương ứng (trừ #2)
- Midnight-boundary writes: đọc day tại tap time, đúng
- Error copy tập trung, offline queues, nav double-push guard: solid
- Camera/photo chrome trắng: intentional, đã đo
- Radii/spacing: đa số dùng tokens, các отклонение đã document

## Ngoài phạm vi
- Dynamic Island Swift — Kiệt đang test máy thật
- Scene lifecycle Expo 57/Xcode 27 — chờ Kiệt quyết
- Community (việc của A), file của B/D
- 4 migrations pending `supabase db push`
