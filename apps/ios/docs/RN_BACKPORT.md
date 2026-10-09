# Nâng cấp so với RN — sổ để mang ngược về RN / Android

Baseline RN: `fac9ac2` (`native/src/**`). Bản RN còn chạy trên **Android**, nên mọi chỗ bản iOS làm
**khác** RN (sửa lỗi, nâng cấp, hay khác có chủ ý) phải ghi ở đây — để người giữ RN / Android biết
và quyết có mang về không. Kiệt cho phép (#527): khi port, agent được nâng cấp / hoàn thiện phần RN
còn dở, **miễn là ghi lại**.

## Luật ghi

1. Mỗi khác biệt một dòng, ghi **trong cùng PR** làm ra nó (không để "ghi sau").
2. Cột "RN" chỉ đúng chỗ (tệp:dòng hoặc tên hàm @ `fac9ac2`); cột "iOS" chỉ tệp / kiểu Swift.
3. **Loại**:
   - `sửa lỗi` — RN sai (số sai, ghi sai, mất dữ liệu, a11y hỏng). Nên mang về.
   - `nâng cấp` — RN đúng nhưng thiếu (ngôn ngữ, trạng thái lỗi, Reduce Motion…). Nên mang về nếu rẻ.
   - `khác nền tảng` — chỉ vì iOS khác (HealthKit, Live Activity, SwiftUI). Không cần mang về.
   - `quyết định` — đổi hành vi theo một quyết định (ghi ai quyết, ở đâu).
4. **Mang về RN?**: `nên` / `tuỳ` / `không` — kèm một câu lý do nếu `không`.
5. Golden / test của iOS ghi rõ chỗ lệch có chủ ý (ví dụ test "khác RN đúng N trường hợp") để
   người mang về biết đáp số mong muốn.
6. Mục chỉ là "chưa port" thì KHÔNG ghi ở đây — đó là việc của `PARITY_MATRIX.md` /
   `PORTING_INVENTORY.md`. Các mục "ported (sửa lỗi RN)" sẵn có trong `PORTING_INVENTORY.md`
   nên được chép dần sang đây.

## Sổ

| # | Khu vực | RN @ fac9ac2 | iOS | Loại | Mang về RN? | PR · agent |
|---|---|---|---|---|---|---|
| E1 | Tổng kết tuần — lời khuyên ACWR | `app/weekly-review.tsx:480-497`: ngưỡng riêng > 1.5 cao, > 1.3 hơi cao, < 0.6 thấp, 0.8–1.3 tối ưu — lệch `acwrZone` (`lib/training-card.ts:111`) mà thẻ sẵn sàng Today tô màu; 1.55 bị bảo "giảm 15–20%" khi Today tô vàng, 0.6–0.65 im lặng khi Today tô đỏ | `WeeklyReview.acwrAdvice` theo đúng băng `acwrZone` (0.65 / 0.8 / 1.3 / 1.6); `WeeklyReviewGoldenTests.acwrAdviceFollowsTheZones` ghim 4 ca lệch (0.6, 0.62 → thấp; 1.55, 1.6 → hơi cao) | quyết định (Kiệt giao E chốt, #527) | nên — một số, một lời trên hai màn | #569 · E |
| E2 | Tổng kết tuần — một nguồn đọc hỏng | Mỗi query riêng, hỏng thì phần đó rỗng → ô số / biểu đồ vẽ như 0 | `WeeklyReviewBook.load`: một nguồn hỏng là cả tuần báo lỗi, có thử lại; đọc lại hỏng khi đã có số của đúng tuần thì giữ số | sửa lỗi | nên | #569 · E |
| E3 | Tổng kết tuần — thực phẩm bổ sung | Ô hỏng (chuỗi không phải số) → `NaN%` | Ẩn ô khi tỉ lệ không hữu hạn | sửa lỗi | nên | #569 · E |
| E4 | Tổng kết tuần — câu khuyến nghị | Chỉ vi / en (`L(vi, en)`), es nhận tiếng Anh | Đủ vi / en / es (`wr.rec.*`) | nâng cấp | nên | #569 · E |
| E5 | Tổng kết tuần — lỗi phân tích AI | `Alert.alert` (`weekly-review.tsx:350`) | Lỗi hiện trong thẻ, có thử lại; chữ theo `AI_FAILURE_KEY` | nâng cấp | tuỳ | #572 · E |
| E6 | Thử thách tuần — đo tiến độ khi đọc hỏng | `use-extras.ts` (đo `:551-645`): đọc nguồn hỏng → `newValue` 0 → ghi đè tiến độ thật thành 0 | `WeeklyChallengesBook.refreshProgress`: đọc hỏng thì bỏ qua thử thách đó, không ghi; báo "chưa đo lại được" | sửa lỗi | nên — đang mất dữ liệu | #566 · E |
| E7 | Thử thách tuần — gieo tuần | `useInitWeeklyChallenges` (`use-extras.ts:424-462`): tuần đã có một phần hàng vẫn gieo lại cả bộ | Chỉ gieo các thử thách còn thiếu của tuần; trùng (23505) coi là đã có | sửa lỗi | nên | #566 · E |
| E8 | Huy chương — trao khi danh sách đã có không đọc được | `useCheckAwards` (`use-extras.ts:207`): danh sách đã có hỏng → coi là rỗng → xét trao lại mọi huy chương | `AwardsBook`: không đọc được danh sách đã có thì không trao gì | sửa lỗi | nên | #563 · E |
| E9 | Màn huy chương — đọc hỏng | Vẽ như chưa có huy chương nào | Màn lỗi có thử lại | sửa lỗi | nên | #563 · E |
| E10 | Thẻ ăn mừng — Reduce Motion | `award-celebration.tsx`: pháo giấy + đĩa xoay-nảy luôn chạy | Reduce Motion: không pháo giấy, đĩa không xoay-nảy | nâng cấp (a11y) | nên — RN có `useReducedMotion` | #567 · E |
| E11 | Thẻ ăn mừng — VoiceOver / ngôn ngữ | Không đọc gì khi thẻ hiện; kicker chỉ vi ("Huy Chương Mới!") còn lại tiếng Anh; nhãn hạng luôn tiếng Anh | Đọc "Huy chương mới! <tên>" khi hiện; kicker + nhãn hạng vi / en / es | nâng cấp (a11y, i18n) | nên | #567 · E |
| E12 | Xu hướng sẵn sàng 7 ngày — chữ | TB / Cao nhất / chú giải chỉ vi / en (`lang === 'vi' ? … : …`) | Đủ vi / en / es (`rt.*`) | nâng cấp | nên | #571 · E |
