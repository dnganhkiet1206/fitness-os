# HERO_STAGE_LAYOUT_SPEC.md
Version: 1.0 (Canonical)
Mục tiêu: Đây là tài liệu duy nhất quy định bố cục Hero Stage. Mọi asset, theme và vật phẩm Shop trong tương lai đều phải tuân theo tài liệu này.

---

# 1. TRIẾT LÝ

Hero Stage là một bố cục bất biến (Fixed Composition).

Asset có thể thay đổi.
Theme có thể thay đổi.
Linh vật có thể thay đổi.

Bố cục KHÔNG được thay đổi.

Không được sắp xếp bằng cảm tính.

Không được tự ý di chuyển asset để "trông đẹp hơn".

Mọi vị trí đều phải tuân theo các ràng buộc dưới đây.

---

# 2. HỆ TỌA ĐỘ

Tất cả giá trị đều là tỷ lệ.

x, width, rx = theo chiều rộng Hero Section.

y, top, bottom, cy, height, ry = theo chiều cao Hero Section.

Không được dùng pixel.

Không được hardcode theo thiết bị.

Không viết logic riêng cho iPhone hoặc Android.

---

# 3. HERO (LINH VẬT)

Đây là đối tượng quan trọng nhất.

Hero luôn là điểm nhìn đầu tiên.

Hero luôn nằm giữa Hero Section.

Thông số chuẩn:

koala.x = 0.50
koala.bottom = 0.30 ± 0.01
koala.width = 0.52 ± 0.03

Quy tắc:

- Hero luôn đứng trên Podium.
- Hero không được chạm Header.
- Hero không được chạm Motivation Card.
- Hero không được chạm Level Card.
- Hero luôn lớn nhất trong Hero Section.
- Hero luôn chiếm khoảng 60–65% chiều cao vùng hiển thị.

Nếu model mới cao hơn hoặc thấp hơn:

→ Chỉ được scale Hero.

→ Không được đổi vị trí Hero.

---

# 4. PODIUM

Podium luôn đi cùng Hero.

Không được di chuyển độc lập.

Thông số chuẩn:

podium.cy = 0.73
podium.rx = 0.39
podium.ry = 0.075
podium.depth = 0.065

Quy tắc:

- Hero luôn đứng đúng giữa Podium.
- Podium rộng khoảng 1.6 lần vai Hero.
- Hai chân Hero luôn nằm hoàn toàn trên mặt Podium.

---

# 5. RING

Ring luôn căn theo Hero.

Không căn theo màn hình.

Thông số chuẩn:

ring.cy = 0.42
ring.r = 0.23

Quy tắc:

- Ring ôm đầu và vai Hero.
- Không được cắt tai.
- Không được cắt đầu.
- Không được chạm vai.

Nếu Hero thay đổi kích thước.

Ring tự scale theo Hero.

---

# 6. LEFT EQUIPMENT ZONE

Giới hạn:

x = 0.05 → 0.30
y = 0.40 → 0.68

Chỉ chứa:

- Dumbbell Rack
- Bench
- Bike
- Punching Bag
- Squat Rack
- Treadmill

Quy tắc:

- Chỉ có 1 asset chính.
- Asset cao khoảng 70–80% chiều cao Hero.
- Không được che Hero.
- Không vượt khỏi Zone.

---

# 7. RIGHT DECORATION ZONE

Giới hạn:

x = 0.72 → 0.94
y = 0.42 → 0.70

Chỉ chứa:

- Trophy
- Plant
- Locker
- Cabinet
- Medicine Ball

Quy tắc:

- Tối đa 2 asset.
- Asset chỉ đóng vai trò phụ.
- Không nổi bật hơn Hero.

---

# 8. BACKGROUND ZONE

Thông số:

Ground Line = 0.58

Window:

x = 0.62 → 0.88

y = 0.08 → 0.34

Quy tắc:

- Window luôn nằm sau Hero.
- Không được sáng hơn Hero.
- Chỉ tạo chiều sâu.
- Không thu hút sự chú ý.

---

# 9. FLOOR PROP ZONE

Giới hạn:

y ≥ 0.63

Chỉ chứa:

- Bottle
- Yoga Mat
- Shoes
- Plate
- Small Dumbbell

Không được cao quá đầu gối Hero.

---

# 10. UI

Card Level:

left = 12dp

top = Header + 4dp

Card Streak:

right = 12dp

top = Header + 4dp

UI luôn độc lập với Stage.

Stage không điều khiển UI.

---

# 11. THỊ GIÁC

Thứ tự người dùng nhìn thấy:

① Hero

↓

② Level

↓

③ Podium

↓

④ Equipment

↓

⑤ Decoration

↓

⑥ Background

Nếu bất kỳ asset nào nổi bật hơn Hero.

Đó là lỗi.

---

# 12. RESPONSIVE

Mọi điện thoại đều dùng cùng một Layout Engine.

Không tạo layout riêng cho:

- iPhone SE
- iPhone Mini
- iPhone Pro Max
- Android
- Tablet

Nếu màn hình hẹp:

→ Scale Hero.

→ Scale Props.

→ Không đổi bố cục.

Nếu màn hình rộng:

→ Giữ nguyên bố cục.

→ Chỉ tăng khoảng trắng.

Không được kéo giãn khoảng cách giữa các thành phần.

---

# 13. SHOP

Shop chỉ được phép thay Asset.

Ví dụ:

Dumbbell Rack

↓

Olympic Rack

↓

Không đổi vị trí.

Plant

↓

Golden Trophy

↓

Không đổi vị trí.

Cyber Stage

↓

Classic Stage

↓

Không đổi bố cục.

Mọi Asset mới phải tự động vừa với Zone tương ứng.

Không cần sửa Layout.

---

# 14. VALIDATION (BẮT BUỘC)

Sau mỗi lần render, Layout Engine phải tự kiểm tra:

- [ ] Hero nằm chính giữa.
- [ ] Hero là vật lớn nhất.
- [ ] Hero là điểm sáng nhất.
- [ ] Hero không chạm UI.
- [ ] Hero đứng đúng trên Podium.
- [ ] Ring không cắt tai.
- [ ] Podium lớn hơn vai Hero.
- [ ] Left Equipment không vượt Zone.
- [ ] Right Decoration không vượt Zone.
- [ ] Background không sáng hơn Hero.
- [ ] Props không che Hero.
- [ ] Khoảng trắng hai bên Hero cân bằng.

Nếu chỉ cần 1 điều sai.

Render được xem là FAILED và phải tự tính lại layout.

---

ĐÂY LÀ NGUỒN CHÂN LÝ DUY NHẤT.

Claude không được tự ý thay đổi bất kỳ quy tắc nào trong tài liệu này nếu không có chỉ định trực tiếp từ người phát triển.
