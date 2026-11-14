# ASCND Motion Kit: tạo bài tập 3D từ mô hình của ASCND

Mục tiêu (Kiệt, 14/11/2026): một công cụ riêng của ASCND để tạo **hàng trăm bài tập** với chuyển động tự nhiên và chính xác. Mọi quyết định dựa trên dữ liệu thu thập được (nghiên cứu, số đo từ video có giấy phép, dữ liệu public domain), không đặt tư thế bằng mắt. Ai dùng bộ kit cũng làm ra bài đạt chuẩn theo cùng một quy trình.

Dữ liệu tạo ra là **tài sản của ASCND**. Chính sách nguồn ở `OPENGYM3D_LESSONS.md`: học cách làm từ các dự án khác, không chép dữ liệu; CMU và Mixamo không vào dữ liệu xuất xưởng.

**Trước khi làm bài mới: đọc `MOTION_KIT_LESSONS.md` (sổ lỗi). Gặp lỗi mới thì ghi vào đó trong cùng PR sửa.**

## Một bài tập = một file mô tả

`artifacts/exercise-visual-system/<bài>/exercise.json`. Các trường của kit:

| Trường | Ý nghĩa |
|---|---|
| `movement.pattern` | Họ động tác (`config/movement_patterns.json`): `press_horizontal`, `press_vertical`, `squat`, `hinge`, `lunge`, `row`, `pull_vertical`, `curl`, `tricep_extension`, `raise_lateral`, `raise_front`, `push_up`, `calf_raise` |
| `movement.rep_phases` | Các pha tạo thành một lần lặp; cổng giải phẫu chỉ chấm trong các pha này |
| `movement.qa` | Nới hoặc siết một ngưỡng của họ cho riêng bài này |
| `motion_provenance` | Nguồn gốc của từng phần dữ liệu: nguồn, giấy phép, ai đo. Bắt buộc, để chứng minh quyền sở hữu |
| `technique` | Thông số bộ giải của họ động tác: tay cầm, điểm chạm, cong lưng, ép vai… |
| `primary/secondary/stabilizing_muscles` | Nhóm cơ theo tổng quan EMG, có trích nguồn |
| `exercise_phases` | Các pha, mốc thời gian, cue kỹ thuật |
| `technical_cues`, `common_mistakes` | Mẹo và lỗi thường gặp (hiện ở trình xem) |

## Quy trình

```
1. Nghiên cứu   tìm nguồn kỹ thuật (NSCA/ACE/ExRx: dữ kiện) + số liệu động học (nghiên cứu)
2. Đo           pipeline/measure_video.py trên video có giấy phép → <bài>/reference_measurements.json
                (nhịp, góc khớp ở đỉnh/đáy, đường đi; chỉ lưu số đo)
3. Mô tả        viết exercise.json: pattern, technique (mục tiêu từ bước 1–2), cơ, mẹo, provenance
4. Dựng         bộ giải của họ động tác + rig 63 xương (bả vai, cơ ngực, xương xoắn)
5. Kiểm         pipeline/validate_motion.py (bài template) / validate_animation.py (bench):
                - cổng khớp: xương, tiếp xúc, trượt, liên tục
                - cổng dáng toàn thân (14/11): cổ tay thẳng, khuỷu ≤ 145°, khuỷu không kẹp
                  sau vai, đầu không gục, dụng cụ không xuyên da
                - cổng giải phẫu (evs/movement_gate.py): ngưỡng của họ động tác
                - tờ soi xoay vòng: 6 góc quanh người + 2 góc cao × đứng / giữa / đáy
                  (factory.py sheet). BẮT BUỘC soi tay, lưng, đầu, chân, dụng cụ ở mọi góc,
                  đối chiếu nguồn kỹ thuật, trước khi báo xong (MOTION_KIT_LESSONS.md luật 1)
6. Xuất         pipeline/export_usdz.py (sợi cơ vẽ, bản chỉ cơ chính) → app
```

## Thành phần đã có (14/11)

| Thành phần | Tệp | Trạng thái |
|---|---|---|
| Nhân vật 003 (14/11, Kiệt chọn A): trong dải dữ liệu MakeHuman (002 ngoại suy cơ 2,15 lần trông như Hulk) | `config/master_character.json`, `evs/character.py` | xong; chuỗi dựng: `factory.py character` |
| **Cơ tạc khối tách lớp theo phần giải phẫu** (14/11): 70 phần (2 đầu ngực, 8 múi bụng, 4 răng cưa, 3 đầu đùi trước, 2 nhóm đùi sau, 2 đầu bắp chân, 2 đầu tam đầu…); rãnh sâu giữa các cơ, nông giữa các đầu, mờ dần ở chỗ cơ thành gân | `config/muscle_parts.json`, `evs/muscle_sculpt.py`, `pipeline/sculpt_muscles.py` | bản đầu, chờ Kiệt duyệt |
| Rig 63 xương: thêm bả vai, cơ ngực, xương xoắn cánh tay/cẳng tay/đùi; trọng số da lấy từ rig default của MPFB, làm mượt | `evs/character.py` → `augment_rig` | xong; ép vai 25° không còn bóp nát ngực |
| Bản đồ 21 nhóm cơ, hướng sợi tính trên mặt 3D, sợi vẽ LIC | `evs/fiber_lic.py`, `pipeline/bake_fiber_directions.py` | xong |
| Cổng giải phẫu theo họ động tác (13 họ) | `evs/movement_gate.py`, `config/movement_patterns.json` | xong; `press_horizontal` có trích nguồn, các họ khác để "tạm" |
| Công cụ đo video (MediaPipe, Apache 2.0) | `pipeline/measure_video.py` | xong; bench press: 7 lần đẩy từ clip Pexels |
| Bộ giải họ đẩy ngang (bench press) | `bench-press/animate_bench_press.py` | chạy; cần tách thành bộ giải chung |
| Trình xem 3D (zoom, mẹo, ẩn cơ phụ) | `apps/ios/.../ExerciseDemo3DView.swift` | xong; đọc USDZ, góc máy, chú thích theo từng bài |
| **Bộ tạo chung theo template** | `motionlab/` (timing min-jerk, primitives, families: `curl`, `squat`), `pipeline/generate_exercise.py` | xong cho 2 họ; dumbbell-curl QA 12/12, back-squat 10/11 |
| **Bộ kiểm chung 4 tầng (A–D), lỗi chỉ đúng khung/khớp** | `evs/motion_qa.py`, `pipeline/validate_motion.py` | xong |
| **Giải theo mục tiêu** | `pipeline/solve_targets.py`, `pipeline/measure_animation.py` | xong; bench press: khuỷu 104° / dang vai 60° sau 24 lần thử |

## Đã học từ dữ liệu (bench press)

- Người trong clip Pexels 20672105 (tay cầm rộng), 7 lần đẩy: hạ trung vị 0,58 s, lên 0,83 s; khuỷu ở đáy góc trong khoảng 97° (2D 97,6°, 3D 96,7°), tức gập khoảng 83°. Khớp Mausehund 2022 cho tay cầm rộng (87,4 ± 8,1°).
- Nhân vật 002 hiện gập khoảng 118° ở đáy: vẫn sâu hơn người thật. Nguyên nhân: thanh chạm ngực thấp so với khớp vai. Phụ thuộc thân hình, độ rộng tay cầm và mức cong lưng, ép vai.
- MediaPipe đoán độ sâu kém khi người nằm (khoá tay đọc 132° thay vì khoảng 175°). Với góc quay ngang, góc 2D đáng tin hơn. Công cụ đo ghi cả hai.

## Lộ trình hoàn thiện kit

1. **Bộ giải theo mục tiêu (ưu tiên cao nhất):** bộ giải nhận mục tiêu đo được (ví dụ gập khuỷu 95° ở đáy, cánh tay so với mặt phẳng ngực ≥ −15°) rồi tự tìm tay cầm, điểm chạm, cong lưng, ép vai. Hết cảnh người vặn số.
2. **Bộ giải chung theo họ:** tách `animate_bench_press.py` thành `evs/families/press_horizontal.py` cùng giao diện chung (`solve(spec, character, equipment) → keyframes`). Biến thể (ghế dốc, tay hẹp, tạ đơn, chống đẩy) chỉ là thông số.
3. **Nhịp tự nhiên:** đường cong tốc độ của từng pha lấy từ số đo video (tăng tốc, chậm ở đáy, khoá tay), thay vì chỉ một hàm làm mượt.
4. **Bả vai tự động:** nhịp vai–cánh tay (scapulohumeral rhythm) theo nghiên cứu, gắn bả vai theo độ nâng và đưa của cánh tay, để mọi bài có vai chuyển động như người thật.
5. **Tờ ảnh duyệt nhanh:** 4 góc × đỉnh/giữa/đáy, kèm bảng điểm cổng, trong một ảnh mỗi bài.
6. **Lane dữ liệu sở hữu được:** UI-PRMD (PDDL, Vicon) cho squat/lunge làm mẫu nhịp và phối hợp khớp; Mesh2Motion (CC0) cho đi bộ, chạy, chống đẩy.
7. **Tạc khối cơ theo giải phẫu:** phồng bụng cơ, rãnh giữa các cơ, vạch gân bụng (3 cặp ở mỏm mũi kiếm, giữa, rốn), rãnh delta–ngực. Làm theo bản đồ cơ, trước khi làm hàng loạt.
8. **Dụng cụ:** thư viện tạ đơn, cáp, máy, ghế dốc, có kích thước theo nguồn (`config/equipment.json`).
9. **Danh sách 20 bài đầu:** chọn theo tần suất trong lịch tập của app; mỗi bài có file mô tả và trích nguồn.
