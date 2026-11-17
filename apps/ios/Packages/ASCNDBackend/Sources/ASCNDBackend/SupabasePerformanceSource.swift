public import ASCNDCore
import Foundation
import Supabase

/// `PerformanceSource` thật: các buổi trong cửa sổ qua lượt đọc chung
/// `SharedWorkoutSessions` (R2-OPS-08), lọc trong bộ nhớ theo đúng `since` —
/// chỉ cột "lần trước" cần (`id, date_time, sets`).
public struct SupabasePerformanceSource: PerformanceSource {
  private let client: SupabaseClient
  private let shared: SharedWorkoutSessions

  public init(backend: Backend) {
    self.client = backend.client
    self.shared = backend.sharedSessions
  }

  public func sessions(userId: String, since: EpochMillis) async throws -> [SessionHistoryRow] {
    Self.historyRows(try await shared.rows(userId: userId, since: since))
  }

  /// `useWeightHistory(days)` (`use-fitness-data.ts:884`): `weight_logs`
  /// (`date`, `weight_kg`) của mình, từ ngày `since`, cũ trước (#417).
  public func weighIns(userId: String, since: LocalDate) async throws -> [WeighIn] {
    let rows: [WeightRow] = try await client.from("weight_logs")
      .select("date, weight_kg")
      .eq("user_id", value: userId)
      .gte("date", value: since.description)
      .order("date", ascending: true)
      .execute().value
    return Self.weighIns(rows)
  }

  struct WeightRow: Decodable, Sendable {
    let date: String
    let weight_kg: JSONValue?
  }

  /// Ngày không đọc được hay cân nặng không phải số → bỏ (`Number(...)` của
  /// baseline cho NaN, và `bodyweightOn` bỏ nó).
  static func weighIns(_ rows: [WeightRow]) -> [WeighIn] {
    rows.compactMap { r in
      guard let d = LocalDate(String(r.date.prefix(10))) else { return nil }
      let kg: Double?
      switch r.weight_kg {
      case .number(let n)?: kg = n
      case .string(let s)?: kg = Double(s)
      default: kg = nil
      }
      return kg.map { WeighIn(date: d, kg: $0) }
    }
  }

  /// Hàng không đọc được id hay thời điểm thì bỏ — không đoán buổi ấy thuộc
  /// ngày nào. Id về chữ thường như truy vấn cũ.
  static func historyRows(_ rows: [JSONValue]) -> [SessionHistoryRow] {
    rows.compactMap { row in
      guard let id = row["id"]?.stringValue,
        let at = row["date_time"]?.stringValue.flatMap({ EpochMillis(iso8601: $0) })
      else { return nil }
      return SessionHistoryRow(id: id.lowercased(), at: at, sets: row["sets"])
    }
  }
}
