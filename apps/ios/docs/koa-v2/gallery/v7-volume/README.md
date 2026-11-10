# `v7-volume/`: quay mặt có khối (05/11/2026)

Kiệt: "vẫn cần cải thiện nhiều hơn nữa" (sau v6).

## Đổi so với v6 (`KoaTurn`, `KoaRender`)

| Việc | Vì sao |
|---|---|
| **Bóng trăng khuyết phía sau mặt** cho đầu và thân. Hình gốc trừ đi bản sao dời về hướng quay, màu `#8E98A3`, độ mờ 0,28 × độ quay | Kiểu vẽ phẳng cho thấy khối bằng một mảng bóng cạnh sắc, không dải mờ. Quay mà không có bóng thì như mặt nạ trượt trên đĩa |
| **Đầu ngoảnh theo:** nghiêng ngang quanh đỉnh đầu, hàm / má dời tới 6,5 đơn vị | Dáng đầu đứng im là chỗ yếu nhất của v6 |
| **Tay phía xa vẽ sau thân**, tay gần vẽ trước | Trước đây thứ tự lớp cố định; tay xa đè lên thân |
| **Mũi nhô hơn** (bán kính mặt trụ +26 thay vì +20) | Mũi trượt nhiều hơn mắt, thấy rõ mõm |

| Tệp | Là gì |
|---|---|
| `plus30-v6-left-v7-right.jpg` | 30°: v6 (trái) và v7 (phải), simulator |
| `minus30-plus30.jpg` | v7 ở −30° và 30° |
| `sim-spec-sheet-turn-sweep.mp4` | Kéo −30° → 30° → 0, simulator |

## Còn lại (một người chấm: mình)

- **Bóng có cạnh cứng.** Đó là chủ ý theo kiểu phẳng, nhưng ở thân thấy rõ một đường kẻ. Cần Kiệt xem có thích không.
- **Đồ mặc chưa có bóng, chưa theo thân.**
- **Chưa có góc 90° và sau lưng.**
- **NOT VERIFIED:**
  - Koa đi trong phòng;
  - hiệu năng iPhone thật. Mỗi khung thêm 2 vùng cắt khi đang quay.
