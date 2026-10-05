# ADR-0003: Đồng bộ và outbox cho iOS native

- **Trạng thái:** Proposed (05/10/2026). Cần review: D (correctness/spec), A tự review. `B OFFLINE — substitute review`.
- **Owner:** A · **Issue:** #225

## Product contract, không đổi

[`native/docs/OFFLINE-POLICY.md`](../../native/docs/OFFLINE-POLICY.md) (Kiệt quyết, #65, #161, #165) là hợp đồng. Bản native thực thi **đúng bốn lớp** của nó và **đúng sáu câu hỏi xếp lớp**. ADR này chỉ nói *cách làm trên iOS*, không đổi *hành vi*.

| Lớp | Khi mất mạng | Sống qua tắt app |
|---|---|---|
| **Ghi nhận** (`record`) | Xếp hàng, gửi khi có mạng | Có |
| **Trạng thái** (`state`) | Áp ngay trên màn. Gộp theo khoá, giữ giá trị cuối cùng, gửi giá trị tuyệt đối | Không, chỉ trong phiên |
| **Tức thời** (`now`, cũng là mặc định) | Từ chối ngay | Không có gì để mất |

## Bằng chứng từ baseline (`fac9ac2`, `native/src/lib/offline-write.ts`)

- **Bảy loại bản ghi** của lớp Ghi nhận: `water`, `workout`, `weight`, `meal`, `sleep`, `measurement`, `biometrics` (`KNOWN_KINDS`).
- **Idempotency đã có sẵn ở server:**
  - Bản ghi mới mang id do client sinh, gửi bằng `upsert(…, {onConflict: 'id', ignoreDuplicates: true})`.
  - `weight`, `measurement`, `sleep` upsert theo khoá tự nhiên `(user_id, date)`.
  - Gửi lại bao nhiêu lần cũng ra một hàng.
- **Thứ tự:** gửi lần lượt, đúng thứ tự tạo. Hai lần ghi cùng `(user_id, date)` phải giữ thứ tự, nếu không giá trị sai sẽ thắng.
- **Lỗi vĩnh viễn, không gửi lại** (`permanentFailure`):
  - `PGRST*`
  - `42501`, `42703`, `23505`, `23503`, `23514`, `23502`, `22P02`, `22007`, `54000`, `CR001`
  - Bản ghi của tài khoản khác (`WrongAccountError`)
  - Bản ghi bản build này không đọc được (`UnusableWriteError`)
- **Thử lại:**
  - Mất mạng → chờ, không tính lượt.
  - Lỗi khác → tối đa 3 lần thử lại.
  - Khoảng chờ `min(1000 · 2^n, 30000)` ms.
- **Lỗ hổng đã ghi trong chính code baseline (`:729`):** tắt hẳn app giữa lúc đang thử lại thì **mất bản ghi**. Lý do là hàng đợi nằm trong cache của TanStack, được persist theo nhịp chứ không theo từng lần ghi.

## Quyết định

1. **Lưu trữ: SQLite qua [GRDB 7](https://github.com/groue/GRDB.swift)**, trong một target riêng `ASCNDStore`. Đây là dependency bên thứ ba duy nhất của tầng dữ liệu.
   - Outbox cần ba thứ: **ghi xong mới trả về** (WAL + transaction), **lấy đúng phần tử đầu hàng** dưới đồng thời, và **migration có version**. Cả ba là thế mạnh của SQLite.
   - GRDB 7 đã hỗ trợ Swift 6 strict concurrency (`DatabasePool` là `Sendable`).
2. **Logic outbox là giá trị thuần trong `ASCNDCore/Sync`.** Logic gồm: xếp lớp, phân loại lỗi, lịch thử lại, chọn việc kế tiếp, gộp lớp Trạng thái.
   - Không I/O, test được trên Linux, có golden vectors.
   - `ASCNDStore` chỉ lưu và nạp; worker gửi chỉ gọi mạng. Cả hai **hỏi core** phải làm gì.
3. **Bản ghi lớp Ghi nhận được ghi vào SQLite *trước* khi màn hình báo "đã lưu".** Đóng lỗ hổng `:729`: tắt app ở bất kỳ thời điểm nào cũng không mất bản ghi. Người dùng không thấy hành vi nào khác; chỉ là lời hứa "đã lưu trên máy" nay đúng thật.
4. **Idempotency key = id do client sinh (UUID v4)**, sinh **một lần lúc tạo bản ghi** và lưu cùng nó. Mỗi lần gửi lại đều mang đúng key đó.
   - Server: **chưa cần migration mới**. Các bảng của bảy loại trên đã bỏ trùng bằng PK hoặc khoá tự nhiên.
   - Chỉ khi một thao tác lớp Ghi nhận đi qua RPC không idempotent thì mới thêm bảng `idempotency_keys`, kèm migration mới, test SQL, và không sửa migration cũ.
5. **Thứ tự: một làn tuần tự cho toàn bộ hàng đợi Ghi nhận**, giống baseline. Tách làn theo thực thể là tối ưu sau này, chỉ làm khi đo thấy hàng đợi bị nghẽn.
6. **Phân loại lỗi và thử lại: đúng bảng ở trên**, đặt ở **một chỗ** (`ASCNDCore/Sync`) và khoá bằng golden vectors (do D viết).
7. **Lỗi vĩnh viễn:** bản ghi rời hàng đợi và người dùng được báo như baseline. Khác baseline ở chỗ bản ghi được giữ trong bảng `outbox_dead` (chỉ trên máy, không gửi lại) để chẩn đoán, thay vì biến mất.
   - Người dùng không thấy khác biệt nào. Đây là giả định của A, **D soát lại**.
8. **Lớp Trạng thái: chỉ trong bộ nhớ**, đúng như baseline. Kiệt đã chọn: không sống qua tắt app.
   - Gộp theo khoá `(thực thể, trường)`, giữ ý cuối cùng.
   - Ý cuối trùng giá trị của server thì không gửi.
   - Mỗi khoá chỉ một lượt gửi; phản hồi cũ không được đè phản hồi mới.
9. **Đổi tài khoản:**
   - Bản ghi mang `userId`. Bản ghi của tài khoản khác bị coi là vĩnh viễn (như `WrongAccountError`), không bao giờ gửi dưới phiên đăng nhập khác.
   - **Đăng xuất xoá hàng đợi Ghi nhận, giống baseline**: `clearPersistedCache()` ở `query-client.ts:172` chạy `queryClient.clear()`, xoá luôn các mutation đang chờ. Có nên giữ lại hay hỏi trước khi xoá là quyết định sản phẩm, đang chờ Kiệt ở #241.

## Phương án đã cân nhắc

| Phương án | Vì sao không chọn |
|---|---|
| **SwiftData** | `ModelContext` không `Sendable`. Lấy đúng phần tử đầu hàng dưới đồng thời phải tự dựng. Migration và debug khó soát. Hợp với đồ thị đối tượng UI, không hợp với hàng đợi giao dịch. |
| **File JSON / UserDefaults** | Ghi cả tệp mỗi lần, không có transaction. Đây đúng là kiểu lưu đã gây lỗ hổng `:729` ở baseline. |
| **SQLite C API tự bọc** | Không có dependency, nhưng phải tự viết WAL, migration và đồng thời. Rủi ro cao hơn một thư viện đã chín. |
| **Core Data** | Nặng, API cũ, cùng vấn đề đồng thời như SwiftData. |

Trade-off của GRDB là thêm một dependency. Bù lại: mã nguồn mở, ổn định nhiều năm, và chỉ `ASCNDStore` import nó. Core vẫn không phụ thuộc gì.

## Kế hoạch PR (#225)

1. ADR này.
2. `ASCNDCore/Sync`: phân loại lỗi, lịch thử lại, hàng đợi thuần. Test trên Linux.
3. Golden vectors `spec/vectors/sync.json` (D). Runner Swift do A viết.
4. `ASCNDStore`: GRDB, bảng `outbox` / `outbox_dead`, migration v1. Test trên macOS CI.
5. Worker gửi, dùng backend client của #224.
6. Lớp Trạng thái: bộ gộp trong bộ nhớ.

## Giả định cần soát

- **Chỗ lệch có chủ đích so với code baseline, nhưng khớp với spec.** Trong TanStack (`retryer.js:89–94`), lỗi mất mạng **cũng tăng** `failureCount`. Vì vậy chuỗi mất mạng ×3 rồi một lỗi 5xx sẽ làm `failureCount < 3` sai, và bản ghi bị bỏ. Điều này trái với OFFLINE-POLICY ("xếp hàng, gửi khi có mạng"). Bản native chỉ tính **lỗi tạm thời không phải mất mạng** vào ngân sách 3 lần thử lại. Khoảng chờ vẫn tăng theo mọi lần lỗi như baseline. D soát giúp: nếu D thấy cần giữ đúng code baseline thì mở `needs-clarification`.

- Danh sách mã lỗi vĩnh viễn được chép nguyên từ baseline. Nếu server thêm mã mới (như CR001 hôm 04/10), phải thêm ở **một** chỗ là core, kèm vector.
- `42501` được coi là vĩnh viễn như baseline. Khi phiên hết hạn, auth (#224) phải refresh token **trước khi** worker gửi, để không biến một lỗi phiên thành mất bản ghi. Sẽ ghi rõ ở PR worker.
