public import Foundation

/// Một dòng bài của buổi tập được chia sẻ (`WorkoutExerciseLine`,
/// `use-community.ts:53` @ fac9ac2) — đã qua `readWorkoutPayload`.
public struct SharedWorkoutLine: Sendable, Hashable {
  public let exerciseId: String?
  public let exerciseName: String
  /// Bài thuộc THƯ VIỆN CHUNG (không phải bài tự tạo của người đăng).
  public let library: Bool
  public let sets: Int
  public let reps: Int

  public init(exerciseId: String?, exerciseName: String, library: Bool, sets: Int, reps: Int) {
    self.exerciseId = exerciseId
    self.exerciseName = exerciseName
    self.library = library
    self.sets = sets
    self.reps = reps
  }
}

/// "Thử workout" (#430) — `workoutFromPost` + `tryIt` (`workout-post-card.tsx`)
/// @ fac9ac2: hành động sao chép template DUY NHẤT của RN. RN không có "nhân
/// bản template" hay "sửa template": builder chỉ tạo mới
/// (`workout-builder.tsx`, `useAddWorkoutTemplate`), nên native không bịa ra.
///
/// RN behavior (giữ nguyên):
/// - chép CẤU TRÚC, không chép mức tạ của người đăng: tạ về 0 (app tự gợi ý
///   tạ từ lịch sử của chính người tập);
/// - chỉ bài thuộc thư viện chung VÀ có `exerciseId`: bài tự tạo của người
///   đăng thuộc về họ (RLS của `exercises`), mẫu trỏ vào bài không đọc được là
///   mẫu hỏng; số bài bị bỏ trả về để màn hình NÓI RA;
/// - `sets` / `reps` ít nhất 1; tên = tiêu đề bài, không có thì tên mặc định;
/// - template mới loại `community`; không còn bài nào → không tạo (toast
///   `nCmTryNone`).
public enum TemplateCopy {
  public static let communityType = "community"

  public struct Draft: Sendable, Hashable {
    public let name: String
    public let exercises: [TemplateExercise]
    public let skipped: Int
  }

  /// `workoutFromPost`.
  public static func fromShared(title: String?, lines: [SharedWorkoutLine], fallbackName: String) -> Draft {
    let kept = lines.filter { $0.library && !($0.exerciseId ?? "").isEmpty }
    return Draft(
      name: title ?? fallbackName,
      exercises: kept.map {
        TemplateExercise(
          exerciseId: $0.exerciseId, exerciseName: $0.exerciseName, sets: max(1, $0.sets), reps: max(1, $0.reps),
          weightKg: 0)
      },
      skipped: lines.count - kept.count)
  }
}

extension PlanEditor {
  /// "Thử workout": một template MỚI (id mới, do màn sinh và giữ qua các lần
  /// bấm lại — bấm lại là idempotent) từ buổi được chia sẻ. Không gán ngày —
  /// RN không gán.
  ///
  /// Bản sao độc lập với nguồn: `TemplateExercise` là giá trị, xoá / gán lại
  /// template nguồn không chạm vào nó, và buổi đang tập dở không đổi (luật thay
  /// buổi của #401, TW-6a).
  public func copyShared(
    id: String, title: String?, lines: [SharedWorkoutLine], fallbackName: String
  ) async throws(Refusal) -> (template: WorkoutTemplate, skipped: Int) {
    let draft = TemplateCopy.fromShared(title: title, lines: lines, fallbackName: fallbackName)
    let template = try await create(id: id, name: draft.name, type: TemplateCopy.communityType, exercises: draft.exercises)
    return (template, draft.skipped)
  }
}
