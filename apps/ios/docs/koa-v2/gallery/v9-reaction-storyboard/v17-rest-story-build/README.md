# `v17-rest-story-build/`: màn nghỉ "Một hơi nữa thôi", bản dựng (07/11/2026)

Dựng theo storyboard Kiệt duyệt ở `../v16-rest-story-board/STORYBOARD.md` ("Duyệt, dựng đi").

## Đã dựng

**Mặt có tham số** (`KoaFaceRig`, mới):

| Lớp | Cách làm |
|---|---|
| Mí | Dùng mí có sẵn của bản vẽ (`Options.blink`), từng mắt, mở 0 → nhắm 1. Chớp tự nhiên vẫn chạy chồng lên |
| Mày | Đường cong bậc hai của mày gốc (`M74 65 Q80.5 57.5 89 61`, mực `#20242A`, dày 5); đầu trong / ngoài dời theo độ nâng, độ nghiêng |
| Miệng | Môi trên qua hai khoé theo độ cười; khi há thì có lòng miệng, lưỡi, răng. Cùng màu và độ dày nét với miệng gốc |
| Đổi mặt | Nội suy từng kênh: mí trước, mày sau 90 ms, miệng sau 180 ms (mắt dẫn, mặt theo) |

**11 nét mặt** là 11 bộ số:
- gồng;
- kiệt sức;
- đã hồi sức;
- "lại là mày à";
- thở dài;
- ấm lên;
- dịu;
- cân nhắc;
- quyết tâm;
- chờ;
- ngủ gật.

Ảnh: `faces-grid.jpg`.

**Câu chuyện** (`KoaRestStory`), bám đồng hồ nghỉ thật:

| # | Cảnh | Koa | Mặt | Máy |
|---|---|---|---|---|
| 1 | Buông tạ (0–3 s) | Rep cuối run tay, hạ tạ, tạ chạm sàn "cộp", lấy đà ngồi phịch, nảy, lắng | gồng → kiệt sức | Toàn cảnh, đứng yên |
| 2 | Thở | Ngồi thở, nhịp dốc 1,2 s chậm dần thành 6 s | kiệt sức → đã hồi sức, liền theo độ hồi sức | Trôi rất chậm vào trung cảnh |
| 3 | Liếc tạ (nếu đủ dài) | Mắt liếc tạ trước, đầu theo sau; thở dài, vai sụp | → "lại là mày à" → thở dài → dịu lại | Lia nhẹ về phía tạ |
| 4 | Nhìn bạn | Quay về máy, gật nhẹ; sau đó nghỉ yên, cứ ~14 s một cú gật / mỉm nhỏ | → ấm lên → dịu | Trung cảnh |
| 5 | Quyết định (12 s cuối) | Nhìn tạ lần nữa, hít sâu, lấy đà, đứng dậy cầm tạ | → cân nhắc → quyết tâm | Đẩy vào cận mặt, chậm |
| 6 | Nhấc tạ (3 s cuối) | Mỗi giây siết tạ một nhịp; ở 0 nhấc tạ, vượt đà, lắng | quyết tâm → gồng | **Cắt** sang máy thấp, nghiêng 3° ở 0 |
| — | Tạm dừng | Nhìn bạn chờ; dừng quá 8 s thì mí sụp dần, ngủ gật | → chờ → ngủ gật | Giữ |

**Test giữ:**
- mặt không tham số nào nhảy quá 0,09 giữa hai khung 20 ms (nghỉ 30 s và 90 s);
- máy chỉ cắt đúng một lần, ở 3 s cuối;
- thân và tay không giật;
- nghỉ ngắn bỏ cảnh 3 nhưng vẫn đủ mạch.

## Tệp

`faces-grid.jpg`, `storyboard-frames.jpg` và `rest-90s.mp4`: chụp và quay trên simulator iPhone 17 Pro.
