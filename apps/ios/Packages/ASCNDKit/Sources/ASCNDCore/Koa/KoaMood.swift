/// Bộ máy cảm xúc của Koa (#527, Koa đợt 1, Kiệt duyệt 19/10) — Koa ở Hôm nay
/// đổi nét mặt theo ngày THẬT của người dùng, chỉ dùng 11 biểu cảm × 6 tư thế đã vẽ.
///
/// Gốc là `baseEmotion` của RN (`lib/mascot-emotion.ts` @ fac9ac2): đêm → ngủ,
/// sinh nhật → mũ, chuỗi sắp đứt vào buổi tối CỦA người này → lo, rồi phản chiếu
/// ngày. Native thêm những gì RN chưa có hình để nói (không theo RN, xem
/// `rn-parity-not-required`):
/// - xong hết nhiệm vụ đang tính → mừng rỡ;
/// - ăn quá dải mục tiêu (CÙNG luật `NutritionToday.ring` → `.over` của vòng kcal,
///   để Koa và vòng không bao giờ nói ngược nhau) → "ôi" (ngạc nhiên, không trách);
/// - buổi sáng sau một đêm đã ghi: ngủ đủ → tươi tỉnh, mũ len; ngủ ít → mệt;
/// - đã tập → tự đắc; đã ăn → vui.
///
/// Như RN: ngày chưa đọc được là `idle`, không bao giờ là mặt buồn — một truy vấn
/// chưa về không phải là lời nhận xét về người dùng. Không có cảm xúc nào dựa
/// trên độ dài chuỗi để "buồn hơn" (RN đã bỏ cơ chế tội lỗi ấy và lý do vẫn đúng).
public enum KoaMood {
  /// `RISK_HOUR`: sàn của "buổi tối" khi người này chưa có giờ quen.
  public static let riskHour = 18.0
  /// `RISK_MIN_STREAK`: chỉ lo cho một chuỗi app đã gọi là thành tích (huy chương 3 ngày).
  public static let riskMinStreak = 3
  /// `RISK_SPAN`: khung lo dài bao nhiêu giờ kể từ giờ muộn của người này.
  public static let riskSpan = 6.0
  /// Đêm: từ 22:00 tới trước 06:00 Koa ngủ.
  public static let nightFrom = 22
  public static let morningFrom = 6
  /// Buổi sáng (giờ < 11) mới nói về giấc ngủ đêm qua.
  public static let morningUntil = 11
  /// Ngủ đủ / ngủ ít (phút).
  public static let restedMinutes = 7 * 60.0
  public static let shortSleepMinutes = 6 * 60.0

  /// Vì sao Koa có nét mặt này — câu của Koa đọc từ đây.
  public enum Reason: String, Sendable, Hashable, CaseIterable {
    case unread, night, birthday, worry, allDone, overate, rested, shortSleep, trained, fed, emptyLate, calm
  }

  public struct Read: Sendable, Hashable {
    public let emotion: KoaEmotion.Emotion
    public let reason: Reason
  }

  public struct Input: Sendable, Hashable {
    /// Tín hiệu hôm nay (đã gộp nước trên máy); `nil` = chưa đọc được.
    public var signals: DailySignals?
    public var stepsGoal: Int
    /// Giờ địa phương 0…23.
    public var hour: Int
    public var streak: Int
    /// Hôm nay đã nằm trong chuỗi (`Streak.Value.loggedToday`).
    public var loggedToday: Bool
    /// Giờ muộn của người này (`UserRhythm.lateHour(habit(.meal), floor: 18)`).
    public var riskHour: Double
    /// Mục tiêu kcal (`NutritionToday.calorieTarget`); `nil` = không xét ăn quá.
    public var kcalTarget: Double?
    public var isBirthday: Bool

    public init(
      signals: DailySignals?, stepsGoal: Int = DailySignals.defaultStepsGoal, hour: Int, streak: Int = 0,
      loggedToday: Bool = false, riskHour: Double = KoaMood.riskHour, kcalTarget: Double? = nil,
      isBirthday: Bool = false
    ) {
      self.signals = signals
      self.stepsGoal = stepsGoal
      self.hour = hour
      self.streak = streak
      self.loggedToday = loggedToday
      self.riskHour = riskHour
      self.kcalTarget = kcalTarget
      self.isBirthday = isBirthday
    }
  }

  /// `streakInDanger`: chuỗi đủ dài, hôm nay thật sự trống, và đang trong khung
  /// `riskSpan` giờ kể từ giờ muộn của người này (khung trên vòng 24 giờ).
  public static func streakInDanger(streak: Int, emptyToday: Bool, hour: Int, riskHour: Double) -> Bool {
    let since = (((Double(hour) - riskHour).truncatingRemainder(dividingBy: 24)) + 24).truncatingRemainder(dividingBy: 24)
    return emptyToday && streak >= riskMinStreak && since < riskSpan
  }

  /// Nét mặt của Koa, theo thứ tự ưu tiên ở đầu tệp.
  public static func read(_ i: Input) -> Read {
    guard let s = i.signals else { return Read(emotion: .idle, reason: .unread) }
    if i.isBirthday { return Read(emotion: .hat, reason: .birthday) }
    if i.hour >= nightFrom || i.hour < morningFrom { return Read(emotion: .sleep, reason: .night) }
    if streakInDanger(streak: i.streak, emptyToday: !i.loggedToday, hour: i.hour, riskHour: i.riskHour) {
      return Read(emotion: .worry, reason: .worry)
    }
    func done(_ q: MascotRules.Quest) -> Bool { s.done(q, stepsGoal: i.stepsGoal) }
    // `activeDefs`: nhiệm vụ bước không tính khi chưa từng có số bước.
    let active = MascotRules.dailyQuests.map(\.key).filter { $0 != .steps || s.stepsEverRecorded }
    if active.allSatisfy(done) { return Read(emotion: .celebrate, reason: .allDone) }
    if let target = i.kcalTarget, target > 0, let kcal = s.kcal, kcal > 0,
      NutritionToday.ring(kcal: kcal, target: target).band == .over
    {
      return Read(emotion: .oops, reason: .overate)
    }
    if i.hour < morningUntil, let min = s.sleepMinutes, min > 0 {
      if min >= restedMinutes { return Read(emotion: .rested, reason: .rested) }
      if min < shortSleepMinutes { return Read(emotion: .tired, reason: .shortSleep) }
    }
    if done(.workout) { return Read(emotion: .proud, reason: .trained) }
    if done(.meal) { return Read(emotion: .happy, reason: .fed) }
    // `moodFrom` → 'tired': quá trưa mà chưa ăn, chưa tập. Khác RN: đã ăn mà tối
    // chưa tập vẫn là vui (`fed`) — ngày nghỉ hay tập muộn không phải lỗi.
    if i.hour >= 12 { return Read(emotion: .tired, reason: .emptyLate) }
    return Read(emotion: .idle, reason: .calm)
  }

  /// Phần trăm kcal của mục tiêu cho câu "ăn quá" (cùng số với vòng kcal).
  public static func kcalPercent(kcal: Double, target: Double) -> Int {
    Int(NutritionToday.ring(kcal: kcal, target: target).percentOfTarget)
  }
}
