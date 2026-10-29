public import Foundation

/// Tăng tải cho các bài của buổi hôm nay (Kiệt duyệt mock 28/10: thẻ "Tăng tải hôm
/// nay" nằm sau thẻ việc chính của Today, vuốt sang để xem).
///
/// Không thêm công thức mới: "có nên tăng" là `readiness` của phân tích 90 ngày
/// (`ExerciseTrend.readiness`); ở đây chỉ chọn TĂNG GÌ, theo loại bài:
/// - bài nặng (`compound`): +1 bậc tạ (2,5 kg / 5 lb), giữ số rep của set đỉnh;
/// - bài cô lập (`isolation`): +1 rep tới số rep của buổi + 3, rồi +1 bậc tạ và về
///   lại số rep của buổi;
/// - bài thân người (`bodyweight`): +1 rep;
/// - bài giữ (`timed`): giữ mức.
/// Hồi phục thấp hôm nay (`DailyPlan.Reason.lowRecovery`): không gợi ý tăng — như
/// chốt chặn "sẵn sàng đỏ" của `LoadProgression`.
public enum OverloadPlan {
  public enum Advice: Sendable, Hashable {
    /// Tạ mới (kg) với cùng số rep.
    case addWeight(fromKg: Double, toKg: Double, reps: Int)
    /// Thêm rep ở cùng mức tạ (`nil` = không tạ).
    case addRep(weightKg: Double?, from: Int, to: Int)
    /// Giữ mức lần trước.
    case hold(weightKg: Double?, reps: Int?)
    /// Chưa đủ buổi để nói (`sessions` = số buổi đã ghi trong 90 ngày).
    case notEnough(sessions: Int)

    public var isUp: Bool {
      switch self {
      case .addWeight, .addRep: true
      case .hold, .notEnough: false
      }
    }
  }

  public struct Item: Sendable, Hashable, Identifiable {
    public var id: String { name }
    public let name: String
    public let advice: Advice
  }

  /// Bài cô lập: thêm rep tới số rep của buổi + 3 rồi mới tăng tạ.
  public static let repHeadroom = 3

  /// Bậc tạ theo đơn vị người dùng: 2,5 kg hay 5 lb (đổi ra kg).
  public static func stepKg(_ unit: WeightUnit) -> Double {
    unit == .lbs ? 5 / Units.lbPerKg : 2.5
  }

  /// Các bài của buổi theo thứ tự của buổi; bài trùng tên chỉ một dòng.
  public static func items(
    template: WorkoutTemplate, insight: (String) -> ExerciseInsight?, last: (String) -> ExercisePerformance?,
    stepKg: Double, lowRecovery: Bool = false
  ) -> [Item] {
    var seen = Set<String>()
    var out: [Item] = []
    for ex in template.exercises {
      let key = PersonalRecords.exerciseKey(ex.exerciseName)
      guard !key.isEmpty, seen.insert(key).inserted else { continue }
      out.append(
        Item(
          name: ex.exerciseName,
          advice: advice(
            target: ex, insight: insight(ex.exerciseName), last: last(ex.exerciseName), stepKg: stepKg,
            lowRecovery: lowRecovery)))
    }
    return out
  }

  static func advice(
    target: TemplateExercise, insight: ExerciseInsight?, last: ExercisePerformance?, stepKg: Double,
    lowRecovery: Bool
  ) -> Advice {
    guard let last, let insight else { return .notEnough(sessions: 0) }
    let weight = last.bestWeightKg.flatMap { $0 > 0 ? $0 : nil }
    let reps = last.topSetReps ?? last.bestReps
    if insight.sessions < ExerciseTrend.minSessions { return .notEnough(sessions: insight.sessions) }
    let hold = Advice.hold(weightKg: weight, reps: reps)
    guard insight.readiness == .readyToProgress, !lowRecovery, let reps else { return hold }
    switch last.kind {
    case .timed:
      return hold
    case .bodyweight:
      return .addRep(weightKg: weight, from: reps, to: reps + 1)
    case .compound:
      guard let weight else { return .addRep(weightKg: nil, from: reps, to: reps + 1) }
      return .addWeight(fromKg: weight, toKg: weight + stepKg, reps: reps)
    case .isolation:
      guard let weight else { return .addRep(weightKg: nil, from: reps, to: reps + 1) }
      let ceiling = max(target.reps, 1) + repHeadroom
      if reps < ceiling { return .addRep(weightKg: weight, from: reps, to: reps + 1) }
      return .addWeight(fromKg: weight, toKg: weight + stepKg, reps: max(target.reps, 1))
    }
  }
}
