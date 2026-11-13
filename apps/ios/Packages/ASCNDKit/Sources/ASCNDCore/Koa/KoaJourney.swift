import Foundation

/// Hành trình của người dùng cùng Koa (02/11, Kiệt duyệt Koa Ecosystem V2). Mọi cột mốc TÍNH LẠI
/// từ dữ liệu đã lưu (buổi tập, kỷ lục, lịch tuần) qua đúng phép tính Gains, nên:
/// - không có bảng mốc riêng để lệch hay cộng trùng; gửi lại, đổi máy, mất mạng đều ra cùng kết quả;
/// - mỗi mốc có `id` cố định, dùng làm khoá cho "đã thấy" và cho thông báo, không bao giờ lặp.
/// Không có mốc nào về cân nặng hay calo.
public enum KoaJourney {
  public enum Kind: String, Sendable, Hashable, Codable, CaseIterable {
    case firstSession, sessions, fullWeek, firstFullWeek, record, rankUp, comeback
    /// Lên bậc trong cùng hạng (10/11): mốc nhỏ. Lên hạng (bậc I của hạng mới) vẫn là `rankUp`.
    case tierUp
    /// Tổng số ngày có ghi bữa / nước / giấc ngủ chạm một mốc (10/11, Kiệt duyệt
    /// `docs/design/mocks/koa-logging-milestones.html`). Cộng dồn, không phải chuỗi; không Gains, không xu.
    case logDays
    /// Một tháng đã qua (13/11, "Tháng của bạn với Koa"): Koa nhắc ở Hôm nay mấy ngày đầu tháng mới,
    /// một lần. Không nằm trong danh sách mốc của Hành trình (tháng đã có dải riêng).
    case monthDone
  }

  public struct Moment: Sendable, Hashable, Identifiable {
    /// Khoá cố định, ví dụ `rank:3`, `week:2026-11-02`, `record:2026-10-19`.
    public let id: String
    public let kind: Kind
    public let date: LocalDate
    /// Số đi kèm: hạng mới, số buổi, số ngày ghi, số ngày nghỉ trước khi quay lại; `tierUp`: thứ tự bậc
    /// (`KoaGains.Tier.step`, đổi lại hạng và bậc bằng `KoaGains.tier(step:)`).
    public let value: Int

    /// Mốc lớn: Koa phản ứng ở mọi nơi, có thể thành thông báo. Mốc nhỏ chỉ nằm trong hành trình.
    public var major: Bool {
      switch kind {
      case .firstSession, .firstFullWeek, .rankUp, .sessions: true
      case .record, .comeback, .fullWeek, .tierUp: false
      case .logDays: KoaJourney.majorLogMarks.contains(value)
      case .monthDone: true
      }
    }
  }

  /// Số buổi đáng ghi nhận: dày lúc đầu (cảm giác tiến bộ sớm), thưa dần.
  public static let sessionMarks = [5, 10, 25, 50, 100, 150, 200, 300, 500, 750, 1000]
  /// Nghỉ từ ngần này ngày trở lên rồi tập lại thì là một lần quay lại đáng ghi.
  public static let comebackGap = 7

  /// Tổng số ngày ghi đáng ghi nhận, và những mốc Koa nhắc như mốc lớn (3 ngày thay vì 1).
  public static let logMarks = [3, 7, 30, 60, 100, 200, 365]
  public static let majorLogMarks: Set<Int> = [7, 30, 100, 200, 365]

  /// Mốc ghi đều: ngày mà tổng số ngày có ghi chạm từng mốc. Bỏ một ngày thì con số đứng yên.
  public static func logMoments(_ logged: Set<LocalDate>, today: LocalDate) -> [Moment] {
    let days = logged.filter { $0 <= today }.sorted()
    return logMarks.filter { $0 <= days.count }.map {
      Moment(id: "log:\($0)", kind: .logDays, date: days[$0 - 1], value: $0)
    }
  }

  /// `logged`: các ngày có ghi bữa / nước / giấc ngủ (`KoaLogDaysSync`); trống thì chỉ có mốc tập.
  public static func moments(
    _ days: [KoaGains.Day], week: KoaGains.Week, logged: Set<LocalDate> = [], today: LocalDate
  ) -> [Moment] {
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
    for s in steps(ledger, days: days) where s.tier > 1 {
      out.append(Moment(id: "tier:\(s.step)", kind: .tierUp, date: s.date, value: s.step))
    }
    out += logMoments(logged, today: today)
    out += KoaMonthRecap.doneMoments(days: days, logged: logged, today: today)
    return out.sorted { $0.date != $1.date ? $0.date > $1.date : $0.major && !$1.major }
  }

  /// Một bậc đã đạt, kèm chặng dẫn tới nó: từ sau ngày đạt bậc trước tới hết ngày đạt bậc này.
  public struct Step: Sendable, Hashable, Identifiable {
    /// Thứ tự bậc trên cả hành trình (`KoaGains.Tier.step`), từ 1.
    public let step: Int
    public let rank: Int
    public let tier: Int
    public let date: LocalDate
    /// Tổng Gains cuối ngày đạt bậc.
    public let total: Int
    /// Số ngày có buổi (không tính đi bộ) và số ngày có kỷ lục của chặng.
    public let sessions: Int
    public let records: Int
    public var id: Int { step }

    public init(step: Int, rank: Int, tier: Int, date: LocalDate, total: Int, sessions: Int, records: Int) {
      self.step = step
      self.rank = rank
      self.tier = tier
      self.date = date
      self.total = total
      self.sessions = sessions
      self.records = records
    }
  }

  /// Mọi bậc đã đạt, cũ → mới, gồm cả bậc I của mỗi hạng (lúc lên hạng). Tính lại từ sổ Gains nên
  /// chỉ thêm, không bao giờ bớt.
  public static func steps(_ days: [KoaGains.Day], week: KoaGains.Week, today: LocalDate) -> [Step] {
    steps(KoaGains.ledger(days, week: week, today: today), days: days)
  }

  static func steps(_ ledger: [(LocalDate, KoaGains.Breakdown)], days: [KoaGains.Day]) -> [Step] {
    let active = Set(days.filter { $0.kind != .walk }.map(\.date))
    var out: [Step] = []
    var reached = 0
    var sessions = 0
    var records = 0
    for (day, b) in ledger {
      if active.contains(day) { sessions += 1 }
      if b.personalRecord { records += 1 }
      let now = KoaGains.tier(b.total).step
      guard now > reached else { continue }
      // Một ngày vượt nhiều bậc (hiếm): chặng thuộc về bậc đầu, các bậc sau cùng ngày có chặng 0.
      for s in (reached + 1)...now {
        let t = KoaGains.tier(step: s)
        out.append(Step(step: s, rank: t.rank, tier: t.tier, date: day, total: b.total, sessions: sessions, records: records))
        sessions = 0
        records = 0
      }
      reached = now
    }
    return out
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

/// Đọc các ngày có ghi cho mốc ghi đều: cả lịch sử `daily_logs`, chỉ ngày và ba số ghi.
public enum KoaLogDaysSync {
  /// ~5 năm ghi mỗi ngày, cùng trần với lịch sử Gains.
  public static let limit = 2000

  public static func query(userId: String) -> RowQuery {
    RowQuery(
      table: "daily_logs", columns: "date, kcal, water_ml, sleep_duration_min",
      filters: [.eq("user_id", .string(userId))], order: .init(column: "date", ascending: false), limit: limit)
  }

  /// Việc được ghi trong một ngày (Nhịp ghi tách theo loại, 12/11).
  public enum Kind: String, Sendable, Hashable, CaseIterable { case meal, water, sleep }

  /// Ngày có ít nhất một việc ghi: bữa (kcal > 0), nước, hoặc giấc ngủ. Bước chân không tính.
  public static func days(_ rows: [JSONValue]) -> Set<LocalDate> {
    Set(kinds(rows).keys)
  }

  /// Từng ngày có ghi và ghi những gì. Ngày chỉ có bước chân không có mặt.
  public static func kinds(_ rows: [JSONValue]) -> [LocalDate: Set<Kind>] {
    var out: [LocalDate: Set<Kind>] = [:]
    for r in rows {
      guard let d = r["date"]?.stringValue.flatMap(LocalDate.init) else { continue }
      var k: Set<Kind> = []
      if (r["kcal"]?.doubleValue ?? 0) > 0 { k.insert(.meal) }
      if (r["water_ml"]?.doubleValue ?? 0) > 0 { k.insert(.water) }
      if (r["sleep_duration_min"]?.doubleValue ?? 0) > 0 { k.insert(.sleep) }
      guard !k.isEmpty else { continue }
      out[d, default: []].formUnion(k)
    }
    return out
  }

  /// `nil` khi đọc hỏng: giữ các ngày đã biết.
  public static func load(userId: String, store: any RowStore) async -> [LocalDate: Set<Kind>]? {
    (try? await store.select(query(userId: userId))).map(kinds)
  }
}

/// Nhịp ghi 30 ngày (12/11, Kiệt duyệt mock "Ghi chép cũng nuôi Koa", lớp A,
/// `docs/design/mocks/koa-logging-rhythm.html`): số ngày có ghi bữa / nước / giấc ngủ trong cửa sổ
/// cuốn chiếu 30 ngày, so với 30 ngày trước đó. Cùng tinh thần với `KoaRhythm`: không có số liên tiếp
/// để gãy, bỏ một ngày thì con số chỉ bớt 1. Không Gains, không xu, không nói gì về calo hay cân nặng.
public enum KoaLogRhythm {
  public static let window = KoaRhythm.window

  public struct State: Sendable, Hashable {
    /// Cũ → mới, đúng `window` ngày, ngày cuối là hôm nay; `true` = có ghi.
    public let days: [Bool]
    public let logged: Int
    /// Số ngày có ghi trong 30 ngày trước đó, để so.
    public let previous: Int
    /// Trong cửa sổ: số ngày có ghi từng loại.
    public let meals: Int
    public let water: Int
    public let sleep: Int
    public var change: Int { logged - previous }
  }

  public static func state(_ kinds: [LocalDate: Set<KoaLogDaysSync.Kind>], today: LocalDate) -> State {
    let start = today.adding(days: -(window - 1))
    var days: [Bool] = []
    var meals = 0, water = 0, sleep = 0
    var d = start
    while d <= today {
      let k = kinds[d] ?? []
      days.append(!k.isEmpty)
      if k.contains(.meal) { meals += 1 }
      if k.contains(.water) { water += 1 }
      if k.contains(.sleep) { sleep += 1 }
      d = d.adding(days: 1)
    }
    let prevStart = start.adding(days: -window)
    let previous = kinds.filter { !$0.value.isEmpty && $0.key >= prevStart && $0.key < start }.count
    return State(
      days: days, logged: days.filter { $0 }.count, previous: previous, meals: meals, water: water, sleep: sleep)
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
