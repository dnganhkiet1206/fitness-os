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
///
/// Tự nhận thưởng (Koa đợt 1, 19/10 — `useQuestAutoClaim` của RN, phần native
/// còn thiếu: xu từng nằm "đang chờ" mãi vì không có nút nào nhận): MỌI lượt đọc
/// `ready` gửi `claim_quest_reward` cho từng nhiệm vụ đã xong mà chưa nhận — kể
/// cả nhiệm vụ đã xong lúc app đóng (bước / giấc ngủ từ Apple Health). Server
/// khoá theo `ref_key` (`ON CONFLICT DO NOTHING`) nên gửi lặp không trả hai lần.
/// `sent` chặn gửi lại trong phiên; lần bị từ chối thì gỡ khỏi `sent` và giữ ở
/// `owed` để lượt sau thử lại, kể cả qua nửa đêm (server nhận trong 2 ngày).
/// Nhận và ăn mừng là hai việc: `onClaimed` báo `seen = true` chỉ cho bước
/// chuyển app THẤY tận mắt — mở app với bốn việc đã xong đêm qua không diễn bốn
/// màn ăn mừng.
@MainActor
public final class QuestObserver {
  /// Một lần nhận thưởng thành công.
  public struct Claimed: Sendable, Hashable {
    public let quest: MascotRules.Quest
    public let refKey: String
    public let amount: Int
    /// Bước chuyển "chưa xong → xong" thấy ở lượt đọc này.
    public let seen: Bool
    /// Mọi nhiệm vụ đang tính của ngày đã xong ở lượt đọc này.
    public var allDone = false
  }

  /// Nhận lại một khoá bị từ chối trong bao nhiêu ngày (`CLAIM_RETRY_DAYS`).
  public static let claimRetryDays = 2

  public let userId: String

  private let source: any MascotSource
  private let stepsGoal: @Sendable () -> Int
  private let clock: any WallClock
  private let timeZone: TimeZone
  private let onQuestDone: @MainActor (MascotRules.Quest, Int) -> Void
  private let economy: (any MascotEconomy)?
  private let onClaimed: @MainActor (Claimed) -> Void
  /// Khoá đã gửi trong phiên này (đang chờ hoặc đã nhận).
  private var sent: Set<String> = []
  /// Khoá bị từ chối, còn nợ: khoá → (nhiệm vụ, ngày).
  private var owed: [String: (MascotRules.Quest, LocalDate)] = [:]

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
    economy: (any MascotEconomy)? = nil,
    onClaimed: @escaping @MainActor (Claimed) -> Void = { _ in },
    onQuestDone: @escaping @MainActor (MascotRules.Quest, Int) -> Void
  ) {
    self.economy = economy
    self.onClaimed = onClaimed
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
    let active = MascotRules.dailyQuests.map(\.key).filter { $0 != .steps || signals.stepsEverRecorded }
    claim(unclaimed, day: day, seen: Set(seen), claimed: claimed, allDone: active.allSatisfy { done[$0] == true })
    guard !seen.isEmpty else { return }
    // `new Date().getHours()`: giờ nguyên địa phương lúc thấy.
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = timeZone
    let hour = cal.component(.hour, from: clock.now())
    for q in seen { onQuestDone(q, hour) }
  }

  /// Gửi nhận thưởng cho các nhiệm vụ chưa nhận của hôm nay, rồi các khoá còn nợ
  /// của ngày trước (trong `claimRetryDays`).
  private func claim(
    _ quests: [MascotRules.Quest], day: LocalDate, seen: Set<MascotRules.Quest>, claimed: Set<String>, allDone: Bool
  ) {
    guard let economy else { return }
    var jobs = quests.map { (MascotRules.questRefKey(day, $0), $0, seen.contains($0)) }
    let oldest = day.adding(days: -Self.claimRetryDays)
    for (key, (q, d)) in owed.sorted(by: { $0.key < $1.key }) where !jobs.contains(where: { $0.0 == key }) {
      if d < oldest || claimed.contains(key) {
        owed[key] = nil
      } else {
        jobs.append((key, q, false))
      }
    }
    for (key, q, saw) in jobs where !sent.contains(key) {
      sent.insert(key)
      let date = LocalDate(String(key.dropFirst(2).prefix(10))) ?? day
      Task { @MainActor [weak self] in
        do {
          let amount = try await economy.claimReward(refKey: key, reason: q.rawValue)
          guard let self, !self.closed else { return }
          self.owed[key] = nil
          // "Xong hết" chỉ gắn với nhiệm vụ của hôm nay, không với khoá nợ hôm qua.
          self.onClaimed(Claimed(quest: q, refKey: key, amount: amount, seen: saw, allDone: allDone && date == day))
        } catch {
          guard let self, !self.closed else { return }
          // Im lặng (như RN): lượt đọc sau thử lại, không mất gì.
          self.sent.remove(key)
          self.owed[key] = (q, date)
        }
      }
    }
  }
}
