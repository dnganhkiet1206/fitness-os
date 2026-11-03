import Foundation

/// Hành trình của người dùng cùng Koa (02/11, Kiệt duyệt Koa Ecosystem V2). Mọi cột mốc TÍNH LẠI
/// từ dữ liệu đã lưu (buổi tập, kỷ lục, lịch tuần) qua đúng phép tính Gains, nên:
/// - không có bảng mốc riêng để lệch hay cộng trùng; gửi lại, đổi máy, mất mạng đều ra cùng kết quả;
/// - mỗi mốc có `id` cố định, dùng làm khoá cho "đã thấy" và cho thông báo, không bao giờ lặp.
/// Không có mốc nào về cân nặng hay calo.
public enum KoaJourney {
  public enum Kind: String, Sendable, Hashable, Codable, CaseIterable {
    case firstSession, sessions, fullWeek, firstFullWeek, record, rankUp, comeback
  }

  public struct Moment: Sendable, Hashable, Identifiable {
    /// Khoá cố định, ví dụ `rank:3`, `week:2026-11-02`, `record:2026-10-19`.
    public let id: String
    public let kind: Kind
    public let date: LocalDate
    /// Số đi kèm: hạng mới, số buổi, số ngày nghỉ trước khi quay lại.
    public let value: Int

    /// Mốc lớn: Koa phản ứng ở mọi nơi, có thể thành thông báo. Mốc nhỏ chỉ nằm trong hành trình.
    public var major: Bool {
      switch kind {
      case .firstSession, .firstFullWeek, .rankUp, .sessions: true
      case .record, .comeback, .fullWeek: false
      }
    }
  }

  /// Số buổi đáng ghi nhận: dày lúc đầu (cảm giác tiến bộ sớm), thưa dần.
  public static let sessionMarks = [5, 10, 25, 50, 100, 150, 200, 300, 500, 750, 1000]
  /// Nghỉ từ ngần này ngày trở lên rồi tập lại thì là một lần quay lại đáng ghi.
  public static let comebackGap = 7

  public static func moments(_ days: [KoaGains.Day], week: KoaGains.Week, today: LocalDate) -> [Moment] {
    let ledger = KoaGains.ledger(days, week: week, today: today)
    var out: [Moment] = []
    var count = 0
    var rank = 0
    var last: LocalDate?
    var weeks = 0
    for (day, b) in ledger {
      let active = days.contains { $0.date == day && $0.kind != .walk }
      if active {
        count += 1
        if count == 1 { out.append(Moment(id: "first", kind: .firstSession, date: day, value: 1)) }
        if sessionMarks.contains(count) {
          out.append(Moment(id: "sessions:\(count)", kind: .sessions, date: day, value: count))
        }
        if let last, day.daysSinceEpoch - last.daysSinceEpoch - 1 >= comebackGap {
          let off = day.daysSinceEpoch - last.daysSinceEpoch - 1
          out.append(Moment(id: "comeback:\(day)", kind: .comeback, date: day, value: off))
        }
        last = day
      }
      if b.personalRecord { out.append(Moment(id: "record:\(day)", kind: .record, date: day, value: 0)) }
      if b.fullWeek {
        weeks += 1
        let monday = KoaGains.monday(day)
        out.append(
          Moment(
            id: weeks == 1 ? "week:first" : "week:\(monday)", kind: weeks == 1 ? .firstFullWeek : .fullWeek, date: day,
            value: weeks))
      }
      let r = KoaGains.rank(b.total)
      if r > rank {
        for up in (rank + 1)...r { out.append(Moment(id: "rank:\(up)", kind: .rankUp, date: day, value: up)) }
        rank = r
      }
    }
    return out.sorted { $0.date != $1.date ? $0.date > $1.date : $0.major && !$1.major }
  }

  /// Tổng kết một tháng, chỉ từ buổi thật.
  public struct Month: Sendable, Hashable {
    public let year: Int
    public let month: Int
    public let sessions: Int
    public let records: Int
    public let fullWeeks: Int
    public let rankUps: [Int]
  }

  public static func month(_ moments: [Moment], days: [KoaGains.Day], year: Int, month: Int) -> Month {
    func inMonth(_ d: LocalDate) -> Bool { d.year == year && d.month == month }
    let sessions = Set(days.filter { $0.kind != .walk && inMonth($0.date) }.map(\.date)).count
    let mine = moments.filter { inMonth($0.date) }
    return Month(
      year: year, month: month, sessions: sessions, records: mine.filter { $0.kind == .record }.count,
      fullWeeks: mine.filter { $0.kind == .fullWeek || $0.kind == .firstFullWeek }.count,
      rankUps: mine.filter { $0.kind == .rankUp }.map(\.value).sorted())
  }
}

/// Nhịp 30 ngày (02/11, thay "chuỗi ngày"): đếm buổi trong cửa sổ cuốn chiếu, không có số liên tiếp
/// để gãy. Một ngày trống chỉ là một chấm trống. Ngày nghỉ đã hẹn và ngày tạm nghỉ được gọi tên.
public enum KoaRhythm {
  public static let window = 30

  public enum Day: Sendable, Hashable { case trained, rest, paused, open }

  public struct State: Sendable, Hashable {
    /// Cũ → mới, đúng `window` ngày, ngày cuối là hôm nay.
    public let days: [Day]
    public let sessions: Int
    /// Số buổi trong 30 ngày trước đó, để so.
    public let previous: Int
    public var change: Int { sessions - previous }
  }

  public static func state(
    _ history: [KoaGains.Day], week: KoaGains.Week, paused: (LocalDate) -> Bool = { _ in false }, today: LocalDate
  ) -> State {
    let trained = Set(history.filter { $0.kind != .walk }.map(\.date))
    let start = today.adding(days: -(window - 1))
    var days: [Day] = []
    var d = start
    while d <= today {
      if trained.contains(d) {
        days.append(.trained)
      } else if paused(d) {
        days.append(.paused)
      } else if week.isRest(d) {
        days.append(.rest)
      } else {
        days.append(.open)
      }
      d = d.adding(days: 1)
    }
    let prevStart = start.adding(days: -window)
    let previous = trained.filter { $0 >= prevStart && $0 < start }.count
    return State(days: days, sessions: days.filter { $0 == .trained }.count, previous: previous)
  }
}

/// Bộ điều phối khoảnh khắc của Koa: một nguồn duy nhất quyết định Koa nên nhắc mốc nào, để Hôm
/// nay, phòng, tổng kết và thông báo không mỗi nơi tự nói một kiểu. Mốc đã thấy ở bất kỳ đâu thì
/// không nhắc lại.
public enum KoaMomentFeed {
  /// Mốc lớn còn đáng nhắc trong ngần này ngày; mốc nhỏ chỉ trong ngày và hôm sau.
  public static let majorFreshDays = 3
  public static let minorFreshDays = 1

  public static func next(_ moments: [KoaJourney.Moment], seen: Set<String>, today: LocalDate) -> KoaJourney.Moment? {
    func fresh(_ m: KoaJourney.Moment) -> Bool {
      let age = today.daysSinceEpoch - m.date.daysSinceEpoch
      return age >= 0 && age <= (m.major ? majorFreshDays : minorFreshDays)
    }
    let open = moments.filter { !seen.contains($0.id) && fresh($0) }
    return open.first { $0.major } ?? open.first
  }
}
