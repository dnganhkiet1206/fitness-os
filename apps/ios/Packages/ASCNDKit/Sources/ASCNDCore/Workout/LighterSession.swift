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

/// "Buổi ngắn" khi quay lại sau ≥ 4 tuần nghỉ (`DailyPlan.ComebackStep.short`):
/// giữ nửa số bài ĐẦU của buổi (bài chính thường xếp trước), ít nhất hai bài; số
/// hiệp, số lần, tạ giữ nguyên. Lựa chọn lưu theo (người, ngày, mẫu) như bản nhẹ.
public enum ShortSession {
  public static func exercises(_ list: [TemplateExercise]) -> [TemplateExercise] {
    guard list.count > 2 else { return list }
    return Array(list.prefix(max(2, (list.count + 1) / 2)))
  }

  static func key(userId: String, date: LocalDate, templateId: String) -> String {
    "ascnd_short.\(userId).\(date).\(templateId)"
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

/// Bản của buổi hôm nay người dùng đã chọn.
public enum TodayVariant: Sendable, Hashable {
  case full, lighter, short
}

extension TodayPlan {
  /// Kế hoạch buổi, bản nhẹ khi `lighter` (một hiệp ít hơn mỗi bài).
  public func sessionPlan(lighter: Bool) -> WorkoutSessionController.Plan? {
    sessionPlan(variant: lighter ? .lighter : .full)
  }

  public func sessionPlan(variant: TodayVariant) -> WorkoutSessionController.Plan? {
    guard variant != .full, let template else { return sessionPlan }
    let list = variant == .short ? ShortSession.exercises(template.exercises) : LighterSession.exercises(template.exercises)
    return .init(date: date, templateId: template.id, templateName: template.name, rows: WorkoutPlanning.rows(list))
  }
}
