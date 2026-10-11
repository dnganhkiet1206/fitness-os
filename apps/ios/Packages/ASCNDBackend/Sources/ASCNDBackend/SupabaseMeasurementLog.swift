public import ASCNDCore
import Foundation
import Supabase

/// `MeasurementLogSource` thật (#527, `log-measurement`): `body_measurements`.
public struct SupabaseMeasurementLog: MeasurementLogSource {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func upsert(_ row: JSONValue) async throws {
    try await Self.write(client, row: row)
  }

  /// `useUpsertBodyMeasurement` / `case 'measurement'` của `offline-write.ts`:
  /// upsert theo `(user_id, date)` — ghi lại cùng ngày là sửa. Không dựng lại
  /// `daily_logs` (bảng ấy không có trường số đo).
  static func write(_ client: SupabaseClient, row: JSONValue) async throws {
    try await client.from("body_measurements").upsert(row, onConflict: "user_id,date").execute()
  }
}
