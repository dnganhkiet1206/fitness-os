# `v9-hands/`: bàn tay đúng chiều khi giơ (06/11/2026)

Kiệt chụp `kiet-hands-reversed.png`: "tay vẫn giơ ngược này".

**Vì sao:** v8 đẩy ngưỡng lật hình tay lên 70° để khỏi lật đi lật lại khi đấm tay, nhưng tay chỉ giơ ≤ 52°, nên không bao giờ được lật và bàn tay ngược chiều.

**Sửa:**
- **Ngưỡng lật 25°** (`KoaRender.armFlipDeg`). Mọi tư thế giơ đang giữ của cảnh phản ứng (đấm tay 38–52°, dang tay, nâng tạ) đều ở trên ngưỡng, nên luôn lật, không lật đi lật lại. Tay vung từ buông lên qua 25° rất nhanh. Có test kiểm từng khung 20 ms.
- **Lật là tuỳ chọn của dáng** (`KoaWalk.Pose.flipRaisedArms`), chỉ cảnh phản ứng bật. Chạy kéo thẻ (`KoaPull`, tay đánh tới ±40°, Kiệt đã duyệt) và đi trong phòng (±14°) giữ nguyên, ảnh chuẩn không đổi.

| Tệp | Là gì |
|---|---|
| `after.jpg` | Cuối cảnh xong buổi, lúc nhảy, kỷ lục lúc đấm tay |
| `koa-reaction-*.mp4` | Ba cảnh, có tiếng |
