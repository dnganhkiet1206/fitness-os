# `v4-from-art/`: 8 góc dựng từ đường viền gốc (05/11/2026)

**Kiệt góp ý v3:** "má của koa và chân tay của koa không còn được như bản chính".

**Vì sao v3 sai:** v3 dựng bằng khối cầu và khối trụ đoán theo toạ độ:
- má là hai khối phình riêng, nên đầu bị lồi;
- tay thành que, chân thành viên bi.

## Cách làm mới (`../../blender/koa_guide.py`)

1. **Phồng đúng đường viền gốc.** Mỗi mảng (đầu, tai, thân, tay, chân, chỏm lông) lấy path trong `KoaSceneData`. Một khối cầu được nắn sao cho nhìn từ trước trùng khít đường viền đó, chỉ thêm chiều sâu. Nhờ vậy má, tay, chân giữ đúng dáng bản vẽ ở mọi góc.
2. **Dán mảng mặt lên bề mặt.** Các mảng:
   - mắt, con ngươi, hai chấm sáng, mày, má;
   - mũi (phồng nhẹ) với vệt sáng và lỗ mũi;
   - miệng, lưỡi;
   - bụng, vệt bóng cằm, tay, chân.

   Mỗi mảng lấy hình gốc, chia lưới, chiếu lên bề mặt bên dưới. Nên chúng ôm theo khối, không nhô ra ngoài viền.
3. **Xếp lớp như bản 2D.** Tay, chân, thân, tai, đầu là từng lớp đầy đủ, xếp trước / sau theo góc nhìn:
   - chân luôn nằm dưới thân;
   - đầu và tai nằm trên thân;
   - tay trước hay sau thân tuỳ góc.

   SVG có nhóm `<g id="arm_L">`…, sẵn để rig xoay tay mà không lộ lỗ.

## Đo mặt trước so với bản chính (`front-iou.json`)

Độ trùng (IoU) giữa vùng thấy được của từng mảng và bản vẽ gốc:
- **Bóng dáng chung:** 0,999.
- **Tay, chân, thân, đầu, má, tai, mắt:** ≥ 0,95.
- **Mũi:** 0,85, vì phồng nên vệt sáng che một phần.
- **Chỏm lông:** 0,46. Phần chân chỏm chìm trong đầu; cùng màu nên không thấy khác, chỉ mất nét viền mảnh.

| Tệp | Là gì |
|---|---|
| `front-art-v4-v3.png` | Trái: bản chính (simulator). Giữa: v4. Phải: v3 |
| `34-v3-vs-v4.png` | Góc 3/4: v3 (trái) và v4 (phải) |
| `turnaround-guide-top-vector-bottom.jpg` | Trên: mẫu 3D. Dưới: vector. 0° → 315°, mỗi góc cách 45° |
| `vector-step-turn.mp4` | Đổi góc theo bước 45° |
| `svg/` | 8 SVG, cùng khung 240 × 300 với `KoaSceneData` |

## Vòng kiểm hình

| Lần | Thấy | Sửa |
|---|---|---|
| 1 | Dáng đúng, nhưng mũi ra trắng; tay chỉ trùng 0,64 vì thân 3D che mép trong của tay | Xếp lớp theo nhóm |
| 2 | Mũi vẫn trắng: vệt sáng làm mũi vỡ thành mảnh, mảnh nằm trong lỗ bị tô thành lỗ | Lấp lỗ đã có lớp sau che |
| 3 | Mảng mặt nở ra khi đẩy theo pháp tuyến (trùng còn 0,76–0,9) | Chỉ phồng mũi theo pháp tuyến; nâng mảng về trước 0,006 |

## Còn sai (một người chấm: mình)

- **Sau lưng và 3/4 sau trơn một màu.** Bản vẽ không có mặt sau. Cần Kiệt chọn chi tiết (sau tai tối hơn, đuôi…).
- **Góc nghiêng:**
  - mặt phẳng nên mũi và mắt dồn ra mép;
  - tai thành tấm mỏng.

  Đúng với khối, nhưng chưa "đẹp" như bản vẽ tay.
- **NOT VERIFIED:**
  - nạp vào app, vẽ bằng `Canvas`;
  - chuyển góc có hoạt ảnh;
  - đồ mặc;
  - hiệu năng.
