/// Koa nói gì, và "việc kế tiếp" của ngày là gì (#527, tab Hôm nay —
/// `docs/design/today`) — `lib/mascot-message.ts` (`mascotLine`) @ fac9ac2.
///
/// RN behavior (giữ nguyên):
/// - bốn việc Koa nói tới: ngủ, bữa, nước, buổi tập (bước chân không có câu);
/// - chỉ hỏi một việc khi tới khung giờ của nó: ngủ từ 06:00 trong 5 giờ, bữa từ
///   11:00, nước từ 14:00, buổi tập từ 16:00 trong 5 giờ (khung qua nửa đêm vẫn
///   đúng);
/// - một ô chưa đọc được là CẢ ngày chưa biết → im lặng (nửa ngày không phải một
///   ngày: Koa sẽ hỏi đúng bữa vừa ghi);
/// - "xong": ngủ > 0 phút, bữa > 0, nước ≥ 50 % mục tiêu, buổi tập > 0;
/// - không còn việc nào tới giờ: có việc đã xong thì khen, không thì im lặng;
///   chưa xong gì thì hỏi việc đầu; đã xong việc gì thì ghi nhận việc đó rồi hỏi
///   việc kế.
///
/// `order` / `dueFrom` của RN đến từ mô hình cá nhân (bandit theo ngày, giờ quen
/// đã học); native chưa có mô hình ấy nên dùng thứ tự và giờ mặc định — đúng
/// hành vi RN với một người mới (xem NATIVE_IMPROVEMENTS).
///
/// Golden: `mascot-line-golden.json` (`gen-mascot-line.mjs`, mã RN biên dịch).
public enum MascotLine {
  public enum Thing: String, Sendable, Hashable, CaseIterable {
    case sleep, meal, water, workout
  }

  /// Ngày của người dùng. Một ô `nil` = chưa đọc được.
  public struct Day: Sendable, Hashable {
    public var sleepMin: Double?
    public var meals: Double?
    public var waterPct: Double?
    public var workouts: Double?
    /// Giờ địa phương, 0…23.
    public var hour: Int

    public init(sleepMin: Double?, meals: Double?, waterPct: Double?, workouts: Double?, hour: Int) {
      self.sleepMin = sleepMin
      self.meals = meals
      self.waterPct = waterPct
      self.workouts = workouts
      self.hour = hour
    }
  }

  public enum Line: Sendable, Hashable {
    case silent
    case ask(Thing)
    case notice(win: Thing, gap: Thing)
    case praise

    /// Việc được hỏi — "việc kế tiếp" của khối ngày.
    public var gap: Thing? {
      switch self {
      case .ask(let t), .notice(_, let t): t
      case .silent, .praise: nil
      }
    }
  }

  /// `WATER_DONE_PCT`.
  public static let waterDonePct = 50.0
  /// `GAP_FROM`: giờ sớm nhất được hỏi.
  public static let gapFrom: [Thing: Int] = [.sleep: 6, .meal: 11, .water: 14, .workout: 16]
  /// `GAP_SPAN`: khung dài bao nhiêu giờ (`nil` = tới hết ngày).
  public static let gapSpan: [Thing: Int?] = [.sleep: 5, .meal: nil, .water: nil, .workout: 5]
  /// `ORDER`: thứ tự mặc định.
  public static let defaultOrder: [Thing] = [.workout, .meal, .sleep, .water]

  static func withinWindow(_ hour: Int, from: Int, span: Int?) -> Bool {
    guard let span else { return hour >= from }
    let d = (((hour - from) % 24) + 24) % 24
    return d < span
  }

  /// `mascotLine`.
  public static func line(_ day: Day, order: [Thing] = defaultOrder, dueFrom: [Thing: Int] = [:]) -> Line {
    let rank = order + defaultOrder.filter { !order.contains($0) }
    guard let sleep = day.sleepMin, let meals = day.meals, let water = day.waterPct, let workouts = day.workouts
    else { return .silent }
    let done: [Thing: Bool] = [
      .sleep: sleep > 0, .meal: meals > 0, .water: water >= waterDonePct, .workout: workouts > 0,
    ]
    let wins = rank.filter { done[$0] == true }
    let gaps = rank.filter { t in
      done[t] != true && withinWindow(day.hour, from: dueFrom[t] ?? gapFrom[t] ?? 0, span: gapSpan[t] ?? nil)
    }
    guard let gap = gaps.first else { return wins.isEmpty ? .silent : .praise }
    guard let win = wins.first else { return .ask(gap) }
    return .notice(win: win, gap: gap)
  }

  /// `allowPraise` (`mascot-budget.ts`): khen MỘT lần mỗi ngày — đã khen trong
  /// phiên này thì vẫn giữ câu, sang phiên khác cùng ngày thì thôi.
  public static func allowPraise(praisedOn: LocalDate?, today: LocalDate, thisSession: Bool) -> Bool {
    thisSession || praisedOn != today
  }
}
