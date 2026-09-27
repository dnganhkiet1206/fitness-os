# Video quảng cáo ASCND 15 giây, dùng màn hình THẬT của app

`../ascnd-ad-15s-app.mp4`: dọc 1080×1920, 30 khung/giây, H.264, không tiếng.

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
