public import ASCNDCore
import Foundation
import Supabase

/// `PerformanceSource` thật: các buổi trong cửa sổ, như `useWorkoutSessions`
/// (`use-fitness-data.ts:874`) nhưng chỉ cột "lần trước" cần.
public struct SupabasePerformanceSource: PerformanceSource {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func sessions(userId: String, since: EpochMillis) async throws -> [SessionHistoryRow] {
    let rows: [Row] = try await client.from("workout_sessions")
      .select("id, date_time, sets")
      .eq("user_id", value: userId)
      .gte("date_time", value: WorkoutSessionRecord.iso8601(since))
      .order("date_time", ascending: false)
      .execute().value
    return Self.rows(rows)
  }

  struct Row: Decodable, Sendable {
    let id: String
    let date_time: String
    let sets: JSONValue?
  }

  /// Hàng không đọc được thời điểm thì bỏ — không đoán buổi ấy thuộc ngày nào.
  static func rows(_ rows: [Row]) -> [SessionHistoryRow] {
    rows.compactMap { r in
      EpochMillis(iso8601: r.date_time).map { SessionHistoryRow(id: r.id.lowercased(), at: $0, sets: r.sets) }
    }
  }
}
