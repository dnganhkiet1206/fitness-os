@testable import ASCNDCore
import Foundation
import Testing

/// Phòng linh vật (#527 Phase 7): đọc theo đúng tài khoản, trạng thái tải /
/// lỗi / trống, thưởng chào mừng, thưởng chuỗi, băng chuỗi — server là chủ.
@MainActor
struct MascotRoomControllerTests {
  /// 2026-10-08 là Thứ Năm → tuần bắt đầu 2026-10-05.
  let today = LocalDate("2026-10-08")!

  final class FakeSource: MascotSource, @unchecked Sendable {
    let lock = NSLock()
    var ledgerRows: [LedgerRow] = []
    var ledgerError: (any Error)?
    var dates: [LocalDate] = []
    var freezeRows: [FreezeRow] = []
    var weekly: [WeeklyChallenge] = []
    var awards = 0
    var signals = DailySignals()
    var signalsError: (any Error)?
    /// Mọi `userId` được hỏi, theo thứ tự.
    var askedFor: [String] = []
    var askedWeekStart: LocalDate?

    private func note(_ uid: String) { lock.withLock { askedFor.append(uid) } }

    func ledger(userId: String) async throws -> [LedgerRow] {
      note(userId)
      if let ledgerError { throw ledgerError }
      return lock.withLock { ledgerRows }
    }
    func loggedDates(userId: String, limit: Int) async throws -> [LocalDate] {
      note(userId)
      return dates
    }
    func freezes(userId: String) async throws -> [FreezeRow] {
      note(userId)
      return lock.withLock { freezeRows }
    }
    func weeklyChallenges(userId: String, weekStart: LocalDate) async throws -> [WeeklyChallenge] {
      note(userId)
      lock.withLock { askedWeekStart = weekStart }
      return weekly
    }
    func awardCount(userId: String) async throws -> Int {
      note(userId)
      return awards
    }
    func dailySignals(userId: String, date: LocalDate) async throws -> DailySignals {
      note(userId)
      if let signalsError { throw signalsError }
      return signals
    }
  }

  final class FakeEconomy: MascotEconomy, @unchecked Sendable {
    let lock = NSLock()
    /// Sổ dùng chung với nguồn: một lần nhận thành công ghi vào đây (như server).
    let source: FakeSource
    var claims: [String] = []
    var claimError: (any Error)?
    var freezeRequests: [UUID] = []
    var freezeError: (any Error)?

    init(source: FakeSource) { self.source = source }

    func claimReward(refKey: String, reason: String) async throws -> Int {
      lock.withLock { claims.append(refKey) }
      if let claimError { throw claimError }
      let amount = refKey == "welcome" ? 300 : 25
      source.lock.withLock { source.ledgerRows.append(LedgerRow(amount: amount, refKey: refKey)) }
      return amount
    }

    func buyStreakFreeze(requestId: UUID) async throws -> Int {
      lock.withLock { freezeRequests.append(requestId) }
      if let freezeError { throw freezeError }
      source.lock.withLock {
        source.ledgerRows.append(LedgerRow(amount: -MascotRules.freezePrice, refKey: "freeze:\(requestId)"))
        source.freezeRows.append(FreezeRow(usedOn: nil))
      }
      return 0
    }
  }

  func make(_ source: FakeSource, user: String = "u1", ids: [UUID] = []) -> (MascotRoomController, FakeEconomy) {
    let economy = FakeEconomy(source: source)
    let queue = IdQueue(ids)
    let c = MascotRoomController(
      userId: user, today: today, source: source, economy: economy, makeRequestId: { queue.next() })
    return (c, economy)
  }

  final class IdQueue: @unchecked Sendable {
    let lock = NSLock()
    var ids: [UUID]
    init(_ ids: [UUID]) { self.ids = ids }
    func next() -> UUID { lock.withLock { ids.isEmpty ? UUID() : ids.removeFirst() } }
  }

  static let welcomed = [LedgerRow(amount: 300, refKey: "welcome")]

  // MARK: - Đọc

  @Test func everyReadAsksForThisAccountOnly() async {
    let s = FakeSource()
    s.ledgerRows = Self.welcomed
    let (c, _) = make(s, user: "acct-A")
    await c.load()
    #expect(!s.askedFor.isEmpty)
    #expect(s.askedFor.allSatisfy { $0 == "acct-A" })
    #expect(s.askedWeekStart == LocalDate("2026-10-05"))
  }

  @Test func startsLoadingThenReady() async {
    let s = FakeSource()
    s.ledgerRows = Self.welcomed
    let (c, _) = make(s)
    #expect(c.phase == .loading)
    await c.load()
    #expect(c.phase == .ready)
    #expect(c.balance == 300)
    #expect(c.level == 1)
  }

  /// Sổ không đọc được: không có gì đúng để hiện — báo lỗi, không bịa số dư 0.
  @Test func ledgerFailureIsAnErrorNotAnEmptyWallet() async {
    let s = FakeSource()
    s.ledgerError = URLError(.notConnectedToInternet)
    let (c, e) = make(s)
    await c.load()
    #expect(c.phase == .failed(.offline))
    #expect(c.wallet == nil)
    #expect(e.claims.isEmpty, "không thưởng chào mừng khi chưa đọc được sổ")
  }

  /// Phần phụ lỗi thì phần đó trống; phòng vẫn mở.
  @Test func sideReadFailureHidesOnlyThatPart() async {
    let s = FakeSource()
    s.ledgerRows = Self.welcomed
    s.signalsError = URLError(.timedOut)
    let (c, _) = make(s)
    await c.load()
    #expect(c.phase == .ready)
    #expect(c.signals == nil)
    #expect(c.energyCount == 0)
  }

  /// Đóng phiên giữa chừng: kết quả về sau không được áp (không mang ví người trước).
  @Test func closedRoomIgnoresLateResults() async {
    let s = FakeSource()
    s.ledgerRows = [LedgerRow(amount: 999, refKey: "welcome")]
    let (c, _) = make(s)
    c.close()
    await c.load()
    #expect(c.wallet == nil)
    #expect(c.phase == .loading)
  }

  // MARK: - Thưởng chào mừng

  @Test func welcomeIsClaimedOnceThroughTheServer() async {
    let s = FakeSource()
    let (c, e) = make(s)
    await c.load()
    #expect(e.claims == ["welcome"])
    #expect(c.welcomeGranted == 300)
    #expect(c.balance == 300)
    await c.load()
    #expect(e.claims == ["welcome"], "đã có trong sổ thì không hỏi lại")
  }

  /// Bị từ chối thì lần sau được thử lại (chốt gỡ khi lỗi — RN).
  @Test func refusedWelcomeIsRetriedNextTime() async {
    let s = FakeSource()
    let (c, e) = make(s)
    e.claimError = URLError(.timedOut)
    await c.load()
    #expect(c.welcomeGranted == nil)
    e.claimError = nil
    await c.load()
    #expect(e.claims == ["welcome", "welcome"])
    #expect(c.welcomeGranted == 300)
  }

  // MARK: - Nhiệm vụ, năng lượng

  @Test func questsFollowTheDaysSignals() async {
    let s = FakeSource()
    s.ledgerRows = Self.welcomed
    s.signals = DailySignals(
      kcal: 420, workoutCount: 1, sleepMinutes: 0, steps: 4000, hasSleepRow: false, waterMl: 2000,
      waterTargetMl: 1800, stepsEverRecorded: true)
    let (c, _) = make(s)
    await c.load()
    #expect(c.questDone(.meal))
    #expect(c.questDone(.workout))
    #expect(c.questDone(.water), "mục tiêu của hồ sơ, không phải 2500")
    #expect(!c.questDone(.sleep))
    #expect(!c.questDone(.steps), "dưới mục tiêu 10.000 mặc định")
    #expect(c.energyCount == 3)
    #expect(c.energyHeadline == .mid)
    #expect(c.activeQuests.map(\.key) == [.meal, .workout, .water, .sleep, .steps])
  }

  /// Chưa từng có số bước: nhiệm vụ bước rời danh sách (không ai thắng được nó).
  @Test func stepsQuestLeavesWithoutAStepSource() async {
    let s = FakeSource()
    s.ledgerRows = Self.welcomed
    s.signals = DailySignals(stepsEverRecorded: false)
    let (c, _) = make(s)
    await c.load()
    #expect(!c.activeQuests.contains { $0.key == .steps })
    #expect(DailySignals(waterMl: 2500).done(.water), "không có mục tiêu → 2500")
    #expect(DailySignals(hasSleepRow: true).done(.sleep))
    #expect(DailySignals(sleepMinutes: 30).done(.sleep))
  }

  @Test func claimedQuestsComeFromTheLedger() async {
    let s = FakeSource()
    s.ledgerRows = Self.welcomed + [LedgerRow(amount: 25, refKey: "d:2026-10-08:workout")]
    let (c, _) = make(s)
    await c.load()
    #expect(c.isClaimed(MascotRules.questRefKey(today, .workout)))
    #expect(!c.isClaimed(MascotRules.questRefKey(today, .meal)))
    #expect(c.xp == 30)
  }

  // MARK: - Thưởng chuỗi

  /// Chuỗi 3 nhưng hôm nay chưa ghi: KHÔNG có dòng thưởng (không trả cho ngày chưa xảy ra).
  @Test func streakBonusNeedsTodayInTheRun() async {
    let s = FakeSource()
    s.ledgerRows = Self.welcomed
    s.dates = [LocalDate("2026-10-07")!, LocalDate("2026-10-06")!, LocalDate("2026-10-05")!]
    let (c, e) = make(s)
    await c.load()
    #expect(c.streak.count == 3)
    #expect(!c.showsStreakBonus)
    #expect(await c.claimStreakBonus() == nil)
    #expect(e.claims.isEmpty)
  }

  @Test func streakBonusClaimsThroughTheServerAndReportsLevelUp() async {
    let s = FakeSource()
    // 300 xu, 110 XP: còn 10 XP là lên cấp 2.
    s.ledgerRows = Self.welcomed + [LedgerRow(amount: 0, refKey: "ch:gold:x:y"), LedgerRow(amount: 0, refKey: "d:2026-10-01:workout")]
    s.dates = [today, LocalDate("2026-10-07")!]
    let (c, e) = make(s)
    await c.load()
    #expect(c.xp == 110)
    #expect(c.showsStreakBonus)
    #expect(c.streakBonus == MascotRules.streakPayout)
    let outcome = await c.claimStreakBonus()
    #expect(e.claims == ["d:2026-10-08:streak"])
    #expect(outcome?.amount == 25)
    #expect(outcome?.newLevel == 2)
    #expect(outcome?.newRank == nil, "cấp 2 vẫn là Tập sự")
    #expect(c.isClaimed("d:2026-10-08:streak"))
    #expect(await c.claimStreakBonus() == nil, "đã nhận thì không gửi lần hai")
  }

  @Test func refusedClaimNamesTheFailure() async {
    let s = FakeSource()
    s.ledgerRows = Self.welcomed
    s.dates = [today, LocalDate("2026-10-07")!]
    let (c, e) = make(s)
    await c.load()
    e.claimError = MascotFailure.dailyCeiling
    #expect(await c.claimStreakBonus() == nil)
    #expect(c.actionFailure == .dailyCeiling)
    #expect(!c.isClaimed(c.streakRefKey))
  }

  // MARK: - Băng chuỗi

  @Test func freezeButtonFollowsBalanceAndCap() async {
    let s = FakeSource()
    s.ledgerRows = [LedgerRow(amount: 100, refKey: "welcome")]
    let (c, _) = make(s)
    await c.load()
    #expect(!c.canBuyFreeze, "100 < 150")
    s.ledgerRows = Self.welcomed
    s.freezeRows = [FreezeRow(usedOn: nil), FreezeRow(usedOn: nil), FreezeRow(usedOn: LocalDate("2026-10-01"))]
    await c.load()
    #expect(c.freezesHeld == 2)
    #expect(c.freezesUsed == 1)
    #expect(c.freezeFull)
    #expect(!c.canBuyFreeze)
  }

  /// Lỗi mạng giữa chừng: lần bấm lại dùng CÙNG mã yêu cầu (server không trừ hai lần);
  /// xong thì mã mới cho lần mua sau.
  @Test func freezePurchaseReusesItsRequestIdUntilAccepted() async {
    let a = UUID(), b = UUID()
    let s = FakeSource()
    s.ledgerRows = Self.welcomed
    let (c, e) = make(s, ids: [a, b])
    await c.load()
    e.freezeError = URLError(.networkConnectionLost)
    #expect(await c.buyFreeze() == false)
    #expect(c.actionFailure == .offline)
    e.freezeError = nil
    #expect(await c.buyFreeze())
    #expect(e.freezeRequests == [a, a])
    #expect(c.balance == 150)
    #expect(c.freezesHeld == 1)
    #expect(await c.buyFreeze())
    #expect(e.freezeRequests == [a, a, b])
    #expect(c.balance == 0)
    #expect(c.freezeFull)
  }

  @Test func serverFreezeRefusalIsNamed() async {
    let s = FakeSource()
    s.ledgerRows = Self.welcomed
    let (c, e) = make(s)
    await c.load()
    e.freezeError = MascotFailure.insufficientCoins
    #expect(await c.buyFreeze() == false)
    #expect(c.actionFailure == .insufficientCoins)
  }

  // MARK: - Thử thách tuần

  @Test func completedChallengesShowWhatWasPaid() async {
    let s = FakeSource()
    s.ledgerRows = Self.welcomed
    s.weekly = [
      WeeklyChallenge(id: "1", key: "steps_week", title: "Steps", completed: true, rewardTier: "gold"),
      WeeklyChallenge(id: "2", key: "x", title: "X", completed: false, rewardTier: "silver"),
      WeeklyChallenge(id: "3", key: "y", title: "Y", completed: true, rewardTier: nil),
    ]
    let (c, _) = make(s)
    await c.load()
    #expect(c.completedChallenges.map(\.id) == ["1", "3"])
    #expect(c.completedChallenges[0].paid.coins == 80)
    #expect(c.completedChallenges[1].paid.coins == 25, "không có hạng → đồng")
  }
}
