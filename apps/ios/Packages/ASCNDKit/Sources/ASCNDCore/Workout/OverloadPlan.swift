import Foundation

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
///
/// Đối chiếu ACSM 2009 (Kiệt 03/11, `docs/research/WEEK_RULES_EVIDENCE.md`): chỉ tăng tạ khi
/// mọi set làm việc vượt đích ít nhất 1 rep ở HAI buổi liên tiếp; bài nặng tăng ~5% làm tròn
/// xuống theo bậc tạ, tối đa 10% (bậc nhỏ nhất vượt 10% thì thêm rep thay vì tạ). Bài cô lập
/// tăng tiến kép: thêm rep tới đích + 3 ở hai buổi liền rồi mới lên một bậc.
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
  /// Bài nặng: phần trăm tăng tạ và trần (ACSM 2009: 2–10%, nhóm cơ lớn tăng nhiều hơn).
  public static let compoundPercent = 0.05
  public static let maxPercent = 0.10

  /// - Parameter previous: buổi TRƯỚC buổi gần nhất của bài; `nil` = chưa đủ hai buổi để tăng tạ.
  public static func items(
    template: WorkoutTemplate, insight: (String) -> ExerciseInsight?, last: (String) -> ExercisePerformance?,
    previous: (String) -> ExercisePerformance? = { _ in nil }, stepKg: Double, lowRecovery: Bool = false
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
            target: ex, insight: insight(ex.exerciseName), last: last(ex.exerciseName),
            previous: previous(ex.exerciseName), stepKg: stepKg, lowRecovery: lowRecovery)))
    }
    return out
  }

  /// Trung bình mỗi set làm việc đạt ít nhất `reps` ở cả hai buổi (cùng mức tạ trở lên).
  static func twoAtTop(_ last: ExercisePerformance, _ previous: ExercisePerformance?, reps: Int) -> Bool {
    guard let previous, last.setCount > 0, previous.setCount > 0 else { return false }
    let lastAvg = Double(last.totalReps) / Double(last.setCount)
    let prevAvg = Double(previous.totalReps) / Double(previous.setCount)
    return lastAvg >= Double(reps) && prevAvg >= Double(reps)
      && (previous.bestWeightKg ?? 0) >= (last.bestWeightKg ?? 0) - 0.05
  }

  /// Tạ cộng thêm cho bài nặng: ~5% làm tròn xuống theo bậc; `nil` khi bậc nhỏ nhất đã vượt 10%.
  static func compoundIncrement(_ weight: Double, stepKg: Double) -> Double? {
    let steps = (weight * compoundPercent / stepKg).rounded(.down)
    if steps >= 1 { return steps * stepKg }
    return stepKg <= weight * maxPercent + 0.0001 ? stepKg : nil
  }

  static func advice(
    target: TemplateExercise, insight: ExerciseInsight?, last: ExercisePerformance?,
    previous: ExercisePerformance? = nil, stepKg: Double, lowRecovery: Bool
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
      guard twoAtTop(last, previous, reps: max(target.reps, 1) + 1),
        let add = compoundIncrement(weight, stepKg: stepKg)
      else { return .addRep(weightKg: weight, from: reps, to: reps + 1) }
      return .addWeight(fromKg: weight, toKg: weight + add, reps: max(target.reps, 1))
    case .isolation:
      guard let weight else { return .addRep(weightKg: nil, from: reps, to: reps + 1) }
      let ceiling = max(target.reps, 1) + repHeadroom
      if !twoAtTop(last, previous, reps: ceiling) { return .addRep(weightKg: weight, from: reps, to: min(reps + 1, ceiling)) }
      return .addWeight(fromKg: weight, toKg: weight + stepKg, reps: max(target.reps, 1))
    }
  }
}
