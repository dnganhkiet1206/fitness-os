# ĐỀ XUẤT ĐỢT 7 (DE-XUAT-7) — Security / Data integrity / Edge-case verification

**Ngày:** 03/10/2026 (đêm) · **Người quét:** C (+ 3 explorer chuyên sâu: security / data-integrity / edge-case) · **Trạng thái:** 2/8 DONE (1 P1 + 1 P2), 6 DEFER có lý do — đã push

Vòng 7 đào các mảng chưa cover: security, data integrity, và verify lại các fix khó gần đây. Tất cả findings có file:dòng chứng minh. Theo honesty rule của Kiệt: chỉ báo cái chứng minh được.

---

## P1 — Bug thật

### 1. Food library custom entries không validate số (âm / typo khổng lồ ghi thẳng DB)
- **Evidence:** `native/src/app/food-editor.tsx:111` — `const num = (v: string) => Number(v) || 0` (không range check); `:121` `canSave` chỉ check tên; `:123-133` pass thẳng vào mutation. `native/src/hooks/use-nutrition.ts:222-224` (create) / `:235-237` (update) insert/update không validate. Không có CHECK constraint trên `food_items` numeric columns trong migrations (chỉ RLS ownership).
- **Hậu quả cụ thể:** `Number('-50') || 0` = `-50` (paste số âm hoặc typo `100000` kcal ghi thẳng DB). Garbage lan tiếp: `resyncMealEntry` sum raw (`Number(r[k]) || 0` giữ số âm) → `daily_logs.kcal` → `adaptiveTDEE` 14-day regression → readiness score → weekly review. Chính codebase document failure mode này ở `log-meal.tsx:298-306` ("one wild row moves the target") — path meal-logging có bounds, path library editor không.
- **Fix:** Thêm plausible bounds validation ở food-editor trước save (create + update chung path).
- **Commit:** _(đang thực hiện)_ ✅ DONE

### 2. Supabase auth session (refresh token) nằm plaintext trong AsyncStorage
- **Evidence:** `native/src/integrations/supabase/client.ts:11` — `storage: AsyncStorage, persistSession: true`. Zero `expo-secure-store` usage trong cả app (không import, không có trong package.json).
- **Vấn đề:** Refresh token long-lived nằm file unencrypted trong app sandbox → đọc được từ unencrypted backup / file extraction → full account access không cần device.
- **Fix:** Storage adapter dùng `expo-secure-store` (LargeSecureStore pattern) + migration session cũ. **DEFER:** cần thêm native dependency + migration session, không verify được trên Linux, blast radius cao nếu sai → cần Kiệt quyết.

---

## P2 — Đáng làm

### 3. Xoá sleep/workout log không xoá mirror trong Apple Health (part (c) của fix 0f6211a chưa làm)
- **Evidence:** `native/src/hooks/use-fitness-data.ts:1171` (`useDeleteSleepLog`), `:210` (`useDeleteWorkoutSession`) — chỉ xoá Supabase row. Library đã expose `deleteObjects` (`healthkit.ios.ts:360`) nhưng không ai gọi.
- **Hậu quả:** Samples `ascnd:`-stamped mồ côi tích tụ trong Apple Health; user thấy đêm/workout đã xoá vẫn hiện trong app Health; log lại đêm đó ghi thêm mirror mới chồng lên.
- **Fix:** Gọi `deleteObjects` khi xoá sleep/workout log.
- **Quyết định:** **DEFER** — cần native API details (query by metadata → HK UUID → delete) không verify được trên Linux. P2 cosmetic (orphan samples trong Health app, không corrupt data). Ghi nhận để làm khi có device test.

### 4. Password-recovery deep link trỏ tới route không tồn tại
- **Evidence:** `native/src/hooks/use-auth.tsx:196` — `redirectTo: Linking.createURL('/auth?type=recovery')`. Không có `src/app/auth*` route. `change-password.tsx` chỉ handle in-session update. `detectSessionInUrl: false` nên client không consume token từ URL.
- **Vấn đề:** Tap link recovery trong email → deep link chết (không match route). Recovery flow in-app hiện không hoạt động.
- **Fix:** **DEFER:** cần quyết định product về recovery UX (tạo route /auth consume token, hay đổi redirectTo). Không tự quyết flow auth.

### 5. DI `AdjustRestIntent` lost-update race (double-tap ±15s)
- **Evidence:** `native/modules/ascnd-native/ios/Widgets/RestTimerIntents.swift:113` — 2 taps nhanh đọc cùng `ContentState` trước khi `activity.update` land → tap sau đè tap trước (double-tap chỉ apply 1 lần).
- **Fix:** **DEFER:** cần Swift concurrency (serial queue/actor), không compile/verify được trên Linux. Tần suất thấp, self-correcting ở tap tiếp theo.

### 6. DI intent không có `REST_MAX` cap (app cap 600s)
- **Evidence:** `RestTimerIntents.swift` — paused branch floor 1s nhưng không cap trên; app `onAdjust` cap 600s.
- **Fix:** Thêm cap 600s trong intent (mirror app behavior).
- **Commit:** _(đang thực hiện)_ ✅ DONE

### 7. React Query cache (health data) persist unencrypted
- **Evidence:** `native/src/lib/query-client.ts:120-127` — `createAsyncStoragePersister({ storage: AsyncStorage })`; health queries (`sleep_history`, `readiness_history`, `meal_plans`, workout/diary/biometric) vào cache plaintext.
- **Fix:** **DEFER:** cùng root cause với #2 (không có encrypted storage layer). Fix chung khi làm #2.

### 8. Thiếu `.eq('user_id')` ở ~12 queries (defense-in-depth)
- **Evidence:** `use-nutrition.ts:37-48` (useFavoriteFoods), `:251/:318/:699/:791/817`, `use-extras.ts:741/:887/:904`, `use-water.ts:292`, `use-progress-photos.ts:136`, `use-coach-chat.tsx:379`, `ai-coach.tsx:125`, `use-library.ts:179` — đều chỉ `.eq('id', …)`.
- **Fix:** **DEFER:** RLS đã guard tất cả (policies đúng); đây là convention-only. 12 sites / 7 files — dedicated pass riêng nếu muốn.

---

## Đã kiểm tra và KHÔNG vấn đề (khỏi làm lại)
- **Secrets:** không có service_role/server keys; chỉ anon key (bình thường với RLS); Sentry DSN từ env; không hardcoded tokens.
- **Admin auth:** server-side (RPCs check role trong DB); client chỉ gate rendering.
- **Logs/telemetry:** Sentry hardened (no PII, no screenshots, scrubbing); không console.log sensitive data.
- **WebView/URLs:** không WebView; external links fixed hrefs; không openURL với untrusted input; không http://.
- **Deep links:** chỉ custom scheme `ascnd`, không universal links; params đã validate; không có gì unvalidated tới file/SQL.
- **Apple Sign-In nonce:** đúng (SHA-256 cho Apple, raw cho Supabase).
- **Sign-out sweeps:** VERIFIED COMPLETE — 19 USER_KEYS + routine-day:* prefix sweep + clearWidgetData + cancelAllReminders; gate signed-out.mjs pass; không còn dynamic keys lọt.
- **UTC dates:** VERIFIED COMPLETE — zero `toISOString().split('T')[0]` bucketing còn lại; mọi DATE binding dùng localDateStr.
- **HealthKit import filters:** VERIFIED COMPLETE — getRecentWorkouts/getLastNightSleep filter `ascnd:` metadata; không còn import path nào thiếu filter.
- **XP/coins/streak/awards:** VERIFIED CLEAN — server-side pricing, advisory locks, UNIQUE constraints, idempotent request ids.
- **Upserts:** mọi onConflict target khớp unique constraints trong migrations.
- **Swift bridge contract:** VERIFIED — 7/8 positional args khớp, types khớp, không force unwrap, echo loop impossible.

## Ngoài phạm vi
- Dynamic Island Swift device test — Kiệt đang test máy thật
- Scene lifecycle Expo 57/Xcode 27 — chờ Kiệt quyết
- Community (việc của A), file của B/D
- Migrations pending `supabase db push`
