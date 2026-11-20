public import Foundation

/// "Tuần lên tạ" (KOA-T23, Kiệt 19/11: "nối thật vào buổi sau"): nhận lời khuyên tăng tải của thẻ
/// đầu tuần thì mục tiêu của từng bài (`OverloadPlan`) được áp vào các buổi trong tuần ấy — tạ mới
/// hay số rep mới thay số của mẫu. Không sửa mẫu, không đổi lịch; chỉ NÂNG, không bao giờ hạ.
/// Như `LighterSession`: lựa chọn nằm trên máy, theo (người, tuần).
public enum ProgressWeek {
  public struct Target: Sendable, Hashable, Codable {
    /// `nil`: giữ tạ của mẫu (bài không tạ).
    public let weightKg: Double?
    public let reps: Int
    public init(weightKg: Double?, reps: Int) {
      self.weightKg = weightKg
      self.reps = reps
    }
  }

  /// Mục tiêu theo khoá bài (`PersonalRecords.exerciseKey`) — chỉ những bài được khuyên tăng.
  public static func targets(from items: [OverloadPlan.Item]) -> [String: Target] {
    var out: [String: Target] = [:]
    for item in items {
      let key = PersonalRecords.exerciseKey(item.name)
      guard !key.isEmpty else { continue }
      switch item.advice {
      case .addWeight(_, let to, let reps): out[key] = Target(weightKg: to, reps: reps)
      case .addRep(let kg, _, let to): out[key] = Target(weightKg: kg, reps: to)
      case .hold, .notEnough: break
      }
    }
    return out
  }

  /// Bài sau khi áp mục tiêu: tạ / rep = lớn hơn giữa mẫu và mục tiêu.
  public static func apply(_ targets: [String: Target], to list: [TemplateExercise]) -> [TemplateExercise] {
    guard !targets.isEmpty else { return list }
    return list.map { ex in
      guard let t = targets[PersonalRecords.exerciseKey(ex.exerciseName)] else { return ex }
      return TemplateExercise(
        exerciseId: ex.exerciseId, exerciseName: ex.exerciseName, sets: ex.sets, reps: max(ex.reps, t.reps),
        weightKg: max(ex.weightKg, t.weightKg ?? 0), rpe: ex.rpe, restSeconds: ex.restSeconds, warmupSets: ex.warmupSets)
    }
  }

  static func key(userId: String, monday: LocalDate) -> String { "ascnd_progressweek.\(userId).\(monday)" }

  public static func set(
    _ targets: [String: Target], userId: String, week: LocalDate, in defaults: UserDefaults = .standard
  ) {
    let k = key(userId: userId, monday: week.weekStart)
    if targets.isEmpty {
      defaults.removeObject(forKey: k)
    } else if let data = try? JSONEncoder().encode(targets) {
      defaults.set(data, forKey: k)
    }
  }

  /// Mục tiêu đã nhận cho tuần chứa `date` (rỗng nếu chưa nhận).
  public static func targets(userId: String, date: LocalDate, in defaults: UserDefaults = .standard) -> [String: Target] {
    guard let data = defaults.data(forKey: key(userId: userId, monday: date.weekStart)),
      let t = try? JSONDecoder().decode([String: Target].self, from: data)
    else { return [:] }
    return t
  }
}
