/// Koa sống theo lịch tập (#527 đợt 2, Kiệt duyệt 20/10
/// `docs/design/mocks/koa-wave2-schedule.html`).
///
/// Hai trạng thái đè lên Koa của ngày (thẻ Hôm nay, widget, phòng linh vật):
/// - `pump`: tối đa 2 giờ sau buổi tập;
/// - `waiting`: hôm nay có buổi trong lịch, chưa tập, đã qua giờ quen tập, chưa tới 22:00.
/// "Mất pump" và "tụt hạng" đã bỏ (Kiệt 21/10, duyệt GĐ1): Koa không phạt việc
/// nghỉ; người quay lại được chào đón (`DailyPlan` luật ④). Ngoài hai trạng thái
/// ấy Koa vẫn như cũ (`KoaMood`). Không bao giờ trách móc.
public enum KoaSchedule {
  public enum Phase: Sendable, Hashable {
    case pump
    case waiting
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
    // Đêm (22:00–06:00) Koa ngủ như Koa của ngày (`KoaMood.night`) — không đợi tập,
    // không nhắc lỡ lịch lúc nửa đêm (20/10, chủ dự án: "11h27 tối còn đòi tập").
    // Vừa tập xong (`pump`) vẫn được khoe, ở trên.
    if hour >= KoaMood.nightFrom || hour < KoaMood.morningFrom { return nil }
    if plannedToday, hour >= (habitHour ?? defaultHabitHour) { return .waiting }
    return nil
  }

  /// Một đợt quay lại (≥ 3 ngày nghỉ), khoá theo ngày tập cuối — để đo một lần
  /// cho mỗi đợt (`comeback_shown`). `nil` = không phải đang quay lại.
  public static func comebackKey(_ gains: KoaGains.State) -> String? {
    guard gains.missedDays >= KoaGains.comebackDays, let last = gains.lastSession else { return nil }
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
