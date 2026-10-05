public import ASCNDCore
import Foundation
import Supabase

/// `ExerciseGuideSource` thật: đúng ba truy vấn của `useExerciseGuide`
/// (`use-exercise-guide.ts`) — hàng bài (bài mẫu + của mình), nội dung chữ,
/// media kèm chú thích. Phần chọn dòng / ngôn ngữ / media là của Core.
public struct SupabaseExerciseGuideSource: ExerciseGuideSource {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  public func guideRows(userId: String, id: String?) async throws -> [GuideExerciseRow] {
    var q = client.from("exercises")
      .select("id, user_id, name, muscle_group, equipment, video_url")
      .or("user_id.is.null,user_id.eq.\(userId)")
    if let id { q = q.eq("id", value: id) }
    let rows: [ExerciseRow] = try await q.execute().value
    return rows.map(\.domain)
  }

  public func guideContent(exerciseId: String) async throws -> [GuideContentRow] {
    let rows: [ContentRow] = try await client.from("exercise_guide_content")
      .select("locale, instructions, form_cues, common_mistakes")
      .eq("exercise_id", value: exerciseId)
      .execute().value
    return rows.map(\.domain)
  }

  public func guideMedia(exerciseId: String) async throws -> [MediaRow] {
    let rows: [MediaRowDTO] = try await client.from("exercise_media")
      .select("kind, uri, position, duration_s, poster_uri, alt, exercise_media_content(locale, title, description)")
      .eq("exercise_id", value: exerciseId)
      .execute().value
    return rows.map(\.domain)
  }

  struct ExerciseRow: Decodable, Sendable {
    let id: String
    let user_id: String?
    let name: String?
    let muscle_group: String?
    let equipment: String?
    let video_url: String?
    var domain: GuideExerciseRow {
      GuideExerciseRow(
        id: id.lowercased(), userId: user_id?.lowercased(), name: name ?? "", muscleGroup: muscle_group,
        equipment: equipment, videoUrl: video_url)
    }
  }

  struct ContentRow: Decodable, Sendable {
    let locale: String?
    let instructions: [String]?
    let form_cues: [String]?
    let common_mistakes: [String]?
    var domain: GuideContentRow {
      GuideContentRow(locale: locale ?? "", instructions: instructions, formCues: form_cues, commonMistakes: common_mistakes)
    }
  }

  struct CaptionRow: Decodable, Sendable {
    let locale: String?
    let title: String?
    let description: String?
  }

  struct MediaRowDTO: Decodable, Sendable {
    let kind: String?
    let uri: String?
    let position: Double?
    /// `numeric` của Postgres có thể tới dưới dạng chuỗi.
    let duration_s: JSONValue?
    let poster_uri: String?
    let alt: String?
    let exercise_media_content: [CaptionRow]?
    var domain: MediaRow {
      let seconds: Double? = switch duration_s {
      case .number(let n)?: n
      case .string(let s)?: Double(s.trimmingCharacters(in: .whitespaces))
      default: nil
      }
      return MediaRow(
        kind: kind, uri: uri, position: position, durationS: seconds, posterUri: poster_uri, alt: alt,
        captions: exercise_media_content?.map {
          MediaCaptionRow(locale: $0.locale ?? "", title: $0.title, description: $0.description)
        })
    }
  }
}
