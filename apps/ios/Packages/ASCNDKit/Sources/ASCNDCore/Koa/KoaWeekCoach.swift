import Foundation

/// Đầu tuần, Koa tóm tắt tuần trước và đề xuất kiểu tuần này (Kiệt duyệt mock 03/11). Người dùng
/// nhận hoặc giữ lịch như cũ; không nhận thì không đổi gì. Luật đối chiếu nghiên cứu gốc
/// (`docs/research/WEEK_RULES_EVIDENCE.md`):
/// - Tuần nhẹ: tuần trước lỡ từ một nửa số buổi, hoặc nghỉ ≥ 7 ngày. Bớt 1 set mỗi bài (sức mạnh
///   giữ gần nguyên tới ~3 tuần nghỉ, giảm khối lượng giữ cường độ vẫn duy trì được: McMaster 2013,
///   Spiering 2021). Nghỉ 21–55 ngày gợi ý giảm 10% tạ, ≥ 56 ngày giảm 20% (lựa chọn của app trong
///   khoảng nghiên cứu cho phép, chưa thử nghiệm nào kiểm đúng số này).
/// - Tuần lên tạ: đủ buổi theo lịch và có bài đủ điều kiện lên tạ theo `OverloadPlan` (ACSM 2009:
///   vượt đích ở hai buổi liên tiếp).
/// - Giữ nhịp: còn lại.
public enum KoaWeekCoach {
  public enum Kind: Sendable, Hashable {
    /// `loadFactor` < 1: gợi ý giảm tạ theo độ dài kỳ nghỉ.
    case light(loadFactor: Double)
    case progress
    case steady
  }

  public struct LastWeek: Sendable, Hashable {
    public let planned: Int
    public let done: Int
    public init(planned: Int, done: Int) {
      self.planned = planned
      self.done = done
    }
    public var missedHalf: Bool { planned > 0 && (planned - done) * 2 >= planned }
  }

  public static let lightAfterDaysOff = 7
  /// Thẻ hiện từ thứ Hai tới hết thứ Tư.
  public static let showDays = 3

  public static func loadFactor(daysOff: Int) -> Double {
    if daysOff >= 56 { return 0.8 }
    if daysOff >= 21 { return 0.9 }
    return 1
  }

  /// - Parameters:
  ///   - daysOff: số ngày từ buổi gần nhất tới hôm nay (không tính hôm nay).
  ///   - targets: gợi ý tăng tải của các bài trong lịch tuần này (`OverloadPlan`).
  public static func decide(lastWeek: LastWeek, daysOff: Int, targets: [OverloadPlan.Item]) -> Kind {
    if daysOff >= lightAfterDaysOff || lastWeek.missedHalf {
      return .light(loadFactor: loadFactor(daysOff: daysOff))
    }
    let addsWeight = targets.contains { if case .addWeight = $0.advice { true } else { false } }
    if lastWeek.planned > 0, lastWeek.done >= lastWeek.planned, addsWeight { return .progress }
    return .steady
  }

  /// Có nên hiện thẻ hôm nay: tuần trước có lịch, trong ba ngày đầu tuần, chưa trả lời.
  public static func shows(today: LocalDate, lastWeek: LastWeek, answered: Bool) -> Bool {
    !answered && lastWeek.planned > 0 && WorkoutPlanning.routineIndex(today) < showDays
  }

  /// Bài lên tạ trước, rồi thêm rep; bỏ bài chưa đủ dữ liệu hay giữ mức.
  public static func shownTargets(_ targets: [OverloadPlan.Item]) -> [OverloadPlan.Item] {
    let ups = targets.filter(\.advice.isUp)
    return ups.filter { if case .addWeight = $0.advice { true } else { false } }
      + ups.filter { if case .addRep = $0.advice { true } else { false } }
  }
}
