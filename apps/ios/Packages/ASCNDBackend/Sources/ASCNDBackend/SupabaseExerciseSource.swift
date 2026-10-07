public import ASCNDCore
import Foundation
import Supabase

/// `ExerciseSource` thật: đúng truy vấn của `useExercises` (`use-library.ts:200`)
/// — bài mẫu (`user_id` null) + bài của mình, xếp `muscle_group` rồi `name`.
public struct SupabaseExerciseSource: ExerciseSource {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func exercises(userId: String) async throws -> [LibraryExercise] {
    let rows: [Row] = try await client.from("exercises")
      .select("id, user_id, name, muscle_group, equipment, exercise_kind")
      .or("user_id.is.null,user_id.eq.\(userId)")
      .order("muscle_group")
      .order("name")
      .execute().value
    return Self.map(rows)
  }

  struct Row: Decodable, Sendable {
    let id: String
    let user_id: String?
    let name: String?
    let muscle_group: String?
    let equipment: String?
    let exercise_kind: String?
  }

  /// Hàng → domain. Id chữ thường (uuid so khớp không phân biệt hoa thường);
  /// hàng không tên thì bỏ — không có gì để chọn hay tìm.
  static func map(_ rows: [Row]) -> [LibraryExercise] {
    rows.compactMap { r in
      guard let name = r.name, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
      return LibraryExercise(
        id: r.id.lowercased(), userId: r.user_id?.lowercased(), name: name, muscleGroup: r.muscle_group,
        equipment: r.equipment, kind: r.exercise_kind)
    }
  }
}
