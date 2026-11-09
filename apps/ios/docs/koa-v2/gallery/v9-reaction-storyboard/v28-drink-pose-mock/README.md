# v28 — mock dáng uống nước (chờ Kiệt duyệt)

Kiệt chọn "Vẽ mock dáng uống" (07/11): tay một mảnh của bản vẽ không gập được, nên uống nước cần tay gập khuỷu.

- `draft-1.jpg` (07/11): hỏng — quên `insetMat` (hình thu 0,93 neo ở chân) nên bình đè lên mũi, tay lơ lửng.
- `draft-2.jpg` (08/11): miệng lấy từ mốc mũi thật (`KoaRender.anchors`) theo đúng tư thế đầu; bình đặt sao cho vòi
  chạm miệng; tay hai đoạn (IK từ vai, khuỷu gập ra ngoài), cùng màu `#BFC7CF` và vệt lông `#A9B2BC` như tay gốc;
  bàn tay ôm phần dưới bình. Ba dáng: A nhấp nước, B tu (bình gần ngang), C hạ bình trước ngực "ahh".

Chỉ là mock debug (`SIMCTL_CHILD_ASCND_DEBUG_KOA_DRINK=1`), chưa nối vào `restDrink`. Duyệt xong mới nối.

**08/11 — KHÔNG DUYỆT.** Kiệt: tay gập "phá vỡ dáng tay ban đầu của koa". Không nối vào màn nghỉ; không vẽ tay
khác hình tay gốc. Hướng tiếp theo chờ Kiệt chọn.
