/*
  Koa — tập vì Koa, đợt 1 (#527; Kiệt duyệt 20/10 `apps/ios/docs/design/mocks/koa-train-loop.html`).

  Buổi tập thành nhiệm vụ chính của ngày: trước đây 25 / 100 xu một ngày đủ
  (25%), giờ 35 / 85 (41%). Ngày không có buổi trong lịch có nhiệm vụ chính
  riêng — hồi phục (ngủ đủ + 6 000 bước), khoá `d:<ngày>:recovery`. Thưởng chuỗi
  hạ 25 → 15. Tổng tối đa một ngày: 100 → 85, để tủ đồ không hết trong 3 tháng.

  Chỉ đổi giá trong `reward_prices`: `reward_amount_for` đã tra
  `quest:<khoá>` cho mọi `d:<ngày>:<khoá>`, nên `recovery` có giá là được nhận.
  Sổ cũ giữ nguyên (xu đã nhận không bị đổi). Client: `MascotRules.dailyQuests`
  + `streakPayout` (iOS) đọc đúng các số này.
*/
INSERT INTO public.reward_prices (reward_key, coins) VALUES
  ('quest:workout', 35),
  ('quest:recovery', 20),
  ('quest:meal', 10),
  ('quest:water', 8),
  ('quest:sleep', 8),
  ('quest:steps', 8),
  ('streak:max', 15)
ON CONFLICT (reward_key) DO UPDATE SET coins = EXCLUDED.coins;
