# `v1-slice/`: Koa V2, lát dọc (05/11/2026)

Trước / sau của PR "Koa V2 lát dọc", chụp trên simulator iPhone 17 Pro, iOS 26.5, Xcode 26.6.
- **Trước** = `native/ios-rewrite` @ `9cd4ae6d`.
- **Sau** = nhánh `claude/koa-v2-slice`.

Không ghi đè `v0-baseline/`.

| Tệp | Là gì |
|---|---|
| `today-real-size-before-after.mp4` | Koa ở Hôm nay **đúng cỡ trong app** (khoảng 50 điểm), 10 giây. Trên: trước, dưới: sau |
| `today-before-after.mp4` | Cùng cảnh, Koa phóng to 2 lần. Trái: trước, phải: sau |
| `today-4fps-before-top-after-bottom.png` | 40 khung (4 khung/giây) của mỗi bản |
| `sheet-before.mp4`, `sheet-after.mp4` | Bảng spec Debug: chạm Koa lớn để đổi nét mặt |
| `face-change-before-top-firsttry-bottom.png` | 20 khung/giây quanh lúc đổi mặt. Trên: trước (cắt bụp một khung). Dưới: **lần thử đầu**, mắt mờ dần chồng hai lớp ("mắt ma", cột 4–5 hàng dưới), đã bỏ |
| `face-change-v2-60fps-eyes.png`, `face-change-v2-60fps-wide.png` | 60 khung/giây, bản cuối: mắt đổi dứt khoát lúc mí khép, không còn hai lớp mắt |

**Đo chớp mắt** (độ sáng vùng mắt từng khung, 60 khung/giây, Koa ở Hôm nay):
- Trước: 5 lần trong 10,6 giây, theo hai chu kỳ cố định (5,2 s và 8,7 s).
- Lần thử đầu (`KoaGaze` 2–7 s): **1 lần** trong 10,4 giây. Kém sống hơn bản cũ, nên đã đổi sang 1,6–4,6 s.
- Sau: 6 lần trong 10,8 giây, cách nhau 0,47 / 2,18 / 3,75 / 0,47 / 2,63 giây (có chớp đôi).
