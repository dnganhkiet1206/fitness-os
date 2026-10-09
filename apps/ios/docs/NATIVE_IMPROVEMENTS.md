# Native khác RN — sổ cải tiến và chỗ lệch có chủ đích

## Chính sách (Kiệt, 09/10/2026)

Khi port, agent **được phép nâng cấp / cải thiện** một tính năng nếu phần ấy ở
React Native **chưa hoàn thiện** (lỗi, thiếu trạng thái, chữ sai, hành vi dễ gây
hiểu nhầm). Điều kiện:

1. **Ghi vào sổ này** trong CÙNG commit / PR thay đổi hành vi — không ghi thì
   coi như chưa được phép. (Từ 09/10 mọi agent commit thẳng lên
   `native/ios-rewrite`, chỉ thị #527 6074127548: ghi cột PR là commit SHA.)
2. RN cũng là app **Android**: mỗi dòng phải nói RN/Android có nên làm theo
   không (cột *RN/Android*), để người làm RN biết việc cần backport.
3. Không đổi hợp đồng dữ liệu (schema, RPC, RLS, hình dạng hàng ghi) chỉ vì một
   cải tiến phía client; đổi dữ liệu vẫn cần chốt riêng.
4. Golden / test vẫn lấy từ RN cho phần GIỐNG RN; phần cải tiến có test riêng
   nói rõ nó khác RN ở đâu. Không sửa expected của golden cho xanh.

Chỗ native **thiếu** so với RN (chưa port) không ghi ở đây — xem
`PARITY_MATRIX.md`. Sổ này chỉ ghi chỗ native **làm khác / làm hơn**.

Mở rộng (Kiệt, 09/10, sau đó): mọi agent **được sửa và tối ưu** code so với RN,
miễn **giữ nguyên ý định** của app và chỉ làm app tốt hơn — vẫn ghi lại ở đây.

## Cột

- **Loại**: `cải tiến` (native làm hơn RN) · `sửa lỗi RN` (RN sai, native làm
  đúng) · `lệch nền tảng` (khác vì iOS / app chưa có hạ tầng, không phải hơn).
- **RN/Android**: `nên làm theo` · `không cần` · `chờ quyết`.

## Sổ

| Màn / phần | Native làm gì | RN làm gì | Loại | RN/Android | PR | Agent |
|---|---|---|---|---|---|---|
| Nước uống — lần đọc đầu hỏng | Nói "không đọc được" / offline; thẻ ở tab Dinh dưỡng ẩn | Màn `/water` hiện `0.00L`, 0% như thể chưa uống gì | sửa lỗi RN | nên làm theo (màn `/water`) | #568 | A |
| Nước uống — biểu đồ 7 ngày | Cộng cả lần uống còn trong hàng đợi offline | Biểu đồ tuần không có bản vá lạc quan; hôm nay trên biểu đồ lệch số tổng cho tới khi server trả lời | cải tiến | nên làm theo | #568 | A |
| Nước uống — tiêu đề thẻ ở tab Dinh dưỡng | Chuỗi dịch đủ en/vi/es ("Agua") | `lang === 'vi' ? 'Nước uống' : 'Water'` — bản es hiện "Water" | sửa lỗi RN | nên làm theo | #568 | A |
| Nước uống — kết quả ghi | Một dòng trong thẻ + VoiceOver đọc | `toast` | lệch nền tảng (native chưa có toast) | không cần | #568 | A |
| Thực phẩm bổ sung — bản lưu của hôm qua | Mở lại offline sang ngày mới: giữ danh sách, **bỏ dấu "đã uống"** | Cache React Query giữ `taken` của ngày cũ tới khi đọc lại | sửa lỗi RN | nên làm theo | #570 | A |
| Thực phẩm bổ sung — câu khi rỗng | Giữ nguyên chữ RN ("Thêm stack của bạn trên bản web") | Câu cũ dù màn đã có nút "+" | (chưa sửa — ghi để quyết) | chờ quyết: đổi chữ ở cả hai | #570 | A |
| Thực phẩm bổ sung — kết quả thêm / xoá | Hộp thoại + VoiceOver | `Alert` / `toast` | lệch nền tảng | không cần | #570 | A |
| `daily_logs.water_ml` | Như RN: ghi nước KHÔNG dựng lại ngày | Như native | (lỗ chung, ghi để quyết) | chờ quyết: dựng lại sau khi ghi nước ở cả hai | #568 | A |
| Quãng nghỉ — nút tạm dừng | Có ở CẢ thẻ trong app lẫn Dynamic Island | 02/10 chỉ có trên Island, gỡ 03/10 | cải tiến | chờ quyết | #523 | (xem PARITY_MATRIX) |
| Tổng kết tuần — lời khuyên ACWR | Theo đúng băng `acwrZone` (0.65 / 0.8 / 1.3 / 1.6) mà thẻ sẵn sàng Today tô màu (`WeeklyReview.acwrAdvice`); test ghim 4 ca lệch: 0.6, 0.62 → "thấp"; 1.55, 1.6 → "hơi cao" | `weekly-review.tsx:480-497`: ngưỡng riêng > 1.5 / > 1.3 / < 0.6 — 1.55 bảo "giảm 15–20%" khi Today tô vàng; 0.6–0.65 im lặng khi Today tô đỏ | sửa lỗi RN (Kiệt giao E chốt, #527) | nên làm theo | #569 | E |
| Tổng kết tuần — một nguồn đọc hỏng | Cả tuần báo lỗi, có thử lại; đọc lại hỏng khi đã có số của đúng tuần thì giữ số | Mỗi query riêng; phần hỏng rỗng → ô số / biểu đồ vẽ như 0 | sửa lỗi RN | nên làm theo | #569 | E |
| Tổng kết tuần — ô thực phẩm bổ sung | Ẩn ô khi tỉ lệ không hữu hạn | Ô hỏng (chuỗi không phải số) → `NaN%` | sửa lỗi RN | nên làm theo | #569 | E |
| Tổng kết tuần — câu khuyến nghị | Chuỗi dịch đủ vi / en / es (`wr.rec.*`) | `L(vi, en)` — bản es hiện tiếng Anh | sửa lỗi RN | nên làm theo | #569 | E |
| Tổng kết tuần — lỗi phân tích AI | Lỗi hiện trong thẻ, có thử lại; chữ theo `AI_FAILURE_KEY` | `Alert.alert` (`weekly-review.tsx:350`) | lệch nền tảng | không cần | #572 | E |
| Thử thách tuần — đo tiến độ khi đọc hỏng | Bỏ qua thử thách đó, không ghi; báo "chưa đo lại được" (`WeeklyChallengesBook.refreshProgress`) | `use-extras.ts:551-645`: lỗi đọc bị bỏ qua → `newValue` 0 → **ghi đè tiến độ thật thành 0** (mất dữ liệu) | sửa lỗi RN | nên làm theo (mất dữ liệu trên Android) | #566 | E |
| Thử thách tuần — gieo tuần | Chỉ gieo các thử thách còn thiếu; trùng (23505) coi là đã có; đọc hỏng thì không gieo | `useInitWeeklyChallenges` (`use-extras.ts:424-462`): tuần đã có ≥ 1 hàng thì không gieo gì — tuần gieo dở thiếu mãi; đếm hỏng (`count` rỗng) bị đọc là 0 → chèn lại cả bộ | sửa lỗi RN | nên làm theo | #566 | E |
| Huy chương — màn đọc hỏng | Màn lỗi có thử lại | Vẽ như chưa có huy chương nào | sửa lỗi RN | nên làm theo | #563 | E |
| Thẻ ăn mừng — Reduce Motion | Không pháo giấy, đĩa không xoay-nảy | `award-celebration.tsx`: pháo giấy + xoay-nảy luôn chạy | cải tiến (a11y) | nên làm theo (`useReducedMotion`) | #567 | E |
| Thẻ ăn mừng — VoiceOver / ngôn ngữ | Đọc "Huy chương mới! <tên>" khi hiện; kicker + nhãn hạng vi / en / es | Không đọc gì; kicker chỉ vi ("Huy Chương Mới!") còn lại tiếng Anh; nhãn hạng luôn tiếng Anh | cải tiến (a11y, i18n) | nên làm theo | #567 | E |
| Xu hướng sẵn sàng 7 ngày — chữ | Chuỗi dịch đủ vi / en / es (`rt.*`) | TB / Cao nhất / chú giải `lang === 'vi' ? … : …` — bản es hiện tiếng Anh | sửa lỗi RN | nên làm theo | #571 | E |
| Ghi cân nặng — giao diện | Thước + số to; không vẽ hình chiếc cân (`BodyScaleFigure`) và hai nhãn mép cửa sổ thước | Có hình cân sáng lên khi kéo + nhãn mép | lệch nền tảng (rút gọn trang trí, không đổi hành vi) | không cần | #576 | A |
| Ghi cân nặng — Apple Health | Chưa ghi ngược | `writeBodyMassToHealth` sau khi lưu | (thiếu — guardrail HealthKit, chờ owner) | không cần | #576 | A |
| AI Coach — tiêu đề cuộc trò chuyện | 50 đơn vị UTF-16 đầu như RN, nhưng bỏ nửa emoji bị cắt (`Coach.title`) | `text.slice(0, 50)` có thể để lại nửa cặp surrogate → ký tự hỏng cuối tiêu đề trong lịch sử | sửa lỗi RN | nên làm theo | #527 (`native/ios-rewrite`) | E |
| AI Coach — lỗi lượt gửi | Chữ lỗi ngay dưới cuộc trò chuyện, theo 6 loại của `AI_FAILURE_KEY` | `Alert` | lệch nền tảng | không cần | #527 (`native/ios-rewrite`) | E |
| AI Coach — nút "Cuộc trò chuyện mới" | Chuỗi dịch đủ vi / en / es (`coach.newChat`) | `vi ? 'Trò chuyện mới' : 'New chat'` — bản es hiện tiếng Anh | sửa lỗi RN | nên làm theo | #527 (`native/ios-rewrite`) | E |
| AI Coach — lịch sử đọc hỏng | Màn lỗi có thử lại | `conversations` không có → hiện "Chưa có cuộc trò chuyện nào" | sửa lỗi RN | nên làm theo | #527 (`native/ios-rewrite`) | E |
| AI Coach — nút xoá trong lịch sử | VoiceOver đọc "Xoá <tiêu đề>" | Chỉ "Xoá" — một cột nút cùng tên | cải tiến (a11y) | nên làm theo | #527 (`native/ios-rewrite`) | E |
| Chip gợi ý Trợ lý / AI Coach — tiếng Tây Ban Nha | Chip và câu hỏi có bản es (`AssistantSuggestions.Text3`) | `Bilingual.es` để trống → `s.question[lang] ?? s.question.en`: người dùng es thấy và GỬI câu tiếng Anh | sửa lỗi RN | nên làm theo | #527 (`native/ios-rewrite`) | E |
| Chip gợi ý — số bước trong câu | Nhóm theo ngôn ngữ của câu (vi "3.250", en "3,250") | `toLocaleString()` theo locale của máy, có thể khác ngôn ngữ của câu | cải tiến | tuỳ | #527 (`native/ios-rewrite`) | E |
| Chip gợi ý — ngày buổi tập hỏng | `date_time` không đọc được → coi như chưa có buổi (không chip "nghỉ lâu" / "sau buổi tập") | `daysSince` ra `NaN` — cùng kết quả, không đổi hành vi | ghi chú | không cần | #527 (`native/ios-rewrite`) | E |
| Coach nhớ gì — ngôn ngữ / ngày | Chữ đủ vi / en / es; "Nhắc lần cuối" theo định dạng ngày của ngôn ngữ app | `vi ? … : …` — bản es hiện tiếng Anh; ngày dạng `YYYY-MM-DD` | sửa lỗi RN | nên làm theo | #527 (`native/ios-rewrite`) | E |
| Coach nhớ gì — đọc hỏng | Màn lỗi có nút thử lại (kéo để đọc lại vẫn có) | Chỉ chữ "Kéo xuống để thử lại" | cải tiến | tuỳ | #527 (`native/ios-rewrite`) | E |
| Coach nhớ gì — xoá một | Lệnh xoá lọc thêm `user_id` (ngoài RLS) | `.delete().eq('id', id)` — dựa hoàn toàn vào RLS | cải tiến (phòng thủ) | tuỳ | #527 (`native/ios-rewrite`) | E |
| Coach nhớ gì — lối vào | Nút ở thanh trên của màn chat (tạm, tới khi có bảng điều khiển tab Trợ lý) | Hàng "Coach nhớ gì" trên tab Trợ lý | tạm thời | không cần | #527 (`native/ios-rewrite`) | E |
| Tóm tắt Trợ lý — ăn đúng mục tiêu calo | Dòng riêng "Hôm nay bạn đã ăn đúng mục tiêu calo." (`kcal-on`) | `left > 0 ? … : …` → "Bạn đã vượt mục tiêu calo hôm nay khoảng -0 kcal." | sửa lỗi RN | nên làm theo | #527 (`native/ios-rewrite`) | E |
| Tóm tắt Trợ lý — tiếng Tây Ban Nha | Lời chào + các dòng có bản es (số nhóm theo CLDR es) | `Bilingual` vi / en — es hiện tiếng Anh | sửa lỗi RN | nên làm theo | #527 (`native/ios-rewrite`) | E |
| Coach nhớ gì — lối vào (cập nhật dòng "tạm" ở trên) | Về đúng chỗ của RN: ô "Coach nhớ gì" trong lưới công cụ của tab Trợ lý; nút tạm trên chat đã gỡ | Ô trong lưới công cụ | như RN | — | #527 (`native/ios-rewrite`) | E |
| Nhật ký bữa ăn — sau khi sửa | Đọc lại từ server (nút khoá trong lúc chạy); không vá danh sách lạc quan rồi hoàn lại | `patchDiary` lạc quan + `rollbackUnlessRebuilt` + `invalidate` | lệch nền tảng (đơn giản hoá) | không cần | #527 (`native/ios-rewrite`) | A |
| Nhật ký bữa ăn — xoá cả bữa | Nút "Xoá bữa" trong thẻ đã mở + hành động VoiceOver | Vuốt trái thẻ bữa (+ hành động VoiceOver) | lệch nền tảng | không cần | #527 (`native/ios-rewrite`) | A |
| Nhật ký bữa ăn — xoá nhiều món mà một món hỏng | Dừng ở món hỏng, báo lỗi, vẫn dựng lại ngày cho các món đã xoá | Bắn N lệnh song song; mỗi lệnh tự dựng lại ngày | cải tiến (ít lần dựng lại) | tuỳ | #527 (`native/ios-rewrite`) | A |
| Nhật ký bữa ăn — câu khi ngày rỗng | "Chưa ghi bữa nào hôm nay" — không mời "nhấn để ghi" vì `log-meal` chưa port | Thẻ rỗng mở `log-meal` | (thiếu — chờ port `log-meal`) | không cần | #527 (`native/ios-rewrite`) | A |
| Bảng chỉ số Trợ lý — chữ | "1 day" (không "1 days"); trung bình 7 giờ 59,6 phút → "8 giờ" (không "7 giờ 60 phút"); có bản es | `${n} days` cố định ở câu hỏi sẵn sàng; `Math.round(min % 60)` có thể ra 60; `Bilingual` vi / en | sửa lỗi RN | nên làm theo | #527 (`native/ios-rewrite`) | E |
| Bảng chỉ số Trợ lý — đọc hỏng | Bảng lỗi có thử lại; đọc lại hỏng khi đã có số thì giữ số | `data` không có → `points = []` → "Chưa có ngày nào được ghi trong tuần này" | sửa lỗi RN | nên làm theo | #527 (`native/ios-rewrite`) | E |
| Insight hôm nay — lỗi / bộ nhớ đệm | Lỗi nói rõ loại (`AI_FAILURE_KEY`) dưới "chạm để thử lại"; bộ nhớ đệm bền chỉ giữ MỘT kết quả (khoá có người dùng · ngày · ngôn ngữ · dấu) | Chỉ "Chưa đọc được hôm nay. Chạm để thử lại."; persister giữ mọi khoá tới 24 giờ | cải tiến | tuỳ | #527 (`native/ios-rewrite`) | E |
| Vận động — mục tiêu bước | Nhớ theo tài khoản (khoá `ascnd-steps-goal.<userId>`); nhiệm vụ bước của phòng linh vật chấm theo đúng mục tiêu này | Một khoá chung `ascnd-steps-goal`, xoá khi đổi người (`onUserScopedReset`) | cải tiến | tuỳ | #527 (`native/ios-rewrite`) | E |
| Vận động — đọc hỏng | Màn lỗi có thử lại; đọc lại hỏng khi đã có số thì giữ số | `data` không có → vẽ 0 bước, TB 0, xu thế 0 % | sửa lỗi RN | nên làm theo | #527 (`native/ios-rewrite`) | E |
| Ghi bữa ăn — lúc lưu | Vào hàng đợi rồi đóng màn ngay cả khi có mạng ("Đã lưu bữa ăn!"); hàng đợi gửi liền sau đó, lỗi thì tự thử lại | Có mạng: chờ server rồi mới đóng (`onSuccess`); mất mạng: đóng ngay | lệch nền tảng (đơn giản hoá) | không cần | #527 (`native/ios-rewrite`) | A |
| Ghi bữa ăn — tìm món lỗi mạng | Nói "không tải được" dưới ô tìm | `useQuery` lỗi → danh sách trống, không nói gì | sửa lỗi RN | nên làm theo | #527 (`native/ios-rewrite`) | A |
| Ghi bữa ăn — phần chưa port | Chưa có gợi ý AI, quét ảnh / mã vạch, món yêu thích, "Ăn lại bữa trước", sửa macro một món đã thêm | Có | (thiếu — lát sau) | không cần | #527 (`native/ios-rewrite`) | A |
| Nhật ký bữa ăn — câu khi ngày rỗng (cập nhật dòng "thiếu" ở trên) | Về đúng RN: thẻ rỗng "… — nhấn để ghi" mở màn ghi bữa cho ngày đang xem | Như native | (đã đóng) | không cần | #527 (`native/ios-rewrite`) | A |
| Nhật ký bữa ăn — bữa vừa ghi hiện ra | Sổ đọc lại mỗi lần hàng đợi vơi đi | `invalidate` lúc lưu (online) / lúc phát lại | lệch nền tảng | không cần | #527 (`native/ios-rewrite`) | A |
| Giấc ngủ — nợ ngủ | Nợ ngủ = mục tiêu × số đêm ĐÃ GHI − tổng giờ ngủ (golden ghim cả hai bản; 7 đêm thì trùng RN) | `targetHours * 7 − tổng`: hai đêm được ghi thành "nợ 42 giờ" + lời khuyên ngủ bù | sửa lỗi RN | nên làm theo | #527 (`native/ios-rewrite`) | E |
| Giấc ngủ — trống / màu tầng | Trống không có nút "Ghi giấc ngủ" (`log-sleep` chưa port), lời nhắc đồng bộ Apple Health; màu tầng theo bảng DS | Nút sang `/log-sleep`; dải màu `useSleepRamp` | tạm thời | không cần | #527 (`native/ios-rewrite`) | E |
| Hiệu chỉnh mục tiêu — đọc hỏng | Bất kỳ lượt đọc nào (cân / `daily_logs` / hồ sơ) hỏng lần đầu → màn lỗi có thử lại; đọc lại hỏng giữ số cũ | Chỉ hồ sơ hỏng mới báo lỗi; cân / nhật ký hỏng thì vẽ "cần ít nhất 3 ngày ghi cân" / "chưa có dữ liệu dinh dưỡng" — bảo người ta ghi thứ họ đã ghi | sửa lỗi RN | nên làm theo | #527 (`native/ios-rewrite`) | E |
| Hiệu chỉnh mục tiêu — chữ | "tuần" / "ngày" dịch cả tiếng Tây Ban Nha; số kcal có phân cách hàng nghìn theo ngôn ngữ app; mục tiêu lạ thì không vẽ viên trống | `lang === 'vi' ? 'tuần' : 'week'` (es ra tiếng Anh); "2200 kcal"; viên rỗng khi `goal` không thuộc 6 giá trị | sửa lỗi RN | nên làm theo | #527 (`native/ios-rewrite`) | E |
| TDEE đo được — số vô hạn | Một ngày ăn / lần cân là ±∞ bị bỏ như số ≤ 0 | `Infinity` đi qua → `measured` = ±∞ / NaN (Swift `Int(∞)` sập app) | lệch nền tảng | không cần (cột `numeric`, không có đường thật) | #527 (`native/ios-rewrite`) | E |
| Số đo cơ thể — trục ngày | Đường của mỗi số đo theo cột `date` của bảng, đọc thẳng là ngày lịch | Đọc `r.measured_at` — cột không tồn tại → mọi điểm ra ngày `NaN-NaN-NaN` (biểu đồ ẩn nhãn nên không ai thấy); nếu sửa sang `date` mà vẫn qua `new Date('YYYY-MM-DD')` thì lùi một ngày ở múi giờ âm | sửa lỗi RN | nên làm theo | #527 (`native/ios-rewrite`) | E |
| Số đo cơ thể — 24 lần nào | 24 lần đo MỚI nhất (`order(date desc).limit(24)` rồi đảo lại) | `order(date asc).limit(24)` = 24 lần CŨ nhất: từ lần đo thứ 25, số mới nhất và chênh lệch trên màn không bao giờ đổi nữa | sửa lỗi RN | nên làm theo | #527 (`native/ios-rewrite`) | E |
| Ghi bữa ăn — phần chưa port (cập nhật dòng ở trên) | Đã có món yêu thích, "Ăn lại bữa này", sửa macro một món; còn thiếu gợi ý AI, quét ảnh / mã vạch, đánh / bỏ sao ở màn này | Có | (thiếu — lát sau) | không cần | #527 (`native/ios-rewrite`) | A |
| Ghi bữa ăn — ba lượt đọc gợi ý | Món gần đây / yêu thích / bữa gần đây đọc song song và độc lập: một lượt hỏng chỉ mất đúng hàng gợi ý ấy | Ba `useQuery` riêng — như nhau | lệch nền tảng | không cần | #527 (`native/ios-rewrite`) | A |
| Cửa hàng — mặc / cởi khi mất mạng | Chỉ khi có mạng: áp ngay trên máy, gửi đặt tuyệt đối cả nhóm, hỏng (mất mạng) thì trả lại như trước và báo "cửa hàng cần mạng" | Lớp Trạng thái (#165): ý mặc chờ mạng về rồi gửi | tạm thời (native chưa có lớp Trạng thái — StateWriter #161 chờ owner) | không cần | #527 (`native/ios-rewrite`) | E |
| Cửa hàng — không có cảnh Koa | Danh sách thẻ món (tên, độ hiếm theo màu DS, giá, khoá cấp, Mặc / Cởi / Dùng); màn mở ở tab Trang phục; thẻ bộ sưu tập là tấm riêng | `ShopScene` (camera qua phòng thử đồ, xem trước món trên người Koa), tab "Toàn cảnh" mở đầu, thẻ lật trang | tạm thời (native chưa có bản vẽ Koa) | không cần | #527 (`native/ios-rewrite`) | E |
| Thực phẩm — nút sao | Chưa có (chỉ hiện sao trên món đã yêu thích) | `useToggleFavoriteFood` qua lớp Trạng thái #161; sao món mẫu chung = nhân bản thành món riêng | (thiếu — chờ chốt owner #161) | không cần | #527 (`native/ios-rewrite`) | A |
| Thực phẩm — lưu món gần đây / thêm / sửa / xoá xong | Đọc lại thư viện từ server (nút khoá trong lúc chạy) | `invalidateFoodQueries` | lệch nền tảng | không cần | #527 (`native/ios-rewrite`) | A |
| Thực phẩm — mất mạng khi lưu món gần đây | Hộp thoại "cần có mạng" | `toast.fail` | lệch nền tảng | không cần | #527 (`native/ios-rewrite`) | A |

Thêm dòng mới ở cuối bảng; giữ dòng cũ — sổ là lịch sử, không phải danh sách việc.
