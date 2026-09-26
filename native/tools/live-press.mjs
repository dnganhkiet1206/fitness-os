/**
 * Nhãn của một nút PHÁ HUỶ — xoá, rời, chặn, bỏ theo dõi, đăng xuất (#91, #107).
 *
 * Lượt "bấm thử từng nút" của `live.mjs` đòi mỗi nút như thế HỎI LẠI trước khi
 * ghi: bấm xong không có hộp nào mà có lệnh ghi đi ra thì đỏ, "bấm là LÀM LUÔN".
 *
 * ── vì sao không phải `\b` ──
 *
 * Bản #91 kết thúc mẫu bằng `\b`. Không có cờ `u`, `\b` là ranh giới ASCII: "á"
 * không phải `\w`, nên sau "Xoá" không bao giờ có ranh giới, và mẫu KHÔNG khớp
 * "Xoá tài khoản". "Xóa" hay "Rời" khớp được chỉ vì chữ cuối của chúng là ASCII.
 * Đo trên từ điển chữ app (#94): 76 chuỗi mở đầu bằng một động từ phá huỷ; mẫu
 * cũ khớp 43, bỏ sót đủ 33 chuỗi "Xoá…". Lượt bấm chạy tiếng Anh nên chưa sai
 * gì, nhưng nhánh tiếng Việt của mẫu chưa từng chạy. Từ #107 nó chạy thật.
 *
 * `(?=\s|$)`: sau động từ là khoảng trắng hay hết chuỗi. "Deleted items",
 * "Removed" không khớp. Chỉ còn "Xoá": từ #105 app đặt dấu kiểu cũ (bước cổng
 * "kiểu bỏ dấu"), nên "Xóa" không còn là chữ app hiện ra.
 */
export const DESTRUCTIVE = /^(Xoá|Rời|Chặn|Bỏ chặn|Bỏ theo dõi|Đăng xuất|Delete|Remove|Leave|Block|Unblock|Unfollow|Sign out)(?=\s|$)/i;
