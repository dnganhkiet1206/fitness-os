public import ASCNDCore
import Foundation
import Supabase

/// `HistorySource` thật: đúng truy vấn của `useWorkoutSessions`
/// (`use-fitness-data.ts:874`) — các cột màn lịch sử đọc (WH-1d), của mình,
/// trong cửa sổ, mới trước.
public struct SupabaseHistorySource: HistorySource {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func sessions(userId: String, since: EpochMillis) async throws -> [JSONValue] {
    try await client.from("workout_sessions")
      .select("id, date_time, template_name, session_rpe, volume_load, pr_detected, sets")
      .eq("user_id", value: userId)
      .gte("date_time", value: WorkoutSessionRecord.iso8601(since))
      .order("date_time", ascending: false)
      .execute().value
  }
}
