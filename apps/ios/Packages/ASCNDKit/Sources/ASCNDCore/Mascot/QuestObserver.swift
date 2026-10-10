public import Foundation

/// Bộ quan sát nhiệm vụ ngày ở cấp APP (#527, chỉ thị 6102459377) — chỗ của
/// `<QuestAutoClaim />` gắn ở gốc app RN (`app/_layout.tsx:375`,
/// `hooks/use-quest-autoclaim.ts:139-147, 230-234` @ fac9ac2), phần học giờ.
///
/// MỘT bản cho mỗi tài khoản, giữ MỘT `QuestWatch`: mọi lượt đọc nhiệm vụ —
/// nhịp của phiên (vào phiên, ra tiền cảnh, hàng đợi gửi xong, Nhật ký sửa
/// món, vừa tập xong, nước đổi) và lượt đọc của phòng linh vật — đi qua đây,
/// nên một bước chuyển chỉ được ghi một lần dù nhiều nơi cùng đọc.
///
/// Như RN: chỉ lượt đọc `ready` (tín hiệu ngày đọc được) mới chạm mốc; lần
/// đọc đầu / ngày mới chỉ đặt mốc; chỉ nhiệm vụ "chưa xong → xong" còn chưa
/// nhận thưởng; giờ là giờ nguyên địa phương lúc THẤY. Thêm hai rào RN không
/// cần (React chạy một effect một lúc): lượt đọc bắt đầu trước về sau lượt
/// mới hơn thì bỏ (không làm mốc lùi rồi ghi lặp), và lượt của một ngày đã qua
/// thì bỏ.
@MainActor
public final class QuestObserver {
  public let userId: String

  private let source: any MascotSource
  private let stepsGoal: @Sendable () -> Int
  private let clock: any WallClock
  private let timeZone: TimeZone
  private let onQuestDone: @MainActor (MascotRules.Quest, Int) -> Void

  private var watch = QuestWatch()
  /// Số thứ tự lượt đọc đã cấp / lượt mới nhất đã được đưa vào mốc.
  private var issued = 0
  private var applied = 0
  private var lastDay: LocalDate?
  private var closed = false

  public init(
    userId: String, source: any MascotSource,
    stepsGoal: @escaping @Sendable () -> Int = { DailySignals.defaultStepsGoal },
    clock: any WallClock = SystemWallClock(), timeZone: TimeZone = .current,
    onQuestDone: @escaping @MainActor (MascotRules.Quest, Int) -> Void
  ) {
    self.userId = userId
    self.source = source
    self.stepsGoal = stepsGoal
    self.clock = clock
    self.timeZone = timeZone
    self.onQuestDone = onQuestDone
  }

  /// Phiên kết thúc: lượt đọc về muộn không ghi gì nữa (giờ của người vừa rời
  /// đi không được ghi đè sau `HabitHours.clear()`).
  public func close() { closed = true }

  /// Số thứ tự cho một lượt đọc sắp bắt đầu — lấy TRƯỚC khi gửi truy vấn.
  public func begin() -> Int {
    issued += 1
    return issued
  }

  /// Hôm nay địa phương theo đồng hồ của bộ quan sát.
  public var today: LocalDate { LocalDate(clock.nowMillis(), in: timeZone) }

  /// Đọc nhiệm vụ hôm nay rồi quan sát (một lượt `useDailyQuests`).
  public func refresh() async {
    guard !closed else { return }
    let token = begin()
    let day = today, uid = userId, src = source
    async let signals = capture { try await src.dailySignals(userId: uid, date: day) }
    async let ledger = capture { try await src.ledger(userId: uid) }
    let (s, l) = await (signals, ledger)
    // Tín hiệu hỏng = chưa `ready`: không chạm mốc.
    guard let sig = try? s.get() else { return }
    // Sổ xu hỏng = chưa biết đã nhận gì (`claimedList(undefined)`).
    let claimed = (try? l.get()).map { MascotWallet(rows: $0).claimed } ?? []
    observe(token: token, day: day, signals: sig, claimed: claimed)
  }

  /// Một lượt đọc `ready` từ bất kỳ đâu (phòng linh vật đưa lượt của nó vào
  /// đây). `token` từ `begin()` lúc lượt ấy bắt đầu.
  public func observe(token: Int, day: LocalDate, signals: DailySignals, claimed: Set<String>) {
    guard !closed, token > applied else { return }
    if let lastDay, day < lastDay { return }
    applied = token
    lastDay = day
    let goal = stepsGoal()
    var done: [MascotRules.Quest: Bool] = [:]
    for q in MascotRules.Quest.allCases { done[q] = signals.done(q, stepsGoal: goal) }
    // `activeDefs`: nhiệm vụ bước rời danh sách khi chưa từng có số bước.
    let unclaimed = MascotRules.dailyQuests.map(\.key).filter { q in
      (q != .steps || signals.stepsEverRecorded) && done[q] == true
        && !claimed.contains(MascotRules.questRefKey(day, q))
    }
    let seen = watch.read(today: day.description, done: done, unclaimed: unclaimed)
    guard !seen.isEmpty else { return }
    // `new Date().getHours()`: giờ nguyên địa phương lúc thấy.
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = timeZone
    let hour = cal.component(.hour, from: clock.now())
    for q in seen { onQuestDone(q, hour) }
  }
}
