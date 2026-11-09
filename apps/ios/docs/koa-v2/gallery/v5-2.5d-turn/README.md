# `v5-2.5d-turn/`: Koa xoay kiểu 2.5D (05/11/2026)

Lý do và nguồn: `../../DUOLINGO_RESEARCH.md`.

**Script:** `../../blender/koa_turn25d.py KoaSceneData.swift OUT [góc…]`. Chạy bằng Python thường, không cần Blender.

**Cách làm:** dùng nguyên các path của bản vẽ, không vẽ lại. Mỗi lớp chỉ được dời ngang và co ngang một chút:
- mắt, con ngươi, mày, má, mũi (nhô ra), miệng, chỏm lông: trượt trên mặt trụ quanh đầu, bằng 0,8 lần góc thật;
- bụng, bóng cằm: trượt trên thân, bị cắt theo viền thân;
- tai, tay, chân: quay như các điểm có độ sâu;
- tay phía xa lùi ra sau thân; tai luôn nằm sau đầu.

**Ảnh do Chrome chạy nền vẽ.** ImageMagick vẽ sai SVG có `transform` lồng nhau, mất mày và lệch má, nên không dùng.

| Tệp | Là gì |
|---|---|
| `art-v4-3d-v5-2.5d.jpg` | Trái: bản chính. Giữa: v4 chiếu 3D ở 45°. Phải: v5 2.5D ở 30° |
| `turn-sweep-35-to-35.mp4` | Xoay liên tục −35° → 35° → −35°, 30 khung/giây |
| `turn-sheet-m35-m20-0-20-35.jpg` | −35°, −20°, 0°, 20°, 35° |
| `svg/` | Một vài khung SVG |

## Còn sai (một người chấm: mình)

- **Đầu không đổi dáng**, chỉ mặt trượt. Ở 35° bắt đầu thấy như "mặt nạ trượt". Một rig tốt sẽ chỉnh nhẹ viền đầu: má phía xa phẳng đi, má phía gần phồng ra.
- **Mũi chưa lấn ra viền mặt** ở 35°, nên chưa thấy rõ mõm nhô.
- **Thân gần như không đổi.**
- **Mặt nghiêng (90°), sau lưng: không có** ở cách này.
- **NOT VERIFIED:**
  - nạp vào `KoaRender` và vẽ bằng `Canvas` trong app;
  - hiệu năng;
  - đồ mặc khi xoay.
