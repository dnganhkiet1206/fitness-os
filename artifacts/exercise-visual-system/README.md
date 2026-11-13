# Hệ thống minh hoạ bài tập 3D (exercise visual system)

Lát dọc đầu tiên: **Barbell Bench Press**. Yêu cầu nguyên văn của Kiệt: [`docs/exercise-visual-system/USER_SPEC.md`](../../docs/exercise-visual-system/USER_SPEC.md) (phần 2 thắng phần 1 khi khác nhau).

Trang này là **sổ bàn giao**: ai nhận việc thì đọc hết trang này trước, rồi sửa trang này khi trạng thái đổi.

## 1. Trạng thái (cập nhật 13/11/2026)

Kiểm định tự động lần cuối: 52 PASS, 1 FAIL, 1 NOT_TESTED, 5 REQUIRES_MANUAL_REVIEW, 2 UNVERIFIED (`bench-press/qa_report.json`, chạy lại 13/11 sau khi vẽ lại sợi cơ — số lượng như cũ, FAIL vẫn là `skin_deformation`; `motion_metadata.json` giống hệt bản trước). Xuất bản: **BLOCKED** (chưa có người có chuyên môn duyệt).

| Bước | Trạng thái | Bằng chứng |
|---|---|---|
| Nhân vật chính (bản 1.1, thân hình "vừa" Kiệt chọn 12/11, `docs/exercise-visual-system/body_options.png`) | Đã làm, đã kiểm (ảnh + số đo) | `characters/master_character_001/` (`.blend`, `character_preview.png`, `character_facts.json`) |
| Khung xương + điều khiển + nắm thanh | Đã làm, đã kiểm (`rig_test.json`, ảnh `rig_deformation_test.png`) | `evs/rig.py`, `pipeline/test_rig.py` |
| Bản đồ cơ (21 nhóm) | Đã làm; **vùng cơ chưa người có chuyên môn xem** | `muscle_atlas/`, `muscle_map_preview.png` |
| Dụng cụ (IPF đã đối chiếu) | Đã làm, kiểm kích thước tự động | `config/equipment.json`, `evs/equipment.py` |
| Chuyển động Bench Press | Đã làm; **UNVERIFIED — NOT APPROVED FOR PRODUCTION** | `bench-press/bench_press_master.blend`, `motion_metadata.json`, `reference_notes.json` |
| 4 máy quay đồng bộ, 4 MP4 + 4 MP4 lặp | Đã làm, kiểm tự động (số khung, fps, H.264, nhấp nháy, đồng bộ) và xem bằng mắt. **MP4 đã commit vẫn mang sợi v1** — chưa render lại sau khi vẽ lại sợi (xem §6.6) | `bench-press/*.mp4`, `camera_comparison.png`, `render_metadata.json` |
| Sợi cơ phát sáng (kiểu Lyfta) | Đã làm (v2, 13/11): trường hướng origin→insertion — cơ hình quạt (ngực, vai trước/sau, lưng xô, thang, mông, chóp xoay) xòe nan quạt quanh điểm bám, nhóm chi song song theo trục; bake thành atlas phase trong không gian UV, vân sống qua GLB/USDZ; **vùng cơ không đổi**, vẫn chưa người có chuyên môn xem | `config/fiber_map.json`, `evs/fiber_fields.py`, `evs/fibers.py`, `pipeline/bake_fiber_fields.py`, `muscle_atlas/fiber_phase.npz`, `bench-press/muscle_highlight_map.png` |
| GLB (nhân vật; bài tập + 2 biến thể vật liệu) | Đã làm, đọc lại được trong Blender | `bench-press/*.glb`, `glb_report.json` |
| USDZ cho trình xem 3D trong app | Đã làm: 53 xương biến dạng, hoạt hình khung 24–228, vật liệu albedo + emission; đọc lại được trong Blender, thanh đòn chuyển động đúng | `bench-press/usdz/bench_press_animation.usdz`, `bench-press/usdz/usdz_report.json`, `pipeline/export_usdz.py` |
| Kiểm định + unit test | Đã làm (41 test xanh: 33 cũ + 8 mới cho trường hướng sợi) | `pipeline/validate_animation.py`, `evs/validation/`, `tests/` |
| Gắn vào app iOS | Đã làm, **chỉ bản Debug**: trình xem 3D xoay 360° (RealityKit + USDZ), tự chạy + lặp, khung dọc 9:16, góc mặc định three-quarter 45°, chú thích mờ "Kéo để xoay góc nhìn", legend chú thích cơ đang tô sáng (13/11, Kiệt quyết bắt buộc phải có); một lần chạm nút ▶ ở đầu trang là mở thẳng. ~~3 góc (45° · Bên · Trước) có thanh chọn góc; đã thử trên simulator iPhone 17 (iOS 26)~~ — thanh chọn góc đã bỏ 13/11 theo lệnh Kiệt (12/11); USDZ đã thay bằng bản sợi v2 ngày 13/11; trình xem **chưa kiểm trên simulator** (NOT RUN) | `apps/ios/ASCND/Features/Exercises/ExerciseDemo3D.swift`, `ExerciseDemo3DView.swift`, `apps/ios/ASCND/Resources/ExerciseDemos/` |
| Tài liệu | Đã viết | `docs/exercise-visual-system/` |

**Còn FAIL thật:** `skin_deformation` — da vùng háng giãn quá ngưỡng khi đùi gập 90° (cách da bám xương kiểu tuyến tính của lưới MakeHuman). Bị quần che nên không lộ trong video, nhưng là hạn chế thật của nhân vật. Không nới ngưỡng.

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
$B -b --factory-startup --python pipeline/bake_fiber_fields.py     # ~1,5 phút: atlas phase hướng sợi 21 nhóm (cần masks.npz trước)
$B -b --factory-startup --python pipeline/build_scene.py -- --exercise bench-press
$B -b --factory-startup --python bench-press/animate_bench_press.py
$B -b --factory-startup --python pipeline/test_rig.py               # dáng thử khung xương
$B -b --factory-startup --python pipeline/render_cameras.py -- --exercise bench-press   # ~30 phút
$B -b --factory-startup --python pipeline/export_glb.py -- --exercise bench-press
$B -b --factory-startup --python pipeline/export_usdz.py -- --exercise bench-press --out-dir bench-press/usdz
$B -b --factory-startup --python pipeline/validate_animation.py -- --exercise bench-press
python3 -m unittest discover -s tests
```

Biến môi trường gỡ lỗi: `EVS_DEBUG_HEAD=1` (với `build_character.py`) ghi thêm ảnh cận đầu `_head_debug.png`.

Ảnh still 9:16 để đối chiếu A/B (cần `.blend` đã animate, không ghi lại `.blend`): `pipeline/render_stills.py -- --exercise bench-press --out-dir <thư mục>` — mặc định 4 góc: three-quarter ở khung 60/120/180 + front ở khung 120, 720×1280, khớp khung hình của USDZ.
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
  config.py pngio.py muscle_eval.py fibers.py  Python thuần (không bpy) — sẽ có unit test
  bl_util.py character.py rig.py muscles.py materials.py equipment.py
  studio.py scene.py motion.py             cần Blender
pipeline/                   các bước dùng chung cho mọi bài
  build_character.py bake_muscle_atlas.py build_scene.py export_usdz.py
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
10. **Sợi cơ + USDZ (13/11, theo lệnh Kiệt 12/11)**: vân sợi vẽ vào bản đồ tô sáng (hướng sợi = trục chính của mặt nạ từng nhóm cơ, tách hai bên thân; xem `evs/fibers.py`), không sửa vùng cơ. USDZ xuất từ cùng `.blend` với vật liệu albedo + emission đã bake (emission giữ nguyên độ sáng 0,35 của shader), chỉ 53 xương biến dạng, lưới gốc, hệ Y-up mét cho RealityKit. Góc mặc định của trình xem = preset three-quarter refit cho khung 9:16, ghi trong `usdz_report.json`.
11. **Sợi cơ v2 (13/11, theo lệnh Kiệt 13/11 — vẽ lại cho chuẩn xác)**: thay trục PCA trung bình bằng trường hướng origin→insertion cho cả 21 nhóm (`config/fiber_map.json`, `evs/fiber_fields.py`): cơ hình quạt = nan quạt quanh điểm bám (phase theo góc), nhóm chi = song song theo trục (phase theo khoảng cách ngang trục). Trường định nghĩa trong cùng chart space với `muscle_map` (đối xứng theo cấu trúc, mirror sang trái), bake thành atlas phase 2048² (`pipeline/bake_fiber_fields.py` → `muscle_atlas/fiber_phase.npz`, ~1,4 MB, chỉ ghi trong vùng mặt nạ); `write_highlight_map` dùng atlas khi có, fallback PCA khi không. Căn cứ: Gray's Anatomy 1918 (public domain) + tài liệu giải phẫu hiện đại đối chiếu — chỉ lấy facts, không asset bên thứ ba; BodyParts3D và mô hình OpenSim đã kiểm nhưng không dùng (xem `docs/exercise-visual-system/OPEN_SOURCE_AUDIT.md`). Giới hạn: một trường mỗi nhóm (không tách đầu cơ), không mô hình xoắn gân hay góc pennation, chưa người có chuyên môn giải phẫu xem.
12. **Legend + phong cách viewer (13/11, Kiệt quyết 13/11)**: (a) trình xem 3D PHẢI có legend chú thích cơ đang tô sáng — chấm màu đúng màu render + tên cơ + vai trò, en/vi/es, đặt dưới khung viewer gần dòng chú thích xoay; dữ liệu legend lấy từ `exercise.json` (`highlight_roles`), chỉ nhóm được tô sáng mới có mặt. (b) CHỈ nhóm cơ được tác động mới có vân sợi — KHÔNG vân giải phẫu toàn thân kiểu Lyfta; da xám trơn ngoài vùng sáng là phong cách ASCND, không phải thiếu sót. (c) Nền viewer MÀU ĐEN kiểu premium gym — không đổi sang xanh da trời của Lyfta; viewer hiện đã nền đen, giữ nguyên.

## 6. Việc còn lại

1. **Người có chuyên môn duyệt** chuyển động và vùng cơ (huấn luyện viên có chứng chỉ / chuyên gia vận động). Ghi kết quả vào `exercise.json` (`status`, `reviewer`, `approval_date`). Chỉ khi ấy `qa_report.json` mới cho `PUBLISHABLE`.
2. Sửa da vùng háng: thêm xương phụ / shape key sửa dáng khi gập hông, hoặc chỉnh trọng số vùng háng; chạy lại `pipeline/test_rig.py` và kiểm định.
3. Đưa lên bản phát hành (cần Kiệt duyệt, thay đổi dữ liệu): tải MP4 + poster lên Supabase Storage và thêm hàng `exercise_media`.
4. Thử dùng lại nhân vật cho Incline Dumbbell Press, Squat, Lat Pulldown (cần thêm dụng cụ tạ đơn, máy kéo cáp).
5. ~~Xem 3D tương tác trong app (RealityKit + USDZ, hoặc WKWebView + three.js): cần mock Kiệt duyệt trước.~~ **Đã làm 13/11** (Kiệt duyệt 12/11, lệnh làm xoay 360°): RealityKit + USDZ, chỉ bản Debug. Còn lại: kiểm trên simulator/thiết bị thật (NOT RUN).
6. Render lại 4 MP4 + 4 MP4 lặp với sợi v2 (MP4 hiện tại vẫn mang sợi v1, từ trước khi vẽ lại).

**Ước tính GPU khi mở rộng:** máy này (M3, 8 GB) mất khoảng 1,5–2 giây / khung 720p EEVEE / máy quay, tức ~30 phút cho 4 máy quay × 235 khung. 100 bài ≈ 50 giờ. Một máy có GPU rời tầm RTX 4070–4080 (12–16 GB VRAM) render EEVEE nhanh hơn khoảng 5–10 lần: 100 bài trong 5–10 giờ, 1080p khoảng gấp đôi. Thuê GPU đám mây (RTX 4090 / L4) khoảng 0,4–0,8 USD/giờ (giá nhớ, chưa kiểm lại) → dưới 10 USD cho 100 bài. Mocap bằng mô hình học sâu (nếu tìm được giấy phép thương mại) cần GPU NVIDIA ≥ 12 GB VRAM, không chạy được trên máy này.

## 7. Chưa biết / chưa kiểm

- Kiểm chứng giấy phép và tài liệu kỹ thuật đã chạy (11/11): `docs/exercise-visual-system/OPEN_SOURCE_AUDIT.md`, `bench-press/reference_notes.json`. Kích thước dụng cụ theo luật IPF đã đối chiếu bản PDF. Các thông số động tác (điểm chạm, độ rộng nắm, nhịp) có nguồn nhưng nguồn đo trên người tập ở 1RM, không phải một lần đẩy hướng dẫn: vẫn cần người có chuyên môn.
- Biến dạng da: đã đo trên 10 dáng (`rig_test.json`); khuỷu gập 130° và nắm tay có da chạm da (đánh dấu cần người xem); háng giãn khi gập hông (FAIL ở trên).
- GLB chưa thử trên iPhone (app chưa có trình xem 3D). USDZ + trình xem RealityKit đã làm 13/11 nhưng **chưa kiểm trên simulator / thiết bị thật** (NOT RUN). MP4 mới thử trên simulator; thiết bị thật: NOT RUN.
- Bản đồ cơ do người viết pipeline đặt theo giải phẫu bề mặt; chưa có người có chuyên môn giải phẫu xem. Trường hướng sợi v2 cũng vậy: hướng bề mặt bậc một theo origin→insertion, một trường mỗi nhóm, không mô hình xoắn gân hay góc pennation.
- Tệp nhị phân: repo không dùng Git LFS. Kiệt (11/11) bảo commit cả tệp nhân vật để người sau tiếp nhận được. MP4 / GLB / `.blend` của bài: xem dung lượng rồi quyết định khi có.
