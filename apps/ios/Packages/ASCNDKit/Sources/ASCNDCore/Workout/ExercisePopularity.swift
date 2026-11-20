public import Foundation

/// Độ phổ biến bài tập từ số liệu thật (Kiệt 16/11): hàm `exercise_popularity()` của server
/// (migration 20261116120000, deploy 16/11) trả số buổi + số người tập mỗi bài trong 90 ngày,
/// chỉ bài có ≥ 5 người. App trộn nó với danh sách soạn tay (`ExerciseSearch.popularity`).
public enum ExercisePopularity {
  /// Một dòng của `exercise_popularity()`.
  public struct Row: Sendable, Hashable, Codable {
    public let key: String
    public let sessions: Int
    public let users: Int
    public init(key: String, sessions: Int, users: Int) {
      self.key = key
      self.sessions = sessions
      self.users = users
    }
  }

  /// Dưới số bài này, số liệu chưa đủ để nói bài nào phổ biến hơn (mỗi bài đã cần ≥ 5 người):
  /// giữ danh sách soạn tay nguyên vẹn. 20 bài ≈ một chương trình tập phổ thông.
  public static let minRows = 20
  /// Trọng số còn lại của danh sách soạn tay khi đã có số liệu thật: bài cơ bản không tụt hẳn
  /// chỉ vì cộng đồng nhỏ chưa ai tập, nhưng bài được tập thật luôn có thể vượt lên.
  public static let curatedWeight = 0.6

  public static func decode(_ rows: [JSONValue]) -> [Row] {
    rows.compactMap { r in
      guard let key = r["exercise_key"]?.stringValue, !key.isEmpty else { return nil }
      return Row(key: key, sessions: int(r["sessions"]), users: int(r["users"]))
    }
  }

  private static func int(_ v: JSONValue?) -> Int {
    switch v {
    case .number(let n)?: Int(n)
    case .string(let s)?: Int(s) ?? 0
    default: 0
    }
  }

  /// Bảng độ phổ biến 0…1. Đủ số liệu: số buổi chuẩn hoá theo log (bài nhiều buổi nhất = 1),
  /// mỗi bài lấy max(số liệu thật, 0,6 × soạn tay). Chưa đủ: danh sách soạn tay.
  public static func blend(curated: [String: Double], server: [Row]) -> [String: Double] {
    let usable = server.filter { $0.sessions > 0 }
    guard usable.count >= minRows, let top = usable.map(\.sessions).max() else { return curated }
    let denom = log(Double(top) + 1)
    var out = curated.mapValues { $0 * curatedWeight }
    for r in usable {
      let real = log(Double(r.sessions) + 1) / denom
      out[r.key] = max(out[r.key] ?? 0, real)
    }
    return out
  }

  /// Bảng đang dùng — app đặt khi đọc được server (hay bản đã lưu), mặc định soạn tay.
  public static var current: [String: Double] { box.get() ?? ExerciseSearch.popularity }

  public static func use(_ table: [String: Double]?) { box.set(table) }

  private static let box = Box()

  private final class Box: @unchecked Sendable {
    private let lock = NSLock()
    private var table: [String: Double]?
    func get() -> [String: Double]? {
      lock.lock()
      defer { lock.unlock() }
      return table
    }
    func set(_ t: [String: Double]?) {
      lock.lock()
      table = t
      lock.unlock()
    }
  }
}

/// Đọc `exercise_popularity()` (app: RPC Supabase).
public protocol ExercisePopularitySource: Sendable {
  func popularity() async throws -> [JSONValue]
}
