# `v8-pose-library/`: thư viện dáng Koa cho storyboard (05/11/2026)

Kiệt: "vẽ thêm nhiều dáng mới cho Koa để sau này tạo storyboard cho dễ, nhiều góc quay, dáng tập gym cùng các biểu cảm tương tự… tham khảo các nguồn, dùng công cụ mã nguồn mở nếu cần". Sau đó: "biểu cảm được phép vẽ thêm, tôi thấy Duolingo làm đỉnh lắm".

Đây là **mock tham khảo cho storyboard**, chưa phải art của app.

**Mở `index.html`** trong trình duyệt (cần thư mục `poses/`, `faces/` bên cạnh) để xem cả thư viện.

| Tệp | Là gì |
|---|---|
| `index.html` | Thư viện: storyboard mẫu, 17 dáng × 7 góc máy, 28 biểu cảm |
| `storyboard-sample.jpg` | Storyboard mẫu 6 khung "Buổi tập của Koa", ghi cỡ cảnh / góc máy |
| `library-poses.jpg`, `library-faces.jpg` | Ảnh chụp các phần của trang |
| `poses/<dáng>-<góc>.jpg` | 119 khung, 480 px |
| `faces/face-<biểu cảm>-<front|q34>.jpg` | 56 khung cận mặt |

## Có gì

- **17 dáng:**
  - đứng chào, vẫy tay;
  - cuốn tạ tay, đẩy tạ vai, squat, deadlift, vung tạ ấm, plank, lunge, chạy bộ;
  - nhảy ăn mừng, gồng tay khoe, giãn cơ nghiêng, uống nước, ngồi nghỉ mệt, thiền, nâng cúp.

  Mỗi dáng gắn một biểu cảm hợp cảnh.
- **7 góc máy:** trước · 3/4 phải · 3/4 trái · nghiêng phải · 3/4 sau · góc thấp (anh hùng) · góc cao (nhìn xuống). Đây là các góc cơ bản của storyboard (nguồn ở dưới).
- **28 biểu cảm:**
  - 22 biểu cảm đang có trong app, xuất thẳng từ `KoaRender`;
  - **6 vẽ thêm** (`blender/koa_faces_gym.py`): nghiến răng gồng, phồng má thở ra, hét chiến thắng, tập trung, thở dốc lè lưỡi, tự hào nhếch mép.

  Học cách Duolingo phóng đại, không chép Duo:
  - lông mày gánh cảm xúc;
  - miệng là mảng đồ hoạ lớn;
  - có dấu phụ (mồ hôi, hơi thở, lấp lánh).
- **Đạo cụ** theo bảng màu Koa: tạ tay, tạ đòn, tạ ấm, chai nước, cúp, thảm tập.

## Cách dựng (`docs/koa-v2/blender/`)

| Script | Việc |
|---|---|
| `koa_model.py` | Dựng Koa 3D từ ĐÚNG đường viền bản vẽ (như v4) |
| `koa_pose.py` | Xương, đạo cụ, dáng, góc máy, render (Blender 5.2, Workbench màu phẳng + viền) |
| `koa_faces_gym.py` | 6 biểu cảm vẽ thêm (path SVG trong khung mặt của `KoaSceneData`) |
| `faces_app.json`, `nose_app.json` | Mặt của 22 biểu cảm app, xuất bằng `dump_faces_test.swift.txt` (chép vào `Tests/ASCNDCoreTests` rồi chạy với `KOA_FACE_DUMP=<tệp>`) |
| `koa_storyboard_page.py` | Trang `index.html` + storyboard mẫu |

```sh
B=apps/ios/docs/koa-v2/blender; S=apps/ios/Packages/ASCNDKit/Sources/ASCNDCore/Koa/KoaSceneData.swift
Blender -b --factory-startup --python $B/koa_pose.py -- $S $B/faces_app.json $B/nose_app.json OUT/poses poses
Blender -b --factory-startup --python $B/koa_pose.py -- $S $B/faces_app.json $B/nose_app.json OUT/faces faces
python3 $B/koa_storyboard_page.py OUT/poses OUT/faces OUT/library
```

**Thêm dáng mới:** thêm một dòng vào `POSES` trong `koa_pose.py`.
- Tay khai bằng hướng tuyệt đối `arms_(l=(giơ ngang°, đưa trước°), lf=…)`, nên không phụ thuộc thân đang cúi hay thẳng.
- Thân, đầu, chân khai bằng góc quay theo trục thế giới.
- Thêm góc máy: một dòng trong `CAMS`.

**Bộ xương:** root → hips → chest → head / upper → fore (tay hai đoạn); root → foot.
- **Đùi là phần vẽ thêm:** một đoạn giãn từ hông tới bàn chân. Khi đứng thì khuất trong thân, chỉ lộ ra khi bước, ngồi hay squat. Bản vẽ gốc Koa không có đùi; thiếu đùi thì lunge và chạy không đọc ra được (soi 05/11).

## Vòng kiểm hình

| Lần | Thấy | Sửa |
|---|---|---|
| 1 | Hai góc 3/4 và nghiêng đều đặt máy bên tay trái, nên tay phải đang cuốn tạ bị thân che | Thêm 3/4 phải, nghiêng phải |
| 2 | Tay giơ thẳng lên bị cái đầu to che; tạ ấm ngang vai che mặt; lunge và chạy không thấy chân | Thêm đùi; dáng hợp vóc Koa: đẩy tạ kiểu cột gôn, tạ ấm ngang bụng |
| 3 | Đẩy tạ: bàn tay lọt vào trong đầu, vì góc quay tính từ tay nghỉ vốn chếch 30° | Khai tay bằng hướng tuyệt đối |
| 4 | Vẫy tay, nâng cúp: cẳng tay dựng thẳng nằm sau đầu; cúp và chai lệch hướng | Tay chếch ra ngoài viền đầu; đạo cụ dọc theo cẳng tay, to hơn 1,3–1,5 lần |

## Còn yếu (một người chấm: mình)

- **Khung hình:**
  - **Sau lưng và 3/4 sau trơn:** bản vẽ không có mặt sau.
  - **Tay ngắn, cùng màu thân:** ở góc trước nhiều dáng chỉ đọc ra nhờ đạo cụ. Góc 3/4 và nghiêng đọc rõ hơn.
  - **Deadlift, plank:** dáng thân hạt đậu không gập được nhiều, nên đọc ra "cúi", chưa ra "gập hông".
- **Biểu cảm:** 6 biểu cảm mới là đề xuất, **chưa vào app**. Cần Kiệt duyệt trước khi vẽ thành lớp trong `KoaSceneData`.
- **NOT VERIFIED:**
  - dùng trong Storyboarder hay phần mềm storyboard khác;
  - in khổ lớn.

## Nguồn

**Cỡ cảnh và góc máy storyboard:**
- Boords, "Storyboard shot types and camera moves": https://boords.com/blog/storyboard-shot-types-and-camera-moves
- "Understanding 16 types of camera shots and angles": https://medium.com/boords/understanding-16-types-of-camera-shots-and-angles-with-gifs-ee46d9f22b43
- "Storyboarding basics for Blender": https://blender.substack.com/p/storyboarding-basics-for-blender

**Công cụ mã nguồn mở:**
- Blender: dùng để dựng thư viện này.
- Storyboarder (Wonder Unit, MIT có ngoại lệ) để ghép khung: https://github.com/wonderunit/storyboarder. Ảnh trong `poses/` kéo thẳng vào được.

**Biểu cảm:** `../../DUOLINGO_RESEARCH.md`.

## Đã vào app (05/11, Kiệt: "Đạt, đưa vào app")

- **6 biểu cảm mới** là `KoaFlags.Expression`: `.grit`, `.puff`, `.roar`, `.focus`, `.pant`, `.smug`.
  - Mỗi mặt là một lớp `faceGym…` sinh từ `koa_faces_gym.py` qua `tools/koa-wardrobe/build.py`, nên chỉ có một nguồn.
  - Mắt, mày, miệng gốc tắt; mũi và má gốc giữ.
  - Bản RN không đổi.
- **Hành vi:**
  - mặt nhắm (`puff`, `roar`) không bị ép chớp;
  - khi đổi mặt, cả lớp mặt gym đổi dưới cú chớp như mắt;
  - dáng (`gesture`) có mặt riêng thì tắt lớp mặt gym;
  - quay mặt 2.5D trượt theo như mặt thường.
- **Ảnh:** `sim-spec-sheet-gym-faces.jpg`, bảng spec Debug trên simulator.
- **Còn:**
  - mắt của 4 mặt mắt mở (`grit`, `focus`, `pant`, `smug`) là lớp vẽ riêng: chưa chớp, chưa nhìn theo (`KoaGaze`);
  - ~~chưa gắn vào sự kiện nào~~ **05/11 gắn** (Kiệt: "khi ghi set / xong bài"):
    - thẻ nghỉ giữa set và Live Activity: nghỉ → thở dốc (ngồi), set kỷ lục → hét chiến thắng, tạm dừng → tập trung;
    - tổng kết buổi: tiến bộ hoặc lên hạng → chiến thắng, còn lại → tự hào;
    - ảnh `sim-rest-card-pant-focus.jpg`.
