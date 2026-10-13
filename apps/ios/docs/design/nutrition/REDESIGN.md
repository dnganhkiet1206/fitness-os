# Tab Dinh dưỡng: audit và thiết kế lại (B, 13/10/2026)

**Phạm vi:** chủ dự án yêu cầu "audit lại màn dinh dưỡng và thiết kế lại", cho phép làm đẹp hơn RN (RN chỉ là bản đối chiếu). Giữ mọi luật của RN: số calo / macro, mục tiêu, cách ghi, nước, thực phẩm bổ sung. Chỉ đổi bố cục và cách trình bày.

**Ảnh hiện trạng:** `apps/ios/docs/qa/nutrition-audit-2026-10-13/` (simulator iPhone 17 Pro, tài khoản của chủ dự án, ở `e7ea3f38`).

## Audit (hiện trạng ở `e7ea3f38`)

| # | Vấn đề | Mức |
|---|---|---|
| 1 | **Khoảng trống lớn giữa Dynamic Island và chữ "Dinh dưỡng".** Tab dùng large title của thanh điều hướng, nên có thêm một hàng thanh thu gọn trống ở trên. Tab Hôm nay dựng đầu trang riêng. Kết quả: hai tab đặt tiêu đề lệch nhau khoảng 60pt, nhìn như lỗi (chủ dự án báo). | Cao |
| 2 | **Thẻ calo khi chưa ăn:** vòng là một khối xám đặc. Ở giữa là "0 kcal" thật to. Bên phải nói cùng một điều ba lần: "Mục tiêu 2.508 / 0%", "Còn lại 2.508". Con số người dùng cần ("còn bao nhiêu") không phải số lớn nhất. | Cao |
| 3 | **Bốn ô macro 2×2** chiếm nửa màn hình. Chữ "đã ăn" lặp bốn lần. Đạm dùng biểu tượng dao nĩa (trùng với biểu tượng của tab). | Trung bình |
| 4 | **Ghi bữa nằm ở khối thứ ba**, dưới vòng calo và một thẻ "Xem xu hướng 7 ngày" đứng riêng. Đây là việc chính của tab mà phải cuộn mới thấy. | Cao |
| 5 | **"Bữa hôm nay" ở cuối trang**, dưới Nước và Thực phẩm bổ sung. Khi trống thì là một thẻ "nhấn để ghi", trùng với khối Ghi bữa ở trên. Không ghi thẳng được vào một bữa cụ thể (sáng / trưa / tối). | Cao |
| 6 | **Thẻ Nước to bằng thẻ calo:** số lớn, mục tiêu có số lẻ ("65.3 oz"), thanh tiến độ vô hình khi bằng 0, ba nút +8 / +12 / +16. Trên Today, nước đã là một chạm "+250 ml". | Trung bình |
| 7 | **Ba kiểu thẻ khác nhau** trên cùng một trang: thẻ kính, thẻ trắng, hàng lối tắt. Độ bo góc cũng khác nhau. | Thấp |
| 8 | **Phân đoạn "Kế hoạch ăn"** trộn ba thứ khác nhau (kế hoạch, đi chợ, thư viện thực phẩm có cả ô tìm và hai danh sách). Thẻ kế hoạch là thẻ trắng to cho một tên và một dòng. | Trung bình |
| 9 | **Thiếu quét mã vạch** (RN có). RN đặt nó trong ô tìm. | Trung bình |

## Thiết kế lại

**Thesis:** Dinh dưỡng trả lời hai câu: "hôm nay còn bao nhiêu" và "ghi bữa kế tiếp thật nhanh". Mọi thứ khác lùi xuống một bậc.

Ngôn ngữ chung với Hôm nay: nền giấy + `TodayAmbient(accent: .meal)`, thẻ `todayCard`, hàng kiểu "Your day" (vòng tròn màu 32pt + nhãn + dòng phụ + nút viên nang), Menlo chỉ cho số đo.

### Phân đoạn Hôm nay (trên → dưới)

1. **Đầu trang trong nội dung**, như Hôm nay: "Dinh dưỡng" (largeTitle bold) + ngày. Bên phải là viên "Ngày khác" (→ Nhật ký). Ẩn thanh điều hướng ở trang gốc; các màn con vẫn có thanh. *(Sửa #1.)*
2. **Phân đoạn** Hôm nay | Kế hoạch ăn (giữ).
3. **Thẻ ngân sách:**
   - **Trái:** vòng 104pt. Rãnh tô nhạt màu bữa (không xám); phần đã ăn tô màu bữa; vượt mục tiêu thì phần dư tô màu cảnh báo. Ở giữa là **số kcal còn lại** (Menlo) + "kcal còn lại"; vượt thì "+N" + "vượt mục tiêu".
   - **Phải:** ba thanh mảnh Đạm / Tinh bột / Béo (nhãn, `ăn/mục tiêu g` bằng Menlo, thanh 5pt màu riêng). Dưới ba thanh là một dòng nhỏ Chất xơ.
   - **Chân thẻ:** "Đã ăn N · mục tiêu M" bên trái, "7 ngày ›" bên phải (→ Xu hướng; bỏ thẻ "Xem xu hướng" đứng riêng). Nút "?" giải thích giữ ở góc.
   - *(Sửa #2, #3.)*
4. **Ô ghi bữa:** một viên nang như ô tìm, viền màu bữa: kính lúp + "Bạn vừa ăn gì?" (→ màn ghi bữa, con trỏ trong ô tìm). Bên phải có nút **mã vạch** (→ máy quét; chỉ hiện khi máy có camera) và nút **bút** (→ nhập tay). Đúng chỗ RN đặt máy quét: "quét là một cách tìm". *(Sửa #4, #9.)*
5. **Bữa hôm nay:** một thẻ danh sách, mỗi khung bữa một hàng: Sáng / Trưa / Tối / Ăn vặt, cộng Trước tập / Sau tập khi có.
   - Khung đã ghi: vòng màu bữa, tên khung, dòng phụ là tên món, số kcal bằng Menlo. Chạm vào thì mở ra chi tiết món (sửa khẩu phần, xoá, thêm vào bữa này như trước).
   - Khung trống: vòng xám, "Chưa ghi", nút viên nang "Ghi" mở màn ghi **đúng khung đó**.
   - *(Sửa #5.)*
6. **Trong ngày:** thẻ danh sách hai hàng.
   - Nước: "0,75 / 1,9 L", nút "+250 ml" (hoặc "+8 oz") ghi ngay; chạm cả hàng → màn Nước, nơi giữ các mức thêm nhanh.
   - Thực phẩm bổ sung: "1/3 hôm nay" ›.
   - *(Sửa #6, #7.)*

### Phân đoạn Kế hoạch ăn

1. **Kế hoạch ăn** (tiêu đề + "Xem tất cả" khi > 3): thẻ danh sách, mỗi kế hoạch một hàng (tên, mục tiêu · bữa/ngày, bảy chấm ngày có món), cuối có hàng "+ Tạo kế hoạch ăn".
2. **Thẻ danh sách lối tắt:**
   - "Danh sách đi chợ" (còn N món) ›;
   - "Thực phẩm của tôi" (N món) › → màn Thực phẩm, nơi giữ ô tìm, Của tôi / Gần đây và nút thêm.

   *(Sửa #8. Khác RN, vì RN đặt cả thư viện ngay trong tab.)*

### Không đổi

Số liệu, luật làm tròn, mục tiêu, outbox, cách ghi, màn con (Ghi bữa, Nhật ký, Nước, Thực phẩm bổ sung, Xu hướng, Kế hoạch, Đi chợ, Thực phẩm).

## Trạng thái (13/10, B)

Đã làm (phân đoạn Hôm nay + Kế hoạch ăn như trên), kèm:
- `statusBarScrim` (Today + Dinh dưỡng): dải **nhoè thuần** ở vùng thanh trạng thái (chủ dự án: thử kính trong thì hiện lớp trắng — "phải blur, không phải kính");
- bỏ dòng thứ / ngày dưới tiêu đề (cả Hôm nay); Hôm nay trở lại logo ASCND như RN;
- nền giấy cho mọi màn con của Dinh dưỡng (Ghi bữa, Thực phẩm, Kế hoạch, Nước) và các màn ghi của Cơ thể;
- cỡ chữ trợ năng: vòng trên / macro dưới, giá trị macro xuống dòng, "Ngày khác" chỉ biểu tượng, chữ trong vòng giới hạn ở xLarge.

Ảnh trước / sau: `apps/ios/docs/qa/nutrition-audit-2026-10-13/` (`before-*`, `after-*`). Chưa làm: máy quét mã vạch (lát kế tiếp — nút trong ô ghi bữa sẽ hiện khi có màn quét).

Đã sửa (13/10): Hôm nay và Dinh dưỡng cùng đơn vị nước đã chọn (trước: Hôm nay luôn ml).

## Wizard kế hoạch ăn (13/10, chủ dự án duyệt mock + "chọn thêm bữa")

`PlanWizardView` thay `CreatePlanSheet` ở Kế hoạch ăn (xem NATIVE_IMPROVEMENTS). Ảnh: `docs/qa/nutrition-audit-2026-10-13/wizard-*.jpg`.

