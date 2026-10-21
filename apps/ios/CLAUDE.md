# App iOS native (ASCND): đọc trước khi làm

Đọc theo thứ tự, trước khi sửa bất cứ thứ gì trong `apps/ios`:

1. **`docs/CONSTRAINTS_AND_DEFERRED.md`**: hạn chế, việc hoãn, vấn đề đầu tư và người dùng thật. **Bắt buộc, không được bỏ qua.**
2. **`docs/PRODUCT_DECISION_V1.md`**: hướng sản phẩm đã chốt (21/10/2026).
3. **`docs/AGENT_SESSION.md`**: quy trình làm việc (nhánh, PR, CI, báo cáo #527).

Ba điều không được quên:
- **App chưa phát hành được** (thiếu đầu tư, 0 người dùng thật). Giai đoạn này tập trung cải thiện sản phẩm để khi phát hành thì ít phải sửa. Chưa phát hành không phải lý do để đứng chờ.
- **Việc trong mục "Hoãn phát triển" thì không làm** khi chưa đủ điều kiện ghi ở đó, kể cả khi thấy dễ.
- **Chạm vào một hạn chế hay việc hoãn thì cập nhật sổ** trong cùng PR và báo lên #527. Không xoá dòng; gạch ngang, ghi ngày và bằng chứng.
