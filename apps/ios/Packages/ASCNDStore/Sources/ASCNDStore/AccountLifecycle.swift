public import ASCNDCore
import Foundation

/// Thứ tự vòng đời tài khoản của dữ liệu trên máy (#431, #455) — `read_cache`
/// và `workout_day` — ở MỘT chỗ, để `AppServices` và test chạy cùng một thứ tự.
///
/// - App mở: chốt ĐÓNG (`launched`) — chưa ai đăng nhập thì không đọc / ghi /
///   dọn được gì của ai (#469: kể cả dọn ngày cũ — không còn lượt dọn nào lúc
///   mở app, TRỪ lượt dọn ngày đỗ quá hạn của người KHÁC
///   (`pruneParkedStaleDays`): nó chỉ chạm hàng quá 14 ngày của chủ khác với
///   người của phiên khôi phục, không bao giờ chạm dữ liệu của người ấy).
/// - Phiên mở (`sessionStarted`): mở chốt cho người ấy, RỒI dọn read model và
///   điểm quay lại của mọi người khác (lượt làm mới / ghi muộn của người trước
///   có thể về sau lượt dọn lúc đăng xuất, #335; app chết giữa lượt dọn; hàng
///   `#legacy`), RỒI dọn ngày quá 14 ngày của chính người ấy.
///
/// Lối XUYÊN tài khoản (`clearAll(except:)`, `pruneStaleDays(except:today:)`)
/// chỉ được gọi từ đây. Mọi lối khác của `GRDBWorkoutStore` — kể cả
/// `pruneDays` — chỉ chạm ngày của người đang đăng nhập.
/// - Phiên kết thúc (`sessionEnded`): đóng chốt TRƯỚC mọi bước dọn — lượt ghi
///   muộn của người vừa rời đi bị từ chối ngay, không đợi dọn xong — rồi dọn
///   read model của họ. Ngày tập (`workout_day`) KHÔNG bị xoá nữa (R3-DATA-01):
///   nó đỗ lại theo chủ như hàng đợi chưa gửi (AUD-06, #241 (b)) — chính chủ
///   đăng nhập lại thì tập tiếp được, người khác mở phiên thì lượt dọn của
///   `sessionStarted` bỏ nó đi, ngày quá hạn thì lượt dọn lúc mở app bỏ
///   (`pruneParkedStaleDays`), và chỉ khi tài khoản bị xoá mới bỏ hẳn
///   (`accountDeleted`).
///
/// Đổi thẳng tài khoản (A → B, không qua đăng xuất): `SessionStore` đặt phiên
/// B rồi mới chạy lượt dọn của A, và lượt dọn ấy NHƯỜNG (`await`) ở giữa — màn
/// của B có thể đã mở chốt cho B và ghi trước khi nó chạy tiếp. Nên lượt dọn
/// nhận `next` (người của phiên mới, `nil` khi đăng xuất):
/// - chỉ đóng chốt nếu chốt chưa thuộc về `next`: không đóng mất chốt của B;
/// - dọn mọi thứ TRỪ của `next`: không xoá ngày / cache B vừa ghi.
/// Thứ tự giữa `sessionStarted(B)` và `sessionEnded(next: B)` vì thế không
/// quan trọng — test chạy cả hai.
public final class AccountLifecycle: Sendable {
  public let accounts: AccountScope
  private let workouts: GRDBWorkoutStore
  private let readCache: GRDBTemplateCache

  public init(_ database: ASCNDDatabase) {
    accounts = database.accounts
    workouts = GRDBWorkoutStore(database)
    readCache = GRDBTemplateCache(database)
  }

  /// App mở: chưa ai đăng nhập cho tới khi phiên mở.
  public func launched() {
    accounts.signOut()
  }

  /// App mở: dọn ngày đỗ quá hạn của mọi người KHÁC người của phiên khôi
  /// phục (`except`, `nil` khi không có phiên). Ngoại lệ #469: luật "không
  /// dọn lúc mở app" vẫn đứng cho dữ liệu của người đang / sắp đăng nhập —
  /// lượt này chỉ bỏ hàng đã quá cửa sổ 14 ngày của chủ khác, không bao giờ
  /// chạm ngày của `except` (dù cũ hay mới), nên buổi đang dở của chính chủ
  /// vẫn còn nguyên cho lần đăng nhập sau (R3-DATA-01). Không có phiên nào
  /// mở thì đây là lượt dọn duy nhất giữ ngày đỗ khỏi nằm trên máy vô hạn.
  /// Lỗi thì bỏ qua như `sessionStarted`: dọn dở không được chặn app mở.
  public func pruneParkedStaleDays(except userId: String?, today: LocalDate) async {
    _ = try? await workouts.pruneStaleDays(except: userId, today: today)
  }

  /// Phiên của `userId` bắt đầu (`today`: hôm nay theo giờ máy): mở chốt, bỏ
  /// dữ liệu của mọi người khác, rồi dọn ngày cũ của người ấy.
  public func sessionStarted(userId: String, today: LocalDate) async {
    accounts.signIn(userId)
    _ = try? await readCache.clearAll(except: userId)
    _ = try? await workouts.clearAll(except: userId)
    _ = try? await workouts.pruneDays(today: today)
  }

  /// Phiên kết thúc. `next`: người của phiên mới khi đổi thẳng tài khoản,
  /// `nil` khi đăng xuất. `between` chạy SAU khi chốt đóng và TRƯỚC khi dọn
  /// (đỗ hàng đợi chưa gửi, #241 (b)) — thứ tự của `AppServices`.
  public func sessionEnded(next: String?, between: @Sendable () async -> Void = {}) async {
    if !(next.map { accounts.current == .signedIn($0.lowercased()) } ?? false) {
      accounts.signOut()
    }
    await between()
    // Ngày tập KHÔNG dọn ở đây (R3-DATA-01): đỗ lại theo chủ cho lần đăng
    // nhập sau; người khác mở phiên thì `sessionStarted` dọn. Chỉ read model
    // (dựng lại được từ server) bị bỏ.
    if let next {
      _ = try? await readCache.clearAll(except: next)
    } else {
      _ = try? await readCache.clearAll()
    }
  }

  /// Tài khoản `userId` đã bị xoá trên server: bỏ hẳn ngày tập của nó khỏi
  /// máy. Chỉ gọi khi tài khoản không còn — kết thúc phiên thường giữ ngày
  /// lại cho lần đăng nhập sau (R3-DATA-01).
  public func accountDeleted(userId: String) async {
    _ = try? await workouts.purge(userId: userId)
  }

}
