public import ASCNDCore
import Foundation
import Supabase

/// `exercise_popularity()` (migration 20261116120000, CHƯA DEPLOY): số buổi + số người tập mỗi
/// bài trong 90 ngày, chỉ bài có ≥ 5 người. Hàm chưa có trên server thì ném lỗi — bên gọi giữ
/// danh sách soạn tay.
public struct SupabaseExercisePopularity: ExercisePopularitySource {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func popularity() async throws -> [JSONValue] {
    try await client.rpc("exercise_popularity").execute().value
  }
}
