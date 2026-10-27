# Hạn chế, việc hoãn và điều kiện phát hành — BẮT BUỘC ĐỌC

Kiệt yêu cầu ngày 21/10/2026 (#527): những hạn chế và những việc hoãn phát triển phải được ghi lại để người sau đọc, và **không được phép quên**.

**Cách dùng sổ này:**
- Đọc hết trước khi nhận việc. Sổ đi cùng `PRODUCT_DECISION_V1.md`.
- Mỗi PR chạm vào một mục ở đây thì **sửa sổ ngay trong PR đó**.
- Gỡ một mục: **không xoá dòng**. Gạch ngang (`~~…~~`), ghi ngày, ghi bằng chứng (PR, ảnh, link Sentry).
- Thêm hạn chế hay việc hoãn mới: ghi vào đây **và** báo lên #527.

---

## 0. Trạng thái phát hành: CHƯA PHÁT HÀNH ĐƯỢC

App **chưa thể publish**, vì vài vấn đề thiết yếu chưa giải quyết được (mục 1 và 2).

Chỉ đạo của Kiệt (21/10): giai đoạn này **tập trung cải thiện sản phẩm**, để khi phát hành thì **đỡ phải sửa nhiều**.

Hệ quả cho người làm:
1. **Chưa phát hành không phải lý do để đứng chờ.** Làm tiếp các giai đoạn GĐ1–GĐ3 của `PRODUCT_DECISION_V1.md`: Daily Plan, Today gọn, hợp nhất tiến bộ, thu gọn vệ tinh. Phần GĐ0 làm được thì làm ngay; phần bị chặn (mục 1) thì ghi lại và đi tiếp.
2. **Làm như sắp phát hành.** Ưu tiên những gì nếu để tới sau phát hành sẽ đắt để sửa:
   - mô hình dữ liệu và migration (Gains / XP / cửa hàng);
   - đường ghi dữ liệu và chạy khi mất mạng;
   - xoá tài khoản và quyền riêng tư;
   - accessibility, trạng thái rỗng / lỗi;
   - tính nhất quán số liệu và đơn vị giữa các màn.
3. **Không tối ưu theo số liệu chưa có.** Không đặt mục tiêu giữ chân bằng số. Không nói "tăng retention X%". Mọi nhận định về giữ chân hiện chỉ là thiết kế, chưa được đo.
4. **Không xây thứ chỉ có giá trị khi đã có người dùng**: bảng tin, nhắn tin, bảng xếp hạng, thử thách cộng đồng (mục 3).

---

## 1. Vấn đề đầu tư (chặn bởi chi phí / tài khoản)

| Hạng mục | Chặn gì | Hiện trạng | Ai gỡ |
|---|---|---|---|
| **Apple Developer Program ($99/năm)** | TestFlight, App Store, Sign in with Apple, push thật (APNs), archive bản phát hành | Chưa đăng ký | Kiệt |
| **Khoá AI trả phí** (Gemini; `ASCND_AI_KEY`, `ASCND_AI_MODEL`) | AI ổn định khi có nhiều người dùng. Gói miễn phí giới hạn lượt và hay 503 (`TESTFLIGHT-CHECKLIST.md`) | Đang dùng gói miễn phí. Ngày 21/10 cả 4 hàm thử đều chạy | Kiệt |
| **iPhone thật để kiểm** | Camera (mã vạch, ảnh món), Apple Health thật, push, Live Activity khi khoá màn hình | Chưa kiểm. Danh sách ở `GD0-DEVICE-CHECKLIST.md` | Kiệt (máy), agent (kịch bản) |
| **Token Sentry** (dSYM) | Đọc được stack của các lỗi treo APPLE-IOS-4/5/6/7 | Chỉ bản Release mới tải dSYM | Kiệt |
| **Doanh thu / gói trả phí** | Mua trong app | Server có `verify-purchase` / `store-webhook`; app không có màn nào; chưa có quyết định sản phẩm | Kiệt (quyết định) |

**Quy tắc:**
- Agent **không** tự đăng ký, mua, tạo tài khoản hay nhập thông tin thanh toán.
- Agent **không** tạo tài khoản trên Supabase production.
- Deploy production chỉ khi Kiệt duyệt rõ ràng.

---

## 2. Người dùng thật: 0

- **Chưa có ai ngoài đội dùng app.** Dữ liệu trong app là dữ liệu test (agent được sửa khi kiểm thử; không xoá vĩnh viễn).
- **Đo lường đã cài, nhưng chưa có dữ liệu thật:** sự kiện PostHog của vòng Koa, onboarding, buổi đầu. Mọi "chỉ số" trong tài liệu là mục tiêu thiết kế, chưa phải số đo.
- **Mục tiêu bằng số** (D7 / D28, kích hoạt…) chỉ chốt sau khi có baseline từ nhóm TestFlight đầu tiên.
- **Tính năng cần người dùng thì ẩn hoặc hoãn**, không mặc định hiện ra trống:
  - bảng tin cộng đồng;
  - thử thách cộng đồng;
  - nhắn tin;
  - bạn tập, bảng xếp hạng.
- **Cần người thật để biết:** cơ chế pump / quay lại có làm người dùng quay lại hay bỏ đi, và người dùng có hiểu Gains / xu / huy chương không.
- Thang hạng Gains đổi 24/10 (Kiệt: nhanh lúc đầu, chậm dần): [0, 40, 180, 540, 1150, 2300] — lịch 3 buổi / tuần lên Gym Rat ~1 tuần, Lifter ~1 tháng, Swole ~3 tháng, Beast ~6 tháng, Mass Monster ~1 năm (trước: [0, 40, 120, 260, 450, 700], Mass Monster ~4 tháng). Tài khoản test đang ở hạng cao hơn sẽ về hạng thấp hơn một lần (tính lại từ lịch sử, không phải tụt vì nghỉ). Đồ mở theo hạng ở cửa hàng cũng mở chậm hơn. Chưa biết nhịp này giữ chân hay làm nản.

---

## 3. Hoãn phát triển (deferred)

Mỗi dòng có lý do, và điều kiện để được làm lại. **Không làm khi chưa đủ điều kiện**, kể cả khi thấy dễ.

| Việc | Lý do hoãn | Điều kiện để làm lại | Từ |
|---|---|---|---|
| Mở rộng Cộng đồng (bảng tin, tương tác, trang người dùng) | Chưa có người dùng; QĐ 5 | Có người dùng thật + Kiệt quyết | V1 21/10 |
| Nhắn tin riêng (DM) | Server chưa có (`MESSAGING-PLAN.md`); Release đang ẩn | Có backend đáng tin + có nhu cầu | 15/10 |
| Thử thách cộng đồng | Lớp thử thách thứ ba; chưa có người. **Đã ẩn** ở Today và tab Cộng đồng (GĐ2, đã merge #642, Kiệt duyệt 21/10); code và dữ liệu giữ nguyên | Đủ người tham gia + Kiệt quyết | V1 21/10 |
| Đổi tab Cộng đồng thành "Bạn tập" | Tính năng bạn bè chưa đủ thực chất | Có tính năng bạn tập thật | V1 21/10 |
| Thẻ chia sẻ Story, bạn tập, xếp hạng bạn bè (đợt 5 cũ) | Cần người dùng | Sau TestFlight + số liệu | V1 21/10 |
| Mở rộng AI (Coach đọc lịch / Koa, AI lập kế hoạch) | Chỉ dùng AI khi tạo giá trị thật; luồng chính không được phụ thuộc AI | Sau khi vòng lõi chứng minh giá trị (GĐ4) | V1 21/10 |
| ~~Điều hướng 4 khu vực Today · Train · Fuel · Progress~~ | **Đã làm** (GĐ3, Kiệt duyệt mock 21/10, nhánh `claude/gd3-areas`): Hôm nay · Tập luyện · Dinh dưỡng · Tiến bộ. Cộng đồng bỏ khỏi thanh tab (mở từ Tiến bộ / trang cá nhân / chuông); "Tóm tắt" gộp vào Tiến bộ | — | V1 21/10 |
| ~~Lối "Hỏi Koa về hôm nay" trên Hôm nay~~ | **Đã làm** (Kiệt đưa thiết kế 21/10, nhánh `claude/today-ask-koa`): thẻ "Hỏi Koa" riêng (hình Koa ở bàn của Kiệt) mở Koa Coach. Thanh ghi bằng AI "Kể cho Koa" ở lại thẻ "Hôm nay của bạn" (Kiệt: tách ra) | — | 21/10 |
| Đồ phòng gym của Koa, gói trả phí AI (đợt 6 cũ) | Chưa có người dùng, chưa có quyết định doanh thu | Sau phát hành | 20/10 |
| Koa Classic tháng (đợt 4 cũ) | Thay bằng "Tuần của Koa" cá nhân hoá (QĐ 2) | Kiệt quyết lại | V1 21/10 |
| ~~"Buổi ngắn 15 phút" ở màn quay lại~~ | **Đã làm** 22/10 (Kiệt giao agent tự nghiên cứu và quyết, nhánh `claude/koa-comeback-step`): thẻ quay lại ở Hôm nay gợi ý theo số ngày nghỉ — 3–6 ngày tập như lần trước, 7–27 ngày bớt 1 hiệp mỗi bài, ≥ 28 ngày buổi ngắn (nửa số bài đầu, ≥ 2 bài); luôn có "Tập đủ buổi"; không giảm tạ. Ngưỡng theo nghiên cứu nghỉ tập (sức mạnh giữ gần nguyên dưới 3–4 tuần), chưa kiểm với người dùng thật | — | 20/10 |
| Khoá Face ID, xuất dữ liệu | Chưa ưu tiên | Trước khi phát hành | 20/10 |
| ~~Kế hoạch ăn chi tiết, đi chợ, thực phẩm bổ sung~~ | **Đã đưa xuống** Dinh dưỡng › "Thêm" (GĐ3, 21/10); bỏ bộ chọn Hôm nay / Kế hoạch ăn; bỏ dòng bổ sung ở Hôm nay. Không xoá màn / dữ liệu | — | V1 21/10 |
| Kiểm iOS 18–25 | Không có máy / simulator | Có máy | 16/10 |

---

## 4. Hạn chế đã biết (lỗi, chỗ lệch, chỗ chưa kiểm)

**Code đã merge nhưng trái với V1** (chi tiết, kèm file và dòng, ở #527 ngày 21/10):
- ~~Tụt hạng do nghỉ: `KoaGains`, `KoaSchedule.dropped`, lời nhắc ngày 6, màn quay lại.~~ Đã bỏ ở GĐ1 — **merge vào `native/ios-rewrite` 21/10 (#641, `59cb9d92`)**.
- ~~Cấp XP vẫn hiện, và cửa hàng khoá đồ theo Cấp XP.~~ Đã sửa ở GĐ2 — **merge vào `native/ios-rewrite` 21/10 (#642, `cad8f015`)**.
  - XP **ẩn khỏi giao diện** (thẻ hạng phòng Koa, nhiệm vụ, onboarding, widget, màn lên cấp), **không xoá**: server vẫn cộng XP, bảng và cột giữ nguyên.
  - Cửa hàng khoá theo **hạng Gains** (Kiệt duyệt): Cúp vàng → Lifter, Giày có cánh → Swole, Cánh Rồng → Beast. Không cần migration; không ai mất xu hay đồ đã mua.
- ~~8 thử thách tuần chung.~~ Thay bằng **Tuần của Koa** (GĐ2, đã merge #642): đích = số buổi trong lịch của chính người dùng, chỉ đếm ngày có buổi ghi thật. Đủ tuần: +15 Gains, +50 xu, nhận một lần mỗi tuần (khoá `ch:silver:<tuần>:koa_week`, server bỏ trùng). Code thử thách chung còn giữ, chỉ không hiện.

**GĐ2 (tiến bộ một thang + Tuần của Koa) — hạn chế đã biết:**
- **Khoá đồ theo hạng chỉ ở app.** `buy_mascot_item` trên server chỉ kiểm giá và số dư, không kiểm hạng. Ai gọi thẳng API vẫn mua được. Muốn chặn ở server phải có migration (tính Gains trên server); chưa làm vì Gains hiện chỉ tính ở app.
- ~~**Nhận thưởng Tuần của Koa cần mạng.** Mất mạng thì để lần mở app sau; không xếp hàng outbox.~~ Sửa 22/10 (nhánh `claude/koa-week-offline`): nhận hỏng thì **tự thử lại ngay khi có mạng**; đủ tuần lúc mất mạng rồi sang tuần mới mới có mạng thì **nhận bù tuần trước** (trước đây mất luôn). Vẫn không qua outbox (RPC kinh tế, server bỏ trùng theo `ref_key`).
- **Tổng kết tuần của tuần cũ dùng lịch HIỆN TẠI để tính đích** (app không lưu lịch theo từng tuần). Đổi lịch rồi xem lại tuần trước thì đích có thể khác lúc ấy. Đổi ngày (dời / nghỉ) thì vẫn đúng, vì được lưu theo ngày.
- ~~**Chưa kiểm trên simulator:** widget Koa (số Gains), onboarding bước kế hoạch.~~ Kiểm 22/10 (simulator):
  - Onboarding bước kế hoạch: đúng — "Newbie · 0 Gains · Gains không giảm khi nghỉ", 6 vạch = 6 hạng.
  - Widget Koa: chạy. **Lỗi đã sửa:** nhãn widget theo ngôn ngữ MÁY còn nội dung theo ngôn ngữ APP ("3 of 4 done" cạnh "HÔM NAY · CHUỖI") — `widgetText` tra theo ngôn ngữ app.
  - **Còn mở:** widget nhỏ Koa và hai widget "Phong độ" vẫn lấy **chuỗi ngày** làm số chính (V1: Gains là thang duy nhất, chuỗi đã bỏ khỏi Today; widget nhỏ Koa không có Gains). Cần mock trước khi đổi.
  - ~~Widget "Phong độ" hiện sẵn sàng 91 khi Today nói "Chưa đủ dữ liệu để chấm".~~ Không phải lỗi (kiểm lại 22/10): câu "chưa đủ dữ liệu" là ảnh lúc nửa đêm, hôm nay chưa có điểm; chiều cùng ngày chi tiết Hồi phục ở Tiến bộ cũng ~91, khớp widget.
- ~~"Mất pump" sau 3 ngày: chờ Kiệt chốt.~~ Kiệt chốt 21/10: bỏ; chào mừng quay lại (Daily Plan luật ④). Đã làm trên nhánh GĐ1.

**GĐ1 (Daily Plan + Today gọn) — Kiệt duyệt CÓ ĐIỀU KIỆN 21/10:**
- ~~PR GĐ1 để nháp, chỉ merge khi đủ 6 mục nghiệm thu.~~ **Kiệt lệnh "merge toàn bộ" 21/10 trong chat**: #641 và #642 đã merge vào `native/ios-rewrite` (nhánh tích hợp, **không phải phát hành**), CI xanh. **Nghiệm thu CHƯA đủ 6/6**: còn iPhone thật, A1, A2 (dưới đây). Các mục này vẫn phải làm trước khi phát hành.
- Migration `20261020140000_plan_day_overrides` (đổi lịch theo ngày) **CHƯA deploy** lên production. Cần lệnh duyệt rõ ràng. App đọc bảng này theo kiểu chịu lỗi: thiếu bảng thì coi như chưa đổi ngày nào.
- "Tập nhẹ hơn" chỉ bớt một hiệp mỗi bài cho buổi hôm nay. Không sửa mẫu, không giảm tạ, không phải kết luận y tế.
- Hồi quy mất mạng / lỗi / gửi lại (chỉ thị 21/10 14:26, commit `8d2f9d8b`): R1–R7, W1, D1–D5 **PASS** (test Swift + SQL thật trên Postgres ở máy). **Chặn:**
  - **A1 dời / nghỉ trên app:** Kiệt 21/10 bỏ phương án Supabase dev bằng Docker trên máy này (không đủ tài nguyên). Chỉ kiểm được trên app khi migration được deploy (cần duyệt), hoặc trên một máy / CI có Supabase dev.
  - **A2 mất mạng hẳn trên simulator:** không có công tắc mạng riêng; tắt mạng máy Mac là đổi cài đặt hệ thống.
  - Chi tiết: `GD1-DAILY-PLAN.md`, mục "Hồi quy GĐ1".

**GĐ3 (bốn khu vực) — hạn chế đã biết:**
- Link `ascnd://community` (và `assistant`) mở tab **Tiến bộ**, chưa mở thẳng màn Cộng đồng.
- Tab đã lưu của bản cũ: "assistant" → Tiến bộ; "community" → về Hôm nay (không còn tab ấy).
- ~~Koa ở thẻ đầu Tiến bộ đứng yên (`idle`), không đổi nét mặt theo ngày như ở Hôm nay.~~ Không còn áp dụng (22/10): thẻ Koa ở đầu Tiến bộ đã được thay bằng chữ A trạng thái (mock bản 10, #658/#659).
- Chưa kiểm: VoiceOver của thanh tab mới, iPhone màn hẹp, iOS 18–25 (nút "+" nổi thay thanh Ghi nhanh).
- `PARITY_MATRIX.md` chưa cập nhật theo 4 khu vực (việc cuối của GĐ3 trong lộ trình).

**Tiến bộ theo chữ trạng thái (mock bản 10, Kiệt duyệt 22/10) — hạn chế đã biết:**
- Tập luyện so với buổi theo lịch **tới hết hôm qua**: hôm nay chưa qua thì chưa tính là chậm (không nhắc oan buổi sáng).
- Ngưỡng (80 % bước / đạm, ngủ ≥ mục tiêu − 30 phút, sẵn sàng 60, ≥ 3 ngày dữ liệu) là đề xuất đã duyệt, chưa kiểm với người dùng thật.
- ~~Cơ thể chỉ xét HƯỚNG cân: +15 kg trong 4 tuần với mục tiêu tăng vẫn ra "Tốt" (audit vòng 4, 26/10).~~ Kiệt chốt 27/10; làm 27/10 (nhánh `claude/body-rate-threshold`): tăng (mục tiêu tăng) hay giảm (mục tiêu giảm) nhanh hơn ~1 % cân nặng mỗi tuần — trung bình từ lần cân đầu tới lần cuối trong 4 tuần — là "Cần chú ý", kèm câu khuyên nêu tốc độ ("Đang tăng khoảng 3,8 kg mỗi tuần — nhanh hơn ~1% cân nặng…") và ghi rõ "hướng dẫn chung, không phải lời khuyên y tế". Giữ cân: dải ±1 kg như cũ. Lần cân đầu và cuối cách nhau dưới 7 ngày thì chưa xét tốc độ. Test: `ProgressStatusTests` (tăng nhanh, giảm nhanh, sát ngưỡng, giữ cân, khoảng ngắn). **Hạn chế:** ngưỡng 1 % là mốc hướng dẫn chung, chưa kiểm với người dùng thật; tốc độ lấy theo cân đầu, không làm mượt (một lần cân lệch ở đầu / cuối khung kéo tốc độ).
- Mục tiêu bước nhớ theo máy (`StepsGoalStore`), như màn Vận động — máy khác có thể khác mục tiêu.
- Hồi phục dùng màu `destructive` (đỏ sáng, Kiệt 22/10) — trùng màu với nút xoá / lỗi.
- Chữ trạng thái có màu theo ý nghĩa (Kiệt duyệt phương án A 26/10, mock `L1m8tJ5BCzrbkUBCbZHYyb`): Tốt = bạc hà (`statusGood` #63e6be / #0a7b6c) + ✓, Cần chú ý = vàng hổ phách (`statusAttention` #e8b930 / #8a6a00) + ↗, Chưa đủ dữ liệu = xám + vòng nét đứt. Không dùng đỏ / cam. Chú thích dưới chữ A giữ hình đặc / viền / tối vì nó tả các ô của chữ A, không tả chữ.
- Icon dùng SF Symbols như Apple Health (Kiệt 22/10); mock icon riêng `progress-icons.html` bị thay.
- Chưa kiểm: giao diện sáng, màn hẹp, chi tiết từng nhóm (mới kiểm Vận động).
- ~~VoiceOver của chữ A: cả chữ là một khối, không mở được nhóm nào.~~ 22/10 (nhánh `claude/progress-a-motion`): mỗi mảng là một nút "Nhóm: trạng thái" theo đường leo. **Chưa chạy VoiceOver thật** để nghe.
- Chuyển động chữ A (Kiệt duyệt mock 22/10): hiện theo đường leo mỗi lần mở tab Tiến bộ, mảng "Cần chú ý" thở 3 nhịp, chạm đúng hình mảng (trước là ô chữ nhật), zoom sang chi tiết. Chưa kiểm khi bật Giảm chuyển động trên máy.

**Onboarding thiết kế lại (Kiệt duyệt mock 22/10, nhánh `claude/onboarding-v2`) — hạn chế đã biết:**
- 13 màn → 6 (Koa chào → mục tiêu + kinh nghiệm → lịch → Về bạn → Apple Health → kế hoạch + buổi đầu); style màn đăng nhập.
- Onboarding chỉ còn 4 mục tiêu (lên cơ / giảm mỡ / khoẻ hơn / giữ dáng). "recomp" và "endurance" vẫn chọn được ở Cài đặt → Hồ sơ.
- ~~"Lấy từ Apple Health" cho số đo ở màn Về bạn (có trong mock) **chưa làm**: số đo vẫn nhập tay; Apple Health vẫn kết nối ở màn kế tiếp.~~ Làm 23/10 (nhánh `claude/security-pass`): nút "Lấy từ Apple Health" (chỉ hiện khi máy có Health) xin đọc đúng 4 loại — giới tính, ngày sinh, chiều cao, cân nặng — rồi điền cái Health có, giữ cái không có; số ngoài thước (vd. chiều cao ghi bằng mét) bị bỏ. Health trống / không cho đọc thì báo một dòng. Kiểm trên simulator (Health trống: xin quyền đúng 4 loại, báo "chưa có số đo"); nhánh có số liệu thật chỉ có unit test. Thiết bị thật: NOT RUN.
- "Bỏ qua, dùng số trung bình" đặt giới tính "Khác" và vận động "Vừa phải" (đúng giá trị dự phòng của cổng số đo).
- Chưa kiểm: đi trọn luồng tới "Tập buổi đầu" trên tài khoản mới (ghi hồ sơ thật), VoiceOver từng màn, giao diện sáng (màn luôn tối như màn đăng nhập).

**Trang hỗ trợ web (`apps/site`, mock 23/10, chờ Kiệt duyệt) — hạn chế đã biết:**
- ~~Chỉ những gì App Store và tài khoản cần; **không** landing page.~~ 23/10: **Kiệt yêu cầu làm landing** (trang gốc `/`; Trợ giúp chuyển sang `/help/`). Vẫn **không** blog, đo lường hay thu email (chưa có người dùng — mục 0.4); landing ghi "Sắp có trên App Store", không có nút tải. Trang: Landing, Quyền riêng tư, Điều khoản, Trợ giúp, Đặt lại mật khẩu, Xoá tài khoản, Giới thiệu; en / vi / es. Đổi mật khẩu khi đang đăng nhập vẫn ở trong app.
- Văn bản pháp lý lấy từ `legal-content.json` của app (một nguồn). Là **bản nháp, không phải tư vấn pháp lý**; luật áp dụng Delaware kế thừa từ RN, cần Kiệt xác nhận.
- **Chưa có:** email hỗ trợ, tên đơn vị vận hành (trang hiện ô "chưa đặt"), hosting. Hosting miễn phí (Cloudflare Pages đề xuất; GitHub Pages thì phải sửa workflow) cần Kiệt tạo tài khoản — agent không tự tạo (mục 1).
- **Đặt lại mật khẩu trên web cần đổi cấu hình Supabase production** (Redirect URLs + mẫu email Reset Password dùng `token_hash`), cần Kiệt duyệt. Chưa đổi thì link vẫn chỉ mở được trên iPhone có app (trang web hiện nút "Mở trong app").
- Chuyển động theo cuộn kiểu trang Apple (Kiệt yêu cầu 23/10) ở Trợ giúp và Giới thiệu: cảnh ghim, chữ sáng dần, ảnh phóng to; nền dải sáng + bụi chép từ màn đăng nhập. Bật Giảm chuyển động hoặc tắt JS: trang đứng yên, đọc được hết (đã kiểm). Chưa kiểm trên Safari iPhone thật (ghim `position: sticky`, đơn vị `svh`).
- Chưa chạy luồng đặt mật khẩu thật với một email thật (cần cấu hình trên). Đã kiểm: build, 6 trang × 3 ngôn ngữ ở 1280 px và 390 px, các trạng thái form / hết hạn / mở trên iPhone, và Supabase trả `403 otp_expired` cho link hỏng (trang hiện "Link đã hết hạn").

**Tìm thấy khi kiểm ngày 21/10** (simulator, tài khoản test):
- ~~Coach AI bị cắt giữa câu, còn sót dấu `**` thô.~~ Sửa 21/10 (nhánh `claude/fix-five-bugs`): app bỏ `**` lẻ, câu bị cắt vì hết hạn mức thì nối "…". Server: `MAX_TOKENS` 1024 → 2048 (model gemini-3-flash tiêu một phần cho suy luận ẩn). **`ai-coach` đã deploy 21/10 (Kiệt duyệt trong chat), bản 24, từ `af3f6427`.** Kiểm trên simulator: câu trả lời chạy trọn, không sót `**`.
- ~~Số buổi lệch: Coach nói 4 (đếm 7 ngày gần nhất), tổng kết tuần nói 2 (tuần lịch).~~ Sửa 21/10: `ai-coach` gửi `this_week` (tuần lịch T2 → hôm nay, đếm ngày có buổi như app) và dặn model dùng nó cho "tuần này". **Đã deploy 21/10** — Coach trả lời "2 buổi tập trong tuần này từ thứ Hai", khớp app (2/6).
- ~~Sẵn sàng lệch: tổng kết tuần hiện 92 và khuyên "+2.5kg" dựa trên một điểm duy nhất.~~ Sửa 21/10 (app): cần ít nhất 3 ngày đo được phục hồi (`WeeklyReview.minReadinessDays`) mới có điểm tuần và lời khuyên tăng tải; ít hơn thì "—".
- ~~Điểm sẵn sàng tính sai (kiểm 24/10, Kiệt yêu cầu): HRV / nhịp tim nghỉ đúng mức nền chỉ được 50, nên ngày bình thường có đồng hồ ra ~71 (vàng) còn không đồng hồ ra ~92; nền đếm theo MẪU (đồng hồ ghi nhiều mẫu / ngày, đủ "5 mẫu" sau 1–2 ngày); "HRV hôm nay" là một lần đo lẻ gần nhất; đau cơ bị trừ hai lần (điểm tải + trần "chấn thương" 45).~~ Sửa 24/10 (app, nhánh `claude/readiness-fix`): mức nền = 75, HRV thang ln (AIS / Plews), nền và hôm nay theo ngày (trung bình mẫu, hôm nay không nằm trong nền), cần ≥ 7 ngày (Apple chờ ~7 đêm), đau cơ chỉ trừ điểm tải. **Hạn chế:** khác RN (golden `daily_logs` bỏ so 4 cột sẵn sàng); điểm các ngày cũ chỉ đổi khi ngày ấy được dựng lại; HealthKit vẫn chỉ đọc mẫu HRV MỚI NHẤT mỗi lần đồng bộ (chưa đọc HRV ban đêm như Oura / Apple); ngưỡng 75 / 50 chưa kiểm với người dùng thật.
- ~~Đơn vị lệch: AI viết "2,508", app viết "2.508". Nước oz ở Dinh dưỡng, L ở tổng kết tuần.~~ Sửa 21/10: tổng kết tuần định dạng số theo ngôn ngữ app và nước theo đơn vị người dùng (app). Coach được dặn viết số kiểu app (đã deploy 21/10). `ai-weekly-review` chưa có luật này.
- ~~Quá nhiều con số: tổng kết tuần AI sinh thêm "Điểm tuần 55".~~ Sửa 21/10 (app): không hiện điểm AI; thẻ là "Koa nhận xét tuần". Server vẫn trả `score` (không đổi để khỏi deploy).

**Chưa kiểm:**
- Tạo lịch tuần ở onboarding trên một **tài khoản mới**.
- Mẹo buổi đầu trong một buổi tập thật.
- Kể cho Koa (`ai-log-parse`).
- Chụp ảnh món (`scan-food`).
- Mọi mục ở `GD0-DEVICE-CHECKLIST.md`.

**Tìm thấy khi kiểm toàn diện vòng 2 (26/10, simulator iPhone Air, tài khoản test):**
- ~~Nước không dựng lại `daily_logs`: thêm / bỏ nước không cập nhật `daily_logs.water_ml` (RN cũng vậy), nên Tiến bộ › Ăn uống, tổng kết tuần, TB 7 ngày của Insight và câu "bạn đã ghi X nước" của Coach lệch sổ Nước tới lần ghi bữa / ngủ / tập kế tiếp của ngày ấy.~~ Sửa 26/10 (nhánh `claude/audit-r2`): thêm → dựng lại ngày của lần uống sau khi server nhận; "−" thành → dựng lại ngày ấy. Kiểm trên simulator: uống 16 oz lúc 0:04 → Tiến bộ "Nước TB 2,2" thành "1,9 / mục tiêu 2,4 L". Ngày cũ đã lệch chỉ sửa khi ngày ấy được ghi lại.
- ~~**Còn mở:** Tiến bộ hiện nước bằng **L** khi tài khoản chọn **oz** (Dinh dưỡng, màn Nước hiện oz).~~ Sửa 26/10 (audit vòng 3, nhánh `claude/audit-r3-water-units`): dòng Nước ở Tiến bộ › Ăn uống theo `preferences.volumeUnit` ("72 / 85 oz" hay "2,1 / 2,5 L", cùng cách làm tròn với Dinh dưỡng).
- ~~**Còn mở:** hai chữ "Trung bình" cho nước khác nhau: màn Nước chia cho đủ 7 ngày (kể cả ngày không uống, 53 oz ≈ 1,6 L); Tiến bộ chia cho ngày có ghi (2,2 L). Cùng tổng, khác mẫu số.~~ Sửa 26/10 (cùng nhánh): **một định nghĩa** `Water.loggedAverage` — tổng chia cho số ngày CÓ ghi nước trong khung (ngày không ghi không biết là không uống hay quên ghi), như Insight / tổng kết tuần / Tiến bộ vốn làm. Màn Nước và Tiến bộ ghi rõ "Ngày có ghi: n/7" và in cùng chữ (`Water.shortLabel`: "64 oz", "1,9 L"). Lệch RN có chủ đích (`NATIVE_IMPROVEMENTS.md`); bỏ so golden trung bình của RN và hàm `averageLabel`. Test: `WaterAverageTests`. Kiểm trên simulator (tài khoản oz): màn Nước "53 oz" → "64 oz · Ngày có ghi: 6/7"; Tiến bộ › Ăn uống "Trung bình 2,2 / mục tiêu 1,9 L" → "Trung bình 64 / mục tiêu 63 oz · Ngày có ghi: 6/7".
- ~~**Còn mở (cần Kiệt chốt):** khung 7 ngày khác nhau. Màn Nước và Tiến bộ tính 7 ngày **tới hết hôm nay** (hôm nay còn dở vẫn tính nếu đã uống); Insight "TB 7 ngày" tính 7 ngày **trước hôm nay**. Cùng định nghĩa, khác khung, nên cùng lúc thấy 64 oz (màn Nước) và 70 oz (Insight). Đề xuất: mọi trung bình bỏ hôm nay (ngày chưa xong) — đổi cả cửa sổ trạng thái Tiến bộ (bước chân buổi sáng cũng đang kéo TB xuống), nên chưa tự làm.~~ Kiệt chốt 27/10: mọi trung bình 7 ngày bỏ hôm nay. Làm 27/10 (nhánh `claude/avg-excludes-today`): **một khung** `AverageWindow` (ASCNDCore) = 7 ngày TRƯỚC hôm nay, chia cho ngày có số. Dùng ở: Insight (truy vấn + trung bình), màn Nước (`WaterBook.average`; bảy cốc vẫn tới hôm nay), Tiến bộ (bước, đạm, ngủ, hồi phục, nước, kcal; biểu đồ chi tiết là 7 ngày của khung; số hôm nay đi riêng ở dòng "Hôm nay"), Vận động (TB, lệch RN), Dinh dưỡng 7 ngày (TB đạm / kcal / lời khuyên; biểu đồ vẫn có cột hôm nay), Giấc ngủ (TB theo ngày thức dậy trong khung; đêm dậy sáng nay vẫn ở danh sách), tổng kết tuần (tuần đang chạy: các TRUNG BÌNH bỏ hôm nay; tổng khối lượng / số buổi và biểu đồ ngày giữ hôm nay). Widget không hiện trung bình nào (đã rà) — không đổi. Test: `AverageWindowTests` (một bộ số qua mọi màn ra cùng khung, cùng trung bình), `ProgressStatusTests.todayIsShownButNotAveraged`, `StepsAverageTests`.
- ~~**Còn mở:** câu AI của Insight viết nước bằng ml cho tài khoản oz ("bạn mới uống 473ml thôi" ngay dưới tiêu đề "16 oz nước hôm nay"). Sửa ở prompt server (cần deploy, cần Kiệt duyệt).~~ Sửa 27/10 (nhánh `claude/ai-water-unit`, Kiệt duyệt deploy trong chat): app gửi `waterUnit`; `ai-smart-nudges` đổi số nước sang oz trước khi tới model (`water_today_oz`, `water_target_oz`) + luật viết nước; app cũ không gửi → ml như trước. **Deploy production 27/10 16:47 UTC: `ai-smart-nudges` v12** (trước v11). Kiểm trên simulator (tài khoản oz): Insight "Cập nhật 11:49" — "Uống thêm 47 oz nước để đạt mục tiêu hôm nay" dưới "16 oz nước hôm nay" (63 − 16 = 47).
- Sửa kèm (26/10): Tiến bộ › Ăn uống hiện "Trung bình 0 / mục tiêu …" khi mới có 1–2 ngày ghi calo / nước (hàm con trả 0 khi chưa đủ ngày). Nay hiện trung bình thật, chưa có ngày nào thì "–"; chữ trạng thái vẫn "Chưa đủ dữ liệu".
- ~~Danh sách đi chợ hiện "Cơm 21000g" (gợi ý từ kế hoạch ăn) và hàng danh sách thêm "×" trước số lượng ("×21000g", "××3").~~ Sửa 26/10 (audit vòng 3, nhánh `claude/audit-r3-grocery`): `Grocery.quantityLabel` — nhóm chữ số theo ngôn ngữ app, từ 1000 g đổi ra kg ("21 kg", "1,3 kg", "400 g"); chữ khác giữ nguyên; chữ LƯU vào `grocery_items.quantity` không đổi. Kiểm trên simulator: gợi ý "Cơm 21 kg", thêm vào danh sách → hàng "Cơm 21 kg". Test: `GroceryTests.quantityLabelGroupsDigitsAndUsesKg`.
- ~~Koa Coach: nút / câu hỏi lại về nước luôn ghi ml / L ("Ghi 473 ml") dù tài khoản chọn oz; không hiểu "16 oz" khi người dùng kể; phần nước còn thiếu làm tròn 50 ml ("32 oz" − 16 oz đã ghi → gợi ý 15 oz).~~ Sửa 26/10 (audit vòng 3, nhánh `claude/audit-r3-coach-oz`): `CoachLogPrompt` hiển thị, đọc lựa chọn và làm tròn theo đơn vị người dùng; nhận "oz / fl oz / ounces / onzas". Test: `CoachLogPromptTests.waterFollowsTheUsersUnit`. Chưa kiểm trên simulator (nút chỉ hiện sau một câu trả lời AI thật). ~~**Còn mở:** số gửi cho AI (`checks`) vẫn là ml, nên câu AI tự viết có thể nói ml — sửa ở prompt server (cần deploy).~~ Sửa 27/10 (cùng nhánh): `ai-coach` nhận `waterUnit`, viết câu hỏi lại số nước theo đơn vị (số `checks` app gửi vẫn là ml) + luật viết nước. **Deploy production 27/10 16:47 UTC: `ai-coach` v25** (trước v24). Kiểm trên simulator: "hom nay toi da uong 32 oz nuoc roi" → khối "Nước đã uống 32 oz", "Bạn đã nạp được 32 oz nước…", không có ml.
**Audit 26/10 (vòng 4) — buổi tập, onboarding, accessibility, giao diện sáng, trạng thái tải:**
- ~~Hôm nay hiện "Offline — đang hiện kế hoạch đã lưu" ở MỌI lần mở app dù có mạng (cache hiện ra trong lúc chờ server được coi là offline).~~ Sửa 26/10 (nhánh `claude/audit-r4-offline-banner`): `TodayController.showingStaleCache` — chỉ hiện dải khi đang xem cache VÌ lần hỏi server đã hỏng (như Lịch sử vốn làm). Test: `TodayControllerTests.cacheWhileWaitingIsNotStale`. Kiểm trên simulator (iPhone Air, có mạng): trước — dải hiện ~1 giây mỗi lần mở app (2/2 lần); sau — 8 khung hình lúc mở app, không khung nào có dải. **Chưa kiểm** lúc mất mạng thật (simulator không có công tắc mạng riêng, xem A2).

**Audit 26/10 (vòng 4) — buổi tập trực tiếp:**
- Đi trọn trên simulator (iPhone Air, tài khoản test, tiếng Việt): Hôm nay "Bắt đầu buổi tập" → 3 set Incline (27,2 kg ×2 + 1 set không tạ) → nghỉ / bỏ qua nghỉ → thu nhỏ → **tắt app giữa buổi** → mở lại "Đang tập dở · Tiếp tục" (giữ 3/12) → 1 set Shoulder 18,4 kg → "Kết thúc buổi · 4/12" → tổng kết → ghi thêm 1 set vào buổi đã chốt. Số khớp: tổng kết 728 kg / 4 set / 2 bài; Gains 136 → 150 (+10 buổi, +4 kỷ lục), "còn 30 tới Lifter"; Tuần của Koa 1/7 ở Hôm nay và Tiến bộ › Tập luyện; Lịch sử 728 kg · 5 hiệp · 3 bài sau khi ghi thêm, "Tuần này · 728 kg". Không thấy buổi nhân đôi.
- ~~Ô tạ và hàng "Như set trước · 27.2 kg" in dấu chấm ngay dưới "Lần trước 27,2 kg"; gõ dấu phẩy trên bàn phím tiếng Việt thì ô đổi thành dấu chấm.~~ Sửa 26/10 (nhánh `claude/audit-r4-workout`): `NumberInput.display` — ô tạ và gợi ý hiện theo dấu thập phân của ngôn ngữ app; chữ lưu vẫn dấu chấm. Test `NumberInputTests.displayFollowsTheAppsDecimalSeparator`. Kiểm trên simulator: "Như lần trước · 15,9 kg" → ô "15,9" → "+" → set lưu "18,4 kg × 10".
- ~~Tổng kết buổi in set không tạ là "× 10" (dấu nhân không có vế trước).~~ Sửa 26/10 (cùng nhánh): "10 reps", như dòng "Set vừa xong". Build xanh; **chưa xem lại trên simulator** (cần chốt một buổi mới — hôm nay đã chốt).
- ~~"Về Hôm nay" ở tổng kết chỉ đóng màn tập, đứng lại ở tab Tập luyện.~~ Sửa 26/10 (cùng nhánh): đổi sang tab Hôm nay. Build xanh; **chưa bấm lại trên simulator** (cùng lý do). Tổng kết của ngày cũ (mở từ Kế hoạch tuần) giữ như cũ: đóng về Kế hoạch tuần.
- ~~**Còn mở (cần Kiệt quyết, đã duyệt mock 14/10 là "một chạm mới điền"):** mỗi set sau set đầu bắt đầu ở 0 kg — một set có tạ tốn 2 chạm ("Như set trước" + "Xong set"), 3 nếu bỏ qua nghỉ. Đề xuất: set kế của CÙNG bài trong buổi tự mang tạ của set vừa xong (như Strong / Hevy); bài không tạ vẫn trống.~~ Kiệt chốt CÓ 27/10; làm 27/10 (nhánh `claude/set-prefill`): `WorkoutDay.carryForward` — tích một set thì set chưa tích kế tiếp của cùng bài (cùng loại khởi động / làm việc) mang tạ VÀ reps vừa ghi, hiện trong ô, sửa được; chỉ điền ô chưa gõ; bài không tạ để trống tạ; số theo kế hoạch không bị chép. Test `SetCarryForwardTests`, `WorkoutSessionControllerTests.tickCarriesWeightAndRepsToTheNextSet`. Số chạm mỗi set sau set đầu: 2 → 1 (3 → 2 nếu bỏ qua nghỉ).
- ~~**Còn mở:** tổng kết có nút "Chia sẻ lên cộng đồng" khi bảng tin cộng đồng đang hoãn (§3, 0 người dùng). Cần Kiệt quyết ẩn hay giữ.~~ Kiệt chốt 27/10: **GIỮ** nút, không đổi code (V1 QĐ 5 vẫn giữ chia sẻ buổi tập). Không phải lỗi; đừng ẩn khi chưa có quyết định mới.
- ~~**Còn mở (nhỏ):** "Lần trước 10 reps × không tạ" (chép golden RN `lastSetText`); hàng Lịch sử tên dài ("Back & Shoulders") ép ngày xuống hai dòng.~~ Sửa 27/10 (audit vòng 5, nhánh `claude/v5-small`): không tải thì "Lần trước 10 reps" (lệch RN có chủ ý, test golden nới đúng chỗ ấy); tên ở Lịch sử tối đa 2 dòng, ngày 1 dòng. Unit test xanh; **chưa xem trên simulator**.
- **Chưa kiểm:** xoá buổi ở Lịch sử (xoá thật trên server — không làm trên dữ liệu test theo luật "không xoá vĩnh viễn"); tổng kết tuần AI sau buổi này.

**Audit 26/10 (vòng 4) — onboarding, accessibility, giao diện sáng, trạng thái:**
- Onboarding trên tài khoản mới: **NOT RUN.** Không tạo tài khoản trên Supabase production (§1). Bản Debug có `ASCND_DEBUG_ONBOARDING=1` để xem 6 màn trên tài khoản đã xong, nhưng nút cuối vẫn GHI hồ sơ thật (không phải chạy thử) — chưa chạy vòng này.
- VoiceOver: **chưa chạy VoiceOver thật**; công cụ simulator của phiên này không đọc được cây accessibility. Rà mã: nút tick set có vùng chạm 44 pt (vòng 30 pt bên trong), nút ± 48 pt, nút ẩn mẹo buổi đầu 32 pt (dưới 44, `FirstSessionTip`).
- Chữ lớn (AX5) ở Tiến bộ: chữ thân / chú thích phóng to, tiêu đề "Tuần này" đứng yên cỡ nhỏ (chữ cỡ cố định); thanh tab và Ghi nhanh không phóng (dùng Large Content Viewer của hệ thống — chưa kiểm).
- Giao diện sáng ở bốn tab: không thấy chữ mất hay màu tối cứng; thẻ Hỏi Koa giữ ảnh nền tối (ảnh Koa, không đổi).
- Trạng thái tải: dải offline giả (đã sửa ở trên). Còn thấy: thẻ việc chính Hôm nay đổi "Xem tiến bộ" ↔ "Ghi bữa sau tập" giữa hai lần mở app cách nhau vài phút, cùng dữ liệu — chưa tìm ra nguyên nhân.
  - 27/10 (audit vòng 5, nhánh `claude/v5-small`): **nguyên nhân** — Hôm nay đọc Daily Plan một lần lúc mở; nếu hồ sơ chưa về thì đạm còn thiếu = `nil` → "Xem tiến bộ", hồ sơ về trước → "Ghi bữa sau tập". Sửa: hồ sơ (mục tiêu đạm) đổi / về sau thì đọc lại Daily Plan. **Chưa kiểm trên simulator** (race, khó dựng lại).

**Audit 25/10 (vòng 1):**
- ~~Ghi giấc ngủ có thể lưu giờ dậy ở TƯƠNG LAI~~ (P1, sửa 25/10): `SleepLog.span` (theo RN) đặt giờ dậy vào hôm nay, nên "23:00–7:00" ghi lúc 1:24 sáng lưu một giấc dậy lúc 7:00 sáng nay. Sửa: `SleepLog.lastNight` (lùi về đêm gần nhất đã xong) cho bộ ghi giấc ngủ, màn Ghi giấc ngủ và "Kể cho Koa"; nút ghi nhanh trên thẻ Giấc ngủ chỉ hiện khi giờ dậy quen đã qua. Lệch RN có chủ đích; test mẫu RN của `span` giữ nguyên.

**Tài liệu và mã:**
- `PARITY_MATRIX.md` lạc hậu từ 17/10. 26/10 (audit vòng 3, nhánh `claude/audit-r3-dead-code`): **đánh dấu LẠC HẬU** ở đầu trang (nói rõ chỗ sai: GĐ1–GĐ3, bốn khu vực, lối vào); rà lại toàn bảng vẫn là việc cuối của GĐ3, chưa làm.
- ~~`ReadinessTrendCardView` là code chết.~~ Xoá 26/10 (cùng nhánh): view và 8 chuỗi `rt.*`; giữ `ReadinessTrendBook` / `ReadinessTrend` (Hôm nay vẫn dùng). Build simulator xanh, cổng chuỗi xanh (2787 khoá).

**Giới hạn của môi trường agent:**
- Simulator không có camera, push APNs, dữ liệu Health thật, hay Live Activity khi khoá màn hình.
- Công cụ gõ chữ vào simulator làm hỏng dấu tiếng Việt, nên phải kiểm bằng gợi ý có sẵn hoặc tiếng Anh.
- Agent không được merge PR của phiên khác.

---

## 5. Lịch sử thay đổi sổ

- 27/10/2026: audit vòng 5 — việc nhỏ §4: "Lần trước 10 reps" (bỏ "× không tạ"), tên dài ở Lịch sử, nguyên nhân thẻ việc chính đổi qua lại (hồ sơ về muộn).
- 27/10/2026: deploy production (Kiệt duyệt trong chat: "Cho phép deploy production hai hàm `ai-smart-nudges` và `ai-coach`") — `ai-smart-nudges` v12, `ai-coach` v25, 16:47 UTC, từ nhánh `claude/ai-water-unit` @ `4fd26d04`: viết nước theo đơn vị người dùng; app cũ không gửi đơn vị vẫn là ml. Không deploy hàm nào khác, không migration.
- 27/10/2026: Kiệt chốt — Tiến bộ › Cơ thể "Cần chú ý" khi tăng / giảm nhanh hơn ~1 % cân nặng mỗi tuần, có câu khuyên (hướng dẫn chung).
- 27/10/2026: Kiệt chốt — mọi trung bình 7 ngày bỏ hôm nay (`AverageWindow`, một khung cho mọi màn); gạch mục "khung 7 ngày khác nhau".
- 27/10/2026: Kiệt chốt — set kế điền sẵn tạ + reps của set vừa xong (đã làm); giữ nút "Chia sẻ lên cộng đồng" ở tổng kết (không đổi code).
- 26/10/2026: audit vòng 4 — buổi tập trực tiếp (dấu thập phân ô tạ, set không tạ ở tổng kết, "Về Hôm nay"); ghi kết quả onboarding / accessibility / giao diện sáng / trạng thái tải và các mục còn mở.
- 26/10/2026: audit vòng 4 — Hôm nay không còn báo "Offline" trong lúc chờ server mỗi lần mở app.
- 26/10/2026: audit vòng 3 — Koa Coach hiện và hiểu nước theo đơn vị người dùng (oz).
- 26/10/2026: audit vòng 3 — xoá `ReadinessTrendCardView` (code chết), đánh dấu `PARITY_MATRIX.md` lạc hậu.
- 26/10/2026: audit vòng 3 — số lượng đi chợ nhóm chữ số / đổi ra kg, bỏ "×" thừa ở hàng danh sách.
- 26/10/2026: audit vòng 3 — nước ở Tiến bộ theo đơn vị người dùng; một định nghĩa "trung bình nước" (chia cho ngày có ghi) cho màn Nước và Tiến bộ; Tiến bộ không còn hiện "Trung bình 0" khi chưa đủ ngày.
- 26/10/2026: audit vòng 2 — nước dựng lại `daily_logs` (gạch hạn chế TB 7 ngày của nước); thêm hai chỗ lệch nước còn mở (đơn vị L / oz ở Tiến bộ, hai cách tính trung bình).
- 26/10/2026: Kiệt đổi chỉ thị: mọi trang có dữ liệu cần làm mới khi thay đổi đều được kéo để làm mới (bỏ luật 13/10 "chỉ Hôm nay"). Thêm ở tab Dinh dưỡng và chi tiết nhóm Tiến bộ. **Chưa kiểm được cử chỉ trên simulator:** cả kéo tổng hợp lẫn kéo chuột đều không kích hoạt làm mới, kể cả ở tab Tiến bộ vốn đã có — cần thử trên iPhone thật.
- 26/10/2026: chữ trạng thái Tiến bộ có màu + icon theo ý nghĩa (phương án A, Tốt bạc hà).
- 25/10/2026: audit vòng 1 — giấc ngủ không còn lưu giờ dậy ở tương lai.
- 23/10/2026: trang hỗ trợ web: Koa sống trên mọi trang — SVG dựng từ cảnh app vẽ (`apps/site/tools/koa-svg.mjs`), không vẽ lại; 12 biểu cảm, 6 vóc dáng, hoạt ảnh gốc; landing có câu tuyên ngôn Koa đổi nét mặt, Koa lớn lên theo cuộn, "Koa hiểu ngày của bạn" (theo `KoaMood`). Chưa kiểm Safari iPhone thật.
- 23/10/2026: trang hỗ trợ web: ảnh màn hình app thật (simulator, tài khoản test, ba ngôn ngữ) trong khung iPhone thay chữ A tự vẽ; script chụp lại `apps/site/tools/capture-app-screens.sh`.
- 23/10/2026: trang hỗ trợ web: thêm landing ở trang gốc (Kiệt yêu cầu); sửa hạng cao nhất "Beast" → "Mass Monster" trong chữ của site.
- 23/10/2026: trang hỗ trợ web: chuyển động theo cuộn kiểu Apple; trang Quyền riêng tư / Điều khoản ghi rõ là cùng nội dung trong app.
- 23/10/2026: trang hỗ trợ web `apps/site` (mock chờ duyệt): sáu trang, ba ngôn ngữ; chờ email hỗ trợ, hosting, cấu hình Supabase cho đặt lại mật khẩu.
- 21/10/2026: tạo sổ (Kiệt yêu cầu, #527).
- 21/10/2026: thêm điều kiện duyệt GĐ1, migration chưa deploy, kết quả "mất pump" / tụt hạng.
- 21/10/2026: hồi quy GĐ1 (R / W / D PASS; A1, A2 BLOCKED).
- 21/10/2026: Kiệt lệnh merge: #641 (GĐ1) và #642 (GĐ2) vào `native/ios-rewrite`; nghiệm thu GĐ1 còn thiếu iPhone thật, A1, A2; migration vẫn chưa deploy.
- 23/10/2026: ngôn ngữ app theo iPhone (bỏ bộ chọn trong app; Cài đặt → ASCND → Ngôn ngữ); nút đăng nhập hướng A (Apple / Google / email — Apple ẩn tới khi có Apple Developer Program).
- 22/10/2026: Tuần của Koa nhận lại khi có mạng + nhận bù tuần trước; kiểm widget Koa / onboarding (widget theo ngôn ngữ app; còn mở: chuỗi trên widget; điểm 91 kiểm lại là khớp).
- 22/10/2026: thẻ quay lại gợi ý theo số ngày nghỉ (nhẹ hơn từ 7 ngày, buổi ngắn từ 28 ngày); gỡ mục "Buổi ngắn 15 phút" và dòng Koa đứng yên ở Tiến bộ.
- 22/10/2026: chữ A có chuyển động, vùng chạm đúng hình mảng, VoiceOver từng mảng.
- 22/10/2026: Tiến bộ theo chữ trạng thái (chữ A logo, 6 nhóm); thêm hạn chế.
- 22/10/2026: Insight sống theo việc ghi — đọc lại sau mỗi lần ghi, nước lấy từ sổ Nước (`daily_logs.water_ml` chưa có ngay lượng vừa ghi), bỏ câu đã giải quyết hay đã cũ (người dùng ghi thêm đúng chủ đề sau khi insight về; hết câu thì ẩn cả thẻ tới insight mới), vòng chỉ cho kết quả đã chốt (ngủ, sẵn sàng). Số lăn như Dinh dưỡng khi vừa ghi. Hạn chế: ~~TB 7 ngày của nước vẫn đọc từ `daily_logs`~~ (26/10, audit vòng 2: `daily_logs.water_ml` giờ được dựng lại sau mỗi lần thêm / bỏ nước, nên số này khớp sổ Nước; ngày cũ chỉ sửa khi ngày ấy được ghi lại); ghi nước không gọi lại AI (chỉ ngủ / ăn / tập đổi dấu dữ liệu). Mốc "số lúc insight về" ghi khi thẻ thấy insight lần đầu — insight từ bộ nhớ đệm mở lại sau khi đã ghi thì mốc là số lúc mở.
- 21/10/2026: thẻ "Hỏi Koa" ở Hôm nay (lối vào Koa Coach; thanh "Kể cho Koa" vẫn ở "Hôm nay của bạn"); đóng mục hoãn "Hỏi Koa".
- 21/10/2026: Insight hôm nay kiểu Apple Health (tiêu đề lớn, thẻ số liệu, TB 7 ngày, nút X); gỡ lối "Hỏi Koa" khỏi thẻ, ghi vào mục hoãn.
- 21/10/2026: deploy `ai-coach` (bản 24) lên production theo duyệt của Kiệt.
- 21/10/2026: sửa 5 lỗi tìm thấy 21/10 (phần app xong; phần server `ai-coach` chờ deploy).
- 21/10/2026: GĐ3 — bốn khu vực, Cộng đồng ra khỏi thanh tab, "Tóm tắt" gộp vào Tiến bộ, kế hoạch ăn / đi chợ / bổ sung xuống "Thêm"; thêm hạn chế GĐ3.
- 21/10/2026: GĐ2 — XP ẩn khỏi giao diện, khoá đồ theo hạng Gains, Tuần của Koa thay thử thách chung, ẩn thử thách cộng đồng; thêm hạn chế khoá đồ chỉ ở app.
- 23/10/2026: onboarding — "Lấy từ Apple Health" ở màn Về bạn đã làm (gạch mục ở §4).
