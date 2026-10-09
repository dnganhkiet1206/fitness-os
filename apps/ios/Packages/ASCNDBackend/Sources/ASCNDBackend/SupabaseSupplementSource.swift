public import ASCNDCore
import Foundation
import Supabase

/// `SupplementSource` thật — đúng các truy vấn của `use-library.ts` trên
/// `supplements` / `supplement_intake_logs` (RLS `auth.uid() = user_id`).
public struct SupabaseSupplementSource: SupplementSource {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  /// `useSupplementChecklist`, lượt 1.
  public func supplements(userId: String) async throws -> [Supplement] {
    let rows: [Row] = try await client.from("supplements")
      .select("id, name, dose_text, timing, category")
      .eq("user_id", value: userId)
      .order("timing")
      .execute().value
    return rows.map {
      Supplement(id: $0.id, name: $0.name, doseText: $0.dose_text, timing: $0.timing, category: $0.category, taken: false)
    }
  }

  /// `useSupplementChecklist`, lượt 2: intake trong khoảng ngày địa phương.
  public func takenIds(userId: String, start: String, end: String) async throws -> Set<String> {
    let rows: [Intake] = try await client.from("supplement_intake_logs")
      .select("supplement_id, taken")
      .eq("user_id", value: userId)
      .gte("date_time", value: start)
      .lt("date_time", value: end)
      .execute().value
    return Set(rows.filter { $0.taken == true }.map { $0.supplement_id.lowercased() })
  }

  /// `useAddSupplement`.
  public func insert(_ row: JSONValue) async throws {
    try await client.from("supplements").insert(row).execute()
  }

  /// `useDeleteSupplement` + `confirmWrite`: đếm hàng đã xoá.
  public func delete(id: String, userId: String) async throws -> Int {
    let gone: [JSONValue] = try await client.from("supplements")
      .delete()
      .eq("id", value: id)
      .eq("user_id", value: userId)
      .select("id")
      .execute().value
    return gone.count
  }

  struct Row: Decodable, Sendable {
    let id: String
    let name: String
    let dose_text: String?
    let timing: String?
    let category: String?
  }

  struct Intake: Decodable, Sendable {
    let supplement_id: String
    let taken: Bool?
  }
}
