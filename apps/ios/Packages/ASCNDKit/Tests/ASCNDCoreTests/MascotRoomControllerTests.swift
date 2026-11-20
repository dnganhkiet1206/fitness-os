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

    /// Độ trễ của lần đọc sổ xu kế tiếp (thử tải chồng — KOA-T17), dùng một lần.
    var nextLedgerDelayMs = 0
    var freezesError: (any Error)?
    func ledger(userId: String) async throws -> [LedgerRow] {
      note(userId)
      let (delay, rows, err) = lock.withLock { () -> (Int, [LedgerRow], (any Error)?) in
        let d = nextLedgerDelayMs
        nextLedgerDelayMs = 0
        return (d, ledgerRows, ledgerError)
      }
      if delay > 0 { try? await Task.sleep(for: .milliseconds(delay)) }
      if let err { throw err }
      return rows
    }
    func loggedDates(userId: String, limit: Int) async throws -> [LocalDate] {
      note(userId)
      return dates
    }
    func freezes(userId: String) async throws -> [FreezeRow] {
      note(userId)
      if let freezesError { throw freezesError }
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
    /// Server trả 0 = khoá đã nhận ở máy khác (KOA-T01); sổ không thêm dòng.
    var duplicate = false

    init(source: FakeSource) { self.source = source }

    func claimReward(refKey: String, reason: String) async throws -> Int {
      lock.withLock { claims.append(refKey) }
      if let claimError { throw claimError }
      if duplicate { return 0 }
      let amount = refKey == "welcome" ? 300 : 25
      source.lock.withLock { source.ledgerRows.append(LedgerRow(amount: amount, refKey: refKey)) }
      return amount
    }
  }

  func make(_ source: FakeSource, user: String = "u1") -> (MascotRoomController, FakeEconomy) {
    let economy = FakeEconomy(source: source)
    let c = MascotRoomController(userId: user, today: today, source: source, economy: economy)
    return (c, economy)
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

  /// KOA-T17: hai lượt tải chồng nhau — lượt bắt đầu sau thắng, lượt cũ về muộn không đè.
  @Test func overlappingLoadsLatestWins() async {
    let s = FakeSource()
    s.ledgerRows = Self.welcomed
    let (c, _) = make(s)
    await c.load()
    s.nextLedgerDelayMs = 120  // lượt 1 chậm, còn sổ CŨ
    let first = Task { await c.load() }
    try? await Task.sleep(for: .milliseconds(20))
    s.ledgerRows = Self.welcomed + [LedgerRow(amount: 40, refKey: "x:photo")]
    await c.load()  // lượt 2 nhanh, sổ MỚI
    #expect(c.balance == 340)
    await first.value
    #expect(c.balance == 340, "lượt cũ về muộn không được đè số mới")
  }

  /// KOA-T17: sổ xu đọc hỏng sau khi đã có số → giữ số, nhưng báo là số cũ; băng hỏng
  /// không về 0.
  @Test func aFailedReloadIsShownAsStaleAndFreezesAreKept() async {
    let s = FakeSource()
    s.ledgerRows = Self.welcomed
    s.freezeRows = [FreezeRow(usedOn: nil), FreezeRow(usedOn: nil)]
    let (c, _) = make(s)
    await c.load()
    #expect(!c.walletStale)
    #expect(c.freezesHeld == 2)
    s.ledgerError = URLError(.timedOut)
    s.freezesError = URLError(.timedOut)
    await c.load()
    #expect(c.walletStale)
    #expect(c.phase == .ready)
    #expect(c.balance == 300)
    #expect(c.freezesHeld == 2, "băng đọc hỏng: giữ số đã biết, không về 0")
    s.ledgerError = nil
    await c.load()
    #expect(!c.walletStale)
  }

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

  /// KOA-T01: túi chào mừng đã nhận ở máy khác (server trả 0) → không hiện "+300".
  @Test func welcomeAlreadyClaimedElsewhereIsNotCelebrated() async {
    let s = FakeSource()
    let (c, e) = make(s)
    e.duplicate = true
    await c.load()
    #expect(e.claims == ["welcome"])
    #expect(c.welcomeGranted == nil)
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

  /// KOA-T51: bị từ chối HẲN (lỗi không tạm) thì không gõ cửa lại mỗi lần mở phòng.
  @Test func permanentlyRefusedWelcomeIsNotRetried() async {
    let s = FakeSource()
    let (c, e) = make(s)
    e.claimError = MascotFailure.server(code: "P0001")
    await c.load()
    e.claimError = nil
    await c.load()
    #expect(e.claims == ["welcome"])
    #expect(c.welcomeGranted == nil)
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
    #expect(c.activeQuests.map(\.key) == [.workout, .meal, .water, .sleep, .steps])
    c.questDay = .rest
    // ngày nghỉ: hồi phục THAY buổi tập (lỗi 03/11: trước đây cộng thêm, 5 → 6)
    #expect(c.activeQuests.map(\.key) == [.recovery, .meal, .water, .sleep, .steps])
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
    #expect(c.xp == 40)
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

  /// Koa Ecosystem V2 (02/11): không còn 15 xu chuỗi tự về mỗi ngày.
  @Test func streakCoinsAreNoLongerClaimedByThemselves() async {
    let s = FakeSource()
    s.ledgerRows = Self.welcomed
    s.dates = [today, LocalDate("2026-10-07")!]
    let (c, e) = make(s)
    await c.load()
    #expect(e.claims.isEmpty)
    #expect(c.streakAutoClaim == nil)
  }

  /// Nhận tay bị từ chối thì báo đúng lỗi.
  @Test func refusedClaimNamesTheFailure() async {
    let s = FakeSource()
    s.ledgerRows = Self.welcomed
    s.dates = [today, LocalDate("2026-10-07")!]
    let (c, e) = make(s)
    e.claimError = MascotFailure.dailyCeiling
    await c.load()
    #expect(c.actionFailure == nil, "đọc phòng không tự nhận gì")
    #expect(await c.claimStreakBonus() == nil)
    #expect(c.actionFailure == .dailyCeiling)
  }

  // MARK: - Băng chuỗi

  /// Băng đã mua giữ nguyên sau khi đóng bán: số đang giữ / đã dùng vẫn đọc
  /// từ hàng `streak_freezes` (lối mua đã gỡ — AUD-14).
  @Test func freezeCountsComeFromHeldAndUsedRows() async {
    let s = FakeSource()
    s.ledgerRows = Self.welcomed
    s.freezeRows = [FreezeRow(usedOn: nil), FreezeRow(usedOn: nil), FreezeRow(usedOn: LocalDate("2026-10-01"))]
    let (c, _) = make(s)
    await c.load()
    #expect(c.freezesHeld == 2)
    #expect(c.freezesUsed == 1)
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
