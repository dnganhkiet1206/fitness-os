public import ASCNDCore
import Foundation
import Supabase

/// `TemplateSource` thật: đọc kế hoạch tuần và các template của người dùng —
/// đúng hai truy vấn của baseline (`useRoutineDays`, `useWorkoutTemplates`,
/// `use-library.ts:349`, `:387`), chỉ lấy những cột màn tập cần.
public struct SupabaseTemplateSource: TemplateSource {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func fetch(userId: String) async throws -> TemplateSnapshot {
    async let days: [RoutineRow] = client.from("routine_days")
      .select("day_of_week, is_rest, is_deload, template_id")
      .eq("user_id", value: userId)
      .order("day_of_week")
      .execute().value
    async let templates: [TemplateRow] = client.from("workout_templates")
      .select("id, name, exercises")
      .eq("user_id", value: userId)
      .order("name")
      .execute().value
    return try await Self.snapshot(days: days, templates: templates, at: SystemWallClock().nowMillis())
  }

  struct RoutineRow: Decodable, Sendable {
    let day_of_week: Int
    let is_rest: Bool?
    let is_deload: Bool?
    let template_id: String?
  }

  struct TemplateRow: Decodable, Sendable {
    let id: String
    let name: String?
    let exercises: JSONValue?
  }

  /// Ánh xạ hàng → domain. Cột nullable lấy đúng mặc định baseline đọc:
  /// `!!is_rest`, `?? false`; `exercises` không phải mảng → không có bài.
  static func snapshot(days: [RoutineRow], templates: [TemplateRow], at: EpochMillis) -> TemplateSnapshot {
    TemplateSnapshot(
      routine: days.map {
        RoutineDay(dayOfWeek: $0.day_of_week, isRest: $0.is_rest ?? false, isDeload: $0.is_deload ?? false,
                   templateId: $0.template_id?.lowercased())
      },
      templates: templates.map {
        WorkoutTemplate(id: $0.id.lowercased(), name: $0.name ?? "", exercisesJSON: $0.exercises)
      },
      fetchedAt: at)
  }
}
