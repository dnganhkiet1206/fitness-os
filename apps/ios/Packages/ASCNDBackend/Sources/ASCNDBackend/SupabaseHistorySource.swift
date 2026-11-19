public import ASCNDCore
import Foundation

/// `HistorySource` thật: các cột màn lịch sử đọc (WH-1d), của mình, trong cửa
/// sổ, mới trước — qua lượt đọc chung `SharedWorkoutSessions` (R2-OPS-08), lọc
/// trong bộ nhớ theo đúng `since`, thay cho một truy vấn riêng.
public struct SupabaseHistorySource: HistorySource {
  private let shared: SharedWorkoutSessions

  public init(backend: Backend) {
    self.shared = backend.sharedSessions
  }

  public func sessions(userId: String, since: EpochMillis) async throws -> [JSONValue] {
    try await shared.rows(userId: userId, since: since)
  }
}
