# `v26-rest-fixes/`: bỏ cảnh nhảy, sửa cảnh lấy nước, mắt đen khi đổi mặt, sân khấu khớp cảnh xong buổi (07/11/2026)

**Kiệt:**
- "bỏ cảnh koa nhảy đi, cảnh koa lấy nước có vấn đề, thi thoảng koa chỉ có mỗi tròng đen khi chuyển đổi nét mặt";
- "sân khấu và vị trí đứng của koa phải khớp với story xong buổi tập".

## Mắt chỉ còn tròng đen khi đổi nét mặt

- **Bắt được trên video** (`bug-black-eyes-before.jpg`): lúc đổi sang mắt nhắm, hoặc từ mắt sao sang mắt mở, có vài khung hai mắt thành hai bầu dục đen đặc.
- **Nguyên nhân:**
  - màu của tròng trắng, ngôi sao và mí là dải màu đánh đèn trong `defs` của hình;
  - `defs` chỉ dựng theo nét mặt mới, trong khi lớp mắt của nét cũ còn vẽ tới lúc đổi xong;
  - lớp cũ mất dải màu nên tô thành đen.
- **Sửa ở bộ vẽ** (`KoaRender.defsFlags`): đang đổi mặt thì `defs` dựng theo cả cờ nét cũ.
- **Test:** mọi dải màu `koaL…` dùng trong lúc đổi mặt đều có định nghĩa. Test đỏ khi bỏ bản sửa.
- Lỗi này ở mọi chỗ Koa đổi mặt (cả cảnh xong buổi), không riêng màn nghỉ.

## Bỏ cảnh nhảy

- Bỏ "chạy bước nhỏ".
- "LƯỢT MÌNH!" vẫn giơ tay chữ V nhưng chỉ nhón nhẹ, chân không rời sàn.
- Test: không cảnh nào của màn nghỉ có `air` > 0.

## Cảnh lấy nước

- Bình nước đã mua đứng sẵn trên sàn cạnh chân Koa. Koa cúi nhặt (bình rời sàn vào tay), uống xong đặt lại.
- Lúc uống, Koa quay mặt về phía tay cầm bình cho bình sát miệng.

Ảnh: `drink-9-frames.jpg`.

## Sân khấu và chỗ đứng khớp cảnh xong buổi

- **Lấy đúng số của `KoaReactionView`:**
  - quầng cam ở 46 % chiều cao;
  - vũng sáng sàn ở 79 %;
  - Koa rộng 82 % màn (tối đa 340), tâm ở 54 %.
- **Bố cục:** chữ và thẻ số ở trên. Đồng hồ và nút gọn ở dải dưới chân, đúng chỗ cảnh xong buổi đặt thẻ số. Set tiếp theo nằm trong nút "Vào set tiếp".

Ảnh so sánh: `done-vs-rest-stage.jpg`.

| Tệp | Là gì |
|---|---|
| `rest-90s.mp4` | Quãng nghỉ 90 s (có bình), có tiếng |
