public import ASCNDCore
import Foundation

/// Thứ tự vòng đời tài khoản của dữ liệu trên máy (#431, #455) — `read_cache`
/// và `workout_day` — ở MỘT chỗ, để `AppServices` và test chạy cùng một thứ tự.
///
/// - App mở: chốt ĐÓNG (`launched`) — chưa ai đăng nhập thì không đọc / ghi /
///   dọn được gì của ai (#469: kể cả dọn ngày cũ — không còn lượt dọn nào lúc
///   mở app).
/// - Phiên mở (`sessionStarted`): mở chốt cho người ấy, RỒI dọn read model và
///   điểm quay lại của mọi người khác (lượt làm mới / ghi muộn của người trước
///   có thể về sau lượt dọn lúc đăng xuất, #335; app chết giữa lượt dọn; hàng
///   `#legacy`), RỒI dọn ngày quá 14 ngày của chính người ấy.
///
/// Hai lối XUYÊN tài khoản (`clearAll`, `clearAll(except:)`) chỉ được gọi từ
/// đây. Mọi lối khác của `GRDBWorkoutStore` — kể cả `pruneDays` — chỉ chạm
/// ngày của người đang đăng nhập.
/// - Phiên kết thúc (`sessionEnded`): đóng chốt TRƯỚC mọi bước dọn — lượt ghi
///   muộn của người vừa rời đi bị từ chối ngay, không đợi dọn xong — rồi dọn
///   của họ.
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
  /// (bỏ hàng đợi chưa gửi, #241) — thứ tự của `AppServices`.
  public func sessionEnded(next: String?, between: @Sendable () async -> Void = {}) async {
    if !(next.map { accounts.current == .signedIn($0.lowercased()) } ?? false) {
      accounts.signOut()
    }
    await between()
    if let next {
      _ = try? await workouts.clearAll(except: next)
      _ = try? await readCache.clearAll(except: next)
    } else {
      _ = try? await workouts.clearAll()
      _ = try? await readCache.clearAll()
    }
  }

}
