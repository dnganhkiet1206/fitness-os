# `v5-fixes/`: sửa ba lỗi của v4 (06/11/2026)

Kiệt: "khung khi koa nhảy lên có vấn đề, dáng koa mệt thở lè lưỡi như bị què 1 chân, nền phía sau koa nhảy theo koa".

| Lỗi | Vì sao | Sửa |
|---|---|---|
| Lúc nhảy, đầu và tai bị cắt bằng | Cú nhảy làm bằng độ nhún TRONG khung vẽ của Koa (viewBox 240 × 300); vượt mép trên là bị cắt | Nhún trong khung tối đa 6 đơn vị (`inCanvasBob`). Phần bay lên (`Frame.air`) dời CẢ hình |
| Dáng mệt như què một chân | Mình dùng `lean` / `sway` của dáng đi để diễn "cúi người". Nhìn thẳng thì đó là nghiêng NGANG trên màn, nên Koa lệch sang một bên | Nghiêng ngang tối đa ±1,5° (`maxTilt`). Mệt diễn bằng nhún xuống, gục đầu, tai cụp |
| Nền nhảy theo Koa | Quầng sáng `stage` gắn vào hình, nên theo cú nhảy và theo máy | Tắt `stage` của hình. Nền là quầng sáng + vũng sáng tĩnh của màn |
| (đi kèm) Bóng bay theo chân | Dời cả hình thì bóng của bản vẽ cũng bay lên | `KoaRender.Options.groundShadow = false`. Màn tự vẽ bóng nằm yên trên sàn, co lại và nhạt đi khi bay cao |

**Test chặn lại** (`KoaPerformanceFixTests`):
- nhún trong khung ≤ 6, cú nhảy kỷ lục vẫn bay > 25;
- không khung nào nghiêng ngang quá ±1,5°;
- tắt `groundShadow` thì bỏ đúng elip bóng.

| Tệp | Là gì |
|---|---|
| `before-v4.jpg` / `after-v5.jpg` | Ba khung: kỷ lục lúc nhảy, xong buổi lúc mệt, ghi set lúc mệt |
| `koa-reaction-*.mp4` | Ba cảnh, có tiếng |
