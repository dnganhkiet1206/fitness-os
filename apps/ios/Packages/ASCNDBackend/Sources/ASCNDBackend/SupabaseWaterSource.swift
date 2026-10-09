public import ASCNDCore
import Foundation
import Supabase

/// `WaterSource` thật — đúng các truy vấn của `use-water.ts` trên `water_logs`
/// (RLS: `auth.uid() = user_id`). Ghi THÊM không ở đây: nó đi qua outbox
/// (`SupabaseRemoteWriter`, kind `water`).
public struct SupabaseWaterSource: WaterSource {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  /// `useTodayWaterLogs` (+ `created_at` cho thứ tự `newestFirst`).
  public func logs(userId: String, date: LocalDate) async throws -> [WaterLog] {
    let rows: [JSONValue] = try await client.from("water_logs")
      .select("id, amount_ml, logged_at, created_at")
      .eq("user_id", value: userId)
      .eq("date", value: date.description)
      .order("logged_at", ascending: false)
      .order("created_at", ascending: false)
      .order("id", ascending: false)
      .execute().value
    return rows.compactMap(WaterLog.init(row:))
  }

  /// `useWaterWeek` (+ `id`: không cộng hai lần lần uống còn trong outbox).
  public func rows(userId: String, from: LocalDate) async throws -> [WaterRow] {
    let rows: [JSONValue] = try await client.from("water_logs")
      .select("id, date, amount_ml")
      .eq("user_id", value: userId)
      .gte("date", value: from.description)
      .execute().value
    return rows.compactMap(WaterRow.init(row:))
  }

  /// `useRemoveLastWater`: tìm (`newestFirst`, `limit 1`) rồi xoá theo `id` +
  /// `user_id`, `confirmWrite` đếm hàng đã xoá.
  public func removeNewest(userId: String, date: LocalDate) async throws -> Int? {
    let found: [JSONValue] = try await client.from("water_logs")
      .select("id")
      .eq("user_id", value: userId)
      .eq("date", value: date.description)
      .order("logged_at", ascending: false)
      .order("created_at", ascending: false)
      .order("id", ascending: false)
      .limit(1)
      .execute().value
    guard let id = found.first?["id"]?.stringValue else { return nil }
    let gone: [JSONValue] = try await client.from("water_logs")
      .delete()
      .eq("id", value: id)
      .eq("user_id", value: userId)
      .select("id")
      .execute().value
    return gone.count
  }
}
