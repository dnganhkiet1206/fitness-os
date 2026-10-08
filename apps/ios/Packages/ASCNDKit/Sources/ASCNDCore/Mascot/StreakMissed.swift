/// Phần của `lib/streak.ts` mà phòng linh vật cần thêm vào `Streak` (#66):
/// `missedDates` — golden trong `mascot-golden.json` (`streakCases`).
extension Streak {
  /// `missedDates`: các ngày trống liền trước hôm nay, từ hôm qua lùi tới ngày
  /// đầu tiên đã ghi (hoặc đã băng) — cũ → mới; tối đa `window` ngày. Chưa ghi
  /// ngày nào thì không có gì để bỏ lỡ.
  public static func missedDates(datesDesc: [LocalDate], today: LocalDate, frozen: [LocalDate] = []) -> [LocalDate] {
    guard !datesDesc.isEmpty else { return [] }
    let covered = Set(datesDesc + frozen)
    var out: [LocalDate] = []
    var cursor = today.adding(days: -1)
    var i = 0
    while i < window, !covered.contains(cursor) {
      out.append(cursor)
      cursor = cursor.adding(days: -1)
      i += 1
    }
    return out.reversed()
  }
}
