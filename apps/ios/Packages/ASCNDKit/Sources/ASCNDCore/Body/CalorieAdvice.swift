public import Foundation

/// Lời khuyên calo trên `SmartGoals.Analysis` (09/11, Kiệt duyệt mock "Áp dụng gợi ý
/// calo" bản 2, `https://claude.ai/artifact/XtvfHmkLzoqyLBnmgLB2m9`).
///
/// Kiệt: "người dùng phải ăn thật" — đổi con số mục tiêu mà không ăn theo thì vô
/// nghĩa. Nên:
/// - chỉ gợi ý ĐỔI khi trung bình calo ghi được sát mục tiêu hiện tại (lệch < 10 %)
///   và gợi ý đến từ chính số ăn + số cân (`fromMeasurement`);
/// - cân đúng dải thì im lặng; gợi ý phải kéo cân về dải;
/// - ăn lệch hơn thì nói "ăn đủ mục tiêu hiện tại trước", không có nút đổi;
/// - chưa đủ 10 ngày ghi bữa thì không đoán (bỏ luật cũ ±150 / ±250 chỉ từ cân);
/// - vừa áp dụng mục tiêu mới thì 14 ngày "đang thử", không gợi ý đổi tiếp.
/// `SmartGoals.analyse` giữ nguyên (golden RN); lớp này đứng trên nó.
public enum CalorieAdvice: Sendable, Hashable {
  /// Không có gì để nói (cân đúng dải, hoặc thiếu số cân để đo).
  case none
  /// Cân lệch dải nhưng chưa đủ ngày ghi bữa để biết vì sao.
  case needIntake(loggedDays: Int)
  /// Ăn lệch mục tiêu hiện tại quá 10 %: mục tiêu chưa phải là vấn đề.
  case eatToTarget(avgKcal: Int, target: Int, loggedDays: Int)
  /// Ăn sát mục tiêu mà cân vẫn lệch: gợi ý đổi `from` → `to`.
  case change(from: Int, to: Int, avgKcal: Int, measuredDays: Int)
  /// Đang thử mục tiêu vừa áp dụng, xem lại từ `until`.
  case trial(since: LocalDate, until: LocalDate)

  /// Lệch tối đa giữa trung bình ăn và mục tiêu để coi là "ăn theo mục tiêu".
  public static let tolerance = 0.10
  public static let trialDays = 14

  /// Có nút "Áp dụng" không.
  public var canApply: Bool { if case .change = self { true } else { false } }

  /// Ngày có ghi bữa (kcal > 0) trong `daily_logs` của cửa sổ — ngày không ghi
  /// không phải ngày ăn 0 kcal.
  public static func intake(_ daily: [JSONValue]) -> (avg: Int, days: Int) {
    let k = daily.map { JS.number($0["kcal"]) }.filter { $0.isFinite && $0 > 0 }
    guard !k.isEmpty else { return (0, 0) }
    return (Int(JS.round(k.reduce(0, +) / Double(k.count))), k.count)
  }

  public static func advise(_ a: SmartGoals.Analysis, daily: [JSONValue], today: LocalDate, applied: LocalDate?)
    -> CalorieAdvice
  {
    if let applied, applied <= today {
      let until = applied.adding(days: trialDays)
      if today < until { return .trial(since: applied, until: until) }
    }
    // Cân đúng dải thì không bàn chuyện đổi calo, kể cả khi phép đo lệch.
    guard !a.onTrack else { return .none }
    // Gợi ý phải kéo cân VỀ dải: thấp hơn dải thì ăn thêm, cao hơn thì bớt.
    let fixes = a.weeklyChange < a.targetMin ? a.calorieAdjustment > 0 : a.calorieAdjustment < 0
    let measuredChange = a.fromMeasurement && a.calorieAdjustment != 0 && fixes
    let (avg, days) = intake(daily)
    guard days >= AdaptiveTDEE.minLoggedDays else { return .needIntake(loggedDays: days) }
    let target = a.currentCal
    if target > 0, abs(Double(avg - target)) / Double(target) > tolerance {
      return .eatToTarget(avgKcal: avg, target: target, loggedDays: days)
    }
    guard measuredChange else { return .none }
    return .change(from: target, to: target + a.calorieAdjustment, avgKcal: avg, measuredDays: a.measuredDays)
  }
}

/// Áp dụng / để sau của một tài khoản, lưu trên máy.
public struct CalorieAdviceMemory: Sendable {
  public let userId: String
  let store: any KeyValueStore

  public init(userId: String, store: any KeyValueStore) {
    self.userId = userId
    self.store = store
  }

  var appliedKey: String { "ascnd_calorie_applied.\(userId)" }
  var snoozeKey: String { "ascnd_calorie_snooze.\(userId)" }

  /// Ngày vừa áp dụng mục tiêu mới (bắt đầu 14 ngày thử).
  public var applied: LocalDate? { store.string(forKey: appliedKey).flatMap(LocalDate.init) }
  public func markApplied(_ day: LocalDate) {
    store.set(day.description, forKey: appliedKey)
    store.remove(snoozeKey)
  }
  /// Hoàn tác: như chưa áp dụng.
  public func clearApplied() { store.remove(appliedKey) }

  public static let snoozeDays = 7
  /// Gợi ý phải đổi thêm chừng này mới hiện lại trước hạn.
  public static let snoozeKcal = 100

  public func snooze(_ day: LocalDate, to kcal: Int) { store.set("\(day.description)|\(kcal)", forKey: snoozeKey) }

  /// Dòng ở Dinh dưỡng có hiện không: chỉ khi có gợi ý đổi, và không bị "Để sau"
  /// trong 7 ngày (trừ khi gợi ý đã đổi thêm ≥ 100 kcal).
  public func showsHint(_ advice: CalorieAdvice, today: LocalDate) -> Bool {
    guard case .change(_, let to, _, _) = advice else { return false }
    guard let raw = store.string(forKey: snoozeKey) else { return true }
    let parts = raw.split(separator: "|")
    guard parts.count == 2, let day = LocalDate(String(parts[0])), let kcal = Int(parts[1]) else { return true }
    if today >= day.adding(days: Self.snoozeDays) { return true }
    return abs(to - kcal) >= Self.snoozeKcal
  }
}
