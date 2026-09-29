# Chính sách ghi khi mất mạng

Chủ dự án quyết ngày 27/09/2026 (#65): chọn cách **chia theo nhóm**, nhưng
viết thành **một chính sách có nguyên tắc thay vì một danh sách 48 trường hợp**,
để còn đứng vững khi app có 100+ thao tác ghi.

Trang này là nguồn duy nhất. Không ghi danh sách thao tác ở đây; mỗi thao tác
tự khai lớp của nó ngay trong code (xem "Thực thi").

## Bốn lớp

| Lớp | Khi mất mạng | Sống qua tắt app | Câu báo cho người dùng |
|---|---|---|---|
| **Ghi nhận** | xếp hàng, gửi khi có mạng | có | "Đã lưu trên máy, sẽ gửi khi có mạng" |
| **Trạng thái** | áp ngay trên màn, gửi giá trị cuối khi có mạng | không (trong phiên) | "Sẽ cập nhật khi có mạng lại" + dấu chờ nhỏ trên chính mục ấy |
| **Tức thời** | từ chối ngay | không có gì để mất | "Không có kết nối, chưa gửi" |
| **Mặc định** | = Tức thời | | |

## Xếp lớp: trả lời theo thứ tự, câu đầu tiên đúng thì dừng

1. **Tốn tiền hay tài nguyên có hạn** (xu, mua đồ, hạn mức AI), hoặc đụng tới
   tài khoản, bảo mật, đăng nhập? → **Tức thời.** Việc này cần server quyết
   đúng lúc bấm, và chạy muộn có thể thành mất tiền.
2. **Người khác nhìn thấy** (đăng bài, thích, bình luận, theo dõi, chặn)? →
   **Tức thời.** Hành động xã hội gắn với khoảnh khắc; phát lại muộn vài giờ
   là một hành động khác (#45).
3. **Xoá, hoặc sửa một thứ đã có trên server** bằng nội dung người dùng gõ
   (chữ, số)? → **Tức thời.** Kết quả phụ thuộc trạng thái server lúc chạy, và
   chạy muộn gây bất ngờ: xoá lúc 8 giờ, biến mất lúc 18 giờ.
4. **Ghi một sự thật MỚI về chính mình** (bữa ăn, buổi tập, nước, cân nặng,
   giấc ngủ), kèm thời điểm do chính thao tác mang theo? → **Ghi nhận.** Nó
   vẫn đúng dù gửi muộn bao lâu.
5. **Đặt một cờ hoặc một lựa chọn trong tập cố định về một GIÁ TRỊ TUYỆT ĐỐI**
   (tick món đi chợ, đã uống thực phẩm bổ sung hôm nay, bật/tắt lời nhắc, một
   tuỳ chọn), mà chỉ giá trị cuối cùng là quan trọng? → **Trạng thái.**
6. Không câu nào đúng → **Tức thời.** Mặc định luôn là an toàn.

Khi phân vân giữa hai lớp, chọn lớp **đứng trước** trong danh sách trên.

## Luật của lớp Trạng thái

Đây là lớp mới. Ba luật giữ cho nó đúng:

- **Giá trị tuyệt đối, không phải lệnh đảo.** Gửi "đặt = đã uống", không gửi
  "đảo trạng thái". Lệnh đảo phát lại hai lần là sai; giá trị tuyệt đối gửi
  mấy lần cũng ra một kết quả.
- **Gộp theo khoá, lấy ý cuối cùng.** Khoá là (thực thể, trường), ví dụ
  (món đi chợ #12, `checked`). Tick → bỏ tick → tick khi mất mạng chỉ để lại
  MỘT ý: "đã tick". Nếu ý cuối trùng giá trị server đang có thì không gửi gì.
  Luật này giải đúng cái bẫy mà `lib/offline-write.ts` ghi lại cho thực phẩm
  bổ sung: hàng đợi chỉ chứa lệnh "tick", nên tick rồi bỏ tick vẫn bị ghi là
  đã uống.
- **Một lượt gửi mỗi khoá, và phản hồi cũ không được ghi đè** (cùng cơ chế của
  #157). Gửi xong mà thực thể đã bị xoá ở nơi khác thì bỏ ý ấy và báo ngắn,
  không lặng im.

Lớp này chỉ sống **trong phiên**, đúng như chủ dự án đã chọn. Tắt app trước
khi có mạng thì ý chờ mất, và câu báo phải nói trước điều đó. Muốn nó sống qua
tắt app thì phải có quyết định mới: một cờ đặt từ vài ngày trước có thể đè lên
thay đổi mới hơn từ máy khác.

## Thực thi, để luật không chỉ nằm trên giấy

- **Mỗi thao tác ghi tự khai lớp** ngay nơi định nghĩa, ví dụ
  `offline: 'record' | 'state' | 'now'`. Lớp `'now'` kèm câu hỏi (1–3, 6) đã
  quyết nó.
- **Một bước cổng đỏ khi có thao tác chưa khai**, và đỏ khi một thao tác khai
  `'state'` mà không có khoá gộp hoặc không gửi giá trị tuyệt đối. Nhờ vậy
  thao tác thứ 101 cũng buộc phải trả lời sáu câu trên.
- Bước ấy tự thử ngược như mọi bước khác: một thao tác giả không khai lớp phải
  làm nó đỏ.
- `tools/write-heard.mjs` vẫn giữ luật cũ: thao tác nào báo được lỗi thì phải
  có người nghe.

## Đã thực thi (#161)

- Khai lớp: `meta: { offline: now(N) }` trên mọi `useOnlineMutation` (kiểu
  bắt buộc), `meta: { offline: RECORD }` trên mọi `useMutation` gọi thẳng —
  `src/lib/offline-class.ts`.
- Lớp Trạng thái: `src/lib/state-write-core.ts` (luật, không import gì) và
  `src/lib/state-write.ts` (mạng, đọc lại, câu báo). Đang dùng cho tick món đi
  chợ và tick thực phẩm bổ sung. Lời nhắc bật/tắt chỉ lưu trên máy, không có
  lệnh ghi server nào để xếp lớp.
- Bước cổng: `tools/offline-class.mjs`. Kịch bản live: hai kịch bản
  "Mất mạng, lớp Trạng thái" trong `tools/live.mjs`.

