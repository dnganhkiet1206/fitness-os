public import Foundation

/// Phần thuần của màn "Tiến bộ từng bài" (`app/exercise-insight.tsx` @
/// fac9ac2) và `lib/plan-exercises.ts` — màn chỉ còn việc vẽ.
///
/// RN behavior (giữ nguyên):
/// - phạm vi theo kế hoạch (`planKeys`): hôm nay / cả tuần / tất cả; mặc định
///   cả tuần (một mặc định trống năm ngày trên bảy dạy người ta rằng màn hỏng);
///   ngày nghỉ không xếp gì; bài trong template gập theo `exerciseKey`;
/// - ba nhóm (`groupOf`): chưa đủ dữ liệu → "cần thêm buổi"; giảm / chững, bỏ
///   lâu, hay dao động → "đáng để ý"; còn lại → "đang ổn";
/// - con số đầu thẻ (`headline`) và dãy buổi so sánh (`seriesText`) theo đơn
///   vị của tài khoản.
public enum InsightScreen {
  public enum Group: String, Sendable, Hashable, CaseIterable {
    case attention, fine, thin
  }

  /// `groupOf`.
  public static func group(_ i: ExerciseInsight) -> Group {
    if i.trend == .insufficientData { return .thin }
    if i.trend == .declining || i.trend == .plateau { return .attention }
    let volatile = i.evidence.contains { if case .volatile = $0 { true } else { false } }
    if i.stale || volatile { return .attention }
    return .fine
  }

  /// Ba nhóm, mỗi nhóm giữ thứ tự của `insightsFrom`.
  public static func grouped(_ list: [ExerciseInsight]) -> [Group: [ExerciseInsight]] {
    var out: [Group: [ExerciseInsight]] = [.attention: [], .fine: [], .thin: []]
    for i in list { out[group(i), default: []].append(i) }
    return out
  }

  // MARK: - Phạm vi theo kế hoạch

  /// `PlanScope`.
  public enum Scope: String, Sendable, Hashable, CaseIterable {
    case today, week, all
  }

  /// `planKeys`: `nil` = không lọc ("tất cả"). Template trùng id thì cái sau
  /// thắng (`Map.set`); ngày nghỉ và ngày không có template không xếp gì.
  public static func planKeys(
    _ scope: Scope, days: [RoutineDay], templates: [WorkoutTemplate], today: LocalDate
  ) -> Set<String>? {
    guard scope != .all else { return nil }
    var byId: [String: WorkoutTemplate] = [:]
    for t in templates { byId[t.id] = t }
    let index = WorkoutPlanning.routineIndex(today)
    let wanted = scope == .today ? days.filter { $0.dayOfWeek == index } : days
    var out = Set<String>()
    for d in wanted where !d.isRest {
      guard let id = d.templateId, let t = byId[id] else { continue }
      for e in t.exercises {
        let key = PersonalRecords.exerciseKey(e.exerciseName)
        if !key.isEmpty { out.insert(key) }
      }
    }
    return out
  }

  /// Bài hiện trên màn: một bài (`ex`, từ chip trên hàng kế hoạch) thắng phạm vi.
  public static func shown(_ list: [ExerciseInsight], keys: Set<String>?, single: String?) -> [ExerciseInsight] {
    if let single, !single.isEmpty { return list.filter { $0.exerciseKey == single } }
    guard let keys else { return list }
    return list.filter { keys.contains($0.exerciseKey) }
  }

  // MARK: - Chữ số

  /// Con số đầu thẻ (`headline`): giây cho bài giữ tư thế, "—" khi chưa có rep,
  /// số rep trần khi không có tải, còn lại "tải × rep". Tải của bài không tạ
  /// cộng cân nặng cơ thể của buổi gần nhất trong dãy.
  /// - Parameter load: chữ của một mức tải dương ("62.5 kg") — màn đưa bản
  ///   theo locale.
  public static func headline(_ i: ExerciseInsight, load: (Double) -> String) -> String {
    if let d = i.bestDurationSec, i.bestReps == nil { return "\(d)s" }
    guard let reps = i.bestReps else { return "—" }
    let bw = bestSets(of: i)?.last?.bodyweightKg
    let total = (bw ?? 0) + (i.bestWeightKg ?? 0)
    if total <= 0 { return "\(reps)" }
    return "\(load(total)) × \(reps)"
  }

  /// `seriesText`: dãy buổi so sánh. Tải giống nhau (lệch < 0,05) ở mọi buổi
  /// có rep thì tải đứng đầu một lần ("60 kg → 8 · 8 · 9").
  public static func seriesText(
    _ values: [ExerciseTrend.Evidence.BestSet], load: (Double) -> String
  ) -> (prefix: String?, parts: [String]) {
    if values.allSatisfy({ $0.durationSec != nil && $0.reps == nil }) {
      return (nil, values.map { "\($0.durationSec ?? 0)s" })
    }
    let loads = values.map { ($0.bodyweightKg ?? 0) + ($0.weightKg ?? 0) }
    let first = loads.first ?? 0
    let same = loads.allSatisfy { abs($0 - first) < 0.05 }
    if same, first > 0, values.allSatisfy({ $0.reps != nil }) {
      return (load(first), values.map { "\($0.reps ?? 0)" })
    }
    return (nil, zip(values, loads).map { v, l in
      guard let reps = v.reps else { return "—" }
      return l > 0 ? "\(load(l)) × \(reps)" : "\(reps)"
    })
  }

  /// `% thay đổi` của thẻ: `Math.round(pct * 100)`, `nil` khi không có.
  public static func changePercent(_ i: ExerciseInsight) -> Int? {
    for e in i.evidence {
      if case .change(_, _, _, let pct) = e { return Int((pct * 100 + 0.5).rounded(.down)) }
    }
    return nil
  }

  /// Dãy chỉ số + ngày thật của buổi, cho đường nhỏ (`spark`).
  public static func spark(_ i: ExerciseInsight) -> [(date: LocalDate, value: Double)] {
    for e in i.evidence {
      if case .series(_, let values, let dates) = e { return Array(zip(dates, values)) }
    }
    return []
  }

  // MARK: - Dải "Lần trước" (`components/ascnd/exercise-progress.tsx`)

  /// `lastSetText`: con số của buổi gần nhất — giây cho bài giữ tư thế, `nil`
  /// khi chưa có rep (dải không hiện: mười hai dòng "chưa có gì" trên kế hoạch
  /// đầu tiên là mười hai món đồ đạc nói cùng một điều không gì). Cân nặng cơ
  /// thể chỉ cộng cho bài không tạ; không có tải thì "8 reps × không tạ".
  /// - Parameters:
  ///   - load: chữ của một mức tải dương ("62.5 kg").
  ///   - reps: "1 rep" / "8 reps" (`nRepsN`).
  ///   - bodyweight: chữ "không tạ" đã viết thường (`nRdBodyweight.toLowerCase()`).
  public static func lastSetText(
    _ p: ExercisePerformance, load: (Double) -> String, reps: (Int) -> String, bodyweight: String
  ) -> String? {
    if let d = p.bestDurationSec, p.bestReps == nil { return "\(d)s" }
    guard let r = p.bestReps else { return nil }
    let total = (p.bodyweightKg ?? 0) * (p.kind == .bodyweight ? 1 : 0) + (p.bestWeightKg ?? 0)
    if total <= 0 { return "\(reps(r)) × \(bodyweight)" }
    return "\(load(total)) × \(reps(r))"
  }

  /// % trên dải: `Math.round(changePct * 100)`, chỉ hiện khi khác 0.
  public static func stripPercent(_ i: ExerciseInsight?) -> Int? {
    guard let c = i?.changePct else { return nil }
    let pct = Int((c * 100 + 0.5).rounded(.down))
    return pct == 0 ? nil : pct
  }

  /// Các set tốt nhất của dãy so sánh (`best-sets`).
  public static func bestSets(of i: ExerciseInsight) -> [ExerciseTrend.Evidence.BestSet]? {
    for e in i.evidence {
      if case .bestSets(let s) = e { return s }
    }
    return nil
  }
}
