# ĐỀ XUẤT ĐỢT 3 (DE-XUAT-3) — Quét toàn app ASCND

**Ngày:** 03/10/2026 (tối) · **Người quét:** C (+ 4 explorer song song) · **Trạng thái:** 10/10 DONE — đã push hết

Lần quét này tìm bug/UX/infra còn sót sau DE-XUAT (14 items) và DE-XUAT-2 (18 items). Tất cả findings đều có file:dòng chứng minh. Theo honesty rule của Kiệt: chỉ báo cái chứng minh được, không bịa thêm.

---

## P0 — Bug thật, làm ngay

### 1. Sign-out không xoá widget data iOS — dữ liệu user cũ lọt sang account mới ✅ DONE
- **Evidence:** `src/lib/query-client.ts:250-256` — `clearUserScopedStorage()` xoá `ascnd.widget.todayWorkout`/`streakReadiness` trong AsyncStorage, nhưng comment thừa nhận: *"AsyncStorage.removeItem không với tới App Group; cần gọi native clear khi App Group provision (TODO)."* Widget data thật nằm ở App Group shared UserDefaults (`src/native/ios/widget-data.ts:40-41`). Grep `clear` trong `widget-data.ts`/`ASCNDNative.ts` = 0 — không tồn tại hàm native clear.
- **Vấn đề:** User A sign-out → user B sign-in trên cùng máy → widget home screen hiện "today's workout" + streak của user A cho tới khi có push mới đè lên. Rò rỉ dữ liệu sức khoẻ cross-account.
- **Fix:** Thêm `clearWidgetData()` vào Expo module `AscndNative` (Swift) + facade TS, gọi từ `forgetPreviousAccount()` trong `use-auth.tsx` (lib/ không được import từ native/). Fire-and-forget, null-safe.
- **Commit:** `b03df9c` (đã push)

### 2. `/templates` không có nút back — màn pushed duy nhất thiếu chevron ✅ DONE
- **Evidence:** `src/app/templates.tsx:75` — `<Screen>` không có prop `back`; 0 hit `nav.back`/`ChevronLeft` trong file. Mọi màn pushed khác đều có back.
- **Vấn đề:** Trên iOS không có cách visible nào để quay lại từ Workout list (chỉ còn edge-swipe).
- **Fix:** Thêm prop `back`.
- **Commit:** `e966221` (đã push)

### 3. `LoadFailed` không có nút retry ở exercise-insight + diary ✅ DONE
- **Evidence:** `src/app/exercise-insight.tsx:387-389` (`loading ? null` = màn trắng + `LoadFailed` không `onRetry`); `src/app/diary.tsx:192` (tương tự). `load-failed.tsx:60-66` — `onRetry` optional, không truyền thì không có nút.
- **Vấn đề:** Read lỗi → user kẹt ở card lỗi, chỉ còn cách pull-to-refresh (mà không phải ai cũng biết).
- **Fix:** Truyền `onRetry` + skeleton lúc loading ở exercise-insight.
- **Commit:** `e966221` (đã push) (gộp với #2)

---

## P1 — Đáng làm sớm

### 4. Ba empty-state tự vẽ, bypass `EmptyState` (21 adopters) ✅ DONE
- **Evidence:** `src/app/grocery.tsx:237-242`, `src/app/smart-goals.tsx:310-313`, `src/app/biometrics.tsx:146-158` — mỗi nơi một kiểu (có card/không card, có icon/không icon).
- **Fix:** Migrate cả 3 sang `EmptyState`.
- **Commit:** `afcd2d6` (đã push)

### 5. `LANGUAGES` export nhưng chết — settings.tsx hardcode list riêng ✅ DONE
- **Evidence:** `src/lib/i18n.ts:12-16` export `LANGUAGES` (0 reference); `src/app/settings.tsx:843-863` tự build options bằng tay.
- **Vấn đề:** Thêm ngôn ngữ thứ 4 vào `i18n.ts` mà picker vẫn 3 — drift âm thầm.
- **Fix:** settings.tsx generate options từ `LANGUAGES` (giữ hàng 'system').
- **Commit:** `241d3f5` (đã push)

### 6. `STORAGE_KEYS` export nhưng 0 consumer ✅ DONE
- **Evidence:** `src/lib/query-client.ts:293` — 0 reference. Gate `linked.mjs` chỉ quét `export function` nên không thấy.
- **Fix:** Xoá (không ai dùng; diagnostics chưa cần).
- **Commit:** `241d3f5` (đã push) (gộp với #5)

### 7. `IconButton` chết — 0 importer, 119 dòng ✅ DONE
- **Evidence:** `src/components/ascnd/icon-button.tsx` — 0 importer (chỉ có `tools/tap-targets.mjs:77` exempt). Doc comment stale ("229 Pressables", thực tế 121).
- **Fix:** Xoá file + gỡ exemption trong gate.
- **Commit:** `241d3f5` (đã push)

---

## P2 — Chất lượng engineering

### 8. 4 stepper tự vẽ → 1 shared `Stepper` ✅ DONE
- **Evidence:** `day-plan.tsx:2076` (44×32 rect), `today-meals.tsx:1016` (44×44 circle), `log-meal.tsx:831` (28×28 raw Pressable), `workout-set-sheet.tsx:75` (bản đầy đủ nhất: typing + clamp + disabled + haptics).
- **Fix:** Extract bản workout-set-sheet thành `ascnd/stepper.tsx` với props giữ nguyên visual từng nơi (variant/size), migrate 3 chỗ còn lại. Không đổi visual.
- **Commit:** `17fee87` (đã push)

### 9. 4 explainer sheet trùng shell → `ExplainerSheet` ✅ DONE
- **Evidence:** `activity-explainer.tsx` (118), `nutrition-explainer.tsx` (104), `readiness-explainer.tsx` (265), `training-explainer.tsx` (224) — mỗi file ~40 dòng shell giống hệt (FormSheet + usePalette + useI18n + useAppSettings).
- **Fix:** `ascnd/explainer-sheet.tsx` nhận `title/lede/rows`; 4 file chỉ còn content.
- **Commit:** `3a0b6d8` (đã push)

### 10. Thiếu index `community_challenge_members(user_id)` ✅ DONE
- **Evidence:** `supabase/migrations/20260930120000_community_challenges.sql:62-68` — PK `(challenge_id, user_id)`, 0 index; query `WHERE m.user_id = auth.uid()` trong history function chạy mỗi lần mở tab challenge.
- **Fix:** Migration mới `CREATE INDEX`. Zero behavior change, pure perf. (Nhờ A cross-check vì là domain community.)
- **Commit:** `81ff6c4` (đã push) + migration `20261003210000_community_challenge_members_user_idx.sql`

---

## SKIP — có lý do, không làm

| # | Item | Lý do skip |
|---|------|-----------|
| S1 | `ai_credits` không bao giờ được nạp / nhánh `overage` dead | Cần quyết định product của Kiệt: build hệ thống nạp credit hay gỡ nhánh. Không tự quyết. |
| S2 | `decided_by`/`removed_by` không hiện trong admin UI | File của A (`use-admin.ts`, màn admin) — không đụng. Đã note sang #6 nhờ A. |
| S3 | `ai_usage.overage_tokens` ghi không ai đọc | Cần quyết định: surface ở admin (việc của A) hay drop cột. Không tự quyết. |
| S4 | Drop các cột chết (`price_per_serving`, `caffeine_cutoff_time`, `screen_off_time`, `cycle_start_date`) | Drop column không đảo ngược được, giá trị thấp. Ghi nhận ở đây thay vì migration. |
| S5 | `profiles.work_type` không ai đọc/ghi | Cần quyết định product: dùng để tính TDEE/activity thì mới đáng wire; không thì drop. Không tự quyết. |
| S6 | Regenerate `types.ts` (thiếu bảng AI) | Cần DB connection (`supabase gen types`); VM không có. Nhờ người có DB chạy. |
| S7 | Push notification server-driven | Đã note từ DE-XUAT-2 — cần quyết định hạ tầng của Kiệt. |
| S8 | IAP `verifyPurchase`/`storeWebhook` | Quyết định kinh doanh (LAUNCH.md). |

## Đã kiểm tra và KHÔNG vấn đề (khỏi làm lại)
- Orphan screens: không có (coach-memory, weekly-review, log-weight đều reachable)
- Destructive actions: tất cả đều có Alert confirm hoặc undo-toast
- Forms: tất cả surface errors
- Pull-to-refresh: đủ trên các màn server-data
- Dead props: quét 133 components, không có
- Haptics/touch-targets: nhất quán, ≥44pt
- Mọi edge function đều được gọi; không polling server; không N+1
- RLS: không thấy lỗ hổng cần can thiệp

## Ngoài phạm vi
- Dynamic Island Swift — Kiệt đang test máy thật (commit `017b96d` chờ rebuild)
- Scene lifecycle Expo 57/Xcode 27 — chờ Kiệt quyết
- Community (việc của A), file của B/D
- 27 gates đỏ từ commit es của D — không đụng phạm vi D
