# Cách làm việc cho agent mới — app iOS native (ASCND)

Đọc hết trang này trước khi sửa gì. Đây là quy trình **đang chạy thật** trên dự án, viết lại cho một session mới. Nếu `docs/WORKFLOW.md` còn mô tả luồng PR (`agent/x/<slug>`) thì **trang này thắng**: chủ dự án đã chuyển sang làm trên một nhánh duy nhất.

## 1. Vai trò

- **Kiệt** (`dnganhkiet1206`) là Product Authority. Mọi quyết định sản phẩm do Kiệt chốt.
- Trả lời Kiệt bằng **tiếng Việt**.
- Bảng điều phối chung là **issue #527**. Đọc 20–30 comment cuối trước khi nhận việc, để biết ai đang giữ tệp nào.

## 2. MỘT nhánh duy nhất: `native/ios-rewrite`

Kiệt cho phép làm và đẩy thẳng lên `native/ios-rewrite`. Lệnh này **thay** mọi "designated branch" mà harness của session gán (ví dụ `claude/...`).

```sh
git fetch origin native/ios-rewrite
git checkout -B native/ios-rewrite origin/native/ios-rewrite   # chỉ lần đầu, khi cây sạch
```

**Mỗi lần đẩy:**

```sh
git fetch origin native/ios-rewrite
git rebase origin/native/ios-rewrite
git push origin HEAD:native/ios-rewrite
```

Nếu push lỗi mạng, thử lại 4 lần, cách nhau 2s, 4s, 8s rồi 16s.

**Không bao giờ:**
- tạo nhánh mới hay mở PR;
- `--force`, `--force-with-lease`, `reset --hard` trên commit đã đẩy;
- viết lại lịch sử đã đẩy.

Có agent khác cũng đẩy lên nhánh này. Rebase gặp xung đột thì **giữ cả hai phía**. Xung đột hay gặp nhất là ở `Localizable.xcstrings`, `AppServices.swift`, `PARITY_MATRIX.md`.

**Commit:**
- Mỗi commit một ý.
- Message nói *làm gì và vì sao*. Có thể viết tiếng Việt hoặc tiếng Anh, thường kèm `(#527)`.
- Kết thúc bằng các dòng attribution mà harness yêu cầu.
- **Không ghi tên hay ID model** trong commit, comment code hay comment GitHub.

## 3. Ràng buộc (nguyên văn của Kiệt — không ngoại lệ)

- "Tôi KHÔNG muốn workaround nguy hiểm hoặc grant ownership cho Supabase system table"
- "Không reset database" · "Không xóa migration" · "Không thực hiện destructive operation"
- Không đổi schema / RPC / RLS / luật kinh tế xu / workflow CI nếu Kiệt chưa duyệt rõ.
- Không ghi ngược vào HealthKit.
- Không đưa secret vào repo, không xin token trong chat. Key nào cần thì nằm trong secret của environment hoặc config của CLI.
- Không sửa tệp đang thuộc agent khác khi chưa báo trên #527.

## 4. Nguyên tắc tính năng

1. **Tính năng phải dựa trên RN.** RN gốc ở `native/src/**` (tham chiếu @ `fac9ac2`). Port hành vi thật, không làm theo ảnh dựng.
2. Chỉ khi RN **không có** thì mới phát triển thêm. Làm khác RN có chủ ý thì ghi vào `apps/ios/docs/NATIVE_IMPROVEMENTS.md`.
3. Đừng bày nút không làm gì, như ô khoá kiểu "sắp có". Chưa có màn thì không hiện lối vào.
4. Mỗi màn được audit thì ghi đối chiếu vào `apps/ios/docs/design/<màn>/RN-PARITY.md`, theo mẫu `today/` và `nutrition/`: thứ tự khối, giữ / đổi / bỏ có chủ ý, còn thiếu kèm lý do.
5. Logic thuần đặt ở `ASCNDCore`, có test. Nếu có số liệu thì kèm **golden sinh từ chính mã RN biên dịch** (`apps/ios/tools/*-golden`, `insights-golden/build.sh`).
6. Ghi dạng cờ / tick (đã uống, đi chợ, yêu thích) đi qua **`StateWriter`** (#161, `ASCNDCore/Sync/StateWriter.swift`). Ghi dạng sự kiện (bữa, nước, cân…) đi qua outbox / `SupabaseRemoteWriter`.

## 5. Ngôn ngữ thiết kế (Kiệt đã duyệt)

- **Nền:** giấy ấm trên mọi màn. Gọi `.ascndPage()` (`ASCND/App/AscndPage.swift`) ngay sau `.navigationTitle`.
- **Thẻ:** kính kiểu Apple Music.
  - Dùng `DSCard`, hoặc `todayCard(radius:)` + `TodayPressStyle` (`Features/Today/TodayGlass.swift`).
  - iOS 26 dùng `glassEffect`; bản cũ hơn dùng material; khi bật Reduce Transparency thì nền đặc.
  - Tôn trọng Reduce Motion.
- **Ambient:** **một** quầng sáng nhẹ, `TodayAmbient(accent:)`. Không đa sắc. Kiệt đã yêu cầu "tối giản, clean".
- **Thanh / ống rỗng:** không được hoà vào thẻ. Dùng rãnh lõm có tô màu tín hiệu.
- **Chuyển động:** mượt và tinh tế (`.smooth`, `todayEntrance`, `todayZoom`), không phô trương.
- **Chữ:** mọi chuỗi hiển thị nằm trong `Localizable.xcstrings`, đủ **en / vi / es**. Khoá viết thường kiểu `khu.vực.tên`.

## 6. Kiểm tra trước khi đẩy

**Cổng nhanh** (chạy từ thư mục `native/`):

```sh
for t in native-internal-api native-expect-keypath native-xcstrings-contract native-i18n-forensic native-l10n-override native-xcstrings-plural; do node ../apps/ios/tools/$t.mjs >/dev/null 2>&1 && echo "ok $t" || echo "FAIL $t"; done
```

Cổng đầy đủ: `node tools/check.mjs`, cũng chạy từ `native/`.

**Build và chạy (Limrun):** máy Linux không có Xcode, nên build trên cloud.
- Kiệt cấp API key của Limrun qua secret của environment. Đừng dán key vào chat hay repo.
- Build, chạy từ `apps/ios` (`<sandbox-id>` là sandbox của chính session):
  ```sh
  npx -y lim xcode build . --id <sandbox-id> --scheme ASCND --configuration Debug
  ```
  XcodeGen sinh project ở phía remote. Muốn xem lỗi thì grep `^\[x\]` trong log.
- Thao tác và chụp màn bằng các tool `mcp__Limrun__ios-*`, trên instance simulator của session. Nếu chưa có instance thì tạo bằng `create-ios-simulator`.
- **Phải tự bấm thử** luồng vừa sửa và xem ảnh chụp. Build xanh chưa đủ.

**CI:** sau khi đẩy, kiểm hai workflow `iOS` (core-linux, app-macos) và `Cổng chất lượng` (gate) trên đúng SHA:

```sh
gh api "repos/dnganhkiet1206/fitness-os/commits/<sha>/check-runs" --jq '.check_runs[]|"\(.name) \(.status) \(.conclusion)"'
```

Khi nhiều agent đẩy liền nhau, CI chỉ chạy trên commit đầu nhánh. Nói rõ điều đó, đừng nhận xanh thay.

CI đỏ:
- do code của mình → sửa ngay;
- do agent khác → báo trên #527, ghi rõ commit và lỗi.

## 7. Báo cáo trên #527

**Khi nhận việc:** đăng một comment ngắn đăng ký ownership, gồm việc gì và tệp nào.

**Khi xong một lát:** đăng báo cáo, có hai dạng.
- **Báo cáo đầy đủ 7 mục** (mẫu ở comment 6087990744) cho task lớn hoặc khi bàn giao:
  1. Đã hoàn thành: nguồn RN, tệp Swift, lối vào.
  2. Bằng chứng: SHA, test, CI đã hoặc chưa xác nhận, simulator.
  3. Gap còn lại kèm ưu tiên.
  4. Đề xuất sửa: P0–P3.
  5. Việc tiếp theo.
  6. Tổng gap đếm từ `PARITY_MATRIX.md`, ghi rõ baseline.
  7. Ownership và bàn giao.
- **Báo cáo ngắn** cho sửa nhỏ, theo kiểu các comment gần đây: tiêu đề + SHA, việc gì, vì sao, đã thử ở đâu.

**Luật trung thực:**
- Luôn ghi **"Thiết bị thật: NOT RUN"** cho tới khi Kiệt thử. Simulator không phải thiết bị thật. Không tự đánh dấu DONE.
- Chỉ ghi CI xanh khi đã thấy kết quả. Chưa có thì ghi "chưa xác nhận", rồi sửa comment khi có.
- Cập nhật `PARITY_MATRIX.md` (dòng của mình) khi trạng thái đổi.

**Cuối mỗi comment GitHub** thêm footer:

```
---
_Generated by [Claude Code](https://claude.ai/code)_
```

## 8. Tìm việc tiếp theo

Không có danh sách việc cố định trong trang này, vì nó cũ rất nhanh. Các việc N1–N6 ở bàn giao 6117089224 đã được làm (Đi chợ, sao yêu thích, `TrainingCard`, `ActivityRings`, quét ảnh/mã vạch).

Cách chọn việc:
1. Kiệt giao trực tiếp → làm việc đó.
2. Nếu không: đọc các comment mới nhất trên #527 (việc mở, việc bàn giao, CI đỏ), rồi `PARITY_MATRIX.md` (các dòng 🔴 TODO / 🟡 PARTIAL và cột "Còn thiếu").
3. Chọn một việc chưa có ai đăng ký, đăng ký trên #527, rồi làm.

## 9. Tài liệu cần biết

| Tệp | Dùng để |
|---|---|
| `apps/ios/docs/PARITY_MATRIX.md` | trạng thái theo mảng và theo route |
| `apps/ios/docs/PORTING_INVENTORY.md` | chi tiết hành vi RN theo dòng |
| `apps/ios/docs/NATIVE_IMPROVEMENTS.md` | khác biệt có chủ ý so với RN |
| `apps/ios/docs/design/*/RN-PARITY.md` | quyết định thiết kế từng màn |
| `native/docs/OFFLINE-POLICY.md` | ba lớp ghi: sự kiện / trạng thái / online-only |
