# ASCND Product Decision · V1

Kiệt chốt ngày 21/10/2026 (#527), dựa trên `docs/design/ascnd-product-map.html`.
Đây là quyết định sản phẩm. Nó **chưa** có nghĩa là code đã đổi hay các luồng đã qua kiểm thử trên máy thật.

## Hướng đã chọn: A, app tập luyện có Koa

ASCND được định vị là một hệ thống huấn luyện cá nhân thích nghi, không phải "app gym có linh vật". App giúp người dùng:
- duy trì lịch tập;
- điều chỉnh kế hoạch khi cuộc sống thay đổi;
- nhìn thấy tiến bộ của mình qua Koa.

Lời hứa sản phẩm phải kiểm chứng được:
> "Koa hiểu lịch tập của tôi, biết tôi đã tiến bộ thế nào và giúp tôi tiếp tục ngay cả khi lịch sống bị đảo lộn."

Ba mức đầu tư:
- **Giữ và đầu tư sâu:** lịch tuần, buổi tập, Daily Plan, Koa, Gains, ghi nhận hoạt động và tiến bộ thực tế.
- **Thu gọn:** dinh dưỡng, chỉ số cơ thể, nhiệm vụ, huy chương, công cụ phân tích và các màn phụ.
- **Hoãn đầu tư lớn:** mạng xã hội, nhắn tin, thử thách cộng đồng, và các tính năng AI chưa xác nhận chạy đầu cuối.

Vì sao không chọn hai hướng còn lại:
- **Không chọn B:** giữ mọi thứ sẽ tiếp tục tăng độ phức tạp, và cần quá nhiều tính năng chạy hoàn hảo cùng lúc mới cho ra trải nghiệm tốt.
- **Không chọn C:** mạng xã hội cần người dùng và nội dung thật. Khi chưa có người dùng, dồn sức vào bảng tin không giải quyết được giá trị cốt lõi.

## Các quyết định

### 1. Một thang tiến bộ hiển thị: Gains

- **Gains** là tiến bộ chính, hiển thị nhất quán ở hồ sơ, hành trình Koa và tổng kết. Công thức phải minh bạch, và không để người dùng hiểu Gains là phép đo cơ bắp thật.
- **Xu** là tiền trong game, dùng để mua đồ và tuỳ chỉnh Koa. Xu không phải thang tiến bộ thứ hai.
- **Huy chương** là cột mốc, không phải một hệ cấp bậc khác.
- **XP:** bỏ khỏi giao diện. Có thể giữ XP chạy nội bộ trong giai đoạn chuyển đổi, nhưng phải kiểm tra phụ thuộc trước khi xoá cơ chế.
- **Đồng nhất cấp bậc:** cửa hàng, onboarding, Koa và hồ sơ dùng chung một hệ cấp bậc hiển thị.
- **Không mất dữ liệu:** cần migration và kiểm thử để không mất xu, đồ đã mở khoá hay tiến bộ hiện có.

### 2. Gộp thử thách, không biến mọi hoạt động thành nhiệm vụ

- **Nhiệm vụ ngày:** giữ nguyên.
- **"Tuần của Koa":** thay 8 mẫu thử thách tuần chung. Mục tiêu tạo theo lịch và khả năng từng người, ví dụ người mới chỉ cần hai buổi.
- **Không ép cùng khối lượng:** mọi cấp độ không phải đạt cùng một khối lượng tập.
- **Ngày nghỉ đã lên lịch** không tính là thất bại.
- **Lỡ một buổi** không làm mất toàn bộ tiến bộ.
- **Thử thách cộng đồng:** ẩn cho tới khi đủ người tham gia.

### 3. Koa không trừng phạt việc nghỉ

- **Bỏ tụt hạng do vắng mặt.** Thành tích đã kiếm không bị xoá vì người dùng bận, ốm hay cần hồi phục.
- **Trạng thái của Koa:** vẫn có nghỉ, tập luyện, quay lại.
- **Khi quay lại:** app đề xuất bước tiếp theo hợp với lịch sử và trạng thái hiện tại.

### 4. Dinh dưỡng hỗ trợ tập luyện, không phải sản phẩm thứ hai

Ưu tiên cho phiên bản đầu:
1. Ghi bữa thật nhanh.
2. Theo dõi calo và protein dễ hiểu.
3. Theo dõi nước ở mức đơn giản.
4. Điều chỉnh mục tiêu khi đủ dữ liệu và người dùng đồng ý.

Phần chuyển xuống khu vực phụ: kế hoạch ăn chi tiết, danh sách đi chợ, thư viện món nâng cao, checklist thực phẩm bổ sung. Không xoá dữ liệu hay chức năng.

TDEE và mục tiêu calo thích ứng: nối vào dinh dưỡng, nhưng không tự đổi mục tiêu chỉ từ vài lần cân hay bản ghi thiếu. App phải giải thích sự thay đổi, và người dùng phải chấp nhận trước.

### 5. Chưa lấy mạng xã hội làm trọng tâm

- **Chia sẻ:** giữ chia sẻ buổi tập và thành tích.
- **Nhắn tin riêng:** ngừng đầu tư.
- **Thử thách cộng đồng:** ẩn ở phiên bản đầu.
- **Bảng tin trống:** không để nó là trải nghiệm mặc định.
- **Tên tab:** chưa đổi thành "Bạn tập" khi tính năng bạn bè chưa đủ thực chất.

**Hướng đích điều hướng:** bốn khu vực Today · Train · Fuel · Progress. Coach của Koa xuất hiện theo ngữ cảnh; cộng đồng và chia sẻ nằm ở khu vực phụ. Đây là đích, không phải việc làm ngay trong lúc các việc parity native còn mở.

## Kiến trúc: Daily Plan Engine theo quy tắc

Không xây một hệ AI lớn chỉ để thay các thẻ trên Today. Thay vào đó là một engine có quy tắc rõ ràng:
- **Đầu vào:** lịch tuần, buổi tập, nhật ký, trạng thái phục hồi (nếu có).
- **Engine làm ba việc:** chọn hành động, giải thích lý do, đề xuất phương án thay thế.
- **Đầu ra theo khu vực:**
  - Today: một việc quan trọng nhất.
  - Train: buổi tập phù hợp.
  - Fuel: ghi ăn và dinh dưỡng.
  - Progress: tiến bộ và tổng kết.

Quy tắc dùng AI:
- AI chỉ dùng khi tạo thêm giá trị: diễn giải câu nói thành bản ghi, trả lời dựa trên lịch sử thật, giải thích kế hoạch.
- Khi AI không chạy, các luồng chính (bắt đầu buổi tập, ghi bữa, xem lịch, ghi nước) vẫn phải chạy bình thường.

**Quy tắc bắt buộc:** thiếu dữ liệu thì nói rõ là chưa đủ thông tin. Không bịa trạng thái phục hồi, mục tiêu calo hay lời khuyên cá nhân. Readiness không tự cắt tải hay đổi kế hoạch khi logic chưa được kiểm chứng; người dùng luôn được chấp nhận hoặc từ chối đề xuất.

## Lộ trình

**Giai đoạn 0 — Xác minh nền tảng phát hành (chặn trước khi đo):**
- Xác nhận các hàm AI đã deploy có chạy thật không.
- Kiểm thử luồng cốt lõi trên iPhone thật.
- Hoàn tất parity, accessibility, CI và production wiring theo #527.
- Chuẩn bị Apple Developer và TestFlight.

**Giai đoạn 1 — Đơn giản hoá vòng lặp chính (ưu tiên cao nhất trong code):**
- Xây và kiểm thử Daily Plan Engine.
- Thu gọn Today: một hành động chính, một khối ghi nhanh, phần phụ.
- Today và Train dùng chung trạng thái buổi tập.
- Đưa ghi bữa về một luồng thống nhất.

**Giai đoạn 2 — Hợp nhất tiến bộ:**
- Gộp cấp hiển thị vào Gains.
- Khoá đồ trong cửa hàng theo cùng hệ cấp bậc.
- Bỏ tụt hạng do nghỉ.
- Thay thử thách chung bằng Tuần của Koa cá nhân hoá.
- Nối tổng kết tuần với lịch tập và thành tích thật.

**Giai đoạn 3 — Thu gọn tính năng vệ tinh:**
- Đưa kế hoạch ăn nâng cao và thực phẩm bổ sung xuống khu vực phụ.
- Ẩn chức năng cộng đồng còn thiếu dữ liệu hoặc backend.
- Chuyển về bốn khu vực điều hướng.
- Đồng bộ tài liệu thiết kế với code, cập nhật PARITY_MATRIX.

**Giai đoạn 4 — Thử nghiệm với người dùng, quyết định bằng dữ liệu:**
- Đo: thời gian tới hành động đầu tiên, tỉ lệ hoàn thành onboarding, tỉ lệ hoàn thành buổi tập theo kế hoạch, giữ chân D7 / D28, khả năng quay lại sau khi lỡ lịch.
- Chỉ mở rộng AI, cộng đồng và cá nhân hoá nâng cao khi các chỉ số này cho thấy vòng lõi có giá trị.

## Không làm trong đợt này

- Không thêm hệ XP, năng lượng hay chuỗi mới.
- Không xây lại workout engine chỉ để thay giao diện Today.
- Không để việc tập hay ghi dữ liệu phụ thuộc vào AI.
- Không bắt buộc Apple Health.
- Không mở rộng Community/DM trước khi có nhu cầu và backend đáng tin.
- Không dùng số lần mở app hay chuỗi ngày làm chỉ số giữ chân duy nhất.
- Không xoá hàng loạt tính năng chỉ vì chưa nối vào Koa. Trước khi bỏ hẳn: ưu tiên ẩn, giảm độ nổi bật, hoặc đo mức dùng.

## Điều kiện thành công

| Mục tiêu | Bằng chứng |
|---|---|
| Dễ dùng hơn | Ít bước hơn để bắt đầu buổi tập và ghi bữa; ít người bỏ dở onboarding |
| Kế hoạch hữu ích | Người dùng hoàn thành, hoặc chủ động chọn phương án thay thế thay vì bỏ qua |
| Koa tạo khác biệt | Người dùng thấy tổng kết tiến bộ hữu ích và kế hoạch tuần mới hợp hơn |
| Giữ chân lành mạnh | D7 / D28 và tỉ lệ quay lại sau gián đoạn cải thiện |
| Ít phức tạp hơn | Người dùng hiểu Gains, xu, huy chương mà không cần giải thích nhiều |

Mục tiêu bằng số chỉ chốt sau khi có baseline từ nhóm TestFlight đầu tiên.

## Ba nguyên tắc

1. **Một kế hoạch thống nhất:** app biết việc quan trọng nhất hôm nay và lý do đề xuất.
2. **Một thang tiến bộ dễ hiểu:** Gains là tiến bộ, xu để tuỳ chỉnh, huy chương đánh dấu thành tích.
3. **Một người đồng hành không trừng phạt:** Koa lớn lên cùng hành trình thật và giúp người dùng quay lại khi cuộc sống thay đổi.

**Thứ tự ưu tiên:** xác minh nền tảng phát hành → đơn giản hoá Today và luồng hành động → hợp nhất tiến bộ / Koa → thử nghiệm với người dùng → mới mở rộng tính năng.
