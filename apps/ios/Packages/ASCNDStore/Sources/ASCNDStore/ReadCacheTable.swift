public import ASCNDCore
import Foundation
import GRDB

/// Tài khoản mà bảng `read_cache` đang phục vụ (#431) — MỘT chốt cho mọi
/// read model theo người dùng.
///
/// Không có chốt này, ranh giới giữa hai tài khoản chỉ dựa vào THỨ TỰ: đăng
/// xuất xoá bảng, đăng nhập dọn của người khác. Một lượt làm mới của người vừa
/// rời đi về SAU lượt xoá (mạng chậm, controller chưa kịp huỷ) ghi lại hồ sơ /
/// lịch sử / kế hoạch của họ lên đĩa — và nó nằm đó suốt lúc máy không ai đăng
/// nhập, cho tới khi người kế tiếp đăng nhập (#335 chỉ dọn ở thời điểm ấy).
///
/// Với chốt: đọc và ghi chỉ đi qua cho đúng người đang đăng nhập; mọi thứ khác
/// (người cũ, người khác, lúc không ai đăng nhập) là không có gì.
public final class AccountScope: @unchecked Sendable {
  public enum State: Sendable, Hashable {
    /// Chưa ai đặt chốt — công cụ / test dựng cache trực tiếp. App đặt
    /// `signedOut` ngay khi mở database.
    case unrestricted
    case signedIn(String)
    case signedOut
  }

  private let lock = NSLock()
  private var state: State = .unrestricted

  public init() {}

  public var current: State { lock.withLock { state } }

  public func signIn(_ userId: String) { lock.withLock { state = .signedIn(userId.lowercased()) } }
  public func signOut() { lock.withLock { state = .signedOut } }

  /// Chủ của hàng `workout_day` cũ (trước v4) — không tài khoản nào trùng.
  public static let legacyOwner = "#legacy"

  /// Chủ của dữ liệu theo người dùng lúc này: người đang đăng nhập; `""` khi
  /// chưa ai đặt chốt (công cụ / test); `nil` khi không ai đăng nhập — đọc
  /// không thấy gì, ghi bị từ chối.
  public var owner: String? {
    switch current {
    case .unrestricted: ""
    case .signedIn(let who): who
    case .signedOut: nil
    }
  }

  /// Hàng của `userId` có được đọc / ghi lúc này không.
  public func allows(_ userId: String) -> Bool {
    let id = userId.lowercased()
    guard !id.isEmpty else { return false }
    return switch current {
    case .unrestricted: true
    case .signedIn(let who): who == id
    case .signedOut: false
    }
  }
}

/// Các không gian tên của `read_cache` — mỗi cache theo người dùng khai báo
/// `kind` của nó ở ĐÂY, để một test liệt kê được tất cả (#431).
public enum ReadCacheNamespace {
  public static let templates = "templates"
  public static let recordBests = "record-bests"
  public static let lastPerformance = "last-performance"
  public static let workoutHistory = "workout-history"
  public static let exerciseInsights = "exercise-insights"
  public static let exerciseLibrary = "exercise-library"
  public static let exerciseGuide = "exercise-guide:"
  public static let onboardingDraft = "onboarding-draft"
  public static let onboardingCompleted = "onboarding-completed"
  public static let profile = "profile"

  /// `kind` đúng bằng.
  public static let fixed: Set<String> = [
    templates, recordBests, lastPerformance, workoutHistory, exerciseInsights, exerciseLibrary, onboardingDraft,
    onboardingCompleted, profile,
  ]
  /// `kind` = tiền tố + khoá (hướng dẫn theo bài × ngôn ngữ).
  public static let prefixes: [String] = [exerciseGuide]

  public static func isRegistered(_ kind: String) -> Bool {
    fixed.contains(kind) || prefixes.contains { kind.hasPrefix($0) && kind.count > $0.count }
  }
}

/// Cửa DUY NHẤT vào bảng `read_cache`: khoá (người, không gian tên), qua chốt
/// tài khoản. Mọi cache theo người dùng dùng nó thay vì tự viết SQL — chín bản
/// chép cùng một câu lệnh là chín chỗ có thể quên lọc `userId`.
struct ReadCacheTable: Sendable {
  let db: DatabaseQueue
  let accounts: AccountScope

  init(_ database: ASCNDDatabase) {
    db = database.queue
    accounts = database.accounts
  }

  /// JSON thô của (người, kind); `nil` khi không có hoặc chốt không cho đọc.
  func string(userId: String, kind: String) async throws -> String? {
    guard accounts.allows(userId) else { return nil }
    return try await db.read { db in
      try String.fetchOne(db, sql: "SELECT json FROM read_cache WHERE userId = ? AND kind = ?", arguments: [userId, kind])
    }
  }

  /// - Parameter lenient: bản lưu không giải mã được (bản build khác ghi) là
  ///   "không có" thay vì lỗi.
  func load<T: Decodable>(_ type: T.Type, userId: String, kind: String, lenient: Bool = false) async throws -> T? {
    guard let json = try await string(userId: userId, kind: kind) else { return nil }
    if lenient { return try? JSONDecoder().decode(T.self, from: Data(json.utf8)) }
    return try JSONDecoder().decode(T.self, from: Data(json.utf8))
  }

  /// Ghi đè (người, kind). Chốt không cho thì bỏ — không lỗi: lượt làm mới
  /// muộn của người đã rời đi không có gì để báo cho ai.
  func put(_ json: String, userId: String, kind: String) async throws {
    assert(ReadCacheNamespace.isRegistered(kind), "kind chưa khai báo trong ReadCacheNamespace: \(kind)")
    guard accounts.allows(userId) else { return }
    try await db.write { db in
      try db.execute(
        sql: """
          INSERT INTO read_cache (userId, kind, json) VALUES (?, ?, ?)
          ON CONFLICT(userId, kind) DO UPDATE SET json = excluded.json
          """,
        arguments: [userId, kind, json])
    }
  }

  func save<T: Encodable>(_ value: T, userId: String, kind: String) async throws {
    try await put(try OutboxStore.json(value), userId: userId, kind: kind)
  }

  func delete(userId: String, kind: String) async throws {
    try await db.write { db in
      try db.execute(sql: "DELETE FROM read_cache WHERE userId = ? AND kind = ?", arguments: [userId, kind])
    }
  }
}
