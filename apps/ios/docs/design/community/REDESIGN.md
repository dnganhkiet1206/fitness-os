# Cộng đồng — thiết kế lại (14/10, chủ dự án chọn mock v2)

Ba mock: v1 (thẻ trắng có dải màu) — "chưa đủ nổi bật"; v2 (mặt màu đặc, số lớn) — **chọn**; v3 (tối giản) — không chọn.

## Trước
Tiêu đề lớn + cụm nút của thanh điều hướng (khác Hôm nay / Tập luyện); bài không ảnh vẫn chừa khung xám 16:9 chỉ có biểu tượng tạ; ba loại bài trông như nhau; ô soạn bài chỉ nói "Chia sẻ một buổi tập…" rồi hỏi bằng hộp thoại.

## Sau
- **Đầu trang trong nội dung**: "Cộng đồng" lớn + nút tròn tìm / chuông (chấm đỏ khi có mới, gồm thử thách chờ nhận) / hồ sơ — như Tập luyện. Nền `TodayAmbient`.
- **Đang tập hôm nay** (`CommunityToday.faces`, test `todayFacesAreTodaysPostersNewestFirst`): người đăng bài trong ngày địa phương, mới nhất trước, mỗi người một lần, trừ mình; vòng màu theo loại bài mới nhất; chạm mở hồ sơ. Chỉ từ bài đang có trong feed — không có ai thì ẩn.
- **Ba nút chia sẻ màu đặc** (Buổi tập / Tiến bộ / Món) mở thẳng màn chia sẻ — bỏ hộp thoại hỏi.
- **Thẻ thử thách** mặt tối cố định, vòng tiến độ lớn (x/y; chưa tham gia thì cúp), "còn N ngày · N người", hành động (Tham gia / Nhận xu) là viên trắng.
- **Thẻ bài** (dùng chung feed, chi tiết, tìm kiếm, đã lưu, hồ sơ, xem trước khi đăng): mặt trên ĐẶC MÀU theo loại — buổi tập `metricRose`, tiến bộ `metricSteel`, công thức `metricOrange` (bản light cố định `DSColor.solid`, chữ trắng đọc được ở cả hai chế độ); nhãn loại chữ hoa, tiêu đề lớn, số Menlo lớn (kg nâng · phút · bài / kcal · đạm · tinh bột · béo / độ chênh + đường nhỏ), dòng dữ liệu trên mặt lõm trắng mờ, "Kỷ lục" viên vàng, "Thử buổi này" viên trắng; không ảnh thì không có khung ảnh. Đáy thẻ: dải sáng thích / bình luận / lưu / chia sẻ (giữ nguyên hành vi).

Không đổi dữ liệu, RPC hay luật đăng / khoá đăng / lời mời tạo hồ sơ.

## Lượt cải thiện 1–4 (14/10)
1. **Hữu ích tuần này**: hàng thẻ màu trượt ngang (màu theo loại như thẻ bài) — loại, tiêu đề, lý do ("12 người đã thử"), @tác giả.
2. **Thêm vào bữa** (bài công thức; RN chưa có): viên trắng trên thẻ → Ghi bữa mở với MỘT món tự nhập = số của bài (`CommunityCard.mealFood`, test `CommunityRecipeMealTests`); `LogMealView(prefill:)`. Người dùng chọn bữa / sửa trước khi lưu — không tự ghi.
3. **Đang theo dõi trống**: gợi ý 5 người (`community_follow_suggestions`, cùng nguồn màn tìm), Theo dõi tại chỗ; đã theo dõi ai thì "Xem bảng tin".
4. **Thả tim**: tim nảy + đổi biểu tượng + số chạy + rung nhẹ khi bật.
