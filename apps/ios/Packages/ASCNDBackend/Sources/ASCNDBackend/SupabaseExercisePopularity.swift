public import ASCNDCore
import Foundation
import Supabase

/// `exercise_popularity()` (migration 20261116120000, deploy 16/11): số buổi + số người tập mỗi
/// bài trong 90 ngày, chỉ bài có ≥ 5 người. Lỗi (mất mạng) thì ném — bên gọi giữ bản đã lưu
/// hay danh sách soạn tay.
public struct SupabaseExercisePopularity: ExercisePopularitySource {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func popularity() async throws -> [JSONValue] {
    try await client.rpc("exercise_popularity").execute().value
  }
}
