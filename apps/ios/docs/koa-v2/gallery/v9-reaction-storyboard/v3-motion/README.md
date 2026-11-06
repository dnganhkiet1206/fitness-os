# `v3-motion/`: Koa có chuyển động, không cắt bụp (05/11/2026)

Kiệt xem v2: "koa chuyển động không có animation, học cách Duolingo làm".

## Duolingo làm thế nào (nguồn ở dưới)

- **State machine của Rive** nối các trạng thái hoạt ảnh lại với nhau, rồi **hoà trộn (blend)** khi chuyển, thay cho cắt cứng.
- **Đầu và thân tách rời**, cử động độc lập.
- **Nhiều lớp chạy cùng lúc:** thở, chớp mắt, liếc mắt, cảm xúc, khẩu hình.
- **Nhịp nghỉ trộn ngẫu nhiên:** 8 kiểu đầu × 8 kiểu thân = 64 biến thể, để không lặp.
- **Tiết chế:** một cái nhướn mày ngắn thay cho cả một phản ứng lớn (cách của Chuck Jones).

## Đã đổi (`KoaReaction` + `KoaReactionPreview`)

| v2 | v3 |
|---|---|
| Máy cắt cứng giữa các khung | Máy lướt liền sang khung mới trong 0,3 s. Chỉ còn một cú cắt có chủ ý: chớp trắng lúc "KỶ LỤC MỚI!" |
| Dáng đổi bụp (cầm tạ → ngồi) | Thân nén xuống 90 ms, đổi dáng lúc nén sâu nhất, rồi nảy lên có vượt đà |
| | (Lần thử đầu mờ chồng hai hình, ra "bóng ma", đã bỏ) |
| Dáng `cheer` / `taDa` hiện ngay | Hiện dần 0,3 s, vượt đà khoảng 1,08 rồi về 1 (`gestureAmount`) |
| Đầu đứng yên | Đầu diễn riêng theo từng khung: ngửa khi gồng, gật khi xong set, gục khi thở, liếc sang khi thư thái |
| Đổi khung là đứng im | Nảy theo đà sau mỗi lần đổi (lò xo tắt dần) |

Thở, chớp mắt và mặt đổi dưới cú chớp vẫn chạy cùng lúc (sẵn có trong `KoaFigureView`).

| Tệp | Là gì |
|---|---|
| `koa-reaction-set.mp4`, `-record.mp4`, `-done.mp4` | Ba cảnh, quay từ simulator |
| `before-after-transitions.jpg` | 15 khung / giây ở hai lúc đổi khung của cảnh ghi set |
| `record-closeup-to-cheer.jpg` | Cận mặt hét → máy lướt ra → tay giơ dần → nhảy |

Thứ tự hàng trong `before-after-transitions.jpg`:
1. v2, cận → trung cảnh (cắt bụp);
2. v3, máy lướt và đầu gật;
3. v2, cầm tạ → ngồi (đổi bụp);
4. v3, nén – đổi – nảy.

## Còn (một người chấm: mình)

- **Tay và tai chưa theo đà riêng khi đổi dáng.** Trong `KoaRender`, dáng là các lớp vẽ riêng, không có xương để nội suy. Cú nén chỉ giấu được cú đổi, chưa phải chuyển động khớp.
- **Nhịp nghỉ chưa trộn ngẫu nhiên** như 8 × 8 của Duolingo.
- **Chưa có âm thanh.**

## Nguồn

- Duolingo, "World character visemes" (state machine của Rive, trạng thái miệng chạy song song với dáng): https://blog.duolingo.com/world-character-visemes
- Rive, "Duolingo's AI-powered Video Call brings Lily to life" (blend, đầu / thân tách rời, 8 × 8 nhịp nghỉ, tiết chế): https://rive.app/blog/duolingo-s-ai-powered-video-call-brings-lily-to-life
- 12 nguyên tắc hoạt hình (lấy đà, nén / giãn, theo đà): https://www.bloopanimation.com/the-12-principles-of-animation/
