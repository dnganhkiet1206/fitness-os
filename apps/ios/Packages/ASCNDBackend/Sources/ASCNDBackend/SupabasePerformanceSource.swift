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
