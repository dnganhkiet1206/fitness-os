# Video quảng cáo ASCND 15 giây

`../ascnd-ad-15s.mp4`: dọc 1080×1920, 30 khung/giây, H.264, không tiếng.

Sáu cảnh: ASCND → Tập luyện → Tiến bộ → Dinh dưỡng → Cộng đồng → kết (icon app +
"Train. Share. Discover. Progress."). Bám `native/docs/ASCND_Community_Mockup.jpg`
và concept. Ảnh chụp cắt từ mockup; chữ, thẻ và icon vẽ bằng HTML/SVG cho sắc nét.

## Sửa rồi xuất lại

1. Sửa `index.html`. Mọi chuyển động nằm trong khối `<script>`: `A(el, keyframes,
   lúc_bắt_đầu_ms, thời_lượng_ms, easing)`; số đếm nằm trong `window.render(t)`.
2. `node render.mjs 3000 9500` chụp thử vài mốc (ms) vào `probe/`.
3. `node render.mjs all` xuất 450 khung vào `frames/`, rồi ghép:
   `ffmpeg -framerate 30 -i frames/%04d.png -c:v libx264 -crf 17 -pix_fmt yuv420p -movflags +faststart ../ascnd-ad-15s.mp4`

Cần Playwright + Chromium (có sẵn trong môi trường này) và ffmpeg có libx264
(`pip install imageio-ffmpeg` nếu máy không có). Font: Be Vietnam Pro (SIL OFL).
