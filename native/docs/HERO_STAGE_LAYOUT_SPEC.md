# HERO STAGE LAYOUT SPECIFICATION
Version: 2.0
Status: CANONICAL
Priority: HIGHEST

====================================================================

MỤC TIÊU

Hero Stage là một không gian 3D có thể mở rộng.

KHÔNG phải màn hình hiển thị nhân vật.

KHÔNG phải ảnh nền.

KHÔNG phải sân khấu.

Hero Stage phải tạo cảm giác người chơi đang sở hữu một căn phòng gym có thể phát triển trong nhiều năm.

Mọi vật phẩm trong Shop tương lai đều phải tự động đặt đúng vị trí mà KHÔNG cần sửa Layout.

Đây là tài liệu có độ ưu tiên cao nhất.

Claude không được phép tự ý thay đổi bất kỳ quy tắc nào bên dưới.

====================================================================

NGUYÊN TẮC

Asset KHÔNG quyết định vị trí.

Zone quyết định vị trí.

Layout quyết định vị trí.

Asset chỉ mô tả:

- Category
- Zone
- Size
- Priority
- Footprint

Tuyệt đối KHÔNG lưu:

x

y

width

height

Mọi vị trí đều do Layout Engine tính toán.

====================================================================

RESPONSIVE

Không được hardcode pixel.

Không được tạo layout riêng cho:

- iPhone
- Android
- Tablet

Không được viết:

if (iphone)...

if (tablet)...

if (android)...

Tất cả thiết bị phải dùng cùng một Layout Engine.

Nếu màn hình nhỏ:

→ Scale Scene.

Nếu màn hình lớn:

→ Tăng khoảng trắng.

KHÔNG đổi bố cục.

====================================================================

HERO STAGE LÀ SCENE 3D

Hero Stage gồm:

Hero

Podium

Props

Background

Lighting

Particles

Tất cả đều tồn tại trong cùng một World Space.

Không được thiết kế như ảnh 2D.

====================================================================

CAMERA

Camera cố định.

Camera KHÔNG xoay.

Camera luôn nhìn Hero ở góc khoảng 3/4.

Camera chỉ thay đổi khoảng cách nếu cần để giữ đúng bố cục.

====================================================================

STAGE ROTATION

Người dùng được phép xoay Stage.

Stage Rotation:

-45°

↓

0°

↓

+45°

Camera KHÔNG xoay.

Stage xoay.

Hero xoay.

Podium xoay.

Props xoay.

Background xoay.

Toàn bộ Scene xoay cùng nhau.

Không có object nào đứng yên.

====================================================================

TỶ LỆ KHÔNG GIAN

Đây là căn phòng.

Không phải màn hình hiển thị Hero.

Hero chỉ chiếm khoảng 40% diện tích thị giác.

Khoảng 60% còn lại dành cho:

- Decoration
- Equipment
- Empty Space
- Shop Items
- Future Expansion

Nếu Hero quá lớn khiến căn phòng chật.

Đó là lỗi.

====================================================================

ZONE SYSTEM

Hero Stage luôn có đúng các Zone sau.

Không được tạo thêm.

────────────────────

ZONE 01 — Hero Zone
Trung tâm. Chỉ chứa: Hero, Outfit, Animation, Accessory gắn trên Hero.

ZONE 02 — Podium Zone
Chỉ chứa Podium. Hero luôn đứng giữa Podium.

ZONE 03 — Ring Zone
Chỉ chứa Ring. Ring luôn bám theo Hero.

ZONE 04 — Left Equipment Zone
Chỉ chứa thiết bị tập lớn (Rack, Bench, Bike, Squat Rack, Punching Bag,
Treadmill). Tối đa: 2 Large Asset hoặc 1 XL Asset.

ZONE 05 — Right Decoration Zone
Chỉ chứa: Plant, Locker, Shelf, Cabinet, Trophy, Medicine Ball, Decoration.
Tối đa: 3 Asset. Trong đó chỉ có 1 Dominant Decoration.

ZONE 06 — Background Zone
Window, Mirror, Wall, Poster, Banner, Lighting. Không đặt vật thể tương tác.

ZONE 07 — Floor Zone
Yoga Mat, Bottle, Shoes, Plate, Small Dumbbell, Floor Decoration.
Không cao quá đầu gối Hero.

ZONE 08 — FX Zone
Glow, Aura, XP, Coin, Sparkle, Particle, Confetti. Không che Hero.

====================================================================

OCCUPANCY SYSTEM

Mỗi Zone có số lượng tối đa.

Left Equipment: 2 Slot
Right Decoration: 3 Slot
Floor: 5 Slot

Nếu Zone đầy. Asset mới KHÔNG được spawn.

====================================================================

COLLISION RULE

Không được để hai Asset đè lên nhau.

Footprint không được giao nhau. Bounding Box không được giao nhau.

Nếu xảy ra Collision. Layout Engine phải:

1. Scale nhỏ Asset. →
2. Di chuyển Asset. →
3. Ẩn Asset Priority thấp.

====================================================================

EXCLUSIVE GROUP

Một số Asset không được xuất hiện cùng nhau:

- Bike × Treadmill
- Large Plant × Large Cabinet
- Bench × Yoga Bench
- Olympic Rack × Small Rack
- Christmas Tree × Large Trophy

Nếu cùng Occupancy. Chỉ được giữ Asset Priority cao hơn.

====================================================================

PRIORITY

Hero → Podium → Equipment → Decoration → Background → FX

Nếu xảy ra xung đột. Asset Priority thấp phải nhường.

====================================================================

SHOP

Shop KHÔNG thay đổi Layout. Shop chỉ thay Asset.

Ví dụ: Rack → Olympic Rack. Giữ nguyên Zone. Giữ nguyên Slot. Giữ nguyên Anchor.

====================================================================

VISUAL RULE

Hero luôn là điểm nhìn đầu tiên.

Không Asset nào sáng hơn Hero.
Không Asset nào lớn hơn Hero.
Không Asset nào che Hero.

====================================================================

EMPTY SPACE

Không cố lấp đầy căn phòng.

Khoảng trống là một phần của thiết kế. Room phải luôn có cảm giác rộng.

Người chơi phải cảm thấy vẫn còn chỗ để mua thêm đồ.

====================================================================

FUTURE PROOF

Thiết kế Layout như thể người chơi đã mở khóa:

50 Decoration · 30 Equipment · 20 Trophy · 10 Furniture · 5 Pet · 5 Seasonal Item

Nếu lúc đó Layout vẫn hoạt động → PASS. Nếu phải sửa Layout → FAIL.

====================================================================

VALIDATION

Sau mỗi lần Render. Layout Engine phải kiểm tra:

- [ ] Hero nằm giữa.
- [ ] Hero chiếm khoảng 40% Room.
- [ ] Room vẫn còn nhiều khoảng trống.
- [ ] Hero không chạm UI.
- [ ] Hero đứng trên Podium.
- [ ] Ring không cắt tai.
- [ ] Podium không nhỏ hơn Hero.
- [ ] Không Asset nào vượt Zone.
- [ ] Không Asset nào chồng nhau.
- [ ] Không Asset nào che Hero.
- [ ] Không Asset nào sáng hơn Hero.
- [ ] Không vượt Occupancy.
- [ ] Không vi phạm Exclusive Group.
- [ ] Rotation đúng.
- [ ] Responsive đúng.

Nếu chỉ cần 1 điều sai → Render FAILED → Layout Engine phải tự tính lại.

====================================================================

## PHỤ LỤC — TRẠNG THÁI TRIỂN KHAI (Claude cập nhật, không phải luật)

- [x] Layout Engine: asset registry (metadata-only, không x/y) + resolver
      (zone / occupancy / priority / exclusive group / collision).
      → `src/config/stage/stage-assets.ts`, `src/lib/stage-layout.ts`.
- [x] Renderer đọc placement từ engine (Zone quyết định vị trí).
- [x] Hero ~40% diện tích; nhiều khoảng trống cho Shop mở rộng.
- [ ] Scene 3D thật (props trong world 3D thay vì SVG 2D) — CẦN model 3D cho
      từng prop (pipeline asset GLB). Chờ chỉ thị dev.
- [ ] Stage Rotation -45°/0/+45° (xoay cả scene, camera cố định) — phụ thuộc
      Scene 3D ở trên. Chờ chỉ thị dev.

Đây là nguồn chân lý duy nhất (Single Source of Truth). Claude không được tự ý
thay đổi Layout / Zone / Occupancy / Priority / Constraint nếu không có chỉ thị
trực tiếp từ người phát triển.
