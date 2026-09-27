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

## Bản premium (30 giây, 120 khung/giây) — `../ascnd-ad-premium-120fps.mp4`

Mười cảnh, cắt theo nhịp 120 bpm, mỗi cảnh một bố cục riêng:
1. chữ động trên nền đen ("Tập. Ăn. Ngủ. Tiến bộ.");
2. logo có vệt sáng, điện thoại xoay lên;
3. máy quay tiến sát vòng Điểm sẵn sàng;
4. quét cùng một màn từ sáng sang tối;
5. ba điện thoại xếp quạt (tối);
6. thẻ giao diện nổi ra khỏi màn (sáng);
7. Trợ lý sức khoẻ, điện thoại lệch phải (tối);
8. Cộng đồng, thẻ trôi lệch lớp phía sau (sáng);
9. Koa, chỉ chế độ tối;
10. logo kết.

- Dựng: `premium.html`. Mọi khung tính trực tiếp từ thời gian trong `window.render(ms)`, không dùng
  animation của trình duyệt. Chuyển động giảm tốc êm, không nảy.
- Ảnh: `p/` (tĩnh, sáng và tối), `lift/` (thẻ cắt từ ảnh thật để nổi ra), `seq/p-*` (cuộn thật ở
  120 khung/giây, JPEG; không đưa lên repo). Lệnh chụp:
  - `SHOTS=p node capture.mjs still / /nutrition /log-meal /community`
  - `SHOTS=p THEME=dark node capture.mjs still / /nutrition /sleep-insights /workouts /awards /smart-goals`
  - `SHOTS=p MORNING=1 HOUR=10 THEME=dark node capture.mjs still /mascot-room`
  - `node capture.mjs scroll /community 420 1150 p-community`
  - `THEME=dark node capture.mjs scroll /assistant 360 520 p-assistant-dark`
- **Koa mở mắt**, có hai lý do:
  - Biểu cảm theo giờ và ngày: sau 22:00 Koa buồn ngủ; ngày đã ăn và đã tập thì Koa cười híp mắt,
    đúng thiết kế. Nên chụp lúc 10:00 trong trạng thái "đã ăn, chưa tập" (`MORNING=1 HOUR=10`).
  - Trên bản web, mí mắt chớp bị kẹt ở trạng thái khép (issue #162). `capture.mjs` ẩn đúng các mí ấy
    khi chụp.
- Âm thanh: `python3 synth_premium.py audio-premium.wav`. Tổng hợp bằng code, 120 bpm, −15,7 LUFS.
- Xuất: `node render120.mjs premium.html audio-premium.wav ../ascnd-ad-premium-120fps.mp4`, khoảng
  6 phút. Khung đẩy thẳng vào ffmpeg, không ghi ra đĩa.
