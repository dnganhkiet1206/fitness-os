# Cộng đồng ASCND: nguồn để bám theo và quyết định của chủ dự án

Đọc trang này trước mọi việc Cộng đồng. Nó chỉ trỏ tới nguồn và ghi những gì
chủ dự án đã quyết; không thay thế nguồn.

## Nguồn

| Nguồn | Tệp | Vai trò |
|---|---|---|
| Concept sản phẩm | [`ASCND_Community_Product_Concept.md`](ASCND_Community_Product_Concept.md) | Bản chữ: làm gì, vì sao, MVP là gì (§22) |
| Mockup 4 màn | [`ASCND_Community_Mockup.jpg`](ASCND_Community_Mockup.jpg) | Bản hình: bố cục, thứ bậc, cảm giác |

Cả hai do chủ dự án gửi ngày 27/09/2026 và được lưu nguyên văn. Khi hai nguồn
vênh nhau, hỏi chủ dự án; đừng tự chọn.

## Quyết định của chủ dự án (27/09/2026)

Nguyên văn:

> uh lưu luôn ảnh và file concept để bám vào đó mà làm cho xong, nhớ là ui ux
> và animation là một thứ mà tôi rất quan trọng, animation nên học hỏi từ apple
> và x , luôn cho phép 2 bạn search để kiếm thông in. Cho phép người dùng tải
> ảnh lên, tất các các chỗ cần icon biểu thỉ thì phải vẽ vào học theo các app
> lớn,

Nghĩa là:

1. **UI/UX và animation là ưu tiên hàng đầu.** Animation học từ **Apple (iOS)**
   và **X**: chuyển động có vật lý (spring), phản hồi ngay dưới ngón tay, liền
   mạch giữa các màn, và có haptic ở đúng chỗ. Tôn trọng Reduce Motion.
   `.claude/skills/impeccable/` (xem `native/AGENTS.md`) vẫn áp dụng, và một
   phép đo vẫn thắng một lời khuyên chung.
2. **A và B luôn được phép tìm kiếm** để đối chiếu, ví dụ Apple HIG, tài liệu
   Expo, Reanimated, hay cách các app lớn làm một tương tác.
3. ~~Cho phép người dùng tải ảnh lên.~~ **Đổi ngày 27/09 (#163, thay #158):** người dùng
   **không** tải ảnh lên. Nguyên văn:

   > tôi muốn người dùng không phải được phép đăng ảnh nhưng mọi bài đăng sẽ có hình ảnh khi
   > người dùng bấm tuỳ chọn được chia sẻ buổi tập, công thức nấu ăn, hay tiến trình v.v thì sẽ
   > có ảnh được app cấp sẵn, người dùng có thể tuỳ chọn style, mục đích là để app có được thiết
   > kế chuẩn, sạch đẹp như concept, sau này mở rộng rồi cho phép đăng hình sau, vì budget chưa
   > đủ, chỉ có admin với có quyền đăng ảnh

   Nghĩa là:
   - Mọi bài có ảnh lấy từ **thư viện ảnh do app cấp sẵn**.
   - Người dùng chỉ **chọn phong cách**.
   - **Chỉ admin** thêm ảnh vào thư viện.
   - Avatar vẫn là linh vật.
   - Ô ảnh cơ thể "trước/sau" trong mockup đổi thành ảnh app cấp cộng số liệu thật.
   - Cho người dùng đăng ảnh là việc của sau này, khi có ngân sách kiểm duyệt.
4. **Mọi chỗ cần icon thì phải có icon, vẽ theo các app lớn.** Không để một
   hành động chỉ có chữ khi app lớn dùng icon, không dùng emoji thay icon.
   Icon vẽ bằng vector, cùng một nét, cùng một bộ.
5. **Quảng cáo** (thẻ "Được tài trợ" trong mockup): concept cho phép (§16)
   nhưng không thuộc MVP (§22) và phải đến sau engagement. Chưa làm.
6. **Tên và số liệu trong mockup chỉ để minh hoạ.** Mọi thẻ dựng từ dữ liệu
   thật của người đăng; không người dùng giả.

## Ràng buộc đứng khi đụng Storage (thư viện ảnh của app, và ảnh người dùng về sau)

Chủ dự án đã đặt các ràng buộc này và chúng vẫn còn hiệu lực:

- Không grant ownership hoặc elevated privileges cho `storage.buckets`
  (hay bất kỳ bảng hệ thống nào của Supabase).
- Không reset database.
- Không xoá migration.
- Không sửa migration history bằng tay, và không mark migration as applied nếu
  migration chưa thực sự hoàn thành.
- Không thực hiện destructive operation.

Mẫu đã chạy được trên production thì đi theo:

- tạo bucket bằng `INSERT INTO storage.buckets … ON CONFLICT (id) DO NOTHING`;
- chỉ `UPDATE` đúng hàng của bucket mình, không `COMMENT ON` / `ALTER` bảng
  hệ thống.

Xem `supabase/migrations/20260924120000_exercise_media_bucket.sql` và chú thích
cuối `20260812120000_progress_photos_limits.sql` (vì sao `storage.buckets` không
phải của mình). Ảnh cơ thể đi theo mẫu `progress-photos`: bucket riêng tư, URL
ký, khoá theo thư mục của chính người dùng.

## Thứ tự việc

1. **#157** (khẩn): race condition trong điều hướng và tải dữ liệu.
2. Cộng đồng theo concept và mockup. Bảng phối hợp: **#6**. Danh sách phần còn
   thiếu so với concept nằm trong bình luận của A trên #6 ngày 27/09.
