# Bench Press 3D — đánh giá cuối (13/11/2026)

Kiệt hỏi: "kiểm lần cuối xem bài bench press đã đạt chưa". Kết luận: **CHƯA ĐẠT để phát hành.** Phần trình bày (viewer, sợi cơ, màu, chú thích, mẹo) đạt. Chuyển động ở tư thế đáy lệch rõ so với số đo người thật. Vẫn còn một mục kiểm tự động trượt, và chưa có chuyên gia duyệt.

## Cách đánh giá

- Báo cáo QA tự động: `bench-press/qa_report.json`, gồm 52 PASS, 1 FAIL, 5 cần xem tay, 2 UNVERIFIED, 1 NOT_TESTED.
- Đo trực tiếp trong Blender ở khung đáy (126). Khớp lấy từ đầu xương rig: `upperarm_l`, `lowerarm_l`, `hand_l`. Lồng ngực xác định theo `pelvis` → `neck_01` và đường hai vai.
- Đối chiếu với số đo motion capture của Mausehund và cộng sự 2022 (JSCR 36(10):2685–2695): 16 camera, người tập có kinh nghiệm, tay cầm chuẩn hoá theo góc tay–thanh ở đỉnh. Thêm các hướng dẫn kỹ thuật (Starting Strength, Barbell Medicine, Stronger by Science).
- Hướng sợi: `pipeline/check_fiber_directions.py`, xem README mục 14.

## Kết quả

| Hạng mục | Nhân vật | Tham chiếu | Đánh giá |
|---|---|---|---|
| Độ rộng tay cầm (góc tay–thanh ở đỉnh) | ~76°, 1,74 × khoảng cách hai khớp vai | trung bình = 75° | Đạt |
| Đối xứng, bàn chân / mông / đầu bám ghế, cổ tay (18°), khoá tay 171° | đạt ngưỡng QA | — | Đạt |
| Điểm chạm | xương ức dưới, 11,5 cm dưới khớp vai | giữa / dưới xương ức (Starting Strength, Barbell Medicine) | Đạt |
| Đường thanh | chữ J, lệch ngang 11,5 cm, lên ngược về vai | người tập giỏi đẩy về phía vai (Stronger by Science) | Đạt |
| Nhịp | 2 s xuống / 2 s lên, không nảy | 2–0–2 là nhịp áp đặt phổ biến nhất trong các nghiên cứu EMG | Đạt |
| Dang vai ở đáy | 50° (QA), 38° trong mặt phẳng trán | tay cầm trung bình 59,3 ± 8,2° | Gần đạt (thấp hơn ~1 SD) |
| **Gập khuỷu cực đại** | **136°** (góc trong 43,9°) | tay cầm trung bình **101,4 ± 8,3°** (tay cầm rộng 87,4°) | **Trượt (~4 SD)** |
| **Cánh tay so với mặt phẳng trán lồng ngực ở đáy** | **−35,8°** (khuỷu thấp hơn khớp vai 17 cm) | **−6,2° đến −10,8°** | **Trượt** |
| Độ cong lưng | ~5° | 29,9 ± 6,5° (người tập có kinh nghiệm) | Lệch. Lưng phẳng có thể là lựa chọn dạy người mới, nhưng chính nó làm khuỷu tụt sâu |
| Nhóm cơ tô sáng | ngực lớn (chính), delta trước + tam đầu (phụ) | Mausehund 2022 bảng 3: cả ba đều hoạt động cao (50–78 % MVIC trung bình) | Đạt |
| Hướng sợi | ngực 7,6°, delta trước 1,8°, tam đầu 2,1° (trung vị) | ngưỡng ≤ 20° | Đạt |
| Biến dạng da (QA) | p99.9 độ giãn cạnh 2,718 | ≤ 2,6 | Trượt (từ trước, nhẹ) |
| Video MP4 / poster | còn sợi cũ | — | Chưa làm |
| Chuyên gia duyệt | chưa | bắt buộc trước khi phát hành | Chưa |

## Nguyên nhân chính của chỗ trượt

Lưng gần phẳng làm ngực thấp: thanh chạm ngực chỉ cao hơn khớp vai 17,6 cm. Để thanh xuống tới ngực, cánh tay phải hạ sâu ra sau mặt phẳng trán khoảng 36°, nên khuỷu gập 136°. Ngay giữa pha hạ (khung 96), khuỷu đã gập 98,5°, bằng số đo ở *đáy* của người thật.

## Đề xuất sửa (cần Kiệt duyệt, vì phải key lại chuyển động và render lại)

1. Cong lưng vừa phải (khoảng 15–20° theo đường xương ức) và hạ, ép bả vai rõ hơn. Ngực nâng lên thì điểm chạm cao hơn.
2. Đặt mục tiêu ở đáy: gập khuỷu khoảng 95–105°, cánh tay khoảng −10° so với mặt phẳng trán, dang vai khoảng 55–60°, cẳng tay gần thẳng đứng.
3. Thêm ba phép đo này vào `validate_animation.py` để lần sau tự bắt lỗi. Hiện QA chỉ kiểm dang vai và độ nghiêng cẳng tay, nên không thấy khuỷu gập quá sâu.
4. Sau khi sửa: xuất lại USDZ, render lại MP4 và poster, sửa lỗi giãn da, rồi gửi chuyên gia duyệt.

Nguồn: Mausehund L. và cộng sự, "Understanding Bench Press Biomechanics — The Necessity of Measuring Lateral Barbell Forces", JSCR 2022;36(10):2685–2695; Starting Strength (critical technique elements: bench press); Barbell Medicine (how to bench press); Stronger by Science (bench press bar path).
