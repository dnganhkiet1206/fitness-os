# Bench press: tư thế đáy — đối chiếu số đo và giới hạn hình học

Ngày: 2026-11-14. Nhánh: `agent/c/bench-bottom-fix`, từ tip `6483f5f5`,
nhân vật 003. Liên quan: `(#527)`, `docs/exercise-visual-system/
BENCH_PRESS_FINAL_REVIEW.md` (đánh giá của Kiệt, 13/11/2026).

## Kết luận

1. **Số 136° là của `.blend` CŨ, không phải animation hiện tại.**
   `.blend` hiện tại gập khuỷu ở đáy **105,8° — ĐẠT** chuẩn Mausehund
   101,4±8,3°. Không có lỗi gập khuỷu cần sửa.
2. **Khuỷu rơi dưới mặt ghế là lỗi THẬT trên `.blend` hiện tại:**
   khớp khuỷu thấp hơn mặt đệm **6,5 cm**, da khuỷu thấp hơn **9,7 cm**;
   humerus depth **−18,0°** (mục tiêu ≥ −15°, vẫn trong tolerance 5° nên
   cổng cho qua). Mắt thường thấy đúng như vậy.
3. **Lỗi này KHÔNG sửa được bằng tham số tư thế hay luật đặt khuỷu.**
   Tìm kiếm 23 trial + chứng minh hình học độc lập (mục 3–4) cho thấy
   tiêu chí "khuỷu không dưới mặt ghế" xung đột với 4 mục tiêu còn lại
   trên nhân vật 003. PR này **KHÔNG đổi pose, KHÔNG nới ngưỡng nào**.
   Quyết định tiếp theo thuộc về Kiệt (mục 6).

## 1. Đối chiếu số đo (Task 1)

Đo độc lập từ bone-head world positions (`upperarm`/`lowerarm`/`hand`),
không qua `movement_gate`, trên cả hai `.blend`:

| `.blend` | Gập khuỷu đáy | Humerus depth | Khung 96 |
|---|---|---|---|
| Cũ, commit `2ba756af` (nhân vật 001, 1.210.717 B) | **136,13°** | −35,77° | 98,53° |
| Hiện tại, tip (nhân vật 003, 2.828.270 B) | **105,79°** | −17,99° | — |

Số `.blend` cũ tái tạo chính xác đánh giá của Kiệt (136°, −35,8°,
khung 96: 98,5°) — đánh giá ĐÚNG cho file đó. Số `.blend` hiện tại khớp
cổng kiểm (105,792° / −17,987°) tới 0,01° qua hai phương pháp đo độc lập
— cổng ĐÚNG cho file này. Hai số đo hai phiên bản khác nhau: commit
`2ba756af` chỉ thêm file review, không đổi `.blend`; `.blend` được
rebuild ở `2d62fedf` (nhân vật 003 + tham số solver: grip 0,78 m,
retraction 32°, thoracic 29°, touch 0,19 m). `2d62fedf` không phải
ancestor của `2ba756af`.

Chuỗi build tái tạo chính xác: `build_scene.py` → `animate_bench_press.py`
→ `measure_animation.py` cho đúng số của `.blend` đã commit.

## 2. Tìm kiếm tham số (Task 2, giai đoạn 1–2)

Driver riêng: sửa `exercise.json` → chạy `animate_bench_press.py` →
đo bằng `measure_animation.py` + `elbow_above_pad` (khớp khuỷu thấp nhất
trừ mặt đệm 0,44 m). Mục tiêu: gập 93,1–109,7°, dang vai 51,1–67,5°,
depth ≥ −15°, cẳng tay ≤ 21°, khuỷu ≥ 0. Baseline: khuỷu −0,0648 m,
gập 105,79°, dang 55,82°, depth −17,99°, cẳng tay 5,04°.

| Trial | Khuỷu (m) | Gập | Dang | Depth | Cẳng tay |
|---|---|---|---|---|---|
| grip 0,74 | −0,0669 | 108,44 | 49,50 ✗ | −18,33 | 1,21 |
| **grip 0,82** | **−0,0600** | 102,88 | 63,16 | −17,05 | 9,89 |
| grip 0,84 / 0,86 | THẤT BẠI (vượt tầm với ở giá/lockout) | | | | |
| retraction 28° / 26° | −0,0684 / −0,0708 | 108,23 / 109,35 | — | −20,54 / −21,84 | — |
| thoracic 26° / 30° | −0,0689 / −0,0634 | 106,45 / 105,56 | — | −18,65 / −17,77 | — |
| touch 0,17 / 0,15 / 0,21 | −0,0670 / −0,0696 / −0,0621 | 108,14 / 110,48 ✗ / 103,28 | — | −18,50 / −19,08 / −17,35 | — |
| depression 0° / 3° | −0,0663 / −0,0654 | 106,03 | — | −17,77 / −17,94 | — |
| wrist 8° | −0,0624 | 106,62 | 55,48 | −17,44 | 2,74 |
| wrist 0° | THẤT BẠI | | | | |
| grip 0,82 + tho 26° | −0,0638 | 103,54 | 63,63 | −17,70 | 10,30 |
| grip 0,82/0,80 + wrist 8° (+ tho 30°) | THẤT BẠI (vượt tầm với, dù từng thành phần chạy được) | | | | |

Toàn bộ hộp tham số chỉ nhích khuỷu ~11 mm (−0,071…−0,060), trong khi
cần +65 mm. Đòn bẩy tốt nhất (grip 0,82) chỉ được +4,8 mm và làm cẳng
tay/dang vai tệ hơn so với nghiệm tối ưu của solver — không ship dưới
dạng "sửa lỗi" vì mắt thường vẫn thấy lỗi y nguyên. Solver cũ từng ghi
"FAILED" ở tho=30° và grip 0,82 + tho 26° là không xác định/môi trường,
không phải lỗi hình học tất định: cả hai chạy được ở đây.

Công thức khóa: khuỷu ≈ thanh_Z − 0,35 (cổ tay = thanh + offset tay
−0,075 m; cẳng tay đứng → khuỷu = cổ tay − 0,2747 m). Để khuỷu ≥ 0,44 m
cần thanh_Z ≥ 0,79 m, tức da ngực tại điểm chạm ≥ 0,76 m (hiện 0,704 m).

## 3. Chứng minh vòng tròn IK

Với vai V và cổ tay W cố định ở khung 126, khuỷu chỉ di chuyển được trên
một vòng tròn (giao hai mặt cầu bán kính xương cánh tay/cẳng tay). Quét
0–360°: **KHÔNG có vị trí nào thỏa đồng thời cả 5 điều kiện** (khuỷu ≥
mặt đệm, cẳng tay ≤ 21°, dang 51,1–67,5°, depth ≥ −15°, gập trong dải).
Vùng khuỷu trên đệm có cẳng tay nghiêng 39–90°; vùng cẳng tay đứng có
khuỷu −2,3…−6,5 cm dưới đệm. Đổi quy tắc đặt cực khuỷu (pole) một mình
không sửa được — phải đổi hình học vai/cổ tay.

## 4. Nguyên nhân gốc (khung 126, `.blend` hiện tại)

- Khớp vai Z = 0,4608 (chỉ cao hơn mặt đệm 2,1 cm; cao hơn mặt tiếp
  xúc da lưng 0,4339 đúng 2,7 cm). Lưng đã ngồi sát đệm — không còn
  chỗ hạ/xoay thêm.
- Da ngực tại đường chạm Z ≈ 0,704, phẳng ±2 mm trên 20 cm quanh điểm
  chạm; đỉnh ngực (0,714) nằm 15 cm về phía đầu — chạm ở đó là sai kỹ
  thuật. Thanh đáy Z = 0,7224.
- Xương cánh tay 0,2658 m, cẳng tay 0,2747 m; |vai−cổ tay| = 0,3261 m.
- Độ nhạy arch: 1,4 mm/độ lên chiều cao thanh; construction đã ở giới
  hạn (retraction 32° = max, touch 0,19 m = đầu tốt).
- Ràng buộc tầm với ở giá đỡ: thanh trên giá giữ được tối đa Z 1,020 m,
  phải lên tới 1,014 m để qua mép — chỉ còn 6 mm dư. Đây là lý do các
  trial tổ hợp thất bại.
- Ngay cả tư thế chuẩn Mausehund (depth −8°): khuỷu ≈ 0,461 −
  0,266×sin(8°) ≈ 0,424 m, vẫn ~1,6 cm dưới đệm (da ~4,8 cm). Tiêu chí
  "khuỷu không dưới mặt ghế" chặt hơn cả hình học của tư thế tham chiếu
  trên nhân vật này.

Kết luận: thân trên của nhân vật 003 (vai thấp + ngực thấp so với chiều
dài tay, khi đặt cẳng tay đứng) không chứa được đồng thời 5 tiêu chí.
Sửa cần thay đổi ở tầng character/arch (độ dày lưng/vai, chiều cao ngực,
vị trí khớp vai) — ngoài phạm vi task này — hoặc một quyết định về
tiêu chí (mục 6).

## 5. Soi bằng mắt thường (khung 126 + tờ soi 8 góc × 3 tư thế)

Đã soi: `review_sheet.png` đã commit (từ `.blend` hiện tại, commit
`2d62fedf`) đủ 8 góc × 3 tư thế, crop phóng to hàng đáy (góc nghiêng +
góc ngang), và 3 ảnh render mới từ `.blend` đã commit ở khung 126:
ngang, 3/4 từ phía chân (không bị đĩa tạ che), 3/4 từ phía đầu.
Lưu ý: 4 MP4 trong thư mục render từ `.blend` CŨ (001,
`render_metadata.json` sha `25cab480…`) — không dùng để kết luận về
pose hiện tại.

Mắt thường thấy ỔN:
- Cẳng tay đứng thẳng: góc 3/4 phía chân cho thấy cả hai cẳng tay gần
  như dọc, cổ tay xếp trên khuỷu, khớp số đo cổng 5,04°.
- Thanh chạm ngực đúng vị trí; tay nắm thanh, ngón tay quấn quanh thanh
  tự nhiên; cổ tay thẳng.
- Character sạch: đầu đặt trên đệm, vai mượt không gộp cục, chỗ nối
  vai–tay liền mạch, lưng cong có tiếp xúc, mông trên đệm, chân đặt
  phẳng trên sàn, tỉ lệ cơ thể bình thường, không thấy rách da hay gãy
  rig ở góc nào.
- Gập khuỷu nhìn vừa phải, không gập quá sâu như bản cũ.

Mắt thường thấy LỖI:
- Khuỷu treo dưới mặt ghế ở đáy, thấy rõ ở góc ngang và góc nghiêng
  (cột 1/3/5/6 hàng đáy của tờ soi + ảnh ngang khung 126): xương cánh
  tay chúi xuống khỏi vai, khuỷu + da khuỷu lơ lửng dưới đệm.
- Góc ngang bị đĩa tạ che gần hết cẳng tay — không dùng góc này để
  chứng minh góc cẳng tay (đã có góc 3/4 phía chân thay thế).

## 6. Cần quyết / hướng tiếp theo (chưa được duyệt, không tự làm)

1. Chấp nhận hình học hiện tại: gập/dang/cẳng tay đạt, depth trong
   tolerance, khuỷu dưới đệm ghi nhận là giới hạn đã biết của nhân vật
   003 (kèm ghi chú này).
2. Thay đổi tầng character/arch: tăng độ dày lưng/vai hoặc chiều cao
   ngực, hoặc dời khớp vai — cần duyệt thiết kế, ảnh hưởng mọi bài tập.
3. Nới lỏng quy tắc cẳng tay đứng: KHÔNG khuyến nghị — phá giới hạn 12°
   của validator và vẫn không đủ 65 mm.

Không phương án nào được thực hiện trong PR này. QA baseline giữ nguyên:
`validate_animation.py` 55 PASS / 3 FAIL (`skin_deformation`,
`elbow_tracking`, `bench_contact` — đã biết) / 2 NOT_TESTED / 4
REQUIRES_MANUAL_REVIEW / 2 UNVERIFIED; pose không đổi nên không render
lại tờ soi/MP4.
