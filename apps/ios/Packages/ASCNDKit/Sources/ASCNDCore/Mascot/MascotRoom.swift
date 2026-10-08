public import Foundation
public import Observation

// Phòng linh vật (#527 Phase 7) — dữ liệu và hành động của `app/mascot-room.tsx`
// @ fac9ac2 (`hooks/use-mascot-room.ts`, `use-daily-quests.ts`, `use-extras.ts`).
//
// Kinh tế: SERVER là chủ. App chỉ gọi hai RPC — `claim_quest_reward(ref_key)`
// (server định giá theo `reward_prices`, chặn trùng bằng `UNIQUE(user_id,
// ref_key)`, trần 800 xu/ngày) và `buy_streak_freeze(request_id)` (giá
// `shop_prices`, kiểm số dư, giữ tối đa 2, idempotent theo `request_id`).
// Số dư / XP / cấp là PHÉP CỘNG trên sổ `mascot_transactions` mà RLS cho đọc —
// đúng như RN `useMascotWallet`; app không ghi sổ, không gửi số xu.

/// Một dòng sổ xu (`mascot_transactions.amount, ref_key`).
public struct LedgerRow: Sendable, Hashable {
  public let amount: Int
  public let refKey: String?

  public init(amount: Int, refKey: String?) {
    self.amount = amount
    self.refKey = refKey
  }
}

/// Ví (`useMascotWallet`): số dư, XP và các `ref_key` đã nhận — dựng từ sổ.
public struct MascotWallet: Sendable, Hashable {
  public let balance: Int
  /// XP không tiêu được; tiêu xu không bao giờ hạ cấp.
  public let xp: Int
  public let claimed: Set<String>

  public init(rows: [LedgerRow]) {
    balance = rows.reduce(0) { $0 + $1.amount }
    xp = rows.reduce(0) { $0 + ($1.refKey.map(MascotRules.xpForRefKey) ?? 0) }
    claimed = Set(rows.compactMap(\.refKey))
  }
}

/// Một băng chuỗi (`streak_freezes.used_on`): `nil` = đang giữ, chưa dùng.
public struct FreezeRow: Sendable, Hashable {
  public let usedOn: LocalDate?

  public init(usedOn: LocalDate?) { self.usedOn = usedOn }
}

/// Thử thách tuần (`weekly_challenges`), chỉ phần màn này đọc.
public struct WeeklyChallenge: Sendable, Hashable, Identifiable {
  public let id: String
  public let key: String
  /// Tiêu đề đã lưu trong hàng — dự phòng khi không có bản dịch.
  public let title: String
  public let completed: Bool
  public let rewardTier: String?

  public init(id: String, key: String, title: String, completed: Bool, rewardTier: String?) {
    self.id = id
    self.key = key
    self.title = title
    self.completed = completed
    self.rewardTier = rewardTier
  }

  /// Số đã trả cho thử thách này (`CHALLENGE_REWARD[reward_tier ?? 'bronze'] ?? bronze`).
  public var paid: (coins: Int, xp: Int) {
    MascotRules.challengeReward[rewardTier ?? "bronze"] ?? MascotRules.challengeReward["bronze"]!
  }
}

/// Năm tín hiệu của ngày (`use-daily-quests.ts`) — đọc, không ghi.
public struct DailySignals: Sendable, Hashable {
  /// `daily_logs` của hôm nay (`nil` = chưa có hàng / cột trống).
  public var kcal: Double?
  public var workoutCount: Double?
  public var sleepMinutes: Double?
  public var steps: Double?
  /// Có hàng `sleep_logs` thức dậy trong hôm nay.
  public var hasSleepRow: Bool
  /// Tổng `water_logs.amount_ml` của hôm nay.
  public var waterMl: Double
  /// `profiles.water_target_ml`.
  public var waterTargetMl: Double?
  /// Đã TỪNG có số bước (`daily_logs.steps > 0`). `false` = không có nguồn bước
  /// → nhiệm vụ bước rời khỏi danh sách (`stepsAvailable === false`).
  public var stepsEverRecorded: Bool

  public init(
    kcal: Double? = nil, workoutCount: Double? = nil, sleepMinutes: Double? = nil, steps: Double? = nil,
    hasSleepRow: Bool = false, waterMl: Double = 0, waterTargetMl: Double? = nil, stepsEverRecorded: Bool = false
  ) {
    self.kcal = kcal
    self.workoutCount = workoutCount
    self.sleepMinutes = sleepMinutes
    self.steps = steps
    self.hasSleepRow = hasSleepRow
    self.waterMl = waterMl
    self.waterTargetMl = waterTargetMl
    self.stepsEverRecorded = stepsEverRecorded
  }

  /// Mục tiêu nước khi hồ sơ không có (`Number(x) || 2500`).
  public static let defaultWaterTargetMl = 2500.0
  /// Mục tiêu bước mặc định của RN (`useStepsGoal`) — native chưa có chỗ đặt.
  public static let defaultStepsGoal = 10_000

  /// "Xong" của từng nhiệm vụ — `mealDone` / `sleepDone` (`lib/todo.ts`) và
  /// ba so sánh của `use-daily-quests.ts:94–115`.
  public func done(_ quest: MascotRules.Quest, stepsGoal: Int = defaultStepsGoal) -> Bool {
    switch quest {
    case .meal: (kcal ?? 0) > 0
    case .workout: (workoutCount ?? 0) > 0
    case .water: waterMl >= ((waterTargetMl ?? 0) > 0 ? waterTargetMl! : Self.defaultWaterTargetMl)
    case .sleep: hasSleepRow || (sleepMinutes ?? 0) > 0
    case .steps: (steps ?? 0) >= Double(stepsGoal)
    }
  }
}

/// Đọc cho phòng linh vật — mọi lời gọi mang `userId` của phiên.
public protocol MascotSource: Sendable {
  func ledger(userId: String) async throws -> [LedgerRow]
  /// Ngày đã ghi, mới → cũ, tối đa `limit` (`LOGGED_DAY_FILTER`).
  func loggedDates(userId: String, limit: Int) async throws -> [LocalDate]
  func freezes(userId: String) async throws -> [FreezeRow]
  func weeklyChallenges(userId: String, weekStart: LocalDate) async throws -> [WeeklyChallenge]
  func awardCount(userId: String) async throws -> Int
  func dailySignals(userId: String, date: LocalDate) async throws -> DailySignals
}

/// Hai RPC của server. Ném `MascotFailure` (adapter dịch thông điệp Postgres).
public protocol MascotEconomy: Sendable {
  /// `claim_quest_reward(p_ref_key, p_reason)` → số xu server trả.
  func claimReward(refKey: String, reason: String) async throws -> Int
  /// `buy_streak_freeze(p_request_id)` → số dư sau khi mua.
  func buyStreakFreeze(requestId: UUID) async throws -> Int
}

/// Vì sao một hành động kinh tế không xong — theo thứ người dùng làm được.
public enum MascotFailure: Error, Sendable, Hashable {
  case offline
  /// Phiên hết hạn (`not signed in`).
  case notSignedIn
  /// Không đủ xu (`insufficient coins`).
  case insufficientCoins
  /// Đã giữ đủ băng chuỗi (`freeze limit`).
  case freezeLimit
  /// Trần thưởng trong ngày của server (`daily reward ceiling reached`).
  case dailyCeiling
  /// Khoá thưởng server không nhận (`unknown reward`).
  case unknownReward
  /// Còn lại; mã thô chỉ cho log.
  case server(code: String?)
}

/// Phòng linh vật của MỘT tài khoản. Dựng theo phiên; đóng khi phiên đổi —
/// kết quả về sau khi đóng không bao giờ được áp (không mang ví người trước).
@MainActor @Observable
public final class MascotRoomController {
  public enum Phase: Sendable, Hashable {
    case loading
    /// Không đọc được sổ xu — không có gì đúng để hiện.
    case failed(TodayController.RefreshFailure)
    case ready
  }

  /// Kết quả một lần nhận thưởng — để màn chúc mừng đúng mức.
  public struct ClaimOutcome: Sendable, Hashable {
    public let amount: Int
    /// Cấp mới, nếu lần nhận này lên cấp.
    public let newLevel: Int?
    /// Hạng mới, nếu lần nhận này lên hạng.
    public let newRank: MascotRules.Rank?
  }

  public let userId: String
  public private(set) var today: LocalDate
  public private(set) var phase: Phase = .loading
  public private(set) var wallet: MascotWallet?
  public private(set) var streak = Streak.Value(count: 0, loggedToday: false)
  /// Băng chuỗi đang giữ / đã dùng.
  public private(set) var freezesHeld = 0
  public private(set) var freezesUsed = 0
  public private(set) var challenges: [WeeklyChallenge]?
  public private(set) var awardCount: Int?
  public private(set) var signals: DailySignals?
  public private(set) var claiming = false
  public private(set) var buyingFreeze = false
  /// Lỗi của hành động gần nhất (nhận thưởng / mua băng); xoá khi thử lại.
  public private(set) var actionFailure: MascotFailure?
  /// Lần nhận thưởng chào mừng vừa thành công (số xu) — màn báo một lần.
  public private(set) var welcomeGranted: Int?

  @ObservationIgnored private let source: any MascotSource
  @ObservationIgnored private let economy: any MascotEconomy
  @ObservationIgnored private let makeRequestId: @Sendable () -> UUID
  /// Mã của lần mua băng đang dở: GIỮ tới khi server nhận, để bấm lại sau một
  /// lần lỗi mạng không trừ tiền hai lần (`pendingFreezeBuy`).
  @ObservationIgnored private var pendingFreezeRequest: UUID?
  /// Chốt của thưởng chào mừng: đặt TRƯỚC khi gọi, gỡ khi bị từ chối (RN).
  @ObservationIgnored private var welcomeTried = false
  @ObservationIgnored private var closed = false

  public init(
    userId: String, today: LocalDate, source: any MascotSource, economy: any MascotEconomy,
    makeRequestId: @escaping @Sendable () -> UUID = { UUID() }
  ) {
    self.userId = userId
    self.today = today
    self.source = source
    self.economy = economy
    self.makeRequestId = makeRequestId
  }

  /// Phiên kết thúc: mọi kết quả về sau bị bỏ.
  public func close() { closed = true }

  // MARK: - Đọc

  /// Đọc tất cả, song song. Sổ xu là bắt buộc; phần khác lỗi thì phần đó ẩn.
  public func load() async {
    let uid = userId, day = today, src = source
    let weekStart = day.adding(days: -WorkoutPlanning.routineIndex(day))
    async let ledger = capture { try await src.ledger(userId: uid) }
    async let dates = capture { try await src.loggedDates(userId: uid, limit: Streak.window) }
    async let freezes = capture { try await src.freezes(userId: uid) }
    async let weekly = capture { try await src.weeklyChallenges(userId: uid, weekStart: weekStart) }
    async let awards = capture { try await src.awardCount(userId: uid) }
    async let daily = capture { try await src.dailySignals(userId: uid, date: day) }
    let (l, d, f, w, a, s) = await (ledger, dates, freezes, weekly, awards, daily)
    guard !closed else { return }

    switch l {
    case .success(let rows): wallet = MascotWallet(rows: rows)
    case .failure(let e): if wallet == nil { phase = .failed(TodayController.failure([e]) ?? .unavailable) }
    }
    // Băng đọc lỗi thì coi như không có (RN: lỗi `streak_freezes` → []).
    let frozenRows = (try? f.get()) ?? []
    let used = frozenRows.compactMap(\.usedOn)
    freezesHeld = frozenRows.count - used.count
    freezesUsed = used.count
    if let logged = try? d.get() {
      // `streakFrom` — cùng một bản port với widget (#66).
      streak = Streak.from(logged.map(\.description), today: day.description, frozen: used.map(\.description))
    }
    if let rows = try? w.get() { challenges = rows }
    if let n = try? a.get() { awardCount = n }
    if let sig = try? s.get() { signals = sig }
    if wallet != nil { phase = .ready }
    await grantWelcomeIfNeeded()
  }

  /// Chỉ đọc lại sổ (sau một lần nhận / mua).
  private func reloadLedger() async {
    let uid = userId, src = source
    guard let rows = try? await src.ledger(userId: uid), !closed else { return }
    wallet = MascotWallet(rows: rows)
  }

  private func reloadFreezes() async {
    let uid = userId, src = source
    guard let rows = try? await src.freezes(userId: uid), !closed else { return }
    let used = rows.compactMap(\.usedOn)
    freezesHeld = rows.count - used.count
    freezesUsed = used.count
  }

  // MARK: - Hiện

  public var balance: Int { wallet?.balance ?? 0 }
  public var xp: Int { wallet?.xp ?? 0 }
  public var level: Int { MascotRules.level(xp: xp) }
  /// XP đã có trong cấp hiện tại.
  public var intoLevel: Int { xp % MascotRules.levelXp }
  public var rank: MascotRules.Rank { MascotRules.rank(level: level) }
  public var nextRank: MascotRules.Rank? { MascotRules.nextRank(level: level) }

  public func isClaimed(_ refKey: String) -> Bool { wallet?.claimed.contains(refKey) ?? false }

  /// Nhiệm vụ đang tính cho tài khoản này: bỏ `steps` khi chưa từng có số bước.
  public var activeQuests: [MascotRules.QuestDef] {
    MascotRules.dailyQuests.filter { $0.key != .steps || signals?.stepsEverRecorded != false }
  }

  public func questDone(_ q: MascotRules.Quest) -> Bool { signals?.done(q) ?? false }

  public var energyCount: Int { MascotRules.energySignals.filter(questDone).count }
  public var energyHeadline: MascotRules.EnergyHeadline { MascotRules.energyHeadline(energyCount) }

  /// Dòng thưởng chuỗi: từ ngày 2, và CHỈ khi hôm nay đã nằm trong chuỗi.
  public var showsStreakBonus: Bool { streak.count >= 2 && streak.loggedToday }
  public var streakRefKey: String { MascotRules.streakRefKey(today) }
  /// Số xu server trả cho dòng chuỗi (cố định 25) — RN hiện `streakCoins(n)`
  /// (9…25), lệch với số thật được trả ở chuỗi 2–9 ngày.
  public var streakBonus: Int { MascotRules.streakPayout }

  public var freezeFull: Bool { freezesHeld >= MascotRules.freezeMax }
  public var canBuyFreeze: Bool { !freezeFull && !buyingFreeze && balance >= MascotRules.freezePrice }

  public var completedChallenges: [WeeklyChallenge] { (challenges ?? []).filter(\.completed) }

  // MARK: - Hành động

  /// Nhận thưởng chuỗi (`reward(streakRefKey, …, 'streak:<n>', STREAK_XP)`).
  public func claimStreakBonus() async -> ClaimOutcome? {
    guard showsStreakBonus, !isClaimed(streakRefKey), !claiming else { return nil }
    return await claim(refKey: streakRefKey, reason: "streak:\(streak.count)", xpGain: MascotRules.streakXp)
  }

  private func claim(refKey: String, reason: String, xpGain: Int) async -> ClaimOutcome? {
    claiming = true
    actionFailure = nil
    defer { claiming = false }
    let before = xp
    do {
      let amount = try await economy.claimReward(refKey: refKey, reason: reason)
      guard !closed else { return nil }
      await reloadLedger()
      let oldLevel = MascotRules.level(xp: before), newLevel = MascotRules.level(xp: before + xpGain)
      let oldRank = MascotRules.rank(level: oldLevel), newRank = MascotRules.rank(level: newLevel)
      return ClaimOutcome(
        amount: amount, newLevel: newLevel > oldLevel ? newLevel : nil,
        newRank: newRank.key != oldRank.key ? newRank : nil)
    } catch {
      guard !closed else { return nil }
      actionFailure = Self.failure(error)
      return nil
    }
  }

  /// Mua một băng chuỗi. Cùng một mã yêu cầu cho tới khi server nhận.
  @discardableResult
  public func buyFreeze() async -> Bool {
    guard canBuyFreeze else { return false }
    buyingFreeze = true
    actionFailure = nil
    defer { buyingFreeze = false }
    let request = pendingFreezeRequest ?? makeRequestId()
    pendingFreezeRequest = request
    do {
      _ = try await economy.buyStreakFreeze(requestId: request)
      guard !closed else { return false }
      pendingFreezeRequest = nil
      async let l: Void = reloadLedger()
      async let f: Void = reloadFreezes()
      _ = await (l, f)
      return true
    } catch {
      guard !closed else { return false }
      actionFailure = Self.failure(error)
      return false
    }
  }

  /// Túi chào mừng 300 xu (`welcome`, server định giá, idempotent theo khoá).
  private func grantWelcomeIfNeeded() async {
    guard let wallet, !wallet.claimed.contains("welcome"), !welcomeTried else { return }
    welcomeTried = true
    do {
      let amount = try await economy.claimReward(refKey: "welcome", reason: "welcome bonus")
      guard !closed else { return }
      welcomeGranted = amount
      await reloadLedger()
    } catch {
      // Bị từ chối thì lần mở sau được thử lại — khoá là duy nhất mỗi tài khoản.
      welcomeTried = false
    }
  }

  /// Màn đã báo lỗi của hành động.
  public func clearFailure() { actionFailure = nil }

  /// Màn đã báo xong thưởng chào mừng.
  public func welcomeShown() { welcomeGranted = nil }

  static func failure(_ error: any Error) -> MascotFailure {
    if let f = error as? MascotFailure { return f }
    return NetworkFailure.isOffline(error) ? .offline : .server(code: nil)
  }
}

/// Lỗi của một lượt đọc thành giá trị — để các lượt song song không kéo nhau đổ.
func capture<T: Sendable>(_ body: @Sendable () async throws -> T) async -> Result<T, any Error> {
  do { return .success(try await body()) } catch { return .failure(error) }
}
