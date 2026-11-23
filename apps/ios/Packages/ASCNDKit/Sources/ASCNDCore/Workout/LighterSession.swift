public import Foundation

/// "Tập nhẹ hơn" (#527 GĐ1, Kiệt 21/10): bớt MỘT hiệp làm việc mỗi bài cho buổi
/// HÔM NAY. Không sửa mẫu, không đổi tạ, không đổi lịch; bài chỉ còn một hiệp thì
/// giữ nguyên. Người dùng tự chọn — đây là phương án, không phải kết luận y tế.
///
/// Lựa chọn nằm trên máy, theo (người, ngày, mẫu): mở lại app trong ngày vẫn là
/// buổi nhẹ; ngày khác, hay mẫu khác, là buổi đầy đủ như lịch. Server không cần
/// biết — buổi ghi lên vẫn là các hiệp đã tập thật.
public enum LighterSession {
  /// Bài sau khi bớt một hiệp (tối thiểu một). `loadFactor` < 1 (tuần nhẹ sau kỳ nghỉ dài, KOA-T04): tạ
  /// cũng giảm theo, làm tròn XUỐNG theo bước tạ (`lighterWeight`).
  public static func exercises(_ list: [TemplateExercise], loadFactor: Double = 1) -> [TemplateExercise] {
    list.map {
      TemplateExercise(
        exerciseId: $0.exerciseId, exerciseName: $0.exerciseName, sets: max(1, $0.sets - 1), reps: $0.reps,
        weightKg: lighterWeight($0.weightKg, factor: loadFactor), rpe: $0.rpe, restSeconds: $0.restSeconds,
        warmupSets: $0.warmupSets)
    }
  }

  /// Tạ của tuần nhẹ: `kg × factor`, làm tròn XUỐNG theo bước tạ — 2,5 kg (đòn / máy, từ 25 kg), 1 kg (tạ đơn
  /// 5–25 kg), 0,5 kg (nhẹ hơn): bước nhỏ ở tạ nhẹ để không giảm quá nhiều (10 kg × 0,9 = 9, không phải 7,5) —
  /// để không bao giờ nặng hơn lời hứa trên thẻ. Không tạ (bài tạ người) giữ 0; `factor` ≥ 1 giữ nguyên.
  public static func lighterWeight(_ kg: Double, factor: Double) -> Double {
    guard factor < 1, kg > 0 else { return kg }
    let target = kg * factor
    let step = target >= 25 ? 2.5 : target >= 5 ? 1 : 0.5
    let down = (target / step + 1e-9).rounded(.down) * step
    let r = down > 0 ? down : target
    return (r * 100).rounded() / 100
  }

  static func key(userId: String, date: LocalDate, templateId: String) -> String {
    "ascnd_lighter.\(userId).\(date).\(templateId)"
  }

  static func loadKey(userId: String, date: LocalDate, templateId: String) -> String {
    "ascnd_lighter_load.\(userId).\(date).\(templateId)"
  }

  /// Hệ số tạ đã nhận cùng tuần nhẹ cho (người, ngày, mẫu); 1 khi không có (bản nhẹ thường chỉ bớt hiệp).
  public static func loadFactor(userId: String, date: LocalDate, templateId: String, in defaults: UserDefaults = .standard) -> Double {
    let v = defaults.double(forKey: loadKey(userId: userId, date: date, templateId: templateId))
    return v > 0 && v < 1 ? v : 1
  }

  public static func setLoadFactor(
    _ f: Double, userId: String, date: LocalDate, templateId: String, in defaults: UserDefaults = .standard
  ) {
    let k = loadKey(userId: userId, date: date, templateId: templateId)
    if f > 0, f < 1 { defaults.set(f, forKey: k) } else { defaults.removeObject(forKey: k) }
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

  /// `progress`: mục tiêu "Tuần lên tạ" đã nhận (KOA-T23) — chỉ áp cho buổi đầy đủ.
  /// `loadFactor`: hệ số tạ của tuần nhẹ (KOA-T04) — chỉ áp cho bản nhẹ.
  public func sessionPlan(
    variant: TodayVariant, progress: [String: ProgressWeek.Target] = [:], loadFactor: Double = 1
  ) -> WorkoutSessionController.Plan? {
    guard let template else { return sessionPlan }
    if variant == .full, progress.isEmpty { return sessionPlan }
    let list: [TemplateExercise]
    switch variant {
    case .short: list = ShortSession.exercises(template.exercises)
    case .lighter: list = LighterSession.exercises(template.exercises, loadFactor: loadFactor)
    case .full: list = ProgressWeek.apply(progress, to: template.exercises)
    }
    return .init(date: date, templateId: template.id, templateName: template.name, rows: WorkoutPlanning.rows(list))
  }
}
