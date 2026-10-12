/// Khối "ngày" của tab Hôm nay (#527, bản thiết kế `docs/design/today`, phương
/// án C): năm ống ngủ / bữa / nước / buổi tập / bước, và việc Koa chỉ là "kế
/// tiếp" — đọc từ CÙNG một `DailySignals` mà vòng năng lượng và nhiệm vụ ngày
/// đọc, để Koa, ống và danh sách "Your day" không bao giờ nói ngược nhau.
public enum TodayDay {
  /// Thứ tự ống trên màn (bản thiết kế): ngủ, bữa, nước, buổi tập, bước.
  public static let order: [MascotRules.Quest] = [.sleep, .meal, .water, .workout, .steps]

  public struct Tube: Sendable, Hashable, Identifiable {
    public let quest: MascotRules.Quest
    /// Phần ống được tô, 0…1. Ngủ / bữa / buổi tập: 0 hoặc 1; nước và bước: theo
    /// tiến độ.
    public let fill: Double
    public let done: Bool
    /// Số đo dưới ống: phút ngủ, kcal, ml nước, số buổi, số bước.
    public let amount: Double
    public var id: MascotRules.Quest { quest }
  }

  /// Năm ống; chưa đọc được tín hiệu thì mọi ống rỗng.
  public static func tubes(_ s: DailySignals?, stepsGoal: Int) -> [Tube] {
    order.map { q in
      let done = s?.done(q, stepsGoal: stepsGoal) ?? false
      let fill: Double
      let amount: Double
      switch q {
      case .sleep:
        fill = done ? 1 : 0
        amount = s?.sleepMinutes ?? 0
      case .meal:
        fill = done ? 1 : 0
        amount = s?.kcal ?? 0
      case .workout:
        fill = done ? 1 : 0
        amount = s?.workoutCount ?? 0
      case .water:
        let target = waterTarget(s)
        amount = s?.waterMl ?? 0
        fill = target > 0 ? min(max(amount / target, 0), 1) : 0
      case .steps:
        amount = s?.steps ?? 0
        fill = stepsGoal > 0 ? min(max(amount / Double(stepsGoal), 0), 1) : 0
      }
      return Tube(quest: q, fill: done ? 1 : fill, done: done, amount: amount)
    }
  }

  /// Tín hiệu của server cộng phần nước đã ghi trên máy mà server chưa thấy
  /// (lần uống còn trong outbox). `localWaterMl` là tổng của sổ nước hôm nay —
  /// gồm cả hàng server lẫn hàng chờ gửi — nên lấy số lớn hơn: chạm "+250 ml"
  /// thì ống đầy lên NGAY, không đợi một vòng đồng bộ.
  public static func merging(_ s: DailySignals?, localWaterMl: Int?) -> DailySignals? {
    guard var s else { return nil }
    if let local = localWaterMl { s.waterMl = max(s.waterMl, Double(local)) }
    return s
  }

  /// Mục tiêu nước: của hồ sơ, không có thì 2.500 ml (như nhiệm vụ nước).
  public static func waterTarget(_ s: DailySignals?) -> Double {
    guard let t = s?.waterTargetMl, t > 0 else { return DailySignals.defaultWaterTargetMl }
    return t
  }

  /// Ngày cho `MascotLine`. "Xong" theo đúng luật của nhiệm vụ ngày (bữa = có
  /// kcal, ngủ = có hàng ngủ hoặc phút ngủ); nước truyền nguyên phần trăm để
  /// `mascotLine` tự áp ngưỡng 50 % của nó. Chưa đọc được → `nil` cả ngày.
  public static func mascotDay(_ s: DailySignals?, hour: Int) -> MascotLine.Day {
    guard let s else { return MascotLine.Day(sleepMin: nil, meals: nil, waterPct: nil, workouts: nil, hour: hour) }
    let sleep = s.done(.sleep) ? max(s.sleepMinutes ?? 0, 1) : 0
    return MascotLine.Day(
      sleepMin: sleep, meals: s.done(.meal) ? 1 : 0, waterPct: s.waterMl / waterTarget(s) * 100,
      workouts: s.workoutCount ?? 0, hour: hour)
  }

  /// Việc Koa hỏi → nhiệm vụ tương ứng (ống "Next").
  public static func quest(_ t: MascotLine.Thing) -> MascotRules.Quest {
    switch t {
    case .sleep: .sleep
    case .meal: .meal
    case .water: .water
    case .workout: .workout
    }
  }

  /// Số xu của một tín hiệu (`QUESTS`).
  public static func coins(_ q: MascotRules.Quest) -> Int {
    MascotRules.dailyQuests.first { $0.key == q }?.coins ?? 0
  }
}
