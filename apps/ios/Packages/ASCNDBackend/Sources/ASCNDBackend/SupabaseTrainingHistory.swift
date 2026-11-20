public import ASCNDCore
import Foundation

/// `TrainingHistory` thật: thời điểm các buổi trong cửa sổ + buổi của một ngày
/// — qua lượt đọc chung `SharedWorkoutSessions` (R2-OPS-08), lọc trong bộ nhớ
/// theo đúng cửa sổ, thay cho hai truy vấn riêng. Màn Today chỉ cần biết ngày
/// nào đã tập + buổi trong ngày để nhận buổi ghi từ máy khác.
public struct SupabaseTrainingHistory: TrainingHistory {
  private let shared: SharedWorkoutSessions

  public init(backend: Backend) {
    self.shared = backend.sharedSessions
  }

  public func sessionTimes(userId: String, since: EpochMillis) async throws -> [EpochMillis] {
    Self.times(try await shared.rows(userId: userId, since: since))
  }

  /// Buổi của một ngày, mới trước — đủ cột để nhận buổi ghi từ máy khác
  /// (RN `day-plan.tsx` đọc `sessions` của ngày để tính `proven`).
  public func sessions(userId: String, from: EpochMillis, to: EpochMillis) async throws -> [JSONValue] {
    try await shared.rows(userId: userId, from: from, to: to)
  }

  /// Hàng không đọc được thời điểm thì bỏ — không đoán ngày.
  static func times(_ rows: [JSONValue]) -> [EpochMillis] {
    rows.compactMap { $0["date_time"]?.stringValue.flatMap { EpochMillis(iso8601: $0) } }
  }
}
