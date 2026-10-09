public import ASCNDCore
import Foundation
import Supabase

/// `WeightLogSource` thật — `useTodayWeight` / `useLogWeight` trên `weight_logs`
/// (`UNIQUE(user_id, date)`, RLS theo `user_id`). Đường phát lại outbox
/// (`SupabaseRemoteWriter`, kind `weight`) đi qua CÙNG `write`.
public struct SupabaseWeightLog: WeightLogSource {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func weight(userId: String, date: LocalDate) async throws -> Double? {
    let rows: [JSONValue] = try await client.from("weight_logs")
      .select("weight_kg")
      .eq("user_id", value: userId)
      .eq("date", value: date.description)
      .limit(1)
      .execute().value
    return rows.first?["weight_kg"]?.doubleValue
  }

  public func log(userId: String, kg: Double, date: LocalDate) async throws {
    try await Self.write(client, row: WeightLog.row(userId: userId, kg: kg, date: date), userId: userId)
  }

  /// Upsert theo `(user_id, date)` — ghi đè, như RN — rồi `syncProfileWeight`.
  static func write(_ client: SupabaseClient, row: JSONValue, userId: String) async throws {
    try await client.from("weight_logs").upsert(row, onConflict: "user_id,date").execute()
    guard let kg = row["weight_kg"]?.doubleValue, let date = row["date"]?.stringValue else { return }
    await syncProfileWeight(client, userId: userId, kg: kg, date: date)
  }

  /// `syncProfileWeight` (`lib/weight-sync.ts`): `profiles.weight_kg` theo lần
  /// cân này — chỉ khi hợp lệ và KHÔNG có lần cân nào sau ngày ấy. Đọc hỏng thì
  /// để yên (lệch nhiều nhất một lần cân); lỗi ghi hồ sơ không được kiểm, như RN.
  static func syncProfileWeight(_ client: SupabaseClient, userId: String, kg: Double, date: String) async {
    guard WeightLog.plausible(kg) else { return }
    guard
      let newer: [JSONValue] = try? await client.from("weight_logs")
        .select("date")
        .eq("user_id", value: userId)
        .gt("date", value: date)
        .limit(1)
        .execute().value
    else { return }
    guard newer.isEmpty else { return }
    _ = try? await client.from("profiles")
      .update(["weight_kg": kg])
      .eq("user_id", value: userId)
      .execute()
  }
}
