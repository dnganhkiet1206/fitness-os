/// Phần "thấy một nhiệm vụ vừa xong" của `useQuestAutoClaim`
/// (`hooks/use-quest-autoclaim.ts:97-100, 139-147, 230-234` @ fac9ac2) — #527
/// A-NEXT-7 · S2.
///
/// RN: mỗi lần đọc `useDailyQuests` đã `ready`, mốc `seen` là lần đọc trước;
/// một nhiệm vụ trong `unclaimed` mà ở mốc chưa xong là một bước chuyển app
/// THẤY tận mắt — chỉ lúc ấy giờ đồng hồ mới nói lên điều gì về người dùng
/// (`noteDone(key, new Date().getHours(), today)`). Lần đọc đầu (mốc `null`)
/// và lần đọc đầu của một ngày mới chỉ đặt mốc: giờ khi ấy là giờ mở app, không
/// phải giờ ai đó ăn hay tập.
public struct QuestWatch: Sendable {
  private var seen: [MascotRules.Quest: Bool]?
  private var seenDay: String?

  public init() {}

  /// Một lần đọc. `done`: cả năm nhiệm vụ hôm nay; `unclaimed`: các nhiệm vụ
  /// đang tính, đã xong mà chưa nhận thưởng, theo thứ tự `DAILY_QUESTS`. Trả về
  /// những nhiệm vụ vừa chuyển "chưa xong → xong" ở lần đọc này.
  public mutating func read(
    today: String, done: [MascotRules.Quest: Bool], unclaimed: [MascotRules.Quest]
  ) -> [MascotRules.Quest] {
    if seenDay != today {
      seenDay = today
      seen = nil
    }
    let before = seen
    seen = done
    guard let before else { return [] }
    // `!before[key]`: không có trong mốc cũng là "chưa xong".
    return unclaimed.filter { before[$0] != true }
  }
}
