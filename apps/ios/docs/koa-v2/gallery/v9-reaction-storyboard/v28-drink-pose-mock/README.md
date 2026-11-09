# v28 — mock dáng uống nước (chờ Kiệt duyệt)

Kiệt chọn "Vẽ mock dáng uống" (07/11): tay một mảnh của bản vẽ không gập được, nên uống nước cần tay gập khuỷu.

- `draft-1.jpg` (07/11): hỏng — quên `insetMat` (hình thu 0,93 neo ở chân) nên bình đè lên mũi, tay lơ lửng.
- `draft-2.jpg` (08/11): miệng lấy từ mốc mũi thật (`KoaRender.anchors`) theo đúng tư thế đầu; bình đặt sao cho vòi
  chạm miệng; tay hai đoạn (IK từ vai, khuỷu gập ra ngoài), cùng màu `#BFC7CF` và vệt lông `#A9B2BC` như tay gốc;
  bàn tay ôm phần dưới bình. Ba dáng: A nhấp nước, B tu (bình gần ngang), C hạ bình trước ngực "ahh".

Chỉ là mock debug (`SIMCTL_CHILD_ASCND_DEBUG_KOA_DRINK=1`), chưa nối vào `restDrink`. Duyệt xong mới nối.

**08/11 — KHÔNG DUYỆT.** Kiệt: tay gập "phá vỡ dáng tay ban đầu của koa". Không nối vào màn nghỉ; không vẽ tay
khác hình tay gốc. Hướng tiếp theo chờ Kiệt chọn.

## straw-1.jpg (08/11) — bình ống hút, chờ duyệt

Kiệt chọn "Mock bình ống hút". Tay phải giữ NGUYÊN hình gốc, chỉ xoay quanh vai như mọi cảnh khác (`walk.armRight`,
không lật, không gập). Bình vẽ SAU hình nên bàn tay gốc che nửa dưới bình như đang nắm; ống hút gập (trắng sọc cam
như nắp bình) đi từ nắp tới đúng miệng (mốc mũi thật theo tư thế đầu). A hút một ngụm (tay −38°), B hút say sưa
(tay −56°, bình nghiêng vào), C nhả ống "ahh" (tay −22°, ống dựng thẳng). Chưa nối vào màn nghỉ.

## straw-2.jpg (08/11) — sửa theo góp ý của Kiệt về straw-1

Góp ý: biểu cảm chưa đạt, tay cầm bình giả, ống hút dài vắt ngang má.
- **Tay nắm:** lớp nửa bàn tay gốc (`KoaFigureView.pawsOnly` → `arms = .only`, như dáng cheer) vẽ ĐÈ lên bình, bình lộ
  trên và dưới bàn tay. Hình tay không đổi.
- **Mặt:** A môi chúm ngậm ống, nhìn bạn (mặt rig chỉ đổi miệng, không mí nặng); B mắt nhắm gốc (`meditate`);
  C cười "ahh".
- **Ống hút:** thử đưa bình vào trước bụng để ống đi thẳng lên miệng (`straw-2-front-rejected.jpg`). Không được: tay
  cùng màu thân nên tay biến mất. Đưa bình ra bên phải thì ống phải đi ngang qua má, vì miệng nằm ngang hàng má hồng
  và tay gốc một mảnh chỉ xoay quanh vai, không đưa bình lên trước cằm được. Đây là giới hạn của tay gốc.
