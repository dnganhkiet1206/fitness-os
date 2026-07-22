# HERO_MODEL_SPEC
Version 1.0
Status: CANONICAL

Ghi chú triển khai (Claude): Hero là mascot phong cách Pixar, thân tròn — KHÔNG
dùng chuyển động giải phẫu người thật. Mọi animation ưu tiên **silhouette rõ
ràng** hơn chuyển động thực tế. LUÔN giữ khoảng hở nhìn thấy được giữa cánh tay
và thân ở mọi góc. Bone map thực tế: Bone_030 = vai phải (+X), Bone_022 = vai
trái (−X), Bone_029/021 = cẳng tay P/T, Bone_034 = gốc cổ. Trục: +X phải, +Y
lên, +Z trước (khớp WORLD AXIS bên dưới).

==================================================================

## WORLD AXIS
Y+ = Up · X+ = Right · −X = Left · Z+ = Forward (mặt trước) · −Z = Back.
Không suy luận hướng từ mesh. Import sai → sửa Transform, KHÔNG sửa Camera.

## HERO FORWARD
Forward luôn +Z. RotY 0° = nhìn thẳng Camera · 90° = nhìn phải · −90° = nhìn
trái · 180° = quay lưng.

## HERO PIVOT
Pivot: giữa hai bàn chân, trên mặt đất, chính giữa cơ thể. KHÔNG đặt ở đầu/bụng/
ngực/hông. Mọi Rotation xoay quanh Pivot này.

## ROOT BONE
Root là cha toàn Skeleton, chỉ Translation/Rotation/Scale. Animation không đổi
Root ngoài locomotion.

## HERO POSE
Default: đứng thẳng, vai thả lỏng, đầu nhìn trước, hai chân cân bằng, trọng lượng
chia đều. Không A-Pose, không T-Pose. Runtime luôn bắt đầu từ Idle Pose.

## ARM CLEARANCE (RẤT QUAN TRỌNG)
Hai cánh tay KHÔNG BAO GIỜ chạm thân. Khoảng hở tối thiểu:
- Upper Arm ↔ Body ≥ 4% chiều rộng Hero
- Forearm ↔ Body ≥ 3%
- Hand ↔ Hip ≥ 4%
- Elbow ↔ Body ≥ 5%
Nhỏ hơn → LỖI.

## HAND POSITION
Ở Idle: bàn tay luôn nằm phía trước hông một chút. Không sau người. Không xuyên
Shorts / Tank Top / bụng / chân.

## ELBOW
Luôn hướng ra ngoài nhẹ. Không ép sát người. Không xuyên thân.

## SHOULDER
Vai mở tự nhiên, đối xứng. Không kéo sát cổ/thân.

## LEG
Hai chân cách nhau tự nhiên, không giao/xuyên nhau. Đầu gối không khóa cứng.

## FOOT
Hai bàn chân chạm Podium, song song, cân bằng. Không nổi gót, không xuyên sàn.

## HEAD
Cân giữa vai, không nghiêng mặc định, nhìn theo Forward Axis.

## EAR
Không xuyên Ring, không xuyên Headband.

## CLOTHES
Tank Top / Shorts / Headband / Shoes / Bracelet là Mesh riêng, không Merge.

## CAMERA RELATION
Camera KHÔNG quyết định Hero. Hero quyết định Camera. Hero nhìn sai → sửa
Rotation Hero, không sửa Camera.

## STAGE ROTATION
Stage xoay → Hero xoay theo (Root Bone xoay), Skeleton giữ nguyên, Animation
không đổi.

## COLLISION RULE
Trong mọi Animation KHÔNG được: tay xuyên Tank Top/Shorts/Body, cổ tay xuyên
hông, khuỷu xuyên sườn, đầu xuyên Ring, chân xuyên Podium, giày xuyên Floor.
Xảy ra → Animation FAILED.

## IDLE ANIMATION
Chỉ gồm: thở nhẹ, sway rất nhỏ, blink, head micro movement. KHÔNG làm tay đập
vào người / khuỷu xuyên thân / chân trượt / vai co cứng.

## IMPORT RULE
Sau import kiểm tra: Forward +Z, Up +Y, Pivot đúng, Scale đúng, Hero nhìn
Camera, hai tay có khoảng hở, không Mesh giao nhau, không Bone sai hướng. Sai →
sửa Import Transform, không sửa Camera/Layout.

==================================================================
Không suy luận từ mesh. Không tự ý đổi Pose/Skeleton. Không để bất kỳ bộ phận
nào Self-Intersection ở Idle hoặc khi render.
