# `v10-shoulder/`: khe tối ở vai khi tay giơ (06/11/2026)

**Kiệt khoanh** (trên ảnh v9): một mũi tối mảnh giữa mép trên cánh tay trái và cằm.

**Vì sao:** cánh tay đã lật để bàn tay đúng chiều, nhưng ở gốc vai mép trên của nó vẫn nằm thấp hơn cằm, nên lộ nền giữa hai mép.

**Sửa:**
- **Nhấc tay:** khi tay giơ, nhấc cả cánh tay lên tối đa 6 đơn vị (`KoaRender.shoulderTuck`, đủ ở 45°), để gốc vai giấu dưới cằm. Tay vốn vẽ sau đầu.
- **Lấp khe:** bật mảng vai / gáy có sẵn (`KoaGesture.neckFill`) cả khi tay giơ, không chỉ khi đầu nghiêng.
- **Không vẽ thêm hình mới.** Chỉ áp cho dáng có `flipRaisedArms` (cảnh phản ứng). Chạy kéo thẻ và đi trong phòng không đổi.

| Tệp | Là gì |
|---|---|
| `shoulder-before-after.jpg` | Phóng 2×: vai trái trước, vai trái sau, vai phải sau |
| `after-full.jpg` | Cuối cảnh xong buổi, toàn thân |
| `koa-reaction-*.mp4` | Ba cảnh, có tiếng |
