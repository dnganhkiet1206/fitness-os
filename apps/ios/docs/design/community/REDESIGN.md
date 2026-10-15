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

## 15/10 — chia sẻ thành ảnh, chạm hai lần để thích
- **Chia sẻ thành ảnh**: nút chia sẻ gửi ẢNH PNG của chính thẻ (`PostShareImage`: `PostCardView(forShare:)` không nút, dải "ASCND · Tập cùng mình trên ASCND", 3×) kèm chữ như trước; khung xem trước của bảng chia sẻ là chính ảnh ấy. Ảnh minh hoạ tải mạng không vẽ (mặt màu là hình).
- **Chạm hai lần để thích**: tim trắng lớn giữa thẻ + rung; chỉ BẬT (không bỏ thích), nút tim ở đáy vẫn bật / tắt. Bảng tin: chạm một lần mở bài (chờ phân biệt với chạm hai lần, như Instagram); có hành động VoiceOver "Thích".

## Thẻ bài kiểu "bài đăng" (15/10)

Chủ dự án: "thiên về bài đăng một tí kiểu apple style mà vẫn có yếu tố gym aesthetics".
- Mặt trắng (`DS.Color.card`), bo 22, viền mảnh + bóng nhẹ; chế độ tối dùng mặt card tối.
- Đầu thẻ: avatar · tên · thời gian; dòng dưới là loại bài · tiêu đề · "Chỉ người theo dõi".
- Lời người đăng đứng TRƯỚC tệp đính kèm (16pt).
- Buổi tập: "bảng điểm" than cố định (`PostTint.board`) — tên buổi chữ hoa giãn, viên PR vàng, ba số lớn ngăn bằng vạch mảnh, các bài dạng mono.
- Tiến bộ / công thức: mặt lõm sáng, nhãn chữ hoa màu loại bài (`PostTint.ink`), số lớn.
- Ảnh minh hoạ chỉ hiện khi bài có ảnh. Thêm vào bữa / Thử buổi này là viên mảnh màu loại bài.
- Giữ: chạm hai lần để thích, ảnh chia sẻ (`forShare`), menu ⋯.

## Feed kiểu Apple News pha Instagram (15/10)

Chủ dự án: mỗi bài "được phân loại là sức khoẻ, đồ ăn hay các thứ thuộc hệ thống của
ASCND và có logo phân loại như apple news, có xếp hạng trending", sắp xếp "pha trộn
tinh tế giữa apple news và instagram". Duyệt mock v2.

- **Chuyên mục** (`CommunityLayout.Category`, ASCNDCore): tiến bộ → Sức khoẻ (thép,
  `waveform.path.ecg`), công thức → Đồ ăn (cam, `fork.knife`), buổi tập → ASCND (hồng,
  tam giác). Dải chuyên mục trên đầu mỗi thẻ (`CategoryBand`).
- **Thịnh hành** (chỉ Khám phá): điểm = (thích + 2·bình luận + 3·lưu) / (giờ + 2)^1.5,
  bài ≤ 72 giờ, chưa có tương tác thì không vào. Top 3: số 1 là thẻ lớn, 2–3 là danh
  sách đánh số. Chốt theo mỗi lần tải feed để thích / bỏ thích không làm bài nhảy chỗ.
  Chỉ tính trên các bài đã tải — xếp hạng toàn cộng đồng cần server (xem ARTICLES-PLAN §7).
- **Nhịp**: thẻ lớn (bài "mạnh": PR / có số / có ảnh / ≥ 3 tương tác; không thì thẻ
  hàng) → 2 thẻ hàng → lưới 2 cột → lặp. Hai bài cùng chuyên mục không đứng liền nhau
  (nhìn trước 3 bài, gần đúng thứ tự thời gian).
- **Thẻ**: tiêu đề đậm = lời người đăng (không có thì tên buổi / món / "Tiến trình N tuần");
  "ảnh" = ảnh thật nếu có, không thì mảng màu chuyên mục + số lớn (bảng điểm than cho
  buổi tập, cam + kcal cho món, thép + chênh lệch + đường cho tiến bộ). Đáy: thời gian,
  tim (chạm = thích, không mở bài), "⋯". Chạm phần trên mở bài; màn chi tiết vẫn là
  `PostCardView` đầy đủ.

### "Ảnh" khi bài chưa có ảnh — gym premium (15/10)

Chủ dự án: "thẻ nhìn hơi đơn điệu… thay vì màu plain thì cho một vài hiệu ứng", "làm theo
kiểu gym premium aesthetics". Lớp từ dưới lên (`ArtBackdrop`): lưới chuyển màu tối trầm
ánh màu chuyên mục (MeshGradient; điểm giữa lệch theo id bài nên mỗi thẻ hơi khác) →
biểu tượng lớn chìm xoay nghiêng → sáng trên / tối dưới → quầng "đèn phòng tập" màu
chuyên mục từ góc trên → hạt nhám rất nhẹ (cố định theo id, không nhấp nháy) → viền kim
loại mảnh. Số lớn chữ hẹp đậm (`.condensed`), nhãn trên kính mờ. Theo dữ liệu: tiến bộ =
đường trắng + vùng sáng + điểm cuối phát sáng; món = vòng ba chất + kcal + viên P/C/F;
buổi tập = khối lượng nâng + "N bài · M phút" + PR vàng.

### Ánh sáng môi trường cho thẻ (15/10)

Chủ dự án: "làm ambient light cho mấy cái thẻ đỡ có cảm giác thẻ bị cứng". `NewsCardSurface(kind:)`:
màu "đèn" của ảnh (`ArtBackdrop.glow`) tràn nhẹ xuống mặt chữ (radial từ trên, 10% sáng / 22%
tối); quầng màu mờ dưới thẻ như ánh sáng hắt lên mặt bàn (blur 26, 28% sáng / 38% tối); viền
trên sáng hơn viền dưới như mép kính bắt sáng. Danh sách Thịnh hành giữ mặt trung tính.

### Ảnh liền khối, nhoè dần; logo ASCND (15/10)

- Chủ dự án: "thay vì một đường thẳng cắt ngay thì làm blur", "làm cho ảnh blur chứ bạn thêm lớp phủ
  nhìn không tự nhiên". Thẻ lớn và thẻ lưới: ảnh trải cả thẻ, dải chuyên mục + phần chữ (chữ sáng,
  `colorScheme(.dark)`) nằm trên chính ảnh; từ đáy vùng nội dung trở xuống là bản nhoè của chính ảnh
  hiện dần (`ProgressiveBlur`) — không phủ màu, không đường cắt. Thẻ hàng giữ ảnh vuông trong mặt trắng.
- Gỡ quầng màu phía sau thẻ (chủ dự án: "gỡ ambient light sau thẻ").
- Chuyên mục ASCND dùng logo thương hiệu `BrandMark` (`CategoryGlyph`) thay tam giác; dải ảnh chia sẻ cũng vậy.

### Bình luận ngay trên thẻ, tên lớn mở hồ sơ, nút Thử trở lại (15/10)

- Nút bình luận ở đáy thẻ → `CommunityCommentsSheet`: nửa màn (kéo được cả màn), mặt kính
  `.regularMaterial`, bo 32, tiêu đề "Bình luận · N" ở giữa, nút đóng; dùng lại `CommunityPostView`
  (`commentsOnly`) nên luồng / trả lời / menu / thanh viết y như màn bài. Thanh viết mới: ô bo 20 + nút
  gửi tròn đặc (cả màn bài).
- Tên người đăng 16pt semibold, avatar 26, chạm mở trang cá nhân (`openCommunityUser`).
- "Thử" (buổi tập của người khác) / "Thêm vào bữa" (công thức) ở đáy thẻ (`FooterPill`).
- Nhắn tin: chưa có backend — xem `MESSAGING-PLAN.md`.
- (15/10, sau) Chủ dự án: "cho nút thử nằm ngay trên thẻ luôn" → `CardAction`: thẻ lớn đặt viên kính mờ
  "Thử buổi này" / "Thêm vào bữa" ngay trên ảnh, góc dưới phải vùng số; thẻ hàng đặt viên đặc dưới tiêu
  đề. Bỏ khỏi đáy thẻ. Vẫn theo `CommunityTry.offered` (không hiện trên bài của chính mình).
- (15/10, sau) Chủ dự án: "màn này giờ thừa rồi gỡ đi" (màn "Bài đăng" mở từ feed). Feed không còn đẩy
  sang `CommunityPostScreen`: chạm thẻ = mở màn bình luận bật lên; dòng Thịnh hành 2–3 (bài chỉ là một
  dòng) mở màn bật lên KÈM thẻ đầy đủ (`showsPost`). Màn bài vẫn giữ cho Hộp thư, Tìm kiếm, Đã lưu, Trang
  cá nhân và ô "Hữu ích" — những nơi đó bài chỉ hiện thu gọn.
- (15/10, sau) Chủ dự án: "thêm nút đăng bài hiện chưa có" (ba viên màu Buổi tập · Tiến bộ · Món trông như
  bộ lọc). Thay bằng hàng đăng bài kiểu Threads: avatar + "Hôm nay bạn tập gì?" + nút "+" tròn đặc; cả hàng
  là `Menu` ba loại bài → đúng ba màn đăng cũ. Không thêm "+" ở đầu trang (bốn nút làm tiêu đề xuống dòng).

## Trang cá nhân — "thẻ vận động viên" (15/10)

Chủ dự án: mock đầu "hơi giống tiktok, sửa lại cho khác biệt" → duyệt bản thẻ vận động viên.
- Thẻ tối kiểu thẻ thành viên phòng tập, nền `ArtBackdrop` như feed (lưới tối, quầng hồng, hạt nhám,
  logo BrandMark): "ASCND · VẬN ĐỘNG VIÊN", avatar, tên, @handle; ba số bảng điểm CHỈ từ dữ liệu server
  có: bài · người theo dõi · lượt người khác thử buổi tập.
- Hàng nút: một nút dài + nút tròn. Của mình: Sửa hồ sơ · Đã lưu · Quyền riêng tư · Chia sẻ. Người khác:
  Theo dõi (đen đặc) · Chia sẻ. Nhắn tin chờ server (MESSAGING-PLAN.md) — chưa có nút.
- Dưới thẻ: tiểu sử, "Đang theo dõi N", Huy hiệu; "Bài đăng" là thẻ hàng kiểu Apple News như feed.
- Chưa làm (cần dữ liệu): chuỗi ngày / kỷ lục / nhịp tập 4 tuần — với người khác cần server có "chỉ số
  công khai"; với chính mình có thể lấy từ app, làm lô sau.
- (15/10, sau) Chủ dự án: "nền đang bị trùng với bài đăng" → thẻ dùng `PassMaterial` riêng: kim loại đen
  đơn sắc (than → đen), vân xước chéo rất mảnh, logo ASCND dập chìm cỡ lớn, vệt sáng chéo, viền ánh bạc.
  Không màu chuyên mục, không biểu tượng dụng cụ.
- (15/10, sau) Chủ dự án: "trang cá nhân vẫn có nhiều chỗ lệch tông" → đồng bộ: nút phụ (Sửa hồ sơ / Đang
  theo dõi / Bỏ tắt tiếng) cùng họ nút tròn (mặt thẻ trắng + viền mảnh); tiểu sử + "Đang theo dõi N" vào
  trong thẻ; huy hiệu viên trắng; lọc loại bài = viên chữ (đang chọn đen đặc) thay segmented hệ thống;
  tiêu đề mục 20pt bold; nền `TodayAmbient` + che thanh trạng thái như feed; bỏ tiêu đề "@handle" lặp;
  thẻ bài trên trang cá nhân không lặp tác giả (`RowPostCard(showsAuthor: false)`).
- (15/10, sau) Cải thiện trang cá nhân (chủ dự án: "làm đi"):
  - Của mình: mục "Tập luyện" — chuỗi ngày (cùng số với 🔥 ở Hôm nay, `MascotRoomController.streak`), buổi
    tháng này, buổi có kỷ lục trong 90 ngày (`ProfileTraining`, ASCNDCore, từ `HistoryBook` trên máy), nhịp
    tập 28 ngày (2 × 14 ô hồng, đậm dần về gần đây), "Huy chương gần đây" (dùng lại `RecentAwardsCard` →
    `AwardsView`).
  - Bài đăng: lưới 2 cột `GridPostCard` (ảnh lớn) thay thẻ hàng.
  - Chạm avatar trên thẻ của mình → Sửa hồ sơ (đổi linh vật).
  - Chia sẻ hồ sơ = ẢNH của thẻ vận động viên (`PassShareImage`, `AthletePassCard` dùng chung).
  - Chưa làm: trạng thái "mới bắt đầu" thay các số 0.
- (15/10, sau) Việc còn dở (chủ dự án: "ok làm đi"):
  - Trang cá nhân có tiêu đề lớn "Hồ sơ" (chủ dự án: "tiêu đề của trang này chưa có").
  - Trang của mình chưa có bài: thẻ mời "Chia sẻ buổi tập đầu tiên" thay một dòng chữ.
  - Mọi nơi còn đẩy sang màn "Bài đăng" (Hộp thư, Tìm kiếm, Đã lưu, ô Hữu ích, lưới trang cá nhân) nay mở
    màn bật lên (`communityPostSheet`): kèm thẻ khi nơi mở chưa hiện cả bài, chỉ bình luận khi đã hiện.
  - Bài buổi tập của CHÍNH MÌNH có nút "Thử lại" (người khác: "Thử buổi tập" — đổi từ "Thử workout" theo chủ
    dự án): cùng lõi chép template, KHÔNG ghi lượt thử (`CommunityTry.redo`, có test).
- (15/10, sau) Chủ dự án: "nút tim, bình luận đang nhỏ quá khó bấm" → biểu tượng 21pt, số 15pt, vùng chạm
  ≥ 52 × 48; "⋯" 17pt trong 44 × 48. "Nút tim và bình luận không nên xuất hiện trong mục đăng bài" →
  `PostCardView(preview: true)` ở ba màn đăng: không có hàng tim / bình luận / lưu.
- (15/10, sau) Chủ dự án: "thanh đang theo dõi và khám phá khi cuộn thì giữ lại… vuốt sang để sang trang" →
  thanh chọn trang là header GHIM của section feed (nền kính `.bar` khi đã cuộn qua đầu); vuốt ngang rõ ràng
  (|dx| > 70, ngang hơn dọc 1.6×) trên feed: trái → Khám phá, phải → Đang theo dõi, có rung nhẹ.
- (15/10, sau) Chủ dự án: "nút thử lại màu đỏ như bị lỗi" → "Thử lại / Thử buổi tập / Thêm vào bữa" trên thẻ
  đầy đủ là viên đặc trung tính (màu chữ chính, chữ màu nền), không dùng màu hồng/đỏ của loại bài.
- (15/10, sau) "Thử lại" → "Thử lại buổi này" (en "Do this session again"); icon mũi tên vòng (giống "thử lại
  khi lỗi") → `figure.strengthtraining.traditional` cho cả "Thử buổi tập". Thẻ lớn: nút nằm dưới tiêu đề, căn
  trái như thẻ hàng (trước nổi giữa vùng số). Gộp hai `onScrollGeometryChange` của feed thành một — hai cái
  làm `statusBarScrim` mất tín hiệu cuộn (tiêu đề chồng lên đồng hồ).
