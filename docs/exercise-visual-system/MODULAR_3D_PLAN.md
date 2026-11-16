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

## Lộ trình đề xuất

1. ~~**Nguyên mẫu (≈ nửa ngày):**~~ **xong 16/11 (xem trên).** `export_usdz.py --split` xuất `character.usdz` + `dumbbell_curl_motion.usdz` + `equipment/dumbbell.usdz`. App ghép lại và so khung hình với bản cũ trên simulator.
2. ~~Chuyển 8 bài sang dạng khối;~~ **16/11: 7 bài đã chuyển (bench chờ A/B, vẫn USDZ cũ); texture JPEG q92; thư mục 3D của app 63 → 30 MB; mở đủ 7 bài trên simulator.** trình xem nạp theo khối; bỏ bản chép nhân vật trong từng USDZ.
3. Điểm neo trang trí trong phòng + 1 gói mẫu (mock cho Kiệt duyệt trước, vì đây là thiết kế).
4. Dấu ẩn texture (tuỳ chọn).

Nguồn: [Apple forum: chuyển động USDZ từ file khác](https://developer.apple.com/forums/thread/719891), [Apple forum: thay mô hình giữ chuyển động](https://developer.apple.com/forums/thread/712959), [Apple forum: nhiều chuyển động trong USDZ](https://developer.apple.com/forums/thread/797061), [Apple: kiểm USD (variant đổi được sau khi nạp)](https://developer.apple.com/documentation/usd/validating-usd-files), [Apple: khái niệm USD](https://developer.apple.com/documentation/usd/usd-concepts), [DEV: khớp có "/" bị RealityKit bỏ](https://dev.to/_4a49fbaa067787556beb/investigating-missing-skeletons-in-realitykit-after-converting-unirig-glb-files-2kfj).
