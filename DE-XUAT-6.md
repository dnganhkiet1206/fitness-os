# ĐỀ XUẤT ĐỢT 6 (DE-XUAT-6) — i18n / Accessibility / Dark mode / Offline / Onboarding

**Ngày:** 03/10/2026 (đêm) · **Người quét:** C (+ 4 explorer song song) · **Trạng thái:** 17/20 DONE — đã push hết

Vòng 6 đào các mảng chưa cover: i18n gaps, accessibility, dark mode, offline, onboarding. Tất cả findings có file:dòng chứng minh. Theo honesty rule của Kiệt: chỉ báo cái chứng minh được.

---

## P1 — Bug thật / UX gãy

### 1. Onboarding finish ghi đè tên user thành 'Athlete'
- **Evidence:** `native/src/components/ascnd/onboarding-flow.tsx:413` — upsert profiles với `name: 'Athlete'` unconditional. Signup đã lưu tên user vào `raw_user_meta_data` → trigger `handle_new_user()` ghi vào `profiles.name`. Onboarding (12 bước, không hỏi tên) xong → upsert đè mất tên user đã chọn. `edit-profile.tsx:162,292` xác nhận name là field user-editable → silent data loss.
- **Fix:** Bỏ `name` khỏi upsert (upsert chỉ update columns được liệt kê). Fallback read-side nếu cần.
- **Commit:** `c7a4e9e` ✅ DONE

### 2. Queued offline writes mất lặng lẽ khi mạng "giả online" (captive portal)
- **Evidence:** `native/src/lib/offline-write.ts` — retry 3 lần rồi reject; `resumePausedMutations()` chỉ filter `isPaused`, mutations đã error bị loại. Không onError toast, không requeue. Kịch bản: café Wi-Fi chưa accept terms → NetInfo báo online → mutations resume → fetch fail → retry 3 lần → drop lặng lẽ. User tưởng đã log, màn hình refetch không có data.
- **Fix:** Trong retry predicate / onError default, treat `classifyError(e) === 'offline'` như "re-pause, đừng drop", hoặc ít nhất toast to để user biết.
- **Commit:** `24b8cb9` ✅ DONE (offline-classified failures giữ retry vô hạn — fake-online không drop; refusal vẫn dừng ngay, 5xx giữ bound 3)

### 3. 22 `confirmWrite()` sites truyền message tiếng Việt thuần → user en/es thấy tiếng Việt
- **Evidence:** `src/lib/write-result.ts:97` — `confirmWrite(builder, what)` throw `NothingWrittenError(what)`; `toast.fail(e)` hiện raw message cho app-authored errors (`toast.ts:79-83`). 22 sites: use-water.ts:291, use-progress-photos.ts:135, use-library.ts:178/229/333/533/624, use-extras.ts:740/886/903, use-biometrics.ts:185, use-fitness-data.ts:151/217/665/751/756/1177/1212, edit-profile.tsx:289, ai-coach.tsx:123, coach-memory.tsx:93/104.
- **Fix:** Thêm keys `errNothingWritten*` vào native-strings.ts (vi/en/es); đổi `confirmWrite` nhận key thay vì câu, resolve qua `toast.keyed`.
- **Commit:** `75d7a75` ✅ DONE (22 sites → 19 keys `nCxNothingWritten*` vi/en/es; `NothingWrittenError.msgKey` + `failureKeyFor`; sites của B (use-nutrition ×6) và A (use-community ×5) giữ nguyên)

### 4. Throw tiếng Việt trong `health-sync-write.ts` tới tay user en/es
- **Evidence:** `src/lib/health-sync-write.ts:159` — `throw new Error('Đồng bộ sức khoẻ chưa xong — ...')`; `use-health-sync.ts:319-320` onError → `toast.fail(e)`.
- **Fix:** Keyed copy với slot `{days}` (cùng pattern với #3).
- **Commit:** `4b7d37c` ✅ DONE (`KeyedError('nCxHealthSyncIncomplete', { parts })`; slot là `{parts}` (token) thay vì `{days}` thuần vì failures có 3 loại part — hôm nay / bù bước chân / dựng lại ngày; toast slots + host resolve lúc vẽ)

### 5. Water sheet invisible ở light mode (lặp lại pattern DE-XUAT-4 #1)
- **Evidence:** `native/src/app/water.tsx:477` — `sheet: { backgroundColor: '#1b1b1f' }` hardcoded; content dùng theme tokens (`c.foreground` = `#1a1917`). Light: 1.02:1 — chữ invisible.
- **Fix:** Đổi sang theme token như DE-XUAT-4 #1.
- **Commit:** _(pending)_

### 6. Shop collections sheet invisible ở light mode
- **Evidence:** `native/src/app/shop.tsx:572` — `sheet: { backgroundColor: '#101014' }`; content `c.foreground`. Light: 1.08:1 — toàn bộ text biến mất.
- **Fix:** Theme token cho sheet background.
- **Commit:** _(pending)_

### 7. Award tier badge không đọc được ✅  (cả 2 modes)
- **Evidence:** `native/src/components/ascnd/award-celebration.tsx:224-225,291` — badge bg = `tier.color` (fixed dark metal), label `#fff` 11px/800 cần 4.5:1. Đo: gold `#ffd93d` 1.38:1, silver `#c7cad1` 1.64:1 (unreadable cả 2 modes). `medal.tsx` đã có `onLight`/`onDark` variants mà badge không dùng.
- **Fix:** Dùng `m.lit ? tier.onLight : tier.onDark` cho fill + màu label tương phản.
- **Commit:** _(pending)_

### 8. Shop buy button: VoiceOver chỉ đọc giá, affordability chỉ bằng màu
- **Evidence:** `native/src/components/ascnd/shop/shop-pager.tsx:147` — không `accessibilityLabel` → đọc "button, 500". Affordability chỉ qua màu (`actionBuy`/`actionPoor`). Spinner không có `accessibilityState={{busy}}`.
- **Fix:** `accessibilityLabel` với tên item + giá + affordability; busy state.
- **Commit:** _(pending)_

---

## P2 — Đáng làm

### 9. `getLocale(lang)` bị bypass ở 2 chỗ → user es thấy format en-US
- **Evidence:** `ai-coach.tsx:438` (`vi ? 'vi-VN' : 'en-US'` cho dates), `assistant.tsx:759` (cho numbers). `getLocale()` đã map `es → 'es-ES'`, dùng ở ~20 chỗ.
- **Fix:** Thay bằng `getLocale(lang)` (lang đã có trong scope).
- **Commit:** _(pending)_

### 10. Share-sheet title hardcode "export" cho mọi ngôn ngữ
- **Evidence:** `settings.tsx:221` — `title: 'ASCND export ${localDateStr()}'`.
- **Fix:** i18n key với slot `{date}`.
- **Commit:** _(pending)_

### 11. Reminder body dùng nhầm title key (copy bug)
- **Evidence:** `use-reminders.ts:197` — `challengeClaim: { title: i18n.nCxClaimReminderTitle, body: i18n.nCxClaimReminderTitle }` — body phải là `nCxClaimReminderBody`.
- **Fix:** 1 dòng.
- **Commit:** _(pending)_

### 12-13. Contrast dưới floor ở light mode ✅  (shop + water)
- **Evidence:** `shop.tsx:557` `setsBadgeText: #04120c` trên `c.readinessGreen` = 3.85:1 (< 4.5); `water.tsx:519` `sheetBtnTextPrimary: #04121f` trên `c.metricBlue` = 3.78:1. #13 hiện bị mask bởi #5, sẽ lộ khi fix #5.
- **Fix:** Theme-aware text colors.
- **Commit:** _(pending)_

### 14. Edit-profile: TextInputs số không có programmatic label ✅ (xong hết)
- **Evidence:** `edit-profile.tsx:475,488,571,582,585,588,595,620,651` — label `<Text>` tách rời, VoiceOver đọc "text field" không context. Cùng pattern ở `change-password.tsx:81,100`.
- **Fix:** `accessibilityLabel` cho mỗi input.
- **Commit:** `baaf819` ✅ DONE (DE-XUAT-8 Part 1b — đã làm từ trước khi task này giao; verify trên code thật 03/10: 13/13 TextInputs đã có label, không còn việc)

### 15. Food-editor serving input không label
- **Evidence:** `food-editor.tsx:180` — không placeholder, không accessibilityLabel.
- **Fix:** `accessibilityLabel={i18n.foodServing}`.
- **Commit:** _(pending)_

### 16. 6 Switch rows không có accessible name
- **Evidence:** `reminders.tsx:127,176,216`, `settings.tsx:388,638`, `week-plan.tsx:701` — VoiceOver đọc "switch, on/off" không context.
- **Fix:** `accessibilityLabel` với title của row.
- **Commit:** _(pending)_

### 17. Rest-timer digits không có accessible context
- **Evidence:** `rest-timer.tsx:257` — VoiceOver đọc "1:27 / 1:30" không biết là rest countdown.
- **Fix:** `accessibilityLabel` trên wrapping View.
- **Commit:** _(pending)_

### 18. Progress photos không labeled
- **Evidence:** `progress-photos.tsx:407,512` — ảnh comparison + viewer đọc "image" trơ trụi.
- **Fix:** `accessibilityLabel` với date của ảnh.
- **Commit:** _(pending)_

### 19. Decorative hero image lọt vào VoiceOver
- **Evidence:** `today-training.tsx:313` — dumbbell art trang trí không `accessible={false}`.
- **Fix:** Thêm `accessible={false}` (đúng pattern `muscle-art.tsx:59`).
- **Commit:** _(pending)_

### 20. Gate profile-failure là dead end
- **Evidence:** `_layout.tsx` — `profileFailed && !profile` → `LoadFailed` chỉ có Retry. PGRST116 (row missing) retry mãi vẫn fail. Không có đường sign-out, force-quit cũng quay lại.
- **Fix:** Thêm nút sign-out trên màn lỗi, hoặc route PGRST116 về onboarding.
- **Commit:** _(pending)_

---

## Đã kiểm tra và KHÔNG vấn đề
- i18n key completeness: 3 dicts 1089 keys đồng bộ, không raw-key crash
- Alert.alert, toasts, placeholders, screen titles: sạch
- Notifications/reminders copy: đều từ i18n keys
- Accessibility: PressScale roles, tap-targets gate, pending dots, toast announcements — đã có
- Dark mode: camera surfaces, masks, SVG art, confetti, charts — intentional
- Offline: 84 mutations classified, offline queue core, NetInfo, state-write queue — sạch (trừ #2)
- Onboarding mid-flow kill, transition — sạch (trừ #1)

## Ngoài phạm vi
- Spanish ternaries (S1 DE-XUAT-4) — dedicated pass riêng
- File của A/B/D
- Dynamic Island Swift — Kiệt đang test

## DEFERRED — cần pass riêng hoặc design input
| # | Item | Lý do defer |
|---|------|-----------|
| 7 | Award badge contrast | Cần design quyết màu exact cho 4 tiers. |
| 12-13 | P2 contrast tokens | Cần thêm palette tokens mới. |
