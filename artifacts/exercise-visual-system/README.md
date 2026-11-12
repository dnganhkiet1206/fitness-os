# Hệ thống minh hoạ bài tập 3D (exercise visual system)

Lát dọc đầu tiên: **Barbell Bench Press**. Yêu cầu nguyên văn của Kiệt: [`docs/exercise-visual-system/USER_SPEC.md`](../../docs/exercise-visual-system/USER_SPEC.md) (phần 2 thắng phần 1 khi khác nhau).

Trang này là **sổ bàn giao**: ai nhận việc thì đọc hết trang này trước, rồi sửa trang này khi trạng thái đổi.

## 1. Trạng thái (cập nhật 11/11/2026)

| Bước (theo thứ tự của spec) | Trạng thái | Bằng chứng |
|---|---|---|
| 1. Nhân vật chính | **Đã chạy, đã xem ảnh** | `characters/master_character_001/master_character.blend`, `character_preview.png`, `character_facts.json` |
| 2. Khung xương + điều khiển | Mã đã chạy không lỗi; **chưa xem ảnh dáng thử** (IK, nắm tay chưa kiểm bằng mắt) | `evs/rig.py` |
| Bản đồ cơ để tô sáng | **Đã chạy, đã xem ảnh** bản đầu; sau đó sửa vùng cơ thang rồi nướng lại nhưng **chưa xem lại ảnh** | `characters/master_character_001/muscle_atlas/`, `muscle_map_preview.png` (ảnh là bản TRƯỚC khi sửa cơ thang) |
| 4. Dụng cụ (thanh đòn, bánh tạ, ghế, giá) | Mã đã chạy không lỗi; **chưa xem ảnh** | `evs/equipment.py`, `config/equipment.json` |
| Dựng cảnh | Đã chạy: tạo `bench-press/_scene.blend` (tệp trung gian, không commit) | `pipeline/build_scene.py` |
| 3. Chuyển động Bench Press | **ĐANG DỞ — lần chạy đầu dừng ở kiểm tầm với** (xem mục 6) | `bench-press/animate_bench_press.py` |
| 5–7. Ba máy quay, ảnh xem trước, 3 MP4 | **Chưa viết** `pipeline/render_cameras.py` | — |
| 8. GLB | **Chưa viết** `pipeline/export_glb.py` | — |
| 9. Kiểm định | **Chưa viết** `pipeline/validate_animation.py`, `evs/validation/` | — |
| 10. Gắn vào app iOS | **Chưa làm** (đã đọc `ExerciseGuideView.swift`: app đã phát video bằng `VideoPlayer(AVPlayer(url:))` qua `MediaState` / `MediaItem`) | — |
| 11. Tài liệu `ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, `OPEN_SOURCE_AUDIT.md` | **Chưa viết** | — |

Chưa có MP4, GLB, báo cáo QA nào. Đừng ghi là có.

## 2. Máy và công cụ (đã kiểm trên máy của Kiệt, 11/11)

- Blender **5.2.0 LTS** ở `/Applications/Blender.app` (không có trên PATH). FFmpeg 8.1.2 ở `/opt/homebrew/bin`.
- MacBook Air M3, 8 GB RAM. Ổ trong còn khoảng 10 GB. Ổ ngoài `Extreme SSD` không gắn.
- Phụ thuộc ngoài duy nhất: add-on **MPFB 2.0.18** (MakeHuman cho Blender, 46 MB, kho chính thức extensions.blender.org). Cài một lần:

  ```sh
  /Applications/Blender.app/Contents/MacOS/Blender --online-mode --command extension install mpfb --sync --no-prefs
  ```

  Chỉ bước **dựng nhân vật** cần MPFB. Các bước sau đọc `master_character.blend` đã lưu.
- Mọi lệnh chạy với `--factory-startup`: không đọc, không ghi cấu hình Blender của người dùng; add-on được bật trong phiên bằng mã (`evs/bl_util.py: enable_mpfb`).
- EEVEE chạy được khi không có giao diện (`-b`): khoảng 1 giây một khung 700×1100.

## 3. Chạy lại từ đầu

Từ thư mục `artifacts/exercise-visual-system/`:

```sh
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --factory-startup --python pipeline/build_character.py        # ~10 giây: nhân vật + ảnh xem trước
$B -b --factory-startup --python pipeline/bake_muscle_atlas.py      # ~1 phút: 21 mặt nạ cơ + ảnh kiểm
$B -b --factory-startup --python pipeline/build_scene.py -- --exercise bench-press
$B -b --factory-startup --python bench-press/animate_bench_press.py # ĐANG DỞ
```

Biến môi trường gỡ lỗi: `EVS_DEBUG_HEAD=1` (với `build_character.py`) ghi thêm ảnh cận đầu `_head_debug.png`.
Tệp tên bắt đầu bằng `_` là tệp trung gian hoặc gỡ lỗi, không commit (xem `.gitignore`).

## 4. Cấu trúc

```
config/                     cấu hình dùng chung, không gắn với bài nào
  master_character.json     thông số nhân vật (đổi số = nhân vật MỚI, phải đổi id)
  muscle_map.json           21 nhóm cơ: vùng trên thân ở tư thế nghỉ
  equipment.json            kích thước dụng cụ (mét) + nguồn
  camera_presets.json       side / front / three_quarter / closeup_grip
  render_presets.json       chất lượng render + ánh sáng
  brand.config.json         thương hiệu GIẢ ĐỊNH (màu, logo, watermark, intro/outro)
evs/                        gói Python
  config.py pngio.py muscle_eval.py        Python thuần (không bpy) — sẽ có unit test
  bl_util.py character.py rig.py muscles.py materials.py equipment.py
  studio.py scene.py motion.py             cần Blender
pipeline/                   các bước dùng chung cho mọi bài
  build_character.py bake_muscle_atlas.py build_scene.py
characters/master_character_001/           nhân vật đã dựng (commit để mọi bài dùng CHUNG một tệp)
bench-press/
  exercise.json             cấu hình bài: pha, cơ, máy quay, thông số kỹ thuật, ngưỡng kiểm
  animate_bench_press.py    chuyển động riêng của bài này
```

Thêm bài mới = thêm một thư mục như `bench-press/` (một `exercise.json` + một tệp `animate_<bài>.py`). Không dựng lại nhân vật.

## 5. Quyết định kỹ thuật đã chốt (và vì sao)

1. **Nhân vật từ lưới gốc MakeHuman qua MPFB**, không tự nặn bằng primitive: tỉ lệ người thật, lưới toàn tứ giác, có sẵn UV và trọng số da. Nhân vật tạo ra theo giấy phép CC0 (đang chờ workflow kiểm chứng giấy phép xác nhận lại bằng nguồn gốc — xem mục 7).
2. **Độ nét cơ**: lấy hiệu (cơ tối đa − cơ trung bình) của MakeHuman nhân 1,8, thêm 10 % hiệu "gầy". Phần thêm này tắt dần từ gốc cổ lên đầu (áp cho đầu thì má hóp, cổ to). Số ở `config/master_character.json`.
3. **Mặt trơn**: cắt vùng mặt trước (kể cả hốc mắt, mũi, miệng — trong lưới gốc là các túi sâu hàng trăm đỉnh, làm trơn tại chỗ sẽ bị rúm), thay bằng mảng lưới đều. Bề mặt mới = mặt trước của đầu gốc nhìn như bản đồ độ cao, lấp chỗ lõm hẹp, bỏ chỗ lồi hẹp, làm mờ; dưới miệng chỉ lấp lõm để giữ cằm. Đã thử và bỏ: làm phẳng kiểu màng (lõm, có vết kim), thin-plate (lồi thành mõm / có gờ viền). Mã: `evs/character.py: make_faceless`.
4. **Quần**: cắt từ bản sao da (cùng UV → vùng cơ tô sáng hiện xuyên quần; cùng trọng số → theo mọi dáng, không cần mô phỏng vải).
5. **Khung xương**: rig `game_engine` của MPFB, 53 xương biến dạng, tên kiểu Unreal (`upperarm_l`, `calf_r`…). Lớp điều khiển thêm vào (`ctl_*`, không xuất): IK tay / chân + điểm cực khuỷu / gối, thuộc tính `ik_arm_l…` (IK↔FK), `grip_l/r` (nắm tay quanh thanh). **Socket**: Empty gắn trên dụng cụ = ma trận xương bàn tay khi đang nắm; điều khiển tay chép ma trận socket → tay luôn dính thanh, dụng cụ kéo tay đi.
6. **Tô sáng cơ**: mỗi nhóm cơ là một mặt nạ trong không gian UV của nhân vật (`muscle_atlas/masks.npz`). Mỗi bài ghép một ảnh RGB (đỏ = cơ chính, lục = cơ phụ, lam = cơ ổn định); vật liệu trộn màu thương hiệu theo ảnh đó. Lưới nhân vật không đổi theo bài.
7. **Thương hiệu tách rời**: màu lấy từ `brand.config.json` lúc dựng cảnh; watermark / intro / outro sẽ áp lúc mã hoá video. Đổi tên app không phải làm lại chuyển động.
8. **Chuyển động**: chỉ key quỹ đạo thanh đòn (`Barbell` location Y, Z) và điểm cực khuỷu. Tay giải bằng IK, chân ghim sàn bằng IK. Khuỷu đặt ở điểm thấp nhất mà độ dài tay cho phép → cẳng tay đứng thẳng dưới thanh. Nguồn chuyển động: key tay theo tài liệu kỹ thuật, **không phải mocap, chưa ai có chuyên môn duyệt** → nhãn `UNVERIFIED — NOT APPROVED FOR PRODUCTION`.
9. **Render**: EEVEE, 1280×720, 24 fps, view transform Standard (màu nền đúng mã màu thương hiệu). Sàn chỉ tối ở bóng tiếp xúc, còn lại đúng màu nền (không có đường chân trời). Giàn đèn quay theo máy quay.

## 6. Việc đang dở — làm tiếp từ đây

`bench-press/animate_bench_press.py` dừng ở:

```
RuntimeError: the arms cannot reach the bar at 'clear of the rests' (0.549 m > 0.540 m)
```

Nghĩa là: lúc nhấc thanh khỏi giá (cao hơn mép giá 1,2 cm), tay không đủ dài. Hướng sửa (chưa thử): hạ `rack_height` trong `bench-press/exercise.json` (đang 1,02; nhớ sửa cả `location` của `barbell`), hoặc dịch người về phía giá (`placement.head_from_pad_head_end_m`), hoặc hạ `hook_lip` trong `config/equipment.json`. Sau khi chạy qua: **phải render vài khung và xem** (tư thế nằm, bàn tay nắm thanh, khuỷu, chân) trước khi tin.

Thứ tự còn lại: sửa chuyển động → `render_cameras.py` (khung PNG từng máy quay, ffmpeg H.264, `camera_comparison.png`, `render_metadata.json`) → `export_glb.py` → `validate_animation.py` + `qa_report.json` (chỉ dùng PASS / FAIL / NOT_TESTED / REQUIRES_MANUAL_REVIEW / UNVERIFIED; đúng sai về sinh cơ học không bao giờ PASS khi chưa có người có chuyên môn duyệt) → gửi ảnh cho Kiệt duyệt → gắn MP4 vào `ExerciseGuideView` (nhỏ, gỡ được) → ba tài liệu → PR vào `native/ios-rewrite`.

## 7. Chưa biết / chưa kiểm

- Workflow kiểm chứng giấy phép mã nguồn mở và tài liệu kỹ thuật Bench Press (chạy nền trong phiên dựng ban đầu) **chưa trả kết quả** lúc viết trang này. Các số kỹ thuật trong `exercise.json` và `equipment.json` hiện là số người viết pipeline nhớ từ luật IPF và tài liệu huấn luyện, **chưa đối chiếu nguồn**.
- Biến dạng da ở vai / khuỷu / hông / gối / cổ tay trong dáng tập: chưa kiểm.
- Bản đồ cơ do người viết pipeline đặt theo giải phẫu bề mặt; chưa có người có chuyên môn giải phẫu xem.
- Tệp nhị phân: repo không dùng Git LFS. Kiệt (11/11) bảo commit cả tệp nhân vật để người sau tiếp nhận được. MP4 / GLB / `.blend` của bài: xem dung lượng rồi quyết định khi có.
