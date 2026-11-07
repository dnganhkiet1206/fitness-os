import Foundation

/// Đồ trong phòng Koa thỉnh thoảng hỏng, theo thói quen ghi chép 7 ngày gần nhất (Kiệt chốt 05/11, storyboard
/// cảnh A duyệt 06/11). Koa không than vãn: đi lấy đồ nghề, nhờ người dùng làm đúng việc họ đang thiếu, làm xong
/// thì Koa sửa (đoạn diễn cảnh A).
///
/// Luật (Kiệt giao em chọn tần suất, gắn với thói quen):
/// - ghi ≥ 80 % trong 7 ngày → gần như không bao giờ hỏng;
/// - 50–80 % → khoảng một lần mỗi tuần;
/// - < 50 % → nhiều nhất hai–ba ngày một lần;
/// - mỗi lúc chỉ một món hỏng; không hỏng lúc Koa đang ngủ;
/// - muốn sửa phải làm đúng thói quen đang thiếu nhất (ít ngày ghi nhất trong 7 ngày).
///
/// Tất định: cùng lịch sử + cùng người dùng → cùng kết quả (hạt giống từ `userId` và ngày), nên tính lại lúc nào
/// cũng được, không cần server.
public enum KoaBreakage {
  /// Bốn món có thể hỏng (Kiệt chọn): đèn neon, sân khấu, bảng streak, sàn nhà.
  public enum Item: String, Sendable, Hashable, CaseIterable, Codable {
    case neon, stage, board, floor
  }

  /// Thói quen tính vào tỉ lệ và có thể được nhờ để sửa.
  public enum Habit: String, Sendable, Hashable, CaseIterable, Codable {
    case water, meal, sleep, workout
  }

  public struct Broken: Sendable, Hashable, Codable {
    public let item: Item
    /// Ngày hỏng.
    public let day: LocalDate
    /// Việc cần làm để Koa sửa được.
    public let habit: Habit
    /// Việc đã ghi trong ngày hỏng TRƯỚC lúc hỏng — không tính là đã sửa.
    public let already: Set<Habit>
    public init(item: Item, day: LocalDate, habit: Habit, already: Set<Habit> = []) {
      self.item = item
      self.day = day
      self.habit = habit
      self.already = already
    }
  }

  /// Một bậc tần suất: xác suất mỗi ngày và khoảng cách tối thiểu (ngày) giữa hai lần hỏng.
  public struct Tier: Sendable, Hashable {
    public let chance: Double
    public let minGap: Int
  }

  /// ≥ 80 %: gần như không (3 % mỗi ngày, cách nhau ít nhất 14 ngày).
  public static let steady = Tier(chance: 0.03, minGap: 14)
  /// 50–80 %: khoảng một lần mỗi tuần.
  public static let wobbly = Tier(chance: 0.35, minGap: 5)
  /// < 50 %: nhiều nhất hai–ba ngày một lần.
  public static let lapsed = Tier(chance: 0.6, minGap: 2)
  /// Số ngày nhìn lại.
  public static let window = 7

  public static func tier(ratio: Double) -> Tier {
    ratio >= 0.8 ? steady : ratio >= 0.5 ? wobbly : lapsed
  }

  /// Tỉ lệ ghi của 7 ngày ĐÃ QUA (không tính hôm nay — hôm nay còn chưa hết): mỗi ngày, phần thói quen đã ghi;
  /// buổi tập chỉ tính vào ngày có lịch tập. Ngày trước lần hoạt động đầu tiên không tính (tài khoản mới).
  public static func ratio(history: [LocalDate: Set<Habit>], trainingDay: (LocalDate) -> Bool, today: LocalDate) -> Double? {
    guard let first = history.filter({ !$0.value.isEmpty }).keys.min() else { return nil }
    var sum = 0.0, days = 0
    for k in 1...window {
      let d = today.adding(days: -k)
      guard d >= first else { continue }
      let expected: [Habit] = trainingDay(d) ? [.water, .meal, .sleep, .workout] : [.water, .meal, .sleep]
      let got = history[d] ?? []
      sum += Double(expected.filter(got.contains).count) / Double(expected.count)
      days += 1
    }
    return days == 0 ? nil : sum / Double(days)
  }

  /// Thói quen thiếu nhất trong 7 ngày (ít ngày ghi nhất); hoà thì theo thứ tự nước → bữa → ngủ → tập
  /// (việc nhỏ, làm ngay được trước).
  public static func missing(history: [LocalDate: Set<Habit>], trainingDay: (LocalDate) -> Bool, today: LocalDate) -> Habit {
    var count: [Habit: Int] = [:]
    var workoutDays = 0
    for k in 1...window {
      let d = today.adding(days: -k)
      for h in history[d] ?? [] { count[h, default: 0] += 1 }
      if trainingDay(d) { workoutDays += 1 }
    }
    // tập chỉ được nhờ khi tuần có ngày tập theo lịch; so theo phần còn thiếu
    func gap(_ h: Habit) -> Int {
      h == .workout ? (workoutDays == 0 ? -1 : workoutDays - (count[.workout] ?? 0)) : window - (count[h] ?? 0)
    }
    return Habit.allCases.max { a, b in
      gap(a) != gap(b) ? gap(a) < gap(b) : Habit.allCases.firstIndex(of: a)! > Habit.allCases.firstIndex(of: b)!
    } ?? .water
  }

  /// Số ngẫu nhiên tất định trong [0, 1) cho (người dùng, ngày, muối).
  public static func roll(_ userId: String, _ day: LocalDate, _ salt: String = "") -> Double {
    var h: UInt64 = 0xcbf2_9ce4_8422_2325
    for b in "\(userId)|\(day)|\(salt)".utf8 {
      h ^= UInt64(b)
      h = h &* 0x100_0000_01b3
    }
    h ^= h >> 33
    h = h &* 0xff51_afd7_ed55_8ccd
    h ^= h >> 33
    return Double(h >> 11) / Double(1 << 53)
  }

  /// Món đã hỏng có được sửa chưa: đã ghi đúng thói quen được nhờ sau lúc hỏng — ngay trong ngày hỏng (nếu lúc
  /// hỏng chưa ghi việc ấy) hoặc một ngày sau đó.
  public static func isFixed(_ b: Broken, history: [LocalDate: Set<Habit>], today: LocalDate) -> Bool {
    if history[b.day]?.contains(b.habit) == true, !b.already.contains(b.habit) { return true }
    var d = b.day.adding(days: 1)
    while d <= today {
      if history[d]?.contains(b.habit) == true { return true }
      d = d.adding(days: 1)
    }
    return false
  }

  /// Kết quả một lần xét.
  public enum Outcome: Sendable, Hashable {
    /// Không có gì hỏng.
    case fine
    /// Đang hỏng (mới hỏng hôm nay hoặc từ trước, chưa sửa).
    case broken(Broken)
    /// Vừa được sửa (người dùng đã làm việc được nhờ) — app phát đoạn diễn sửa đồ một lần.
    case fixed(Broken)
  }

  /// Xét hôm nay. `current`: món đang hỏng đã lưu; `lastEvent`: ngày hỏng gần nhất (để giữ khoảng cách);
  /// `lastItem`: món hỏng lần trước (lần sau đổi món); `asleep`: Koa đang ngủ thì không hỏng.
  public static func decide(
    userId: String, today: LocalDate, history: [LocalDate: Set<Habit>], trainingDay: (LocalDate) -> Bool,
    current: Broken?, lastEvent: LocalDate?, lastItem: Item?, asleep: Bool
  ) -> Outcome {
    if let b = current {
      return isFixed(b, history: history, today: today) ? .fixed(b) : .broken(b)
    }
    guard !asleep, let r = ratio(history: history, trainingDay: trainingDay, today: today) else { return .fine }
    let t = tier(ratio: r)
    if let last = lastEvent, last.adding(days: t.minGap) > today { return .fine }
    guard roll(userId, today, "break") < t.chance else { return .fine }
    let pool = Item.allCases.filter { $0 != lastItem }
    let item = pool[min(pool.count - 1, Int(roll(userId, today, "item") * Double(pool.count)))]
    let habit = missing(history: history, trainingDay: trainingDay, today: today)
    return .broken(Broken(item: item, day: today, habit: habit, already: history[today] ?? []))
  }
}

extension KoaBreakage {
  /// Trạng thái lưu trên máy giữa các lần mở app.
  public struct Memo: Sendable, Hashable, Codable {
    public var current: Broken?
    public var lastEvent: LocalDate?
    public var lastItem: Item?
    public init(current: Broken? = nil, lastEvent: LocalDate? = nil, lastItem: Item? = nil) {
      self.current = current
      self.lastEvent = lastEvent
      self.lastItem = lastItem
    }
  }

  /// Cập nhật trạng thái lưu theo kết quả: hỏng mới thì ghi lại, vừa sửa thì xoá món đang hỏng.
  public static func step(_ m: Memo, _ o: Outcome) -> Memo {
    switch o {
    case .fine: return m
    case .broken(let b):
      return m.current == b ? m : Memo(current: b, lastEvent: b.day, lastItem: b.item)
    case .fixed: return Memo(current: nil, lastEvent: m.lastEvent, lastItem: m.lastItem)
    }
  }

  /// Thói quen theo ngày: bữa (kcal > 0), nước, giấc ngủ từ `daily_logs`; buổi tập từ lịch sử Gains.
  public static func history(daily: [JSONValue], sessions: Set<LocalDate>) -> [LocalDate: Set<Habit>] {
    var out: [LocalDate: Set<Habit>] = [:]
    for r in daily {
      guard let d = r["date"]?.stringValue.flatMap(LocalDate.init) else { continue }
      if (r["kcal"]?.doubleValue ?? 0) > 0 { out[d, default: []].insert(.meal) }
      if (r["water_ml"]?.doubleValue ?? 0) > 0 { out[d, default: []].insert(.water) }
      if (r["sleep_duration_min"]?.doubleValue ?? 0) > 0 { out[d, default: []].insert(.sleep) }
    }
    for d in sessions { out[d, default: []].insert(.workout) }
    return out
  }
}
