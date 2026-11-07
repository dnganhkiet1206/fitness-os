# `v15-rest-story/`: storyboard màn nghỉ, lần 2 (07/11/2026)

**Kiệt:** "storyboard của màn nghỉ chưa đạt, tham khảo các nguồn, biểu cảm, góc quay khác mới mẻ hơn".

## Tham khảo

- **Duolingo × Rive:** ghép 8 kiểu đầu × 8 kiểu thân cho hơn 64 biến thể đứng yên, để nhân vật không lặp. Nguồn: https://rive.app/blog/duolingo-s-ai-powered-video-call-brings-lily-to-life, https://blog.duolingo.com/world-character-visemes
- **Idle trong game:**
  - thở rất nhỏ (đứng yên không thở thì như tượng);
  - thêm cử chỉ một lần theo nhịp (30–60 s), để vòng lặp không đơn điệu.

  Nguồn: https://mocaponline.com/blogs/mocap-news/idle-animation-game-dev-guide
- **Hẹn giờ có nhân vật:** nhân vật làm việc của nó trong lúc đồng hồ chạy; người dùng khen điều đó. Nguồn: https://apps.apple.com/app/id6738017755
- **Góc máy:** máy thấp làm nhân vật "anh hùng", máy nghiêng gợi chao đảo; dùng ít để giữ sức nặng. Nguồn: https://www.acmi.net.au/education/online-learning/film-it/camera-angles, https://brush.ninja/glossary/animation/dutch-angle/

## Storyboard (bám đồng hồ nghỉ thật, `KoaRestStory`)

Koa làm đúng việc người ta làm khi nghỉ giữa hiệp. Đạo cụ có sẵn trong tủ đồ: tạ, khăn, bình nước.

| # | Đoạn | Koa | Mặt | Máy |
|---|---|---|---|---|
| 1 | Đặt tạ (0–2,8 s) | Gồng nốt rep, run tay → hạ tạ → đặt tạ xuống sàn | nghiến răng → "> <" → thở "phù" | Thấp, cận nửa người → lùi ra toàn cảnh |
| 2 | Lau mồ hôi (2,8–7 s) | Cầm khăn lau trán hai lượt, quay 3/4 | thở hổn hển lè lưỡi, mồ hôi | Trung cảnh |
| 3 | Uống nước (7–12 s, nghỉ ≥ 40 s) | Ngửa đầu tu bình nước, rồi hạ bình | nhắm mắt cười → "ahh" cười tít | Cận, nghiêng nhẹ |
| 4 | Thở cùng bạn | Hít vào 4 s / thở ra 4 s, có chữ dẫn nhịp | nhắm mắt thiền | Toàn cảnh, trôi rất chậm |
| 4b | Cử chỉ (mỗi ~24 s, xoay vòng) | Liếc xuống đồng hồ / vẫy tai nhìn quanh / nhìn bạn cười vẫy tay | suy nghĩ / vui / mỉm cười | Như trên |
| 5 | Chuẩn bị (12 s cuối) | Nhặt tạ từ sàn, lắc vai, nhún | thè lưỡi tập trung | Đẩy vào dần |
| 6 | Đếm ngược (3 s cuối) | Nhún mỗi giây | tập trung (gym) | Hạ thấp, đẩy một nhịp mỗi giây |
| 7 | Lên set (0 s) | Giơ tạ | nghiến răng | Thấp, nghiêng 3°, cận |
| — | Tạm dừng | Gãi đầu; dừng quá 8 s thì ngủ gật | suy nghĩ → buồn ngủ | Toàn cảnh |

Một quãng nghỉ 90 s đi qua ít nhất 8 nét mặt; mỗi nét mặt giữ ≥ 0,9 s. Cả ba điều đều có test.

## Tệp

- `storyboard-16-frames.jpg`: 16 khung dừng hình của quãng nghỉ 90 s, ở các mốc 0,4 / 1,3 / 2,2 / 4,2 / 5,2 / 8,2 / 9,2 / 11,5 / 14 / 22 / 30 / 79 / 82 / 88,3 / 89,7 / 90,3 s.
- `rest-45s.mp4`: một quãng nghỉ 45 s chạy thật, không tiếng (`simctl` không ghi tiếng).
- Mở màn Debug: `SIMCTL_CHILD_ASCND_DEBUG_KOA_REST=90`, thêm `…_REST_T=<ms>` để dừng hình.
