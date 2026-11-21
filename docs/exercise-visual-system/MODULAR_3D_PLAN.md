# 3D dạng khối dùng chung: sửa một chỗ, áp dụng mọi bài (đề xuất 15/11/2026)

Kiệt hỏi 15/11: đổi phòng, sửa lỗi nhân vật, in hay đổi logo (pháp lý), trang trí theo mùa thì chỉ sửa một chỗ, không render lại mọi bài. Bảng dưới ghi hiện trạng, đích đến và cách làm.

## Hiện trạng (đọc từ `ExerciseDemo3DView.swift`)

| Khối | Hiện nay | Sửa một lần áp dụng tất cả? |
|---|---|---|
| Phòng gym | `gym_room_light/dark.usdz` riêng, app nạp lúc mở | **Có** |
| Logo trên biển phòng | App gắn ảnh `BrandMark` lúc chạy (`makeUnlit`) | **Có**: đổi asset `BrandMark` |
| Texture tô cơ | PNG riêng từng bài (`*_focus_*.png`), app gắn lúc chạy | Theo bài (đúng ý: mỗi bài tô cơ khác) |
| Nhân vật (lưới + xương + da) | **Chép vào từng USDZ bài** (~3,5–5,6 MB × 8) | **Không**: sửa nhân vật phải xuất lại mọi bài |
| Dụng cụ (tạ, ghế, đòn) | Chép vào từng USDZ bài | **Không** |
| Chuyển động | Trong USDZ bài | Theo bài (đúng ý) |

Phòng và logo đã tách sẵn. Chỗ còn phải render lại là **nhân vật và dụng cụ**, vì chúng nằm chung file với chuyển động.

## Đích đến: 5 khối, app ghép lúc chạy

1. **`character.usdz`**: một nhân vật duy nhất (lưới, khung xương, quần, texture da gốc). Sửa lỗi da, đổi quần, đổi thân thì chỉ xuất lại file này.
2. **`<bài>_motion.usdz`**: chỉ khung xương + chuyển động, không lưới (vài trăm KB). App lấy `availableAnimations` của file này rồi `playAnimation` trên nhân vật. RealityKit chạy được khi **tên khớp và cây khớp giống hệt** (Apple forum 719891; Reality Composer Pro 3 so cả số khớp, tên, cha, tư thế nghỉ).
3. **Dụng cụ** `equipment/<tên>.usdz` (dumbbell, ghế 70°, đòn + bánh tạ…): bài chỉ ghi "tay phải cầm dumbbell_12kg". App gắn dụng cụ vào xương tay bằng thực thể con bám khớp (pin / anchor theo khớp), hoặc gắn vào xương phụ `prop_r` có sẵn chuyển động trong file motion. Xương phụ là cách chắc nhất vì không cần API mới.
4. **Phòng + điểm trang trí**: phòng có sẵn các điểm neo rỗng (`Decor_Wall_L`, `Decor_Floor_Corner`…). Gói trang trí theo mùa (`decor/tet.usdz`, `decor/noel.usdz`) được gắn vào các điểm neo đó, chọn theo ngày. Logo giữ nguyên cách gắn ảnh lúc chạy.
5. **Texture tô cơ từng bài**: giữ như hiện nay.

Sửa một chỗ → áp dụng tất cả:

| Muốn đổi | Sửa | Render lại bài? |
|---|---|---|
| Lỗi da / thân nhân vật | `character.usdz` | Không (chỉ chạy lại QA chuyển động) |
| Logo vì pháp lý | asset `BrandMark` | Không |
| Phòng mới | `gym_room_*.usdz` | Không |
| Trang trí Tết / Noel | thêm `decor/*.usdz` | Không |
| Thay mẫu tạ | `equipment/*.usdz` | Không |
| Tô cơ (bản đồ cơ đổi) | PNG tô cơ, máy tự sinh từ exercise.json | Chỉ bước tô (vài giây / bài), không render cảnh |

Lợi thêm: 8 bài hiện chiếm 47 MB. Sang dạng khối thì còn 1 nhân vật (~3 MB) + motion (~0,3 MB / bài). Lên 100 bài thì khoảng 40 MB thay vì ~450 MB (bài toán P9).

## Chống bị lấy cắp: nói thật

- File trong app (USDZ / PNG) **luôn lấy ra được** từ gói cài đặt. Không có cách nào khoá hẳn.
- Làm được:
  1. Nhân vật và chuyển động là dữ liệu ASCND tự làm, có lịch sử commit làm bằng chứng tác quyền.
  2. Dấu ẩn trong texture da (watermark không nhìn thấy, đo lại được) để chứng minh bản copy là của ASCND.
  3. Logo gắn lúc chạy, nên ảnh chụp app luôn có logo.
  4. Khi lên hàng trăm bài, tải bài theo nhu cầu từ server có link ký (P9, **hoãn**: cần Kiệt duyệt thay đổi dữ liệu / Storage).
- Tách khối làm việc copy khó hơn một chút (phải tự ghép), nhưng đó không phải lý do chính để làm.

## Rủi ro cần kiểm trước khi chuyển

1. Chuyển động từ file khác chạy trên nhân vật: cần nguyên mẫu (1 bài) trên simulator. Rủi ro đã ghi trên forum: tên khớp có `/` bị từ chối; mỗi file có timeline riêng nên không blend được (app không cần blend).
2. Xương phụ (helper bones) đang được nướng (bake) thành chuyển động. File motion phải chứa cả chúng, nếu không da sẽ gập sai. Cây khớp của file motion phải trùng nhân vật.
3. QA vẫn chạy trên cảnh ghép trong Blender như hiện nay; chỉ khâu **xuất** đổi.
4. Sửa nhân vật mà làm đổi cây xương (thêm xương phụ) thì vẫn phải xuất lại motion. Việc này rẻ: chỉ xuất, không render.

## Kết quả làm thử (16/11, bài curl)

- `export_usdz.py --split [--character-out characters/master_character_003/usdz/character_003.usdz]` xuất:
  - `<bài>_motion.usdz`: khung xương + dụng cụ + chuyển động, thân thay bằng một tam giác 1 mm bám xương chậu để UsdSkel vẫn xuất khung xương;
  - `<bài>_full_*.png`: texture da đủ ba vai trò;
  - `character_003.usdz`: nhân vật ở tư thế nghỉ, không chuyển động.
- App (`ExerciseDemo3D.Demo.motionFile`, `fullTexturePrefix`) nạp nhân vật dùng chung + file chuyển động, phát **cùng một chuyển động** trên cả hai. Hai thứ khớp nhau vì cùng tên khớp và cùng cây xương.
- Simulator iPhone 17: curl chạy đúng, tạ nằm trong tay suốt động tác, ẩn/hiện cơ phụ chạy đúng (texture lấy từ PNG). File curl cũ 5,6 MB đã bỏ khỏi app.
- Dung lượng:

  | Phần | Dung lượng |
  |---|---|
  | File chuyển động curl | **340 KB** (trước 5,6 MB) |
  | Nhân vật dùng chung | 5,3 MB, một lần cho mọi bài |
  | Texture da đủ vai trò | 3,6 MB / bài |

  Texture da đủ vai trò vẫn nặng vì normal map 2 MB/bài. Việc tiếp: một normal map nền dùng chung, mỗi bài chỉ còn màu (JPEG/HEIC). Đây là bước 2.
- Sửa nhân vật từ nay: dựng lại chuỗi nhân vật → xuất lại `character_003.usdz` (một lệnh). Bài dạng khối không phải render lại, trừ khi cây xương đổi (thêm xương phụ). Khi đó chỉ chạy lại `--split` để xuất file chuyển động: vài giây/bài, không render cảnh.

**16/11 — Đổi phòng thực tế:** vệt bóng ghế bench nướng cứng vào sàn → dựng lại phòng trống (`build_gym_room.py --empty`), thay 2 file, mọi bài đổi theo; bóng tiếp xúc do app vẽ lúc chạy (`contactShadow`).

**16/11 — Dụng cụ tách khối (Kiệt):** `export_usdz.py --split --equipment-out equipment` xuất mỗi dụng cụ một lần thành `equipment_<khoá>.usdz` (khoá = loại + khối lượng, ví dụ `dumbbell_12kg`, `barbell_60kg` kèm bánh; không có khối lượng thì loại + hash hình học). File chuyển động chỉ giữ "ổ cắm" (vật cùng tên, vẫn chuyển động, lưới 1 mm); `<bài>_equipment.json` ghi ổ cắm → khoá; app nạp mẫu và gắn vào ổ cắm. `equipment/equipment_registry.json` giữ khoá → hash hình học: hai mẫu khác nhau trùng khoá thì pipeline báo lỗi. Kho hiện có 4 mẫu (tạ đơn 12 kg, đòn 60 kg, đệm ghế, khung ghế). **Đổi mẫu tạ** = sửa mẫu trong cảnh → chạy lại `--split` một bài (hoặc thay file `equipment_dumbbell_12kg.usdz`) → mọi bài dùng mẫu mới.

**16/11 — Dữ liệu bài thành file (Kiệt, việc 2):** `pipeline/export_app_demos.py` sinh `<bài>_demo.json` + `demo3d_index.json` từ `exercise.json` (`app_demo`: tên, tên gọi khác, ghi chú Lab) + `usdz_report.json` (góc máy) + vai trò cơ (chú thích, qua `config/legend_keys.json` và màu thương hiệu). App đọc các file này thay cho khai báo cứng trong `ExerciseDemo3D.swift`. Thêm bài / sửa vai trò cơ / sửa ghi chú: sửa `exercise.json`, chạy lệnh, không đụng code. Đối chiếu: chú thích + thời lượng của 8 bài giống hệt bản Swift; góc máy lệch < 2 mm (báo cáo mới hơn). Mẹo kỹ thuật (en/es/vi) vẫn trong Swift.

**16/11 — Phòng theo phần:** `build_gym_room.py --parts` xuất 7 phần (sàn, trần, tường, thanh gỗ, kệ, LED, biển logo) cho mỗi bản sáng / tối + `room_manifest_<look>.json` (danh sách phần + điểm neo trang trí: logo, trần trái/phải, tường trái/phải, sàn trái/phải, dây đèn). App ráp phòng theo manifest; bỏ 2 file phòng gộp khỏi app. Đổi sàn / kệ / logo = thay một file.

**16/11 — Quần áo tách khỏi thân (Kiệt, việc 3):** `--apparel-out` xuất `apparel_shorts.usdz` (khung xương + quần); `character_003.usdz` chỉ còn thân. App nạp quần như khối riêng, chạy cùng chuyển động, đổi texture "chỉ cơ chính" trên quần. Đổi đồ / in logo lên quần / đồ theo mùa = một file, không đụng thân hay bài.

**20/11 — Nội dung thành khối độc lập (Kiệt: "tách các file trong chế độ hướng dẫn 3d thành các file độc lập… để sau này có thêm nhiều thứ để người dùng cày"):**

- Trước: một `<bài>_demo.json` gộp tên, máy quay, cơ, mẹo, nhịp, lỗi sai; chữ mẹo / lỗi sai nằm trong `Localizable.xcstrings` của app (57 khoá). Sửa một câu mẹo = sửa catalog của app + xuất lại cả tệp bài; thêm nội dung mới = build lại app.
- Nay mỗi bài là các tệp độc lập trong `Resources/ExerciseDemos`:

  | Tệp | Nội dung | Nguồn trong Motion Lab |
  |---|---|---|
  | `<bài>_demo.json` | lõi: tên, tên gọi khác, tệp 3D, poster, máy quay, cơ, ghi chú Lab, `modules` | `exercise.json` (`app_demo`) + `usdz_report.json` |
  | `<bài>_tips.json` | mẹo: điểm neo + chữ en/es/vi | `app_demo.tips` + `content/tips.json` |
  | `<bài>_tempo.json` | nhịp từng rep | `tempo.json` |
  | `<bài>_mistakes.json` | clip lỗi sai + chữ en/es/vi | thư mục lỗi sai: `mistake_demo` + `content/mistake.json` |
  | `demo3d_index.json` | thứ tự bài + mã băm (sha256, 16 ký tự) từng tệp | sinh tự động |

- Thiếu khối nào thì tính năng ấy ẩn (bài không mẹo thì không có nút bóng đèn). Tệp có `schema` mới hơn app thì app bỏ qua khối (không crash) — để sau này gửi nội dung mới cho app cũ.
- Mã băm trong mục lục là bước chuẩn bị cho tải nội dung theo nhu cầu (P9, **hoãn**): khi có, app chỉ tải tệp đổi mã băm.
- Hợp đồng: `artifacts/exercise-visual-system/schemas/demo3d_*.schema.json` (JSON Schema 2020-12, chuẩn mở); bộ xuất kiểm bằng `jsonschema` (MIT) khi cài. Cổng CI `apps/ios/tools/demo3d-content.mjs` (không cần gói ngoài) kiểm phần schema không bắt được: mã băm, đủ ngôn ngữ, số bước giữa các ngôn ngữ, nhịp tăng dần trong clip, tệp 3D có thật, chữ không còn song song trong xcstrings; `--self-test` 14 dạng lỗi phải đỏ. Thêm `export_app_demos.py --check`: tệp trong app phải đúng là thứ Motion Lab xuất ra.
- Đổi gì → sửa gì (bổ sung bảng ở đầu tệp):

  | Muốn đổi | Sửa | Render / xuất lại? |
  |---|---|---|
  | Câu mẹo, thêm mẹo | `content/tips.json` (+ điểm neo trong `exercise.json`) | Không; chạy `export_app_demos.py` |
  | Câu lỗi sai | `content/mistake.json` | Không |
  | Nhịp | `tempo.json` | Không |
  | Thêm ngôn ngữ thứ tư | chữ trong `content/*.json` + `LANGS` của bộ xuất / cổng | Không |

- Còn dính với render: **poster** `<bài>_poster.jpg` (ảnh tĩnh dựng sẵn có phòng + nhân vật) — đổi phòng / nhân vật thì poster cũ lệch. Hướng tách: app chụp poster từ trình xem lúc chạy rồi lưu đệm (việc tiếp theo, cần kiểm khả thi).

## Lộ trình đề xuất

1. ~~**Nguyên mẫu (≈ nửa ngày):**~~ **xong 16/11 (xem trên).** `export_usdz.py --split` xuất `character.usdz` + `dumbbell_curl_motion.usdz` + `equipment/dumbbell.usdz`. App ghép lại và so khung hình với bản cũ trên simulator.
2. ~~Chuyển 8 bài sang dạng khối;~~ **16/11: 7 bài đã chuyển (bench chờ A/B, vẫn USDZ cũ); texture JPEG q92; thư mục 3D của app 63 → 30 MB; mở đủ 7 bài trên simulator.** trình xem nạp theo khối; bỏ bản chép nhân vật trong từng USDZ.
2b. **Tô cơ lúc chạy, xong 17/11** (Kiệt chọn 16/11, bàn giao việc 1):
   - Một bộ ảnh dùng chung cho mọi bài (`pipeline/export_muscle_shader_maps.py`, ~2,7 MB):
     - `muscle_ids.png`: R = số thứ tự phần cơ + 1, G = độ phủ, B = viền;
     - `muscle_shade.jpg`;
     - `muscle_normal.jpg`: khối cơ, không thớ;
     - `muscle_fiber_normal.jpg`: khối cơ có thớ của cả 48 phần;
     - `muscle_parts.json`.
   - `<bài>_demo.json` có `roles` (mã cơ theo vai trò).
   - App (`MuscleShader.swift`) pha da thân + quần × đủ / chỉ cơ chính khi mở bài, đúng phép pha của pipeline (`albedo_from_highlight` + `apply_shade` + `painted_emission`):
     - thớ cơ (normal có thớ) chỉ có trên phần cơ có vai trò; tô hết 48 phần thì thân trông như tranh giải phẫu;
     - ẩn / hiện cơ phụ = đổi bộ đã dựng.
   - Đã bỏ `<bài>_full_*` / `_focus_*` của 7 bài khỏi app: **−11,5 MB**, thư mục 3D 30 → 21 MB.
   - ~~**Vì sao pha trên CPU, không dùng shader Metal:** Xcode 26 tách Metal Toolchain thành thành phần tải riêng; máy dev chưa có, CI chưa chắc có.~~ **17/11 (Kiệt cho tải Metal Toolchain):** tô cơ trên GPU bằng `CustomMaterial` + `apps/ios/ASCND/Features/Exercises/MuscleSurface.metal` (`MuscleMaterial.swift`): đổi bài hay bật / tắt cơ phụ chỉ đổi bảng màu 64×2, không pha 4 ảnh 2K. CI tải Metal Toolchain khi ảnh runner thiếu. Đường CPU (`MuscleShader.compose`) giữ làm đường lùi khi không dựng được vật liệu; bản Debug ép đường CPU bằng `ASCND_MUSCLE_CPU=1` để so.
   - **Đo:** bản Debug trên simulator mất ~1,7 s cho 4 bộ ảnh 2048² (song song, ngoài luồng chính). Bản Release chưa đo.
3. Điểm neo trang trí trong phòng + 1 gói mẫu (mock cho Kiệt duyệt trước, vì đây là thiết kế).
4. Dấu ẩn texture (tuỳ chọn).

## Rà soát 17/11: còn tách / gọn được gì (Kiệt hỏi 17/11)

Đo trên thư mục 3D của app (20 MB, 7 bài dạng khối + bench cũ).

**A. Gọn nhẹ, không đổi hình (agent làm được ngay):**

| # | Việc | Đo được | Lợi |
|---|---|---|---|
| A1 | Bỏ texture da trong `character_003.usdz` và `apparel_shorts.usdz`: shader tô cơ lúc chạy đã thay cả ba (albedo, emission, normal). App nhận vật liệu thân theo tên thay vì "vật liệu có normal map". | 2,8 MB + 0,8 MB texture chết | −3,6 MB |
| A2 | Phòng sáng / tối dùng chung hình học: 7 phần có `usdc` giống hệt nhau (khác 1 byte tên), chỉ ảnh ánh sáng nướng khác. | nan gỗ 1,35 MB + kệ 0,33 MB chép 2 lần | −1,7 MB |
| A3 | Nan gỗ thành 1 thanh + vị trí (instancing; RealityKit có `MeshInstancesComponent` từ iOS 26). | 1 lưới gộp 17 982 mặt | −1,2 MB, nạp nhanh hơn |
| A4 | Chuyển động: bỏ khung mà nội suy từ hai khung bên cạnh vẫn lệch < ~0,3° (USD cho lấy mẫu thời gian không đều). Chạy lại QA để chứng minh không đổi. | curl: 90 khớp × 189 khung, chỉ kênh xoay | ước 2–3× nhỏ hơn mỗi file (~0,3 → ~0,1 MB / bài) |

Gộp A1–A4: 20 → ~13 MB; mỗi bài mới ~0,1–0,15 MB thay vì ~0,35 MB.

**B. Tách dữ liệu khỏi code (không đổi giao diện):**

- **B1. Mẹo kỹ thuật thành `<bài>_tips.json`** (en / es / vi). Hiện 9 mẹo viết cứng trong `ExerciseDemoTips.swift`, điểm neo là toạ độ cố định nên không bám theo người khi động tác chạy. Đề xuất neo vào **tên khớp + độ lệch** (`"joint": "upperarm_l", "offset": [...]`): mẹo đi theo cơ thể, bài mới thêm mẹo không cần sửa code, dịch thuật nằm cùng chỗ với nội dung.
- **B2. Ánh sáng thành preset trong `room_manifest_*.json`** (hiện `addLights` viết cứng): đổi ánh sáng theo phòng hay theo mùa mà không sửa code.

**C. Tính năng mới dựa trên các khối đã tách (cần Kiệt duyệt mock trước):**

- **C1. Nhịp từng rep (P5).** 7 bài đã có `tempo.json` (2 rep, pha lên / giữ / xuống / nghỉ, nhịp thở) nhưng app chưa đọc. Có thể hiện chữ pha ("Lên 2 s · Giữ · Xuống 1,6 s"), nhịp thở, đếm rep, nút chậm 0,5×. Đối thủ: RealiFit có lời nhắc từng rep và đọc số rep; Muscle & Motion tô cơ nhưng không thấy nhịp. Nhịp là điểm khác biệt.
- **C2. Clip lỗi sai (P7).** Cùng nhân vật, thêm file chuyển động "sai" (~0,3 MB, ví dụ lưng cong khi deadlift); nút "Sai thường gặp" chuyển qua lại, viền đỏ ở khớp sai.
- **C3. Bài một bên tay / chân.** Lật gương chuyển động lúc chạy: một file cho cả hai bên.
- **C4. Dụng cụ theo mức tạ người dùng ghi (P2).** Cùng chuyển động, đổi mẫu tạ (đã có cơ chế ổ cắm + `equipment_<khoá>.usdz`).
- **C5. Đồ / trang trí theo mùa.** Quần đã tách (`apparel_shorts.usdz`), phòng có điểm neo trang trí: chỉ còn thiếu mock và gói đầu tiên (việc 3 của bàn giao).

**D. Khi lên hàng trăm bài (hoãn, P9, cần duyệt):** On-Demand Resources đã bị Apple bỏ; thay bằng Background Assets, gói tài sản được quản lý (iOS 26, Apple host hoặc tự host). Diễn đàn có báo lỗi giải mã gói trên iOS 26.4–26.6 (chưa Apple xác nhận). Với A1–A4, 100 bài ước ~25 MB trong app, nên chưa cần tải về theo nhu cầu.

**Công cụ mã nguồn mở / có sẵn:** Blender 5.2 (đang dùng) cho A2–A4; `usdcat` / `usdzip` có sẵn trên macOS để đọc và đóng gói USD. ACL (Animation Compression Library, MIT) là tham khảo cách nén chuyển động, nhưng RealityKit chỉ phát USD, nên A4 làm bằng một bước lọc khung trong pipeline (numpy), không nhúng ACL vào app.

Nguồn rà soát 17/11: [RealityKit MeshInstancesComponent](https://developer.apple.com/documentation/realitykit/meshinstancescomponent), [WWDC25 What's new in RealityKit](https://developer.apple.com/videos/play/wwdc2025/287/), [Apple: kiểm USD (RealityKit hỗ trợ instancing)](https://developer.apple.com/documentation/usd/validating-usd-files), [OpenUSD: scenegraph instancing](https://openusd.org/dev/api/_usd__page__scenegraph_instancing.html), [Blender: USD xuất chuyển động rất nặng #110184](https://projects.blender.org/blender/blender/issues/110184), [ACL](https://github.com/nfrechette/acl), [Background Assets: AssetPackManager](https://developer.apple.com/documentation/backgroundassets/assetpackmanager), [App Store Connect: Apple-hosted asset packs](https://developer.apple.com/help/app-store-connect/manage-asset-packs/overview-of-apple-hosted-asset-packs), [Diễn đàn: lỗi tải gói iOS 26.4–26.6](https://developer.apple.com/forums/thread/845723), [Muscle & Motion](https://muscleandmotion.com/strength-training-app), [RealiFit](https://apps.apple.com/cd/app/realifit/id717142096).

Nguồn: [Apple forum: chuyển động USDZ từ file khác](https://developer.apple.com/forums/thread/719891), [Apple forum: thay mô hình giữ chuyển động](https://developer.apple.com/forums/thread/712959), [Apple forum: nhiều chuyển động trong USDZ](https://developer.apple.com/forums/thread/797061), [Apple: kiểm USD (variant đổi được sau khi nạp)](https://developer.apple.com/documentation/usd/validating-usd-files), [Apple: khái niệm USD](https://developer.apple.com/documentation/usd/usd-concepts), [DEV: khớp có "/" bị RealityKit bỏ](https://dev.to/_4a49fbaa067787556beb/investigating-missing-skeletons-in-realitykit-after-converting-unirig-glb-files-2kfj).
