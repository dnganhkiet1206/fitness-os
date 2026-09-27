# Video quảng cáo ASCND dùng màn hình THẬT của app (15 giây và 30 giây)

- `../ascnd-ad-30s.mp4`: dọc 1080×1920, 30 khung/giây, H.264 + AAC, **có âm thanh**. 11 cảnh
  tính năng, năm kiểu chuyển cảnh, phòng Koa và cảnh kết ở nền tối.
- `../ascnd-ad-15s-app.mp4`: bản 15 giây, không tiếng.

**Phòng Koa chỉ quay ở chế độ tối** (`shots/mascot-room-dark.png`, `THEME=dark`):
chủ dự án chưa vẽ lại màn này cho chế độ sáng.

Mọi màn hình trong điện thoại là app thật. Đó là bản web dựng từ đúng code của app
(`native/tools/.live-build`), chạy với dữ liệu mẫu của bộ chạy thử
(`native/tools/live-world.mjs`, Supabase giả của `live-server.mjs`). Các đoạn cuộn
được quay khung-từng-khung bằng cách cuộn thật trong app rồi chụp.

Khác với iPhone:
- thanh tab ở đáy là thanh tab gốc của iOS, bản web không vẽ được, nên được ẩn;
- không có thanh trạng thái (giờ, pin) vì đây là ảnh chụp trình duyệt.

Cảnh: ASCND → Hôm nay (cuộn) → Dinh dưỡng (cuộn) → Tập luyện → Cộng đồng (cuộn qua
bài Buổi tập, Tiến trình, Công thức) → phòng Koa → kết.

## Làm lại

1. Dựng bản web nếu code app đã đổi:
   `cd native && npx expo export --platform web --output-dir tools/.live-build --clear`
2. Chụp:
   - `node capture.mjs still / /nutrition /workouts /community /mascot-room` → `shots/`
   - `node capture.mjs scroll / 96 900 today`
   - `node capture.mjs scroll /nutrition 84 380 nutrition`
   - `node capture.mjs scroll /community 90 950 community` → `seq/`
3. Ghép: `PAGE=compose.html node render.mjs all` → `frames/`, rồi
   `ffmpeg -framerate 30 -i frames/%04d.png -c:v libx264 -crf 17 -pix_fmt yuv420p -movflags +faststart ../ascnd-ad-15s-app.mp4`

Chữ, thời lượng từng cảnh: `SCREENS` và các `#cap…` trong `compose.html`.
Font, icon: dùng chung với `../ad-15s/`.

## Bản 30 giây

- Cảnh và chữ: mảng `SCENES` trong `compose30.html`. Mỗi cảnh có `tr`, là kiểu vào
  cảnh: `slide` (như đổi tab), `sheet` (như mở một bảng), `flip` (lật điện thoại),
  `blur` (nhoè chéo), `dark` (chuyển nền sang tối). Chuyển động giảm tốc êm, không nảy.
- Chụp thêm:
  - `node capture.mjs scroll /assistant 97 520 assistant`
  - `node capture.mjs scroll /awards 66 700 awards`
  - `node capture.mjs still /log-meal /sleep-insights /smart-goals /ai-coach` (rồi chép từ `shots/`)
  - `THEME=dark node capture.mjs still /mascot-room`
- Âm thanh: `python3 synth.py audio30.wav`. Tất cả tổng hợp bằng code (nhạc nền 4 hợp âm,
  nhịp 100 bpm, tiếng vút theo từng kiểu chuyển cảnh, tiếng tích khi chữ hiện, tiếng
  trầm khi vào cảnh tối, chuông ở cảnh kết), không dùng mẫu âm thanh có bản quyền.
  Mốc hiệu ứng trong `synth.py` phải khớp `SCENES`. Đo được: −16,3 LUFS.
- Xuất: `FRAMES=900 PAGE=compose30.html node render.mjs all`, rồi
  `ffmpeg -framerate 30 -i frames/%04d.png -i audio30.wav -c:v libx264 -crf 17 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart ../ascnd-ad-30s.mp4`
