# `v6-in-app/`: quay mặt 2.5D trong app (05/11/2026)

Chụp trên simulator iPhone 17 Pro (iOS 26.5): bảng spec Debug (`ASCND_DEBUG_KOA=1`), thanh "XOAY".

**Code:** `ASCNDCore/Koa/KoaTurn.swift`, nối vào `KoaRender` (`Options.turn`).
- **Nguồn góc quay:**
  - đang đi: theo hướng đi (thay cách dời cả mặt cũ);
  - nhìn theo ngón tay / liếc: 0,35 lần ánh nhìn;
  - bảng spec: thanh kéo.
- **Góc tối đa:** 30°.
- **Bản RN:** không đổi.

| Tệp | Là gì |
|---|---|
| `sim-spec-sheet-turn-sweep.mp4` | Kéo thanh 0 → 30° → −30° → 0, quay màn hình simulator thật |
| `sim-spec-sheet-turn-2fps.jpg` | 12 khung của video trên |
| `sim-minus30-before-tuft-fix.jpg` | Lần soi thứ hai, trước khi sửa chỏm lông (chỉ còn một lọn) |

## Vòng kiểm hình

| Lần | Thấy | Sửa |
|---|---|---|
| 1 (35°) | Mảng vuông sáng trên đỉnh đầu; mắt xa chạm mép đầu | Miếng che (`rect`) đứng yên; góc tối đa 30° |
| 2 (−30°) | Vẫn mảng vuông: miếng che là `path` hình chữ nhật | Path chỉ có 4 góc vuông cũng đứng yên |
| 3 (−30°) | Chỏm lông còn một lọn: lọn trượt vào dưới miếng che | Cả nhóm chỏm lông trượt cùng một khoảng |

## Còn lại

- **Tay phía xa vẫn vẽ trước thân.** Thứ tự lớp trong `KoaRender` cố định. Cùng màu nên khó thấy, chỉ lộ vệt bóng tay.
- **Đồ mặc chưa theo:** mũ, kính trong nhóm mặt trượt theo; đồ ở thân thì không.
- **NOT VERIFIED:**
  - Koa đi trong phòng quay mặt kiểu mới (chưa quay video phòng);
  - hiệu năng trên iPhone thật.
