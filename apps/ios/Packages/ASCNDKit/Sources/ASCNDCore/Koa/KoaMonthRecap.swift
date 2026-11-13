import Foundation

/// "Tháng của bạn với Koa" (13/11, Kiệt duyệt mock `docs/design/mocks/koa-month-recap.html`, lớp C của
/// "Ghi chép cũng nuôi Koa"): mỗi tháng để lại một ô trong Hành trình, mở ra là trang nhìn lại cả việc
/// tập lẫn việc ghi. Mọi số TÍNH LẠI từ dữ liệu đã có (buổi tập, sổ Gains, `daily_logs`), như phần còn
/// lại của Hành trình: không bảng, không migration, đổi máy ra cùng kết quả.
///
/// Không chấm điểm tháng, không so tháng tốt / xấu, không nói về calo hay cân nặng, không thưởng.
public enum KoaMonthRecap {
  /// Một tháng lịch.
  public struct Key: Sendable, Hashable, Comparable, Identifiable {
    public let year: Int
    public let month: Int

    public init(year: Int, month: Int) {
      self.year = year
      self.month = month
    }

    public init(_ d: LocalDate) { self.init(year: d.year, month: d.month) }

    /// "2026-10": khoá cố định của mốc tháng.
    public var id: String { String(format: "%04d-%02d", year, month) }
    public var first: LocalDate { LocalDate(id + "-01")! }
    public var previous: Key { month == 1 ? Key(year: year - 1, month: 12) : Key(year: year, month: month - 1) }
    public var next: Key { month == 12 ? Key(year: year + 1, month: 1) : Key(year: year, month: month + 1) }
    public func contains(_ d: LocalDate) -> Bool { d.year == year && d.month == month }

    public static func < (a: Key, b: Key) -> Bool { (a.year, a.month) < (b.year, b.month) }
  }

  /// Số ô tháng hiện một lần; "Xem thêm" mở thêm từng chừng ấy (Kiệt chọn 13/11).
  public static let pageSize = 12

  public struct Recap: Sendable, Hashable {
    public let key: Key
    /// Số ngày có buổi tập (không tính đi bộ), như `KoaJourney.month`.
    public let sessions: Int
    /// Số buổi của tháng trước, để so.
    public let previousSessions: Int
    public let records: Int
    public let fullWeeks: Int
    /// Hạng mới chạm trong tháng (`KoaGains.rank`), cũ → mới.
    public let rankUps: [Int]
    /// Bậc lên trong tháng, không gồm bậc I của hạng mới (đã nằm trong `rankUps`).
    public let tierUps: [Int]
    /// Ngày có ghi bữa / nước / giấc ngủ, và từng loại.
    public let logged: Int
    public let meals: Int
    public let water: Int
    public let sleep: Int
    /// Số buổi theo thứ trong tuần, thứ Hai trước (`WorkoutPlanning.routineIndex`).
    public let weekdays: [Int]
    /// Số buổi theo từng chặng 7 ngày của tháng (ngày 1–7, 8–14, …, 29–31) cho cột nhỏ ở dải tháng.
    public let weeks: [Int]
    /// Tối đa ba mốc của Hành trình trong tháng, quan trọng nhất trước.
    public let highlights: [KoaJourney.Moment]

    public var quiet: Bool { sessions == 0 && logged == 0 }
    public var change: Int { sessions - previousSessions }
    /// Hai thứ tập đều nhất, khi tháng có đủ buổi để nói ("bạn hay tập thứ Ba và thứ Năm").
    public var usualDays: [Int] {
      let ranked = weekdays.enumerated().filter { $0.element >= 2 }.sorted { $0.element != $1.element ? $0.element > $1.element : $0.offset < $1.offset }
      guard ranked.count >= 2, sessions >= 4 else { return [] }
      return ranked.prefix(2).map(\.offset).sorted()
    }
  }

  /// Câu của Koa cho trang tháng: chỉ ghi nhận, không trách, không thúc.
  public enum Line: Sendable, Hashable {
    case quiet
    case loggedOnly(logged: Int)
    case lighter
    case usual(days: [Int])
    case sessions(Int)
  }

  public static func line(_ r: Recap) -> Line {
    if r.quiet { return .quiet }
    if r.sessions == 0 { return .loggedOnly(logged: r.logged) }
    if r.previousSessions > r.sessions, r.sessions <= 2 { return .lighter }
    let usual = r.usualDays
    if !usual.isEmpty { return .usual(days: usual) }
    return .sessions(r.sessions)
  }

  /// Thứ tự ưu tiên của mốc nổi bật trong trang tháng.
  static func rank(_ m: KoaJourney.Moment) -> Int {
    switch m.kind {
    case .rankUp: 0
    case .tierUp: 1
    case .record: 2
    case .firstSession: 3
    case .firstFullWeek: 4
    case .sessions: 5
    case .logDays: 6
    case .comeback: 7
    case .fullWeek: 8
    case .monthDone: 99
    }
  }

  public static func recap(
    _ key: Key, days: [KoaGains.Day], week: KoaGains.Week, logKinds: [LocalDate: Set<KoaLogDaysSync.Kind>],
    today: LocalDate
  ) -> Recap {
    let moments = KoaJourney.moments(days, week: week, logged: Set(logKinds.keys), today: today)
    let month = KoaJourney.month(moments, days: days, year: key.year, month: key.month)
    let prev = key.previous
    let previous = Set(days.filter { $0.kind != .walk && prev.contains($0.date) }.map(\.date)).count
    let trained = Set(days.filter { $0.kind != .walk && key.contains($0.date) && $0.date <= today }.map(\.date))
    var weekdays = Array(repeating: 0, count: 7)
    var weeks = Array(repeating: 0, count: 5)
    for d in trained {
      weekdays[WorkoutPlanning.routineIndex(d)] += 1
      weeks[min((d.day - 1) / 7, 4)] += 1
    }
    let steps = KoaJourney.steps(days, week: week, today: today).filter { key.contains($0.date) && $0.tier > 1 }
    let logs = logKinds.filter { key.contains($0.key) && $0.key <= today && !$0.value.isEmpty }
    let mine = moments.filter { key.contains($0.date) && $0.kind != .monthDone }
    let highlights = mine.sorted { rank($0) != rank($1) ? rank($0) < rank($1) : $0.date < $1.date }.prefix(3)
    return Recap(
      key: key, sessions: month.sessions, previousSessions: previous, records: month.records,
      fullWeeks: month.fullWeeks, rankUps: month.rankUps, tierUps: steps.map(\.step), logged: logs.count,
      meals: logs.filter { $0.value.contains(.meal) }.count, water: logs.filter { $0.value.contains(.water) }.count,
      sleep: logs.filter { $0.value.contains(.sleep) }.count, weekdays: weekdays, weeks: weeks,
      highlights: Array(highlights))
  }

  /// Các tháng có ô trong Hành trình, mới → cũ: từ tháng này về tới tháng đầu tiên có buổi tập hay có
  /// ghi. Tháng ở giữa không làm gì vẫn có ô. Chưa từng làm gì thì không có tháng nào.
  public static func months(days: [KoaGains.Day], logged: Set<LocalDate>, today: LocalDate) -> [Key] {
    let active = days.filter { $0.kind != .walk && $0.date <= today }.map(\.date) + logged.filter { $0 <= today }
    guard let earliest = active.min() else { return [] }
    var out: [Key] = []
    var k = Key(today)
    let stop = Key(earliest)
    while k >= stop {
      out.append(k)
      k = k.previous
    }
    return out
  }

  /// Mốc "Tháng N đã xong": mỗi tháng đã qua có buổi tập hay có ghi. Ngày của mốc là ngày 1 tháng sau,
  /// để Koa nhắc ở Hôm nay trong mấy ngày đầu tháng mới (mốc lớn, `KoaMomentFeed.majorFreshDays`).
  /// `value` là số buổi của tháng ấy.
  static func doneMoments(days: [KoaGains.Day], logged: Set<LocalDate>, today: LocalDate) -> [KoaJourney.Moment] {
    let current = Key(today)
    return months(days: days, logged: logged, today: today).filter { $0 < current }.compactMap { k in
      let sessions = Set(days.filter { $0.kind != .walk && k.contains($0.date) }.map(\.date)).count
      let logs = logged.filter { k.contains($0) }.count
      guard sessions + logs > 0 else { return nil }
      return KoaJourney.Moment(id: "month:\(k.id)", kind: .monthDone, date: k.next.first, value: sessions)
    }
  }
}
