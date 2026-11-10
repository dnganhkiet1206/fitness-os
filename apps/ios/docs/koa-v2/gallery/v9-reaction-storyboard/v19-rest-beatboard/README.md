# `v19-rest-beatboard/`: beat board màn nghỉ "Leo đỉnh ASCND" (07/11/2026)

Bước 2 của hồ sơ tiền kỳ `../v18-rest-preproduction/PREPRODUCTION.md` (Kiệt: "Duyệt, vẽ beat board").

**Đây là NHÁP để duyệt dáng, cảnh, màu và góc máy, chưa phải hình cuối.**
- Koa là mẫu 3D dựng từ đúng đường viền bản vẽ (bộ công cụ thư viện dáng đã duyệt 05/11), tay có khuỷu, mặt lấy từ app.
- Cảnh là khối thô, đặt đúng chỗ và đúng màu theo color script.
- Bản vẽ sạch làm ở bước 4.

| # | Nhịp story | Cảnh | Máy | Dáng / mặt |
|---|---|---|---|---|
| 01 | Ngày xưa… | Chân núi, sáng sớm | Toàn cảnh | Buộc giày, vui |
| 02 | (mở đầu) | Chân núi | Máy thấp | Chỉ lên đỉnh, cười tít |
| 03 | Trạm 1 · Mồi | Suối, nắng sáng | Trung cảnh | Ngồi uống nước, mỉm cười ("+2,5 kg!") |
| 04 | Trạm 1 · Vỡ ra | Suối | Máy trượt ngang theo | Bước đi, tự tin ("Đẩy bằng gót nhé") |
| 05 | Set khó · Xung đột | Cầu khỉ, mây xám tím | Góc cao, nghiêng | Dang tay giữ thăng bằng, hốt hoảng |
| 06 | Set khó | Cầu khỉ | Cận mặt | Bám dây, van nài ("Đừng nhìn xuống…") |
| 07 | Set khó · Vỡ ra | Cầu khỉ | Trung cảnh | Ngã ngồi, cười trừ ("Set nặng nhất xong rồi!") |
| 08 | Vì thế… | Trạm mưa | Trung cảnh | Trú dưới lá, mệt |
| 09 | Cho tới cuối cùng… | Sát đỉnh, hoàng hôn | Toàn cảnh sau lưng | Ngồi nhìn lên đỉnh |
| 10 | (nghiêm túc) | Sát đỉnh | Cận mặt | Ấm áp ("Set cuối rồi. Cảm ơn vì đã không bỏ cuộc.") |
| 11 | (đứng dậy) | Sát đỉnh | Máy thấp | Đứng dậy giữa gió, quyết tâm ("Lên nào!") |
| 12 | Từ đó về sau… | Đỉnh, ngược sáng | Toàn cảnh | Cắm cờ, thích thú, nối vào màn xong buổi |

Dựng lại: `Blender -b --factory-startup --python docs/koa-v2/blender/koa_beatboard.py -- <KoaSceneData.swift> faces_app.json nose_app.json <OUT>`.

**Chờ Kiệt duyệt:**
- **Dáng:** 12 dáng (giữ, sửa hay thay khung nào).
- **Cảnh:** 5 trạm và màu từng trạm.
- **Máy:** góc máy từng khung.

Duyệt xong là bước 3: animatic (khung tĩnh đúng nhịp, có tiếng tạm) cho trạm 1 và trạm cuối.
