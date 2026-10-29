/*
  Đồ phòng của Koa (#527 phần 3; Kiệt duyệt 29/10 — mock "Phòng của Koa", 6 chỗ × 3 món).

  Chỉ thêm giá: `buy_mascot_item` tra `shop_prices`, nên món có giá là mua được, và
  mặc / cởi đi qua `mascot_inventory` như đồ mặc. Không đổi bảng, hàm hay RLS.
  Món gốc của mỗi chỗ là miễn phí và không phải món (không có dòng nào).

  Khoá theo hạng Gains (Bonsai → Gym Rat, Núi tuyết → Lifter, Bảng Vàng / Bục cẩm thạch
  → Swole, Rack Olympic → Beast, Đèn chùm → Mass Monster) chỉ ở app, như Cúp vàng:
  server không tính Gains (xem CONSTRAINTS_AND_DEFERRED.md).

  Giá khớp `MascotShop.decor` (iOS); `native/tools/economy-authority.mjs` kiểm hai chiều.
  Chưa chạy thì app báo "Món này chưa mở bán" (`unknown item`).
*/
INSERT INTO public.shop_prices (item_key, price) VALUES
  ('decor_shelf_chrome', 200),
  ('decor_shelf_olympic', 600),
  ('decor_board_neon', 150),
  ('decor_board_gold', 400),
  ('decor_window_ocean', 250),
  ('decor_window_mountain', 300),
  ('decor_plants_snake', 120),
  ('decor_plants_bonsai', 200),
  ('decor_lamp_ring', 250),
  ('decor_lamp_chandelier', 800),
  ('decor_podium_rubber', 200),
  ('decor_podium_marble', 500)
ON CONFLICT (item_key) DO UPDATE SET price = EXCLUDED.price;
