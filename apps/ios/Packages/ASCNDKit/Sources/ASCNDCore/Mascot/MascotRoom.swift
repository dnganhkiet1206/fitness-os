public import Foundation
public import Observation

// Phòng linh vật (#527 Phase 7) — dữ liệu và hành động của `app/mascot-room.tsx`
// @ fac9ac2 (`hooks/use-mascot-room.ts`, `use-daily-quests.ts`, `use-extras.ts`).
//
// Kinh tế: SERVER là chủ. App chỉ gọi RPC `claim_quest_reward(ref_key)`
// (server định giá theo `reward_prices`, chặn trùng bằng `UNIQUE(user_id,
// ref_key)`, trần 800 xu/ngày). Băng chuỗi đã đóng bán (AUD-14): không còn
// lối mua trong app; băng đã mua giữ nguyên.
// Số dư / XP / cấp là PHÉP CỘNG trên sổ `mascot_transactions` mà RLS cho đọc —
// đúng như RN `useMascotWallet`; app không ghi sổ, không gửi số xu.

/// Một dòng sổ xu (`mascot_transactions.amount, ref_key`) — hoặc một dòng GỘP
/// của ví ở server (`mascot_wallet()`, round 3 AUD-28).
public struct LedgerRow: Sendable, Hashable {
  public let amount: Int
  public let refKey: String?
  /// Số dòng sổ mà dòng này đại diện khi tính XP (dòng gộp theo loại khoá: n).
  public let xpCount: Int
  /// Khoá này là một khoá ĐÃ NHẬN thật (dòng gộp XP mang khoá mẫu thì không).
  public let claimsKey: Bool

  public init(amount: Int, refKey: String?, xpCount: Int = 1, claimsKey: Bool = true) {
    self.amount = amount
    self.refKey = refKey
    self.xpCount = xpCount
    self.claimsKey = claimsKey
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
    xp = rows.reduce(0) { $0 + $1.xpCount * ($1.refKey.map(MascotRules.xpForRefKey) ?? 0) }
    claimed = Set(rows.filter(\.claimsKey).compactMap(\.refKey))
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
  /// Mục tiêu bước mặc định của RN (`useStepsGoal`); mục tiêu đã đặt ở màn
  /// Vận động đi vào qua `MascotRoomController.stepsGoal`.
  public static let defaultStepsGoal = Steps.defaultGoal

  /// "Xong" của từng nhiệm vụ — `mealDone` / `sleepDone` (`lib/todo.ts`) và
  /// ba so sánh của `use-daily-quests.ts:94–115`.
  public func done(_ quest: MascotRules.Quest, stepsGoal: Int = defaultStepsGoal) -> Bool {
    switch quest {
    case .meal: (kcal ?? 0) > 0
    case .workout: (workoutCount ?? 0) > 0
    case .water: waterMl >= ((waterTargetMl ?? 0) > 0 ? waterTargetMl! : Self.defaultWaterTargetMl)
    case .sleep: hasSleepRow || (sleepMinutes ?? 0) > 0
    case .steps: (steps ?? 0) >= Double(stepsGoal)
    case .recovery: (hasSleepRow || (sleepMinutes ?? 0) > 0) && (steps ?? 0) >= Double(MascotRules.recoverySteps)
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

/// RPC của server. Ném `MascotFailure` (adapter dịch thông điệp Postgres).
public protocol MascotEconomy: Sendable {
  /// `claim_quest_reward(p_ref_key, p_reason)` → số xu server trả.
  func claimReward(refKey: String, reason: String) async throws -> Int
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
  /// Món đã có trong tủ (`already owned`).
  case alreadyOwned
  /// Món không có trong bảng giá của server (`unknown item`).
  case unknownItem
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

  public let userId: String
  public private(set) var today: LocalDate
  public private(set) var phase: Phase = .loading
  public private(set) var wallet: MascotWallet? {
    // KOA-T55: tập khoá server đọc được đi vào cổng chung — các chỗ nhận khác (tuần, thử thách…) cùng biết.
    didSet { if let wallet { gate?.absorbServer(wallet.claimed) } }
  }
  public private(set) var streak = Streak.Value(count: 0, loggedToday: false)
  /// Băng chuỗi đang giữ / đã dùng.
  public private(set) var freezesHeld = 0
  public private(set) var freezesUsed = 0
  public private(set) var challenges: [WeeklyChallenge]?
  public private(set) var awardCount: Int?
  public private(set) var signals: DailySignals?
  /// Lần nhận thưởng chào mừng vừa thành công (số xu) — màn báo một lần.
  public private(set) var welcomeGranted: Int?
  /// Sổ xu lần này đọc hỏng, đang hiện số của lần trước (KOA-T17) — màn nói ra + thử lại.
  public private(set) var walletStale = false
  @ObservationIgnored private var loadGeneration = 0
  @ObservationIgnored private var frozenDays: [LocalDate] = []

  @ObservationIgnored private let source: any MascotSource
  @ObservationIgnored private let economy: any MascotEconomy
  @ObservationIgnored private let stepsGoalSource: @Sendable () -> Int
  /// Chốt của thưởng chào mừng: đặt TRƯỚC khi gọi, gỡ khi bị từ chối (RN).
  @ObservationIgnored private var welcomeTried = false
  @ObservationIgnored private var closed = false
  /// Bộ quan sát nhiệm vụ của tài khoản, dùng chung với cấp app (#527
  /// A-NEXT-7): lượt đọc của phòng đi vào CÙNG một mốc, nên một bước chuyển
  /// đã thấy ở Hôm nay không được ghi lại khi mở phòng.
  @ObservationIgnored private let questObserver: QuestObserver?

  public init(
    userId: String, today: LocalDate, source: any MascotSource, economy: any MascotEconomy,
    stepsGoal: @escaping @Sendable () -> Int = { DailySignals.defaultStepsGoal },
    questObserver: QuestObserver? = nil, gate: ClaimGate? = nil
  ) {
    self.questObserver = questObserver
    self.gate = gate
    self.stepsGoalSource = stepsGoal
    self.userId = userId
    self.today = today
    self.source = source
    self.economy = economy
  }

  /// Cổng nhận thưởng chung của tài khoản (KOA-T55). `nil` = chỉ dựa vào sổ xu của phòng (test cũ).
  @ObservationIgnored private let gate: ClaimGate?

  /// Phiên kết thúc: mọi kết quả về sau bị bỏ.
  public func close() { closed = true }

  // MARK: - Đọc

  /// Đọc tất cả, song song. Sổ xu là bắt buộc; phần khác lỗi thì phần đó ẩn.
  public func load() async {
    // Lượt tải chồng nhau: chỉ lượt bắt đầu sau cùng được áp (KOA-T17).
    loadGeneration += 1
    let mine = loadGeneration
    let uid = userId, day = today, src = source
    let token = questObserver?.begin()
    let weekStart = day.weekStart
    async let ledger = capture { try await src.ledger(userId: uid) }
    async let dates = capture { try await src.loggedDates(userId: uid, limit: Streak.window) }
    async let freezes = capture { try await src.freezes(userId: uid) }
    async let weekly = capture { try await src.weeklyChallenges(userId: uid, weekStart: weekStart) }
    async let awards = capture { try await src.awardCount(userId: uid) }
    async let daily = capture { try await src.dailySignals(userId: uid, date: day) }
    let (l, d, f, w, a, s) = await (ledger, dates, freezes, weekly, awards, daily)
    guard !closed, mine == loadGeneration else { return }

    switch l {
    case .success(let rows):
      wallet = MascotWallet(rows: rows)
      walletStale = false
    case .failure(let e):
      if wallet == nil {
        phase = .failed(TodayController.failure([e]) ?? .unavailable)
      } else {
        // Đã có số cũ: giữ, nhưng NÓI là số cũ (KOA-T17 — trước đây im lặng như mới).
        walletStale = true
      }
    }
    // Băng đọc lỗi: giữ số đã biết (KOA-T17 — trước đây về 0, như thể mất hết băng).
    if let frozenRows = try? f.get() {
      let used = frozenRows.compactMap(\.usedOn)
      freezesHeld = frozenRows.count - used.count
      freezesUsed = used.count
      frozenDays = used
    }
    let used = frozenDays
    if let logged = try? d.get() {
      // `streakFrom` — cùng một bản port với widget (#66).
      streak = Streak.from(logged.map(\.description), today: day.description, frozen: used.map(\.description))
    }
    if let rows = try? w.get() { challenges = rows }
    if let n = try? a.get() { awardCount = n }
    if let sig = try? s.get() {
      signals = sig
      // Một lượt `useDailyQuests` đã `ready`.
      // Sổ xu chưa đọc được thì `nil`: bộ quan sát không nhận gì lượt này (KOA-T16).
      if let token { questObserver?.observe(token: token, day: day, signals: sig, claimed: wallet?.claimed) }
    }
    if wallet != nil { phase = .ready }
    await grantWelcomeIfNeeded()
    // Không còn 15 xu chuỗi mỗi ngày (Koa Ecosystem V2, 02/11): xu đến từ nhiệm vụ và Tuần của Koa.
  }

  /// Đọc lại sổ xu — sau khi bộ quan sát tự nhận một nhiệm vụ ở nơi khác.
  public func refreshWallet() async { await reloadLedger() }

  /// Chỉ đọc lại sổ (sau một lần nhận).
  private func reloadLedger() async {
    let uid = userId, src = source
    guard let rows = try? await src.ledger(userId: uid), !closed else { return }
    wallet = MascotWallet(rows: rows)
  }

  // MARK: - Hiện

  public var balance: Int { wallet?.balance ?? 0 }
  public var xp: Int { wallet?.xp ?? 0 }
  public var level: Int { MascotRules.level(xp: xp) }
  /// XP đã có trong cấp hiện tại.
  public var intoLevel: Int { xp % MascotRules.levelXp }
  /// Gains — vóc dáng / hạng của Koa chỉ từ tập (#527 đợt 1). Hôm nay nạp vào
  /// (`KoaGainsSync`); phòng linh vật của người khác giữ `.zero`.
  public var gains: KoaGains.State = .zero
  /// Hạng theo GAINS (không còn theo cấp — Kiệt 20/10: "vóc dáng theo Gains").
  public var rank: MascotRules.Rank { MascotRules.ranks[min(gains.rank, MascotRules.ranks.count - 1)] }
  public var nextRank: MascotRules.Rank? {
    gains.rank + 1 < MascotRules.ranks.count ? MascotRules.ranks[gains.rank + 1] : nil
  }

  public func isClaimed(_ refKey: String) -> Bool {
    (wallet?.claimed.contains(refKey) ?? false) || gate?.isClaimed(refKey) == true
  }

  /// Hôm nay không có buổi trong lịch (ngày nghỉ / chưa lên lịch) — Hôm nay đặt.
  public var restDay = false
  /// Loại ngày cho nhiệm vụ (`QuestDay`, 03/11); Hôm nay đặt.
  public var questDay: QuestDay = .unscheduled

  /// Nhiệm vụ đang tính cho tài khoản này: bỏ `steps` khi chưa từng có số bước;
  /// nhiệm vụ hồi phục chỉ ở ngày nghỉ (và cần số bước).
  public var activeQuests: [MascotRules.QuestDef] {
    MascotRules.dailyQuests.filter {
      MascotRules.counts($0.key, day: questDay, stepsEverRecorded: signals?.stepsEverRecorded != false)
    }
  }

  public func questDone(_ q: MascotRules.Quest) -> Bool { signals?.done(q, stepsGoal: stepsGoal) ?? false }

  /// Mục tiêu bước hiện tại của tài khoản (`useStepsGoal`) — đọc mỗi lần, vì
  /// màn Vận động có thể vừa đổi nó.
  public var stepsGoal: Int { stepsGoalSource() }

  public var energyCount: Int { MascotRules.energySignals.filter(questDone).count }
  public var energyHeadline: MascotRules.EnergyHeadline { MascotRules.energyHeadline(energyCount) }

  public var completedChallenges: [WeeklyChallenge] { (challenges ?? []).filter(\.completed) }

  // MARK: - Hành động

  // Xu thưởng chuỗi đã bỏ (02/11, Koa Ecosystem V2); API nhận thưởng chuỗi và đường nhận tay của phòng gỡ hẳn
  // ở KOA-T56 (Kiệt 21/11) — xu của phòng chỉ còn túi chào mừng; nhiệm vụ / tuần nhận ở chỗ khác.

  /// Túi chào mừng 300 xu (`welcome`, server định giá, idempotent theo khoá).
  private func grantWelcomeIfNeeded() async {
    guard let wallet, !wallet.claimed.contains("welcome"), !welcomeTried else { return }
    welcomeTried = true
    do {
      let amount = try await economy.claimReward(refKey: "welcome", reason: "welcome bonus")
      gate?.markClaimed("welcome")
      guard !closed else { return }
      // Túi chào mừng đã nhận ở máy khác: không hiện lại "+300" (KOA-T01).
      if !MascotRules.isDuplicateClaim(amount) { welcomeGranted = amount }
      await reloadLedger()
    } catch {
      // KOA-T51: chỉ lỗi tạm (mất mạng, server tạm hỏng) mới thử lại ở lần mở sau — bị từ chối hẳn thì thôi,
      // không gõ cửa mãi. Khoá là duy nhất mỗi tài khoản, server trả 0 nếu đã nhận (KOA-T01).
      let failure = (error as? MascotFailure) ?? (NetworkFailure.isOffline(error) ? .offline : .server(code: nil))
      if QuestRetry.shouldRetry(failure) { welcomeTried = false }
    }
  }

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
