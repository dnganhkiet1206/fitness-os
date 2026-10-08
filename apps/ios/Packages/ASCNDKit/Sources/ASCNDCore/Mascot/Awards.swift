public import Foundation
public import Observation

/// Huy chương (#527) — `lib/award-grant.ts` + `readAwardSources` /
/// `useCheckAwards` (`hooks/use-extras.ts`) + các biểu thức của `app/awards.tsx`
/// @ fac9ac2.
///
/// Một huy chương là LỊCH SỬ: `awards` có `UNIQUE (user_id, award_key)` và không
/// có quyền sửa, nên hàng ghi ở đây ở lại mãi. Vì thế:
/// - nguồn đọc hỏng là `nil` ("không biết"), KHÔNG BAO GIỜ là 0 — `nil` không
///   bao giờ được so với ngưỡng;
/// - trao từng cái một: một cái hỏng không kéo các cái khác theo;
/// - "đã có rồi" nhận ra bằng SQLSTATE `23505`, không bằng chữ tiếng Anh của
///   thông điệp Postgres.
public enum Awards {
  public enum Tier: String, Sendable, Hashable, CaseIterable { case bronze, silver, gold, platinum }

  /// Một dòng của `AWARD_DEFINITIONS` — cấu trúc và ngưỡng; chữ ở `award-text.json`.
  public struct Def: Sendable, Hashable, Identifiable {
    public let key: String
    public let type: String
    public let icon: String
    public let tier: Tier
    /// `nil` ở huy chương không có ngưỡng (`first_workout`, `first_pr`, `steps_10k`).
    public let requirement: Int?
    public var id: String { key }
  }

  /// `AWARD_DEFINITIONS`, đúng thứ tự (thứ tự trao và thứ tự vẽ).
  public static let catalogue: [Def] = [
    Def(key: "streak_3", type: "streak", icon: "flame", tier: .bronze, requirement: 3),
    Def(key: "streak_7", type: "streak", icon: "calendar-days", tier: .silver, requirement: 7),
    Def(key: "streak_14", type: "streak", icon: "calendar-check", tier: .gold, requirement: 14),
    Def(key: "streak_30", type: "streak", icon: "calendar-range", tier: .platinum, requirement: 30),
    Def(key: "streak_60", type: "streak", icon: "sunrise", tier: .platinum, requirement: 60),
    Def(key: "streak_100", type: "streak", icon: "medal", tier: .platinum, requirement: 100),
    Def(key: "streak_180", type: "streak", icon: "gem", tier: .platinum, requirement: 180),
    Def(key: "streak_365", type: "streak", icon: "crown", tier: .platinum, requirement: 365),
    Def(key: "first_workout", type: "first_workout", icon: "dumbbell", tier: .bronze, requirement: nil),
    Def(key: "workouts_10", type: "volume_milestone", icon: "activity", tier: .silver, requirement: 10),
    Def(key: "workouts_50", type: "volume_milestone", icon: "zap", tier: .gold, requirement: 50),
    Def(key: "workouts_100", type: "volume_milestone", icon: "shield", tier: .platinum, requirement: 100),
    Def(key: "first_pr", type: "pr", icon: "trending-up", tier: .silver, requirement: nil),
    Def(key: "pr_5", type: "pr", icon: "trophy", tier: .gold, requirement: 5),
    Def(key: "steps_10k", type: "steps_goal", icon: "footprints", tier: .bronze, requirement: nil),
    Def(key: "steps_15k", type: "steps_goal", icon: "route", tier: .silver, requirement: 15000),
    Def(key: "steps_20k", type: "steps_goal", icon: "mountain", tier: .gold, requirement: 20000),
    Def(key: "first_meal", type: "nutrition", icon: "utensils", tier: .bronze, requirement: 1),
    Def(key: "meals_50", type: "nutrition", icon: "salad", tier: .silver, requirement: 50),
    Def(key: "meals_250", type: "nutrition", icon: "chef-hat", tier: .gold, requirement: 250),
    Def(key: "water_7", type: "water", icon: "droplet", tier: .bronze, requirement: 7),
    Def(key: "water_30", type: "water", icon: "droplets", tier: .silver, requirement: 30),
    Def(key: "water_100", type: "water", icon: "glass-water", tier: .gold, requirement: 100),
    Def(key: "sleep_7", type: "sleep", icon: "moon", tier: .bronze, requirement: 7),
    Def(key: "sleep_30", type: "sleep", icon: "moon-star", tier: .silver, requirement: 30),
    Def(key: "sleep_100", type: "sleep", icon: "bed-double", tier: .gold, requirement: 100),
    Def(key: "weigh_10", type: "body", icon: "scale", tier: .bronze, requirement: 10),
    Def(key: "weigh_50", type: "body", icon: "chart-line", tier: .silver, requirement: 50),
    Def(key: "weigh_200", type: "body", icon: "target", tier: .gold, requirement: 200),
  ]

  public static func def(_ key: String) -> Def? { catalogue.first { $0.key == key } }

  /// `AwardSources`: `nil` = đọc không được, KHÔNG phải 0.
  public struct Sources: Sendable, Hashable {
    public var streak: Double?
    public var workoutCount: Double?
    public var prCount: Double?
    /// Bước hôm nay.
    public var steps: Double?
    public var mealCount: Double?
    /// Số NGÀY có ít nhất một lần ghi nước — không phải số lần ghi.
    public var waterDays: Double?
    public var sleepCount: Double?
    public var weighCount: Double?

    public init(
      streak: Double? = nil, workoutCount: Double? = nil, prCount: Double? = nil, steps: Double? = nil,
      mealCount: Double? = nil, waterDays: Double? = nil, sleepCount: Double? = nil, weighCount: Double? = nil
    ) {
      self.streak = streak
      self.workoutCount = workoutCount
      self.prCount = prCount
      self.steps = steps
      self.mealCount = mealCount
      self.waterDays = waterDays
      self.sleepCount = sleepCount
      self.weighCount = weighCount
    }
  }

  /// `usable`: một số so được với ngưỡng.
  static func usable(_ n: Double?) -> Double? {
    guard let n, n.isFinite else { return nil }
    return n
  }

  /// `awardsToGrant`: mọi huy chương đã đạt mà chưa có, theo thứ tự danh mục,
  /// không trùng. Thuần: cùng nguồn + cùng tập đã có → cùng danh sách.
  public static func toGrant(_ s: Sources, earned: Set<String>) -> [Def] {
    var out: [Def] = []
    func add(_ key: String) {
      if earned.contains(key) { return }
      if let d = def(key), !out.contains(d) { out.append(d) }
    }
    if let streak = usable(s.streak) {
      for d in catalogue where d.type == "streak" {
        if let r = d.requirement, streak >= Double(r) { add(d.key) }
      }
    }
    if let n = usable(s.workoutCount) {
      if n >= 1 { add("first_workout") }
      for key in ["workouts_10", "workouts_50", "workouts_100"] {
        if let r = def(key)?.requirement, n >= Double(r) { add(key) }
      }
    }
    if let n = usable(s.prCount) {
      if n >= 1 { add("first_pr") }
      if n >= 5 { add("pr_5") }
    }
    if let n = usable(s.steps) {
      if n >= 10000 { add("steps_10k") }
      if n >= 15000 { add("steps_15k") }
      if n >= 20000 { add("steps_20k") }
    }
    let byCount: [(String, Double?)] = [
      ("nutrition", s.mealCount), ("water", s.waterDays), ("sleep", s.sleepCount), ("body", s.weighCount),
    ]
    for (type, value) in byCount {
      guard let n = usable(value) else { continue }
      for d in catalogue where d.type == type {
        if let r = d.requirement, n >= Double(r) { add(d.key) }
      }
    }
    return out
  }

  /// `isDuplicateAward`: SQLSTATE `23505` — cùng giá trị ở mọi ngôn ngữ server.
  public static func isDuplicate(code: String?) -> Bool { code == "23505" }

  /// `grantAll`: trao từng cái; cái hỏng ghi vào `failed`, các cái khác đi tiếp.
  public static func grantAll(
    _ defs: [Def], _ grantOne: @Sendable (Def) async throws -> Void
  ) async -> (granted: [String], failed: [String]) {
    var granted: [String] = []
    var failed: [String] = []
    for d in defs {
      do {
        try await grantOne(d)
        granted.append(d.key)
      } catch {
        failed.append(d.key)
      }
    }
    return (granted, failed)
  }

  /// `metadataFor`: điều huy chương ghi lại về khoảnh khắc nó được trao.
  public static func metadata(_ d: Def, _ s: Sources) -> [String: JSONValue] {
    func v(_ n: Double?) -> JSONValue { n.map(JSONValue.number) ?? .null }
    if d.type == "streak" { return ["streak": v(s.streak)] }
    if d.key == "steps_10k" { return ["steps": v(s.steps)] }
    if d.type == "volume_milestone" { return ["count": v(s.workoutCount)] }
    if d.key == "pr_5" { return ["count": v(s.prCount)] }
    return [:]
  }

  // MARK: - Màn huy chương

  /// `DOMAINS`: các nhóm trên màn — một nhóm nhận DANH SÁCH type
  /// (`first_workout` gộp vào Buổi tập).
  public enum Domain: String, Sendable, Hashable, CaseIterable {
    case streak, workouts, pr, steps, nutrition, water, sleep, body

    public var types: [String] {
      switch self {
      case .streak: ["streak"]
      case .workouts: ["first_workout", "volume_milestone"]
      case .pr: ["pr"]
      case .steps: ["steps_goal"]
      case .nutrition: ["nutrition"]
      case .water: ["water"]
      case .sleep: ["sleep"]
      case .body: ["body"]
      }
    }

    public var awards: [Def] { Awards.catalogue.filter { types.contains($0.type) } }
  }

  /// `currentFor`: con số hiện tại của một type; mọi type trong một nhóm đọc cùng nguồn.
  public static func current(_ type: String, _ s: Sources?) -> Double? {
    guard let s else { return nil }
    switch type {
    case "streak": return s.streak
    case "volume_milestone", "first_workout": return s.workoutCount
    case "pr": return s.prCount
    case "steps_goal": return s.steps
    case "nutrition": return s.mealCount
    case "water": return s.waterDays
    case "sleep": return s.sleepCount
    case "body": return s.weighCount
    default: return nil
    }
  }

  /// Phần đã đi của một huy chương chưa mở — chỉ khi biết CẢ HAI đầu; một
  /// truy vấn hỏng không bao giờ vẽ thành 0%. `nil` = không vẽ thanh.
  public static func progress(_ d: Def, earned: Bool, current: Double?) -> Double? {
    guard !earned, let need = d.requirement, let current else { return nil }
    return Swift.max(0, Swift.min(1, current / Double(need)))
  }

  /// `Math.round(earned / total * 100)`.
  public static func percent(earned: Int, total: Int = catalogue.count) -> Int {
    total > 0 ? Int(JS.round(Double(earned) / Double(total) * 100)) : 0
  }

  /// Mốc trên mặt đĩa: 10 000 → "10K".
  public static func mark(_ requirement: Int?) -> String? {
    guard let r = requirement else { return nil }
    return r >= 1000 ? "\(Int(JS.round(Double(r) / 1000)))K" : String(r)
  }

  // MARK: - Đọc nguồn

  /// Nguồn thô, mỗi phần `nil` khi đọc hỏng.
  public struct Raw: Sendable {
    public var loggedDates: [LocalDate]?
    /// Lỗi đọc băng → coi như không có (bảng đến bằng migration).
    public var frozen: [LocalDate]
    public var workoutCount: Int?
    public var prCount: Int?
    public var steps: Double?
    public var mealCount: Int?
    public var waterDates: [String]?
    public var sleepCount: Int?
    public var weighCount: Int?

    public init(
      loggedDates: [LocalDate]?, frozen: [LocalDate], workoutCount: Int?, prCount: Int?, steps: Double?,
      mealCount: Int?, waterDates: [String]?, sleepCount: Int?, weighCount: Int?
    ) {
      self.loggedDates = loggedDates
      self.frozen = frozen
      self.workoutCount = workoutCount
      self.prCount = prCount
      self.steps = steps
      self.mealCount = mealCount
      self.waterDates = waterDates
      self.sleepCount = sleepCount
      self.weighCount = weighCount
    }
  }

  /// `readAwardSources` sau khi đọc: chuỗi = `streakFrom` có cả băng; nước = số
  /// ngày khác nhau; bước hôm nay vắng hàng → `nil`.
  public static func sources(_ r: Raw, today: LocalDate) -> Sources {
    Sources(
      streak: r.loggedDates.map {
        Double(Streak.from($0.map(\.description), today: today.description, frozen: r.frozen.map(\.description)).count)
      },
      workoutCount: r.workoutCount.map(Double.init), prCount: r.prCount.map(Double.init),
      steps: r.steps, mealCount: r.mealCount.map(Double.init),
      waterDays: r.waterDates.map { Double(Set($0.filter { !$0.isEmpty }).count) },
      sleepCount: r.sleepCount.map(Double.init), weighCount: r.weighCount.map(Double.init))
  }
}

/// Một huy chương đã có.
public struct EarnedAward: Sendable, Hashable {
  public let key: String
  public let earnedAt: EpochMillis?
  /// Chữ lưu lúc trao — chỉ dùng khi khoá không có trong `award-text.json`.
  public let title: String?
  public let description: String?

  public init(key: String, earnedAt: EpochMillis?, title: String? = nil, description: String? = nil) {
    self.key = key
    self.earnedAt = earnedAt
    self.title = title
    self.description = description
  }
}

/// Lỗi ghi một huy chương, mang mã PostgREST.
public struct AwardGrantError: Error, Sendable, Hashable {
  public let code: String?
  public init(code: String?) { self.code = code }
}

/// Đọc / ghi cho màn huy chương — mọi lời gọi mang `userId` của phiên.
public protocol AwardsSource: Sendable {
  /// `useAwards`: mới → cũ.
  func earned(userId: String) async throws -> [EarnedAward]
  /// Chín nguồn của `readAwardSources`, mỗi phần `nil` khi hỏng — không ném.
  func raw(userId: String, today: LocalDate) async -> Awards.Raw
  /// `awards.insert(…)`.
  func grant(userId: String, award: Awards.Def, title: String, description: String, metadata: [String: JSONValue])
    async throws(AwardGrantError)
}

/// Sổ huy chương của một tài khoản: đọc, xét, trao một lần mỗi lần mở màn.
@MainActor
@Observable
public final class AwardsBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed(TodayController.RefreshFailure)
    case ready
  }

  public let userId: String
  public private(set) var phase: Phase = .loading
  /// Khoá → huy chương đã có.
  public private(set) var earned: [String: EarnedAward] = [:]
  /// `nil` khi chưa đọc xong; từng trường `nil` khi nguồn ấy hỏng.
  public private(set) var sources: Awards.Sources?
  /// Những cái vừa trao ở lượt này (để màn báo).
  public private(set) var newlyGranted: [String] = []

  @ObservationIgnored private let source: any AwardsSource
  @ObservationIgnored private let today: @MainActor () -> LocalDate
  /// Tên / mô tả tiếng Anh ghi vào hàng (giá trị lịch sử; màn vẽ theo khoá).
  @ObservationIgnored private let englishText: @Sendable (String) -> (title: String, description: String)
  @ObservationIgnored private var checked = false
  @ObservationIgnored private var closed = false

  public init(
    userId: String, source: any AwardsSource, today: @escaping @MainActor () -> LocalDate,
    englishText: @escaping @Sendable (String) -> (title: String, description: String)
  ) {
    self.userId = userId
    self.source = source
    self.today = today
    self.englishText = englishText
  }

  public func close() { closed = true }

  public var earnedCount: Int { earned.count }

  /// Đọc huy chương + tiến độ; lần đầu đọc được thì xét và trao (`checkAndGrant`).
  public func load() async {
    let uid = userId, src = source, day = today()
    async let earnedRead = capture { try await src.earned(userId: uid) }
    async let rawRead = src.raw(userId: uid, today: day)
    let (e, r) = await (earnedRead, rawRead)
    guard !closed else { return }
    let s = Awards.sources(r, today: day)
    sources = s
    switch e {
    case .success(let rows):
      earned = Dictionary(rows.map { ($0.key, $0) }, uniquingKeysWith: { first, _ in first })
      phase = .ready
    case .failure:
      // Không đọc được cái đã có → không xét (xét trên tập rỗng sẽ trao lại mọi thứ).
      if phase != .ready { phase = .failed(.unavailable) }
      return
    }
    if !checked {
      checked = true
      await grant(s)
    }
  }

  private func grant(_ s: Awards.Sources) async {
    let uid = userId, src = source, text = englishText
    let outcome = await Awards.grantAll(Awards.toGrant(s, earned: Set(earned.keys))) { d in
      let t = text(d.key)
      do throws(AwardGrantError) {
        try await src.grant(
          userId: uid, award: d, title: t.title, description: t.description, metadata: Awards.metadata(d, s))
      } catch {
        // Đã có rồi (máy khác, lượt trước) → không phải lỗi, nhưng cũng không phải "vừa trao".
        if Awards.isDuplicate(code: error.code) { throw AwardAlreadyHeld() }
        throw error
      }
    }
    guard !closed else { return }
    newlyGranted = outcome.granted
    if !outcome.failed.isEmpty || !outcome.granted.isEmpty {
      if let rows = try? await src.earned(userId: uid), !closed {
        earned = Dictionary(rows.map { ($0.key, $0) }, uniquingKeysWith: { first, _ in first })
      }
    }
  }
}

/// Đã có rồi — RN coi là xong (không ném); ở đây tách ra để chỉ báo cái THẬT
/// vừa trao, còn danh sách vẫn được đọc lại như RN.
private struct AwardAlreadyHeld: Error {}
