# `v7-arms/`: tay giơ lên không đè má, không ngược chiều (06/11/2026)

Kiệt chụp màn hình hai lỗi:
- `kiet-arms-over-cheeks.png`: "tay dơ lên bị chèn vào mặt";
- `kiet-arms-reversed.png`: "tay bị giơ ngược rồi".

| Lỗi | Vì sao | Sửa |
|---|---|---|
| Tay ăn mừng đè lên hai má | Cảnh dùng dáng `cheer`, mà `cheer` có `armsFront`: lớp tay vẽ ĐÈ lên đầu | Bỏ `cheer` khỏi cảnh phản ứng. Ăn mừng bằng tay của rig liên tục, dang ≤ 92°, nằm sau đầu đúng lớp. Mắt sao lấy từ mặt `delighted` |
| Tay giơ ngược chiều | Tay của bản vẽ cong để buông xuống; xoay lên mà không lật thì bàn tay ngược (lỗi Kiệt chỉ ngày 24/10, `cheer` / `taDa` đã lật) | `KoaRender.walkMat`: tay giơ ≥ 50° (`armFlipDeg`) thì lật hình tay theo trục vai → bàn tay (`KoaGesture.flip`), lật lúc tay vung nhanh nhất. Đi trong phòng tay chỉ đánh ~±20°, không chạm ngưỡng. Bản RN không lật |

**Test:**
- `noGestureDrawsArmsOverTheFace`;
- `raisedRigArmsFlipLikeTheCheerGesture`: định thức âm khi giơ cao, dương khi đánh tay, RN không lật.

| Tệp | Là gì |
|---|---|
| `before-reversed-hands.jpg` | Lần sửa trước: tay rig chưa lật nên bàn tay ngược |
| `after.jpg` | Kỷ lục lúc nhảy / đấm tay, xong buổi lúc khoe tay / nhảy / cuối cảnh |
| `koa-reaction-*.mp4` | Ba cảnh, có tiếng |
