public import Foundation

/// "Tập nhẹ hơn" (#527 GĐ1, Kiệt 21/10): bớt MỘT hiệp làm việc mỗi bài cho buổi
/// HÔM NAY. Không sửa mẫu, không đổi tạ, không đổi lịch; bài chỉ còn một hiệp thì
/// giữ nguyên. Người dùng tự chọn — đây là phương án, không phải kết luận y tế.
///
/// Lựa chọn nằm trên máy, theo (người, ngày, mẫu): mở lại app trong ngày vẫn là
/// buổi nhẹ; ngày khác, hay mẫu khác, là buổi đầy đủ như lịch. Server không cần
/// biết — buổi ghi lên vẫn là các hiệp đã tập thật.
public enum LighterSession {
  /// Bài sau khi bớt một hiệp (tối thiểu một).
  public static func exercises(_ list: [TemplateExercise]) -> [TemplateExercise] {
    list.map {
      TemplateExercise(
        exerciseId: $0.exerciseId, exerciseName: $0.exerciseName, sets: max(1, $0.sets - 1), reps: $0.reps,
        weightKg: $0.weightKg, rpe: $0.rpe, restSeconds: $0.restSeconds, warmupSets: $0.warmupSets)
    }
  }

  static func key(userId: String, date: LocalDate, templateId: String) -> String {
    "ascnd_lighter.\(userId).\(date).\(templateId)"
  }

  public static func isOn(userId: String, date: LocalDate, templateId: String, in defaults: UserDefaults = .standard) -> Bool {
    defaults.bool(forKey: key(userId: userId, date: date, templateId: templateId))
  }

  public static func set(
    _ on: Bool, userId: String, date: LocalDate, templateId: String, in defaults: UserDefaults = .standard
  ) {
    let k = key(userId: userId, date: date, templateId: templateId)
    if on { defaults.set(true, forKey: k) } else { defaults.removeObject(forKey: k) }
  }
}

extension TodayPlan {
  /// Kế hoạch buổi, bản nhẹ khi `lighter` (một hiệp ít hơn mỗi bài).
  public func sessionPlan(lighter: Bool) -> WorkoutSessionController.Plan? {
    guard lighter, let template else { return sessionPlan }
    return .init(
      date: date, templateId: template.id, templateName: template.name,
      rows: WorkoutPlanning.rows(LighterSession.exercises(template.exercises)))
  }
}
