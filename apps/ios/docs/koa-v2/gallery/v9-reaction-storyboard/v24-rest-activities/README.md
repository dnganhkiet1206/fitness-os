# `v24-rest-activities/`: màn nghỉ có nhiều hoạt động (07/11/2026)

**Kiệt:** "thêm nhiều hoạt động hơn để đỡ nhàm chán" (trên bản v23 làm theo kiểu cảnh xong buổi).

**Đổi:** giữ nguyên kiểu cảnh xong buổi. Giữa "XONG SET!" và "LƯỢT MÌNH!", Koa thở đều khoảng 4,5 s rồi diễn một hoạt động, xen nhau tới hết quãng nghỉ:

| Hoạt động | Koa | Mặt |
|---|---|---|
| Vươn vai | Giơ tay chữ V, nhón chân | buồn ngủ → vui |
| Giãn hông | Một tay vươn qua đầu, nghiêng người, đổi bên | tập trung |
| Xoay vai | Hai tay lắc lên xuống so le, nhún theo | nhắm mắt thả lỏng |
| Chạy bước nhỏ | Nhún nhanh tại chỗ, tay đánh so le | hăng hái |
| Hít sâu | Phồng người, ngẩng lên, rồi thở phù xẹp xuống | nhắm mắt → phồng má |
| Vẫy tay | Quay sang người xem, vẫy | cười tít |
| Gồng khoe cơ | Hai tay gồng, run nhẹ | tự hào |
| Liếc đồng hồ | Mắt liếc xuống trước, đầu theo sau, ngẩng lên gật gù | suy nghĩ → vui |

- **Mỗi lần nghỉ một khác:** thứ tự bắt đầu từ một hoạt động khác.
- **Hoạt động không chồng lên đếm ngược;** tạm dừng thì chỉ thở.
- **Mọi hoạt động** bắt đầu và kết thúc ở dáng đứng thường, nên nối liền với lúc thở (có test).
- **Lịch nằm ở lõi:** `KoaPerformance.restBeat`, có test.

| Tệp | Là gì |
|---|---|
| `rest-90s.mp4` | Quãng nghỉ 90 s, có tiếng; thứ tự cố định bằng `seed` 0 |
| `every-3s.jpg` | Khung mỗi 3 giây |

Xem trên simulator: `SIMCTL_CHILD_ASCND_DEBUG_KOA_REST=90`, thêm `…_SEED=<n>` để cố định thứ tự.
