# Koa V2: audit kỹ thuật (giai đoạn 0)

05/11/2026, `native/ios-rewrite` @ `9cd4ae6d`. Kiệt giao: "ASCND — Koa Character System V2". Giai đoạn 0 chỉ audit: không đổi code, không đổi art.

Ảnh làm bằng chứng nằm ở `gallery/v0-baseline/` (xem `gallery/README.md`). Chỗ nào chưa kiểm được thì ghi **NOT VERIFIED**.

**Đính chính 05/11:** bản đầu viết "đứng yên gần như bất động, chưa thấy thở". Sai: bản vẽ có nhịp thở, chỉ là mọi phần cùng pha (mục 3, dòng 7).

---

## 1. Tóm tắt

- **Koa đã có nhiều hơn một con thú đứng yên.** Đang có:
  - 20 biểu cảm, 6 tư thế, 5 dáng, mí mắt khép theo độ;
  - chớp mắt lúc không đều (có chớp đôi), mắt nhìn có cú liếc nhỏ, đầu theo sau mắt;
  - đi bộ với bàn chân ghim trên sàn;
  - một "đạo diễn" chọn hành vi trong phòng, có điểm ngắt an toàn.

  Vì vậy V2 nên **nâng cấp hệ đang có**, không làm lại từ đầu.
- **Hai giới hạn thật nằm ở bản vẽ, không nằm ở code:**
  1. Chỉ có một góc nhìn: mặt trước.
  2. Bộ khung chỉ có một mảnh cho mỗi tay và mỗi chân, không có khuỷu tay, bàn tay hay đầu gối.

  Vì vậy mọi tư thế ra cùng một bóng dáng (ảnh `sim-koa-sheet-poses.png`). Không thêm code nào sửa được hai điều này. Phải vẽ thêm.
- **Đề xuất:** giữ Koa vẽ bằng vector như hiện nay (phương án A), và mở rộng bộ khung cùng các góc nhìn:
  - mỗi góc nhìn là một bộ lớp vẽ riêng trong cùng định dạng cảnh;
  - có thể dựng một mô hình 3D trong Blender **chỉ để làm mẫu tham chiếu khi vẽ**, không đưa vào app.

  Không chuyển sang Rive, Spine hay 3D thời gian thực: cả ba đều đã thử (thời bản RN) và đã bỏ có lý do (mục 4).
- **Cần Kiệt quyết trước khi vẽ** (mục 8):
  - bộ khung mới, ai vẽ các góc nhìn mới;
  - có cần quay lưng thật hay không.

---

## 2. Hệ hiện tại

### 2.1 Cách vẽ

| Tầng | Ở đâu | Làm gì |
|---|---|---|
| Dữ liệu cảnh | `ASCNDCore/Koa/KoaSceneData.swift` (77 KB, sinh tự động) | Cây SVG lấy từ bản export của công cụ thiết kế (`Koa.dc.html` → `koa-scene.ts` của RN @ `fac9ac2` → Swift). 41 nhóm có tên, mỗi lớp kèm cờ điều kiện, transform, và `@keyframes` CSS đã lấy mẫu |
| Cờ | `KoaFlags.swift` | Biểu cảm + tư thế + đồ mặc → bật / tắt từng lớp |
| Dựng | `KoaRender.swift` (655 dòng) | Hàm thuần: biểu cảm, tư thế, đồ, thời điểm `t`, ánh nhìn, độ khép mi, dáng đi → cây phần tử có ma trận |
| Kế hoạch vẽ | `KoaPaint.swift` | Cây → lệnh vẽ đã giải hết kế thừa, dải màu, clip. Thuần dữ liệu, test được trên Linux |
| Đèn | `KoaLight.swift` | Dải sáng / tối cho từng màu phẳng, viền sáng; bản giấy cho theme sáng |
| Hiển thị | `ASCND/Features/Mascot/KoaFigureView.swift` | SwiftUI `Canvas` + `TimelineView`, tối đa 60 khung/giây; đứng yên hoặc bật Giảm chuyển động thì dừng |

**Không có ảnh bitmap, Lottie, Rive hay 3D nào phía sau Koa trong app.** Ảnh Koa 3D trên trang web (`apps/site/src/img/koa3d/`, 11 ảnh) là ảnh Kiệt đưa ngày 23/10, chỉ dùng cho landing.

### 2.2 Bộ khung (rig) trong bản vẽ

Các nhóm có tên: `POSERIG`, `BODYRIG`, `HEADRIG`, `HEAD`, `FACE`, `EARS` (`ear_left` / `ear_right` + phần trong), `eye_left` / `eye_right`, `pupil_left` / `pupil_right`, `upper_eyelid_left` / `upper_eyelid_right`, `eyebrow_left` / `eyebrow_right`, `nose`, `mouth`, `tongue`, `blush_*`, `TORSO` / `belly`, `ARMS` (`arm_left_upper`, `arm_right_upper`), `LEGS` (`leg_left_lower`, `leg_right_lower`), giày `koaShoeL` / `koaShoeR`. Cảnh tủ đồ tách thêm `FOOT_L` / `FOOT_R`.

**Thiếu:**
- cẳng tay, bàn tay, khuỷu;
- đùi tách khỏi cẳng chân, đầu gối;
- **mí dưới**;
- mặt bên, mặt sau của đầu, thân và tai.

Tay chỉ xoay quanh vai (`KoaGesture.shoulderL/R`). "Quay mặt" là dời mặt 14, tai 5 và bụng 8 điểm theo hướng (`KoaRender.walkFlags`). Thân không đổi hình.

### 2.3 Thư viện hiện có

| Loại | Có gì | Nguồn |
|---|---|---|
| Biểu cảm (20) | happy, surprised, grin, confident, sad, tired, angry, delighted, happytired, strain, plead, meditate; content, warm, sheepish, sleepy, thinking, say1–3 (khẩu hình nói); tease; nope | `KoaFlags.Expression` |
| Tư thế (6) | idle, turn34, running, lifting, stretching, relaxing | `KoaFlags.Pose` |
| Dáng (5) | taDa, cheer, curious, flop, pout: xoay / dời thêm từng mảng, chồng lên tư thế đứng | `KoaGesture` |
| Mí mắt | `lidsHalf` / `lidsHeavy` / `lidsSad` / `lidsWink`: chính mí hạ xuống từ mép trên mắt, nét mi đi theo | `KoaRender` (04/11) |
| Chớp mắt | cách nhau 2–7 giây ngẫu nhiên, 18 % là chớp đôi; khép 0,07 s, mở 0,09 s; chớp khi đổi đích nhìn lớn | `KoaGaze` |
| Ánh nhìn | mắt tới trước, đầu theo sau (lò xo), cú liếc nhỏ, nhìn người xem / đồ vật | `KoaGaze`, **chỉ trong phòng** |
| Đi | bàn chân ghim trên sàn, tăng / giảm tốc, kiểu đi, nhảy lên / xuống bục, tai và đầu trễ theo | `KoaWalk` |
| Hành vi | greet, explore, proud, walkTo, home, rest, lookAround, notice, welcome; chấm điểm theo khí sắc, cooldown, chỉ ngắt ở điểm an toàn | `KoaDirector` |
| Cảm xúc theo ngày | 14 cảm xúc (idle, happy, sad, tired, sleep, celebrate, curl, worry, proud, rested, oops, hat, coat, warmup) suy từ dữ liệu thật của người dùng | `KoaMood`, `KoaEmotion` |
| Lời nói | lịch nói, khẩu hình theo câu, bong bóng thoại | `KoaTalk` |
| Vóc dáng | 6 hạng Gains (vai rộng, tay dày dần) | `KoaRender.rankFlags` |
| Đồ mặc | 7 chỗ × 10 món | `KoaWardrobeData`, `native/assets/mascots/KOA_OUTFIT_CATALOGUE.md` |

### 2.4 Màn có Koa

- Hôm nay: `TodayDayBlock`, `TodayExtras`, `KoaToday`.
- Phòng Koa: `MascotRoomView`, `KoaDirectorDriver`, `StudioLayers`, kéo thẻ `KoaPullScene`, phòng ngủ `KoaBedroomView`.
- Các màn khác: quay lại `KoaComebackView`, thẻ tuần `KoaWeekCard`, `KoaPeekHost`, lời nhắc `KoaReminderContext`, ăn mừng `CelebrationOverlay`.
- Widget: `KoaWidgetPublisher`.
- Bảng spec Debug: `KoaSheetView`.

### 2.5 Hiệu năng (số đã đo)

- Trước 27/10, Hôm nay đứng yên tốn 30–34 % CPU simulator vì `Canvas` vẽ lại 60 lần/giây. Đã sửa: dừng khi không chuyển động hoặc khi cuộn khỏi màn (sổ hạn chế, dòng 219).
- Phòng: 30 khung/giây khi đứng, 60 khi có chuyển động thấy được, một đồng hồ chung (dòng 328).
- **Instruments trên simulator không đo được** hitch, SwiftUI invalidation hay năng lượng (dòng 347). Signpost `Koa` có sẵn; muốn đo thì cần iPhone thật của Kiệt. **NOT VERIFIED:** chi phí khung trên máy thật.

---

## 3. Giới hạn, đối chiếu với đề bài

Mỗi giới hạn kèm bằng chứng. Tiêu đề cột "Đề bài" là số mục ở phần "Current problem" của đề bài.

| Đề bài | Thấy gì | Bằng chứng | Gốc ở đâu |
|---|---|---|---|
| 1, 2: một tư thế đứng, ít tư thế | Sáu tư thế cùng bóng dáng nhìn thẳng; chạy, tập tạ, giãn cơ chỉ khác đạo cụ và hai tay | `sim-koa-sheet-poses.png` | Bản vẽ: tay một mảnh, chân một mảnh |
| 3: thiếu góc nghiêng / 3/4 / sau lưng | "Turnaround 3/4" gần như trùng "đứng yên". Đi vào trong phòng Koa không quay lưng (sổ hạn chế, dòng 300) | `sim-koa-sheet-poses.png` | Bản vẽ chỉ có mặt trước |
| 4: nét mặt tĩnh | 20 biểu cảm, nhưng đổi bằng cách **bật / tắt lớp**: mặt nhảy bụp sang mặt mới, không chuyển dần | `KoaFigureView` / `KoaRender`: không có trộn giữa hai biểu cảm (chỉ đồ mặc có `blend`) | Code |
| 5: mí, chớp | Có chớp đúng nhịp tự nhiên và mí lờ đờ. Thiếu mí dưới; chớp khép mí trên đều hai bên, không lệch | `KoaGaze`, `KoaRender` | Bản vẽ (mí dưới) + code (lệch) |
| 6: ánh mắt | Có liếc nhỏ và nhìn theo đích, **nhưng chỉ ở phòng**. Hôm nay và các màn khác không có ánh nhìn sống | `KoaGaze` chỉ được `KoaDirector` dùng | Code |
| 7: đầu, tai, thân, tay, chân phối hợp | Khi đi: đầu và tai trễ theo, thân nhún. Khi đứng: bản vẽ **có** nhịp nghỉ (`koaBreathe` ngực 1,5–2,5 %, `koaBob` đầu 2,5 điểm, `koaEarL/R` 3,5°, `koaArmL/R` 2,5°), nhưng cả bốn cùng chu kỳ 3,6 s và **cùng pha**: lắc như máy đếm nhịp, biên độ nhỏ nên 14 khung trông gần như đứng yên. Không có dồn trọng tâm | `sim-koa-room-frames-2fps.png`; keyframes trong `KoaSceneData` | Code (cùng pha, thiếu dồn trọng tâm) + bản vẽ (ít khớp) |
| 8: chuyển cảnh thiếu chuẩn bị, theo đà | Đi có tăng / giảm tốc; dáng `cheer` có nhảy. Chuyển giữa biểu cảm là cắt bụp; chưa soi chuẩn bị trước cú nhảy | Code đọc được; **NOT VERIFIED** bằng video 60 khung/giây | Code |
| 9: cảm xúc chưa ra cả người | Cảm xúc chủ yếu ở mặt; 5 dáng đã thêm thân và tay, nhưng chỉ xoay quanh vai / cổ | `KoaGesture` | Bản vẽ (ít khớp) |
| 10: thiếu quy trình duyệt hình | Có ảnh chuẩn (snapshot test) cho 11 màn, có bảng spec Debug, có kiểm Maestro trong phòng. **Chưa có** thang điểm, thư viện ảnh có phiên bản, hay bảng so sánh tư thế | `ASCNDTests/__Snapshots__/KoaSnapshotTests` (33 ảnh) | Quy trình |

**Ngoài đề bài, mình thấy thêm:**
- Hai đường điều khiển cảm xúc tách nhau. Hôm nay dùng `KoaMood` → `KoaEmotion`; phòng dùng `KoaDirector` + `KoaCompanion.Affect`.
- Ăn mừng có `CelebrationQueue` riêng.

Chưa có một bộ điều khiển chung như đề bài yêu cầu ở giai đoạn sáu.

---

## 4. So sánh cách làm

Lịch sử quan trọng (`native/assets/mascots/README.md`, commit `1ee615ee`, 27/07/2026): thời bản RN đã thử **bốn cách** rồi bỏ: mô hình 3D GLB có rig, Rive có rig, ảnh AI tách nền, và Lottie. Chỉ vector vẽ bằng code còn lại, vì đó là cách duy nhất mà một quy trình chỉ có AI làm được trọn: tự tạo hình, xem được thay đổi (diff) và tự kiểm.

Điểm 1–5 (5 là tốt nhất), chấm theo hoàn cảnh của ASCND: không có hoạ sĩ, agent AI làm, Kiệt duyệt.

| Tiêu chí | A. Mở rộng vector hiện có | B. Rive | C. Spine | D. 3D (SceneKit / RealityKit) |
|---|---|---|---|---|
| Chất lượng hình | 4: giữ đúng nét Kiệt duyệt | 4 | 4 | 3–5: phụ thuộc người dựng mô hình |
| Biểu cảm | 4: lớp mặt có sẵn, thêm mí dưới / trộn mặt được | 5: state machine, blend | 4 | 4 |
| Nhiều góc nhìn | 2 → 4: phải vẽ từng góc; xoay liên tục thì không | 2 → 4: vẫn phải vẽ từng góc | 2 → 4: như B | **5**: quay thật |
| Hợp iOS / SwiftUI | 5: `Canvas` thuần, không thêm thư viện | 3: thêm `rive-ios`, tầng vẽ riêng | 2: runtime C++ / Metal tự gắn, giấy phép trả phí | 4: có sẵn trong iOS |
| Hiệu năng | 4: đã đo và tối ưu; cây nhiều lớp hơn thì nặng hơn | 4 | 4 | 3: nặng hơn cho thẻ nhỏ và widget |
| Công sức làm hình | 3: agent sửa được path SVG, nhưng vẽ góc mới cho đồng nhất thì khó | **1**: cần trình sửa Rive (giao diện đồ hoạ), máy này không có; agent không tạo được tệp `.riv` | **1**: như B, cần Spine Editor | 2: Blender 5.2 + MCP có trên máy, nhưng dựng Koa 3D đúng nét là việc lớn và phải Kiệt duyệt lại toàn bộ |
| Bảo trì | 5: test golden từng phần tử, chạy trên Linux | 2: tệp nhị phân, khó diff | 2 | 2: tệp nhị phân; đồ mặc 70 món phải làm lại 3D |
| Mở rộng | 4 | 4 | 4 | 3 |
| Mất gì đang có | không | đồ mặc, vóc dáng theo hạng, đèn, test golden phải làm lại | như B | như B, và nét vẽ Kiệt đã duyệt |

**Đề xuất: A**, kèm hai bổ sung:
1. **Góc nhìn rời** (front, 3/4 trái và phải, nghiêng, 3/4 sau, sau lưng):
   - mỗi góc là một bộ lớp riêng, dùng chung tên khớp (rig);
   - chuyển góc ở ngưỡng hướng mặt, che bằng đầu quay trước và thân theo sau;
   - lật trái / phải chỉ dùng cho những góc vốn đối xứng (nghiêng, 3/4), và phải sửa tay cầm đồ và đồ mặc không đối xứng.

   Đề bài cấm "lật một hình mặt trước". Đây là lật một hình **nghiêng đã vẽ thật**, nên không trái đề.
2. **Blender làm mẫu, không đưa vào app.** Dựng Koa thô (khối, không chi tiết) đúng tỉ lệ bản vẽ, đặt máy quay cố định ở 8 góc, dùng ảnh 8 góc đó làm khung để vẽ vector.
   - Lợi: giữ được tỉ lệ đồng nhất giữa các góc, là chỗ khó nhất của việc vẽ tay.
   - Phải Kiệt đồng ý vì là công cụ mới. Blender và MCP đã cài trên máy này, không cần tải gì.

**Không làm B, C:** không có trình sửa, agent không tạo được hình, và đã bỏ một lần.

**Không làm D cho app:** mất nét vẽ Kiệt đã duyệt (`koa-art-is-owners`) và mất chuyển động theo bộ phận mà Kiệt khen (`koa-motion-liked`, 23/10: Koa PNG trông như sticker). Mở lại nếu Kiệt muốn Koa xoay liên tục 360°, vì chỉ 3D làm được điều đó.

---

## 5. Công cụ có trên máy (đã kiểm 05/11)

| Công cụ | Có | Dùng cho |
|---|---|---|
| Xcode 26.6, simulator iPhone 17 Pro iOS 26.5 | ✅ | build, chạy, chụp (`simctl io screenshot`), quay (`simctl io recordVideo`) |
| Điều khiển simulator (chạm, vuốt, chụp) | ✅ | cuộn bảng spec, chạm Koa |
| `ffmpeg`, ImageMagick (`magick`) | ✅ | tách khung, ghép bảng so sánh, so ảnh |
| Blender 5.2 LTS + Blender MCP | ✅ | mẫu 3D tham chiếu (đề xuất 4.2) |
| Node, Python 3 (không có Pillow) | ✅ | công cụ `tools/koa-room`, `tools/koa-wardrobe`, `native/tools/koa-studio`, `koa-import/verify.mjs` |
| Snapshot test + bảng spec Debug (`ASCND_DEBUG_KOA=1`) + Maestro (`.maestro/09-koa-room.yaml`) | ✅ | ảnh chuẩn trên CI, xem tất cả biểu cảm / tư thế trên máy |
| Rive editor, Spine Editor | ❌ | |
| Bản export thiết kế gốc `Koa.dc.html` | ❌ không có trong repo hay trên máy (`mdfind`) | Chỉ còn bản đã chuyển thành `KoaSceneData.swift`. Vẽ mới sẽ làm thẳng trên dữ liệu cảnh, hoặc cần Kiệt gửi lại tệp gốc |
| Instruments trên simulator | ❌ (sổ hạn chế, dòng 347) | đo hiệu năng cần iPhone thật |
| Người duyệt thứ hai | ⚠️ Chỉ có mình và Kiệt | Agent con tốn token, Kiệt đã dặn không dùng (04/11). Kiệt là người duyệt thứ hai |

**Ảnh mẫu ảnh chuẩn chụp ở máy này lệch với CI:** 8 ảnh `KoaSnapshotTests` lệch dù không ai đổi hình, đã thấy ngày 04/11 ở #840. Vì vậy:
- ảnh chuẩn chỉ ghi và so trên CI;
- ảnh chụp ở máy chỉ để xem bằng mắt.

---

## 6. Vòng kiểm hình (bắt buộc cho mọi thay đổi về Koa)

Theo yêu cầu thêm của Kiệt (05/11). Mỗi thay đổi về hình, tư thế, nét mặt hay chuyển động đi đủ chín bước:

1. **Mock trước** (HTML artifact hoặc ảnh từ bảng spec Debug), Kiệt duyệt.
2. **Chụp thật** trên simulator ở đúng cỡ trong app (không chỉ bản phóng to): Hôm nay, phòng, thẻ nhỏ.
3. **So với Character Bible** và với `gallery/` phiên bản đã duyệt gần nhất. Ghép cạnh nhau bằng `magick +append`.
4. **Video** 60 khung/giây cho chuyển động; tách khung bằng `ffmpeg` để soi chuẩn bị, theo đà, bàn chân chạm sàn.
5. **Chấm 8 tiêu chí** (thang 1–5, mục 7), ghi từng lỗi.
6. **Sửa**, rồi chụp lại, chấm lại.
7. **Lưu vào `gallery/vN-…`**: không ghi đè phiên bản cũ.
8. **Ảnh chuẩn CI** cho hình đã duyệt (snapshot test), để lần sau lệch là CI báo.
9. **Ghi kết quả và giới hạn còn lại** lên #527. Chỗ chưa xem được thì ghi NOT VERIFIED.

---

## 7. Chấm điểm hiện trạng (v0)

**Một người chấm (mình), chưa có người thứ hai.** Chấm từ các ảnh trong `gallery/v0-baseline/` ở cỡ thật trên iPhone 17 Pro.

| Tiêu chí | Điểm | Vì sao |
|---|---|---|
| 1. Nhận diện nhân vật nhất quán | 4,5 | Cùng một Koa ở mọi màn, mọi tư thế, mọi đồ mặc. Nhất quán vì chỉ có một góc |
| 2. Giải phẫu, tỉ lệ | 4 | Tỉ lệ đầu / thân rõ, chân chạm sàn. Tay "ống" không khớp là chủ ý của phong cách, nhưng giới hạn tư thế |
| 3. Đọc được tư thế | **2** | Sáu tư thế cùng bóng dáng. Thu nhỏ hoặc che đạo cụ thì không đọc ra "chạy", "giãn cơ" |
| 4. Biểu cảm khuôn mặt | 4 | 20 mặt rõ ràng, dễ đọc ở cỡ ô nhỏ. Thiếu mí dưới, mày ít độ |
| 5. Chuyển động tự nhiên | 3 | Đi tốt (chân ghim sàn). Đứng yên có thở nhưng mọi phần cùng một nhịp, đọc ra là máy |
| 6. Chuyển cảnh | **2,5** | Đổi biểu cảm là cắt bụp. Chưa có chuẩn bị / theo đà ở chỗ đổi trạng thái |
| 7. Độ hoàn thiện | 4 | Đèn, viền sáng, bóng tiếp xúc, theme sáng / tối |
| 8. Hiển thị trong app | 4 | Sắc nét ở mọi cỡ; đã đo CPU. **NOT VERIFIED** trên iPhone thật |
| **Trung bình** | **3,5** | Chưa đạt ngưỡng 4 của đề bài; hai tiêu chí dưới 3,5 (3 và 6) |

---

## 8. Cần Kiệt quyết trước giai đoạn 1

1. **Hướng A (mở rộng vector, góc nhìn rời)** hay muốn quay liên tục 360° (chỉ 3D làm được, mất nét vẽ hiện tại).
2. **Ai vẽ góc mới.** Bản vẽ là của Kiệt. Có ba cách:
   - (a) agent vẽ vector dựa trên mẫu Blender, Kiệt duyệt từng góc;
   - (b) Kiệt vẽ trong công cụ thiết kế rồi gửi `Koa.dc.html`;
   - (c) thuê hoạ sĩ, nhưng việc này vướng đầu tư (sổ hạn chế).
3. **Bộ khung mới:** thêm cẳng tay + bàn tay, tách đùi / cẳng chân, mí dưới. Mọi đồ mặc ở chỗ tay / chân (70 món) phải chỉnh theo, nên đây là việc lớn nhất.
4. **Có cần sau lưng / 3/4 sau không.** Chỉ cần khi Koa đi vào trong phòng (sổ hạn chế, dòng 300). Có thể để sau front / 3/4 / nghiêng.
5. **Thứ tự:** mình đề xuất làm **một lát dọc** trước (mục 9, bước 2), không vẽ cả thư viện tư thế ngay.

---

## 9. Lộ trình đề xuất

Mỗi bước chạy hết vòng kiểm hình ở mục 6. Chỉ sang bước sau khi Kiệt duyệt ảnh của bước trước.

| Bước | Việc | Ra gì | Vì sao trước |
|---|---|---|---|
| 1 | **Character Bible** từ dữ liệu cảnh hiện có: đo tỉ lệ đầu / thân, khoảng cách mắt, kích thước tai, màu `#BFC7CF`… thẳng từ toạ độ trong `KoaSceneData` | `KOA_CHARACTER_BIBLE.md` + bảng tham chiếu (artifact) | Mọi góc và tư thế sau đều so với nó |
| 2 | **Lát dọc, không cần vẽ mới:** (i) trộn dần giữa hai biểu cảm (mí, mày, miệng chuyển trong khoảng 0,15–0,25 s thay vì cắt bụp); (ii) lệch pha nhịp nghỉ có sẵn (đầu trước, tay rồi tai theo sau) và dồn trọng tâm khi đứng yên; (iii) ánh nhìn sống ở Hôm nay; (iv) chớp lệch nhẹ hai mắt | Video trước / sau, bảng chấm | Nâng tiêu chí 5, 6 mà không đụng bản vẽ; thử trọn vòng kiểm hình trên việc nhỏ |
| 3 | **Mẫu Blender + turnaround** (nếu Kiệt duyệt mục 8.1–8.2): 8 góc, cùng đường nền, cùng ánh sáng | `KOA_TURNAROUND_SHEET` (mock) | Phải duyệt góc trước khi vẽ tư thế |
| 4 | **Bộ khung mới** (cẳng tay, bàn tay, chân hai đoạn, mí dưới) ở mặt trước; chỉnh đồ mặc | Bảng spec Debug cập nhật, ảnh chuẩn CI | Không có khớp thì không có tư thế khác bóng dáng |
| 5 | **Vẽ 3/4 và nghiêng** theo turnaround đã duyệt; chuyển góc khi đi | Video đi trong phòng | Góc dùng nhiều nhất sau mặt trước |
| 6 | **Thư viện tư thế** theo đề bài, ưu tiên những tư thế app có sự kiện thật: ăn mừng xong buổi tập, nghỉ sau tập, uống nước, ngủ / thức, chỉ vào giao diện | `KOA_POSE_LIBRARY` | Mỗi tư thế gắn với một sự kiện có thật |
| 7 | **Bộ điều khiển trạng thái chung** gom `KoaMood`, `KoaDirector`, `CelebrationQueue` thành các trạng thái của đề bài (IDLE … INTERACTING). Không viết lại, chỉ thêm một lớp trên | Bảng trạng thái + test | Cần tư thế trước mới có gì để điều khiển |
| 8 | **Sau lưng / 3/4 sau** (nếu cần) | | Ít dùng nhất |

**Rủi ro:**
- **Vẽ góc mới không giống Koa** là rủi ro lớn nhất. Giảm bằng mẫu Blender, Kiệt duyệt từng góc, và ảnh so sánh cạnh nhau.
- **Cây lớp lớn hơn làm khung chậm hơn.** Đo bằng signpost `Koa`; chỉ đo thật được trên iPhone.
- **70 món đồ mặc phải chỉnh theo khớp mới.** Có công cụ `tools/koa-wardrobe` để dựng lại và so ảnh.
- **Ảnh chuẩn lệch theo máy.** Chỉ ghi ảnh chuẩn trên CI.

---

## 10. Đã quyết, đã bỏ

| Ngày | Quyết định | Lý do |
|---|---|---|
| 27/07/2026 (RN) | Bỏ 3D GLB, Rive, ảnh AI tách nền, Lottie | Agent không tự làm và kiểm trọn được; còn sót thư viện native và khoảng 4 MB ảnh không dùng |
| 19/10 | Bỏ tư thế `wave`, `run` của RN | `turn34` không vẫy tay, `running` đứng yên trên sân khấu: không đọc ra được |
| 23/10 | Giữ Koa vector động trong app; ảnh 3D chỉ cho trang web | Kiệt: Koa PNG trông như sticker |
| 05/11 (đề xuất này) | A + góc nhìn rời + Blender làm mẫu; không B, C, D | Mục 4 |
| 05/11 | Lát dọc (mục 9 bước 2) đã gộp: PR 845 | Kiệt duyệt video trước / sau |
| 05/11 | **Kiệt chọn xoay 360°** thay vì A (mục 8.1) | Đang chờ Kiệt xem mẫu 3D thô `gallery/v2-360-blockout/` trước khi chốt cách làm (3D trong app, hay 3D chỉ để dựng góc rồi vẽ vector) |
