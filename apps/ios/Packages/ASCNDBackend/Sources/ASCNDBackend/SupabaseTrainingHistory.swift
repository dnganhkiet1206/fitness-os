public import ASCNDCore
import Foundation
import Supabase

/// `TrainingHistory` thật: thời điểm các buổi trong cửa sổ, như
/// `useWorkoutSessions` của baseline (`use-fitness-data.ts`) nhưng chỉ lấy cột
/// `date_time` — màn Today chỉ cần biết ngày nào đã tập.
public struct SupabaseTrainingHistory: TrainingHistory {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func sessionTimes(userId: String, since: EpochMillis) async throws -> [EpochMillis] {
    let rows: [Row] = try await client.from("workout_sessions")
      .select("date_time")
      .eq("user_id", value: userId)
      .gte("date_time", value: WorkoutSessionRecord.iso8601(since))
      .order("date_time", ascending: false)
      .execute().value
    return Self.times(rows)
  }

  /// Buổi của một ngày, mới trước — đủ cột để nhận buổi ghi từ máy khác
  /// (RN `day-plan.tsx` đọc `sessions` của ngày để tính `proven`).
  public func sessions(userId: String, from: EpochMillis, to: EpochMillis) async throws -> [JSONValue] {
    try await client.from("workout_sessions")
      .select("id, date_time, session_rpe, pr_detected, sets")
      .eq("user_id", value: userId)
      .gte("date_time", value: WorkoutSessionRecord.iso8601(from))
      .lt("date_time", value: WorkoutSessionRecord.iso8601(to))
      .order("date_time", ascending: false)
      .execute().value
  }

  struct Row: Decodable, Sendable {
    let date_time: String
  }

  /// Hàng không đọc được thời điểm thì bỏ — không đoán ngày.
  static func times(_ rows: [Row]) -> [EpochMillis] {
    rows.compactMap { EpochMillis(iso8601: $0.date_time) }
  }
}
