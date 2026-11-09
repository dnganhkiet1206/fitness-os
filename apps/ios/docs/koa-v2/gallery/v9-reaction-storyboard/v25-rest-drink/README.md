# `v25-rest-drink/`: sửa sân khấu, mắt, động tác; thêm cảnh lấy bình nước (07/11/2026)

**Kiệt:**
- "sân khấu background bị lệch, động tác koa kì quặc 1 vài chỗ, mắt trên hình tui gửi đang ở bản cũ chưa phải bản fix";
- "thêm cảnh koa đi lấy bình nước để uống, cảnh này chỉ áp dụng cho đồ vật đã được mua trong giỏ hàng".

## Sửa

- **Sân khấu lệch:** quầng cam và vũng sáng trên sàn trước neo theo tỷ lệ màn hình, nên lệch khỏi chỗ Koa đứng. Giờ chúng là nền của chính khung Koa: luôn ở sau lưng và ngay dưới chân Koa, không chiếm chỗ trong bố cục.
- **Mắt cũ:** mặt "buồn ngủ" dùng lớp mí nặng kiểu cũ, lộ mảng trắng trên mí. Màn nghỉ bỏ mặt này; cú vươn vai ngáp dùng mắt nhắm có nếp mí (mock B Kiệt đã duyệt).
- **Động tác kỳ:**
  - bỏ "giãn hông": thân chỉ nghiêng được 1,5°, chỉ còn một tay giơ sau đầu;
  - bỏ "xoay vai": hai tay vẫy so le như vỗ cánh;
  - "chạy bước nhỏ" vung tay nhỏ lại.

  Còn 6 hoạt động: vươn vai, chạy bước nhỏ, hít sâu, vẫy tay, gồng khoe cơ, liếc đồng hồ.

## Mới: Koa lấy bình nước uống (`restDrink`, 7,6 s)

Quay sang, bước một nhịp, cúi nhặt bình (bình hiện trong tay lúc chạm sàn), quay lại, đưa bình lên tu (nhắm mắt, nuốt từng ngụm), hạ bình "ahh" (mắt sáng), cúi đặt bình xuống.

- **Chỉ khi đã mua bình nước** (`hand_bottle` trong tủ đồ). App thêm `AppServices.koaOwned`, đồ đã mua, đọc cùng lúc với đồ đang mặc.
- **Thứ tự:** có bình thì uống nước là hoạt động thứ hai (sau khi hồi sức một chút).
- **Test:**
  - không có bình thì không bao giờ có cảnh này;
  - bình chỉ trong tay từ lúc nhặt tới lúc đặt;
  - đầu và cuối cảnh ở dáng đứng thường.

| Tệp | Là gì |
|---|---|
| `drink-8-frames.jpg` | 8 nhịp của cảnh uống nước |
| `rest-90s-bottle.mp4` | Quãng nghỉ 90 s (có bình), có tiếng |

Xem trên simulator: `SIMCTL_CHILD_ASCND_DEBUG_KOA_REST=90 …_SEED=0 …_BOTTLE=1`.
