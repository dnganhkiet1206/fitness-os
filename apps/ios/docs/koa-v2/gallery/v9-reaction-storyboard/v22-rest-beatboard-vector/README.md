# `v22-rest-beatboard-vector/`: beat board màn nghỉ bằng Koa vector của app (07/11/2026)

**Kiệt** (về v21): "sao nhìn koa cứ kì kì vậy".

**Vì sao kỳ:** v19–v21 dùng mẫu 3D thổi phồng từ đường viền. Khối bị phồng méo, tỉ lệ đầu và thân lệch, mặt dán lên mặt cong, có nét viền xám. Đó không phải Koa của Kiệt. Lần đầu (cảnh phản ứng v1) Kiệt cũng chê đúng điều này.

**Sửa:** vẽ bằng chính `KoaFigureView` của app (nét vẽ gốc, mặt, đồ cầm tay) trên nền studio tối giản. Giữ 5 nhịp của v21:

| # | Nhịp | Koa |
|---|---|---|
| 01 | Set xong | Đứng, hạ tạ, mặt "phồng má" |
| 02 | Nghỉ | Ngồi, cầm bình nước, cười tít "ahh…" |
| 03 | Gag | Ngồi, buồn ngủ, mắt lim dim |
| 04 | Bước ngoặt | Thẻ cam "+2,5 kg so với lần trước" hiện ra, Koa ngạc nhiên nhìn lên |
| 05 | Vào set | Đứng, giơ tạ, cười "Lượt mình!" |

Xem lại trên simulator: `SIMCTL_CHILD_ASCND_DEBUG_KOA_BEAT=1…5`.

**Giới hạn của Koa vector hiện có:**
- chỉ có các tư thế đã vẽ (đứng, ngồi, cầm tạ…) và tay một mảnh quay quanh vai;
- động tác như tu nước lên miệng hay nằm vật ra cần Kiệt vẽ thêm dáng.

Vì vậy beat board này giữ story trong phạm vi các dáng đã có.
