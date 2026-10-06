public import ASCNDCore
import Foundation
import Supabase

/// `RecordHistory` thật: cột `sets` của các buổi gần nhất — đúng truy vấn của
/// baseline (`use-fitness-data.ts:368`: `select('sets')`, mới nhất trước,
/// `limit(PR_HISTORY)`).
public struct SupabaseRecordHistory: RecordHistory {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func recentSessionSets(userId: String, limit: Int) async throws -> [JSONValue] {
    let rows: [Row] = try await client.from("workout_sessions")
      .select("sets")
      .eq("user_id", value: userId)
      .order("date_time", ascending: false)
      .limit(limit)
      .execute().value
    return rows.map { $0.sets ?? .null }
  }

  struct Row: Decodable, Sendable {
    let sets: JSONValue?
  }
}
