# Cách làm việc cho session mới — app iOS native (ASCND)

> **Trước hết, bắt buộc:** đọc [`CONSTRAINTS_AND_DEFERRED.md`](CONSTRAINTS_AND_DEFERRED.md) (hạn chế, việc hoãn, đầu tư, người dùng thật) và [`PRODUCT_DECISION_V1.md`](PRODUCT_DECISION_V1.md) (hướng sản phẩm, Kiệt chốt 21/10).
> App **chưa phát hành được**. Giai đoạn này tập trung cải thiện sản phẩm để khi phát hành thì ít phải sửa.

Đọc hết trang này trước khi sửa gì. Đây là quy trình hiện hành, Kiệt chốt ngày 17/10/2026:
- session chạy **cục bộ trên Mac có Xcode**;
- **không còn chia vai A / B / C / D / E**;
- mỗi việc đi qua **PR riêng** → CI xanh → **tự gộp** vào `native/ios-rewrite`.

Chỗ nào trong `docs/WORKFLOW.md` khác trang này thì **trang này thắng**: bảng reviewer chéo, cấm tác giả tự merge, nhánh `agent/x/...`.

## 1. Vai trò

- **Kiệt** (`dnganhkiet1206`) là Product Authority. Mọi quyết định sản phẩm do Kiệt chốt.
- Trả lời Kiệt bằng **tiếng Việt**.
- App đã khá ổn định. Ưu tiên giữ chất lượng: sửa nhỏ, chắc, có kiểm chứng. Không đập đi làm lại thứ đang tốt.
- Bảng điều phối và nơi báo cáo là **issue #527**. Đọc khoảng 20–30 comment cuối trước khi bắt đầu.

## 2. Nhánh, PR và gộp

`native/ios-rewrite` là nhánh tích hợp. Không commit thẳng lên nó; mọi thay đổi đi qua PR.

**Mỗi việc:**

1. Tạo nhánh từ đầu `native/ios-rewrite`:
   ```sh
   git fetch origin native/ios-rewrite
   git switch -c claude/<slug> origin/native/ios-rewrite
   ```
   Tiền tố `claude/` làm `Cổng chất lượng` chạy ngay khi đẩy.
2. Làm việc. Mỗi commit một ý. Kiểm cục bộ theo mục 6: cổng nhanh, `swift test`, build và chạy simulator.
3. Đẩy rồi mở PR vào `native/ios-rewrite`:
   ```sh
   git push -u origin claude/<slug>
   gh pr create --base native/ios-rewrite
   ```
   Body PR theo `.github/pull_request_template.md` (các mục của template, điền từ thay đổi thật).
4. **Đợi CI xanh trên đúng head của PR**:
   - `Cổng chất lượng` (gate);
   - `iOS` (core-linux + app-macos), workflow này chạy khi PR chạm `apps/ios/**`.

   Lệnh kiểm: `gh pr checks <số>`. Đỏ thì sửa, đẩy lên, đợi lại. **Không gộp khi đỏ hoặc còn đang chạy.**
5. `native/ios-rewrite` đã tiến lên trong lúc chờ (có thể do Kiệt đẩy commit) → merge nó vào nhánh PR:
   ```sh
   git merge origin/native/ios-rewrite
   ```
   Hoặc rebase, nếu nhánh mới chỉ có mình dùng. Sau đó đẩy và **đợi CI xanh lại**. Xung đột thì giữ cả hai phía; hay gặp ở `Localizable.xcstrings`, `AppServices.swift`, `PARITY_MATRIX.md`.
6. **Tự gộp bằng merge commit, không squash** (Kiệt chốt ở #523: giữ dấu vết CI và topology):
   ```sh
   gh pr merge <số> --merge --delete-branch
   ```
7. Báo cáo trên #527 (mục 7), có link PR và SHA merge.

**Không bao giờ:**
- `--force` / `--force-with-lease` lên `native/ios-rewrite` hay `main`;
- `reset --hard` trên commit đã đẩy;
- gộp vào `main` (chỉ Kiệt);
- sửa `.github/workflows/**` khi Kiệt chưa duyệt.

**Commit:**
- Message nói *làm gì và vì sao*, thường kèm `(#527)`.
- Kết thúc bằng các dòng attribution mà harness yêu cầu.
- **Không ghi tên hay ID model** trong commit, PR, comment code hay comment GitHub.

## 3. Ràng buộc (nguyên văn của Kiệt — không ngoại lệ)

- "Tôi KHÔNG muốn workaround nguy hiểm hoặc grant ownership cho Supabase system table"
- "Không reset database" · "Không xóa migration" · "Không thực hiện destructive operation"
- Không đổi schema / RPC / RLS / luật kinh tế xu / workflow CI nếu Kiệt chưa duyệt rõ.
- Không ghi ngược vào HealthKit.
- Không đưa secret vào repo, không xin token trong chat. Key nào cần thì nằm trong secret của environment hoặc config của CLI.

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

## 6. Kiểm tra trước khi mở / gộp PR

**Cổng nhanh** (chạy từ `native/`):

```sh
for t in native-internal-api native-expect-keypath native-xcstrings-contract native-i18n-forensic native-l10n-override native-xcstrings-plural native-uitest-mode; do node ../apps/ios/tools/$t.mjs >/dev/null 2>&1 && echo "ok $t" || echo "FAIL $t"; done
```

Cổng đầy đủ, cũng từ `native/`: `node tools/check.mjs`.

**Test Swift:** giống CI. Chạy `swift test` lần lượt trong `apps/ios/Packages/ASCNDKit`, `ASCNDBackend`, `ASCNDStore`. `ASCNDCore` không được import SwiftUI/UIKit (CI `core-linux` build nó trên Linux).

**Build và chạy trên simulator (Xcode cục bộ):**

```sh
cd apps/ios
xcodegen generate        # sau mỗi lần đổi project.yml hoặc thêm/xoá tệp; project không commit
xcrun simctl list devices available            # chọn một iPhone, iOS 26 nếu có
xcodebuild build -project ASCND.xcodeproj -scheme ASCND -configuration Debug \
  -destination 'platform=iOS Simulator,name=<tên iPhone>' -derivedDataPath build/dd \
  | grep -E "error:|warning:|BUILD (SUCCEEDED|FAILED)"
xcrun simctl boot "<tên iPhone>" 2>/dev/null; open -a Simulator
xcrun simctl install booted build/dd/Build/Products/Debug-iphonesimulator/ASCND.app
xcrun simctl launch booted com.ascnd.fitnessos.dev
xcrun simctl io booted screenshot /tmp/ascnd.png   # rồi XEM ảnh
```

- Bản Debug có tên **ASCND Dev**, bundle `com.ascnd.fitnessos.dev`.
- Chế độ tối: `xcrun simctl ui booted appearance dark`, trả lại bằng `light`.
- Chữ lớn: `xcrun simctl ui booted content_size extra-extra-large`.
- **Phải tự đi qua luồng vừa sửa và xem ảnh chụp.** Build xanh chưa đủ. Có công cụ điều khiển simulator (computer use / Xcode MCP) thì bấm thật. Không có thì nói rõ phần nào chưa bấm thử được.
- Simulator **không phải** thiết bị thật. Ký và chạy trên iPhone thật là việc của Kiệt.

**Bot kiểm hệ thống** (nhánh, server Supabase, Sentry, PostHog — chỉ đọc): `node .github/scripts/system-check.mjs`, chi tiết ở `SYSTEM_CHECK.md`. Chạy trước khi báo "server ổn".

**CI:** chỉ ghi xanh khi đã thấy kết quả trên đúng SHA (`gh pr checks`, hoặc `gh api repos/dnganhkiet1206/fitness-os/commits/<sha>/check-runs`). CI đỏ trên `native/ios-rewrite` mà không do PR của mình gây ra → báo trên #527, ghi rõ commit và lỗi.

## 7. Báo cáo trên #527

**Khi bắt đầu một việc lớn:** đăng một comment ngắn, gồm việc gì, tệp nào, link PR nếu đã có. Việc nhỏ thì chỉ cần báo cáo khi xong.

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
- Ghi rõ **đã chạy trên simulator nào**, và **"Thiết bị thật: NOT RUN"** cho tới khi Kiệt thử. Không tự đánh dấu DONE.
- Chỉ ghi CI xanh khi đã thấy kết quả. Chưa có thì ghi "chưa xác nhận", rồi sửa comment khi có.
- Cập nhật dòng liên quan trong `PARITY_MATRIX.md` khi trạng thái đổi.

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
3. Chọn việc có giá trị nhất với người dùng; việc lớn thì nói kế hoạch với Kiệt trước.

## 9. Tài liệu cần biết

| Tệp | Dùng để |
|---|---|
| `apps/ios/docs/PARITY_MATRIX.md` | trạng thái theo mảng và theo route |
| `apps/ios/docs/PORTING_INVENTORY.md` | chi tiết hành vi RN theo dòng |
| `apps/ios/docs/NATIVE_IMPROVEMENTS.md` | khác biệt có chủ ý so với RN |
| `apps/ios/docs/design/*/RN-PARITY.md` | quyết định thiết kế từng màn |
| `native/docs/OFFLINE-POLICY.md` | ba lớp ghi: sự kiện / trạng thái / online-only |
