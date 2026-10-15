public import Foundation

/// Chỉ số tập luyện trên thẻ vận động viên của CHÍNH MÌNH (15/10, chủ dự án: trang
/// cá nhân cần chất gym) — tính từ lịch sử buổi tập trên máy (`HistoryBook`, 90
/// ngày, local-first). Người khác: chờ server có chỉ số công khai.
public enum ProfileTraining {
  public struct Summary: Sendable, Hashable {
    /// Số buổi trong tháng dương lịch hiện tại.
    public let sessionsThisMonth: Int
    /// Số buổi có kỷ lục trong cửa sổ lịch sử (90 ngày).
    public let prSessions: Int
    /// 28 ngày gần nhất, cũ → mới (ô cuối là hôm nay): ngày đó có tập không.
    public let rhythm: [Bool]
    /// Số ngày có tập trong 28 ngày.
    public var activeDays: Int { rhythm.filter { $0 }.count }
  }

  public static let rhythmDays = 28

  public static func summary(_ entries: [HistoryEntry], now: EpochMillis, timeZone: TimeZone) -> Summary {
    let today = LocalDate(now, in: timeZone)
    let days = Set(entries.map { LocalDate($0.at, in: timeZone).daysSinceEpoch })
    let rhythm = (0..<rhythmDays).map { i in days.contains(today.daysSinceEpoch - (rhythmDays - 1 - i)) }
    let month = entries.filter {
      let d = LocalDate($0.at, in: timeZone)
      return d.year == today.year && d.month == today.month && d <= today
    }.count
    return Summary(sessionsThisMonth: month, prSessions: entries.filter(\.prDetected).count, rhythm: rhythm)
  }
}
