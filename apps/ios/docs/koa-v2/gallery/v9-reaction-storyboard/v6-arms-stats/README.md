# `v6-arms-stats/`: tay không chèn vào mặt, thẻ số liệu giữ lâu (06/11/2026)

**Kiệt:**
- "3 thẻ dữ liệu phía dưới nên giữ lại lâu hơn ở cuối storyboard để người dùng đọc";
- "lỗi khi tay koa dơ lên bị chèn vào mặt".

| Lỗi | Vì sao | Sửa |
|---|---|---|
| Tay giơ lên chèn vào mặt | Vai ở (80 / 160, 178), ngay dưới má; tay dài ~68, má rộng tới x ≈ 40 / 200. Giơ quá ~95° là tay vòng ra SAU má, lớp đầu che tay, chỉ còn quả tạ lòi ra ở mép má | Kẹp góc giơ tay ≤ 92° (`maxArmRaise`, cả lúc run tay và kéo trễ). Diễn lại: nâng tạ ngang vai, đấm tay hai nhịp 68° ↔ 90°, khoe tay 90°. Giơ chữ V trên đầu vẫn dùng dáng `cheer` (lật hình tay) |
| 3 thẻ số liệu tắt sớm | Thẻ chỉ hiện 1,05 s (3,55 → 4,6 s) | Thẻ hiện từ 3,55 s tới **hết cảnh**. Cảnh xong buổi dài 7,5 s (trước 6,3 s), tức gần 4 s để đọc, đọc cùng "+12 Gains" |

**Test:**
- `raisedArmsNeverSlipBehindTheCheek`;
- `workoutStatsStayOnScreenUntilTheEnd`;
- sửa cách làm tròn số khung (7500 / 8,33… ra 899,99).

| Tệp | Là gì |
|---|---|
| `before-arms-behind-cheek.jpg` | v5: tay lọt sau má, tạ lòi ra ở mép má |
| `after.jpg` | v6: các khung có tay giơ + khung cuối có 3 thẻ |
| `koa-reaction-*.mp4` | Ba cảnh, có tiếng |
