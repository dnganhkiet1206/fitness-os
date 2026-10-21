/// Koa sống theo lịch tập (#527 đợt 2, Kiệt duyệt 20/10
/// `docs/design/mocks/koa-wave2-schedule.html`).
///
/// Bốn trạng thái đè lên Koa của ngày (thẻ Hôm nay, widget, phòng linh vật):
/// - `pump`: tối đa 2 giờ sau buổi tập;
/// - `waiting`: hôm nay có buổi trong lịch, chưa tập, đã qua giờ quen tập;
/// - `pumpLost`: lỡ lịch từ 3 ngày (ngày nghỉ đã đặt không tính);
/// - `dropped`: 7 ngày không tập và Gains đã tụt dưới hạng cao nhất từng đạt.
/// Ngoài bốn trạng thái ấy Koa vẫn như cũ (`KoaMood`). Không bao giờ trách móc.
public enum KoaSchedule {
  public enum Phase: Sendable, Hashable {
    case pump
    case waiting
    /// Còn bao nhiêu ngày lỡ nữa thì bị trừ Gains lần kế.
    case pumpLost(daysLeft: Int)
    /// Gains còn thiếu để về lại hạng cao nhất từng đạt (×2 khi tập lại).
    case dropped(toRegain: Int, peakRank: Int)
  }

  public static let pumpMillis: Double = 2 * 60 * 60 * 1000
  /// Chưa có giờ quen tập (`HabitHours`) thì coi 18h là giờ tập.
  public static let defaultHabitHour = 18

  public static func phase(
    gains: KoaGains.State, lastSessionAt: EpochMillis?, now: EpochMillis, trainedToday: Bool,
    plannedToday: Bool, hour: Int, habitHour: Int?
  ) -> Phase? {
    if let last = lastSessionAt {
      let gap = Double(now.millis - last.millis)
      if gap >= 0, gap <= pumpMillis { return .pump }
    }
    if trainedToday { return nil }
    let missed = gains.missedDays
    if missed >= KoaGains.layoffDays, gains.rank < KoaGains.rank(gains.peak) {
      let peakRank = KoaGains.rank(gains.peak)
      return .dropped(toRegain: max(0, KoaGains.thresholds[peakRank] - gains.points), peakRank: peakRank)
    }
    if missed >= KoaGains.pumpLostDays {
      let left = KoaGains.layoffDays - missed % KoaGains.layoffDays
      return .pumpLost(daysLeft: left)
    }
    if plannedToday, hour >= (habitHour ?? defaultHabitHour) { return .waiting }
    return nil
  }

  /// Màn quay lại: lần đầu mở app sau ≥ 3 ngày lỡ lịch, một lần cho mỗi đợt nghỉ
  /// (khoá theo ngày tập cuối). `nil` = không hiện.
  public static func comebackKey(_ gains: KoaGains.State) -> String? {
    guard gains.missedDays >= KoaGains.pumpLostDays, let last = gains.lastSession else { return nil }
    return last.description
  }

  /// Ngày thứ mấy lỡ lịch vào ngày `day` sau hôm nay, nếu từ giờ tới đó không tập:
  /// cộng các ngày không phải ngày nghỉ đã đặt. Dùng cho câu của thông báo.
  public static func missedOn(dayOffset: Int, missedToday: Int, todayWeekday: Int, rest: Set<Int>) -> Int {
    guard dayOffset > 0 else { return missedToday }
    var n = missedToday
    for d in 1...dayOffset where !rest.contains((todayWeekday + d) % 7) { n += 1 }
    return n
  }
}
