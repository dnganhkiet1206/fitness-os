# Koa V2: lát dọc

05/11/2026, Kiệt duyệt. Lộ trình trong `KOA_TECHNICAL_AUDIT.md` (PR 844), mục 9, bước 2. Không vẽ thêm, không đổi art: chỉ dùng các mảnh đã có. Bản RN (`KoaScene.rn`) không đổi.

Ảnh và video: `gallery/v1-slice/` (xem README trong đó).

## Đã làm

| Việc | Đổi gì | Ở đâu |
|---|---|---|
| 1. Đổi nét mặt dần | Mày và miệng của nét cũ mờ đi, nét mới hiện lên trong 180 ms (dịu hai đầu). **Mắt không mờ dần:** mắt đổi lúc mí khép kín trong một cú chớp (khép 70 ms, mở 90 ms) | `KoaFaceTween`, `KoaRender.Options.faceFrom / faceMix / faceEyesNew`, `KoaFigureView` |
| 2. Nhịp nghỉ có đà | Bốn nhịp nghỉ của bản vẽ trước đây cùng pha. Giờ đầu nhún trễ 90 ms, tay trái / phải 160 / 230 ms, tai trái / phải 280 / 350 ms | `KoaMath.settleLag` |
| 2. Dồn trọng tâm | Thân nghiêng rất chậm quanh giữa hai bàn chân, tối đa ~0,9°, hai sóng 7,3 s và 11,9 s (không lặp thành nhịp). Chỉ khi đứng thường: không dáng, không đi, không tư thế khác | `KoaMath.weightShift` |
| 3. Ánh nhìn sống ngoài phòng | Koa ở Hôm nay và các thẻ có Koa động dùng `KoaGaze` của phòng: nhìn người xem, liếc nhỏ, thỉnh thoảng liếc đi rồi về | `KoaIdleLife`, `KoaFigureView` |
| 4. Chớp tự nhiên | Ngoài phòng: chớp cách 1,6–4,6 s không đều, 18 % là chớp đôi, thay chu kỳ cố định 5,2 s. Mọi nơi: mắt phải khép sau mắt trái 18 ms | `KoaGaze.blinkGap`, `KoaGaze.rightLag`, `KoaRender.Options.blinkRight` |

## Vòng kiểm hình

1. **Lần thử đầu, nét mặt:** mắt mờ dần làm hai lớp mắt chồng nhau ("mắt ma") trong khoảng 5 khung. Sửa: mắt đổi dưới cú chớp, chỉ mày và miệng mờ dần. Quay lại ở 60 khung/giây: không còn hai lớp mắt.
2. **Lần thử đầu, chớp mắt:** dùng nguyên 2–7 s của phòng thì Hôm nay chỉ chớp 1 lần trong 10,4 s. Sửa: 1,6–4,6 s cho Koa ngoài phòng; test mới quét 40 hạt ngẫu nhiên, hạt nào cũng có ít nhất 2 lần chớp / 10 s. Đo lại: 6 lần trong 10,8 s.
3. Xem ở **đúng cỡ trong app** (Koa khoảng 50 điểm ở Hôm nay), không chỉ bản phóng to.

## Chấm điểm (một người chấm: mình; Kiệt là người chấm thứ hai)

| Tiêu chí | v0 | Sau | Ghi chú |
|---|---|---|---|
| 1. Nhận diện | 4,5 | 4,5 | Không đổi art |
| 2. Giải phẫu, tỉ lệ | 4 | 4 | |
| 3. Đọc được tư thế | 2 | 2 | Ngoài phạm vi lát dọc: cần vẽ khớp và góc mới |
| 4. Biểu cảm | 4 | 4 | Chớp lệch, mí che chỗ đổi mắt |
| 5. Chuyển động tự nhiên | 3 | 3,5 | Chớp không đều, ánh nhìn ở Hôm nay. Lệch pha và dồn trọng tâm **NOT VERIFIED bằng mắt** (rất nhỏ ở cỡ thẻ; chỉ có test) |
| 6. Chuyển cảnh | 2,5 | 3,5 | Không còn cắt bụp ở mày / miệng; mắt đổi dưới cú chớp. Còn cắt ở mắt mở to (dưới đây) |
| 7. Hoàn thiện | 4 | 4 | |
| 8. Hiển thị trong app | 4 | 4 | Không thêm lớp vẽ, trừ một nhóm khi đang chuyển mặt 180 ms. **NOT VERIFIED** trên iPhone thật |
| **Trung bình** | **3,5** | **3,7** | Chưa đạt 4: tiêu chí 3 cần art mới (bước 3–5 của lộ trình) |

## Còn lại

- **Mắt mở to (`eyesWide`, `eyesStar`) không có lớp mí** trong bản vẽ, nên đổi từ mặt ngạc nhiên vẫn cắt ở 70 ms. Muốn sửa phải vẽ mí cho hai kiểu mắt này (art, cần Kiệt duyệt).
- **Nháy mắt có sẵn của bản vẽ** (`koaWink`, 9 s) trùng lúc Koa liếc sang bên có thể đọc ra "lườm" (một khung trong `today-before-after.mp4`). Không phải lỗi mới, nhưng nên xem khi làm hệ nét mặt.
- **Lệch pha và dồn trọng tâm** chưa soi riêng bằng video. Ở thẻ 50 điểm, biên độ dưới một điểm ảnh.
- **Hiệu năng trên iPhone thật**, chưa đo (Instruments không chạy trên simulator).
