# `v2-360-blockout/`: Koa 3D thô để quyết hướng 360° (05/11/2026)

Kiệt chọn "xoay 360°" (audit mục 8.1). Đây là **mock để duyệt**, không đưa vào app.

- Dựng trong Blender 5.2 (chạy nền) bằng `../../blender/koa_blockout.py`, toạ độ lấy thẳng từ `KoaSceneData` (canvas 240 × 300, 1 đơn vị = 1 cm).
- Chỉ có khối: đầu, tai, mắt, mũi, má, miệng, thân, bụng, tay, chân. Không có lông tơ, không có rig, không có đồ mặc.
- Render bằng Workbench, máy quay trực giao. Có hai kiểu ánh sáng: `FLAT` (màu phẳng, gần nét 2D) và `STUDIO` (thấy khối).

| Tệp | Là gì |
|---|---|
| `front-compare.png` | Trái: Koa 2D hiện tại (bảng spec, simulator, `v0-baseline`). Giữa: 3D phẳng. Phải: 3D có khối |
| `turnaround-8-views.png` | 8 góc cách 45°: trước, 3/4 phải, nghiêng phải, 3/4 sau phải, sau, 3/4 sau trái, nghiêng trái, 3/4 trái. Trên: `STUDIO`, dưới: `FLAT` |
| `turntable.mp4` | Quay 360° trong 3 giây, lặp hai vòng. Trái: `FLAT`, phải: `STUDIO` |

## Tự soi (một người chấm: mình)

Khác so với bản 2D:
- đầu tròn đều, thiếu má phình;
- tai trơn, không có viền lông răng cưa;
- chỏm lông là ba gai nhọn, không phải lọn mềm;
- miệng đang há nhỏ, không phải cười;
- mày mảnh;
- tay thẳng, mảnh hơn, có khe hở với thân;
- chân sát nhau.

Đều sửa được trong Blender. Nhưng **nét 2D Kiệt duyệt (đường viền mềm, khối phẳng) không giữ được trọn** khi đi 3D.

**NOT VERIFIED:**
- chạy trong app (chưa có SceneKit / RealityKit);
- hiệu năng;
- đồ mặc.
