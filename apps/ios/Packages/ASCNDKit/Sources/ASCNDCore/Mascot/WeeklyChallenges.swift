public import Foundation
public import Observation

/// Thử thách tuần (#527) — `app/challenges.tsx` + `useWeeklyChallenges` /
/// `useInitWeeklyChallenges` / `useUpdateChallengeProgress` (`hooks/use-extras.ts`)
/// + `lib/challenge-progress.ts` @ fac9ac2.
///
/// Mở màn: tuần chưa có thử thách thì gieo ba cái (xoay vòng theo ngày đầu
/// tuần, như web); rồi đo lại tiến độ từ nhật ký của tuần, trả thưởng ĐÚNG MỘT
/// LẦN khi một thử thách vừa xong (server định giá theo `ref_key`), rồi mới ghi
/// hàng. Mọi đọc / ghi qua `RowStore` của B; thưởng qua `MascotEconomy`.
public enum WeeklyChallenges {
  /// Một dòng của `CHALLENGE_POOL`.
  public struct PoolItem: Sendable, Hashable {
    public let key: String
    public let icon: String
    public let target: Int
    public let tier: String
  }

  /// `CHALLENGE_POOL`, đúng thứ tự (thứ tự quyết định xoay vòng).
  public static let pool: [PoolItem] = [
    PoolItem(key: "workouts_5", icon: "dumbbell", target: 5, tier: "silver"),
    PoolItem(key: "workouts_3", icon: "dumbbell", target: 3, tier: "bronze"),
    PoolItem(key: "protein_7", icon: "beef", target: 7, tier: "gold"),
    PoolItem(key: "steps_50k", icon: "footprints", target: 50000, tier: "silver"),
    PoolItem(key: "sleep_7", icon: "moon", target: 7, tier: "silver"),
    PoolItem(key: "log_7", icon: "target", target: 7, tier: "gold"),
    PoolItem(key: "calories_5", icon: "target", target: 5, tier: "silver"),
    PoolItem(key: "water_7", icon: "droplets", target: 7, tier: "silver"),
  ]

  /// `pickChallengesForWeek`: `parseInt("YYYYMMDD") % 8`, ba cái liền nhau.
  public static func pick(weekStart: LocalDate) -> [PoolItem] {
    let seed = Int(weekStart.description.replacingOccurrences(of: "-", with: "")) ?? 0
    let n = seed % pool.count
    return (0..<3).map { pool[(n + $0) % pool.count] }
  }

  /// Thứ Hai của tuần chứa `date` (`weekStartOf`).
  public static func weekStart(_ date: LocalDate) -> LocalDate {
    date.adding(days: -WorkoutPlanning.routineIndex(date))
  }

  // MARK: - Một lượt đo (`challengeStep`)

  public struct Step: Sendable, Hashable {
    /// Điều sẽ lưu — không bao giờ quá đích, không âm.
    public let value: Int
    public let completed: Bool
    /// Đúng một lượt: lần đầu tiên thử thách này xong. Chỉ nó được trả thưởng.
    public let justCompleted: Bool
    /// Không gì đổi — không ghi.
    public let unchanged: Bool
  }

  public static func step(
    currentValue: Double, targetValue: Double, completed was: Bool, completedAt: String?, newValue: Double
  ) -> Step {
    let target = targetValue.isFinite ? targetValue : 0
    let measured = newValue.isFinite ? newValue : 0
    let value = Swift.max(0, Swift.min(measured, target))
    let completed = measured >= target
    let ever = !(completedAt ?? "").isEmpty
    return Step(
      value: Int(value), completed: completed, justCompleted: completed && !was && !ever,
      unchanged: value == currentValue && completed == was)
  }

  // MARK: - Đo

  /// Ngưỡng theo CHÍNH hồ sơ người này (`sleep_target_hours`, `water_target_ml`,
  /// `macro_protein_g`), mặc định như mọi màn khác khi trống.
  public struct Targets: Sendable, Hashable {
    public var sleepMinutes: Double
    public var waterMl: Double
    public var proteinG: Double

    public init(sleepMinutes: Double = 480, waterMl: Double = 2500, proteinG: Double = 149) {
      self.sleepMinutes = sleepMinutes
      self.waterMl = waterMl
      self.proteinG = proteinG
    }

    /// `Math.round((Number(h) || 8) * 60)`, `Number(ml) || 2500`,
    /// `macroTargetsFor({ macro_protein_g }).protein` (calo mặc định 2200).
    public init(profile: JSONValue?) {
      func truthy(_ v: JSONValue?) -> Double? {
        let n = JS.number(v)
        return JS.truthy(n) ? n : nil
      }
      sleepMinutes = JS.round((truthy(profile?["sleep_target_hours"]) ?? 8) * 60)
      waterMl = truthy(profile?["water_target_ml"]) ?? 2500
      proteinG = MacroTargets.proteinTarget(profile?["macro_protein_g"])
    }
  }

  /// Những gì một lượt đo cần đọc cho tuần [`weekStart`, `weekStart + 7`).
  public struct Reads: Sendable {
    public let workouts: RowQuery
    public let loggedDays: RowQuery
    public let dailyLogs: RowQuery
    public let water: RowQuery
    public let profile: RowQuery
  }

  public static func reads(userId: String, weekStart: LocalDate, in tz: TimeZone) -> Reads {
    let me = RowQuery.Filter.eq("user_id", .string(userId))
    let end = weekStart.adding(days: 7)
    let days: [RowQuery.Filter] = [.gte("date", .string(weekStart.description)), .lt("date", .string(end.description))]
    return Reads(
      workouts: RowQuery(
        table: "workout_sessions", columns: "id",
        filters: [
          me, .gte("date_time", .string(DailyLog.dayRange(weekStart, in: tz).start)),
          .lt("date_time", .string(DailyLog.dayRange(end, in: tz).start)),
        ]),
      loggedDays: RowQuery(
        table: "daily_logs", columns: "date", filters: [me, .or(Streak.loggedDayFilter)] + days),
      dailyLogs: RowQuery(
        table: "daily_logs", columns: "date, steps, sleep_duration_min, protein_g, kcal", filters: [me] + days),
      water: RowQuery(table: "water_logs", columns: "date, amount_ml", filters: [me] + days),
      profile: RowQuery(
        table: "profiles", columns: "sleep_target_hours, water_target_ml, macro_protein_g", filters: [me],
        mode: .maybeSingle))
  }

  /// Nguồn đo một thử thách cần.
  public enum Source: Sendable, Hashable { case workouts, loggedDays, dailyLogs, water, nothing }

  public static func source(_ key: String) -> Source {
    if key.hasPrefix("workouts_") { return .workouts }
    switch key {
    case "log_7": return .loggedDays
    case "steps_50k", "sleep_7", "protein_7", "calories_5": return .dailyLogs
    case "water_7": return .water
    default: return .nothing
    }
  }

  /// Giá trị đo được của `key` từ các hàng của nguồn của nó.
  public static func measure(_ key: String, rows: [JSONValue], targets: Targets) -> Double {
    func n(_ v: JSONValue?) -> Double { JS.number(v).isNaN ? 0 : JS.number(v) }
    if key.hasPrefix("workouts_") { return Double(rows.count) }
    switch key {
    case "log_7":
      return Double(rows.count)
    case "steps_50k":
      return rows.reduce(0) { $0 + n($1["steps"]) }
    case "sleep_7":
      return Double(rows.filter { n($0["sleep_duration_min"]) >= targets.sleepMinutes }.count)
    case "protein_7":
      return Double(rows.filter { n($0["protein_g"]) >= targets.proteinG }.count)
    case "calories_5":
      return Double(rows.filter { n($0["kcal"]) > 500 }.count)
    case "water_7":
      var byDate: [String: Double] = [:]
      for r in rows {
        guard let d = r["date"]?.stringValue else { continue }
        byDate[d, default: 0] += n(r["amount_ml"])
      }
      return Double(byDate.values.filter { $0 >= targets.waterMl }.count)
    default:
      return 0
    }
  }

  // MARK: - Hàng

  /// Một hàng `weekly_challenges`.
  public struct Row: Sendable, Hashable, Identifiable {
    public let id: String
    public let key: String
    public let title: String
    public let description: String?
    public let icon: String?
    public let currentValue: Double
    public let targetValue: Double
    public let completed: Bool
    public let completedAt: String?
    public let rewardTier: String?
    public let rewardTitle: String?

    public init?(row: JSONValue) {
      guard let key = row["challenge_key"]?.stringValue,
        let id = row["id"]?.stringValue ?? row["id"]?.doubleValue.map({ String(Int($0)) })
      else { return nil }
      self.id = id
      self.key = key
      title = row["title"]?.stringValue ?? key
      description = row["description"]?.stringValue
      icon = row["icon"]?.stringValue
      currentValue = JS.number(row["current_value"]).isNaN ? 0 : JS.number(row["current_value"])
      targetValue = JS.number(row["target_value"]).isNaN ? 0 : JS.number(row["target_value"])
      completed = row["completed"] == .bool(true)
      completedAt = row["completed_at"]?.stringValue
      rewardTier = row["reward_tier"]?.stringValue
      rewardTitle = row["reward_title"]?.stringValue
    }

    /// Thanh của màn: `Number(target) || 1`, hiện tại kẹp ở đích, phần trăm làm tròn.
    public var display: (current: Int, target: Int, percent: Int) {
      let target = JS.truthy(targetValue) ? targetValue : 1
      let current = Swift.min(currentValue, target)
      return (Int(current), Int(target), Int(JS.round(current / target * 100)))
    }
  }

  public static let columns =
    "id, challenge_key, title, description, icon, current_value, target_value, completed, completed_at, reward_tier, reward_title"

  public static func query(userId: String, weekStart: LocalDate) -> RowQuery {
    RowQuery(
      table: "weekly_challenges", columns: columns,
      filters: [.eq("user_id", .string(userId)), .eq("week_start", .string(weekStart.description))],
      order: RowQuery.Order(column: "created_at", ascending: true))
  }

  /// Hàng gieo cho tuần — chữ tiếng Anh là giá trị lịch sử, màn vẽ theo khoá.
  public static func seedRow(
    _ item: PoolItem, userId: String, weekStart: LocalDate, english: (String) -> (title: String, desc: String, reward: String)
  ) -> [String: JSONValue] {
    let t = english(item.key)
    return [
      "user_id": .string(userId), "week_start": .string(weekStart.description), "challenge_key": .string(item.key),
      "title": .string(t.title), "description": .string(t.desc), "icon": .string(item.icon),
      "target_value": .number(Double(item.target)), "current_value": .number(0), "reward_title": .string(t.reward),
      "reward_tier": .string(item.tier),
    ]
  }
}

extension MacroTargets {
  /// `macroTargetsFor({ macro_protein_g }).protein`: đạm đã đặt thì dùng; chưa
  /// thì `round(2200 × 0.27 / 4)` — calo mặc định vì lượt đo không đọc calo.
  public static func proteinTarget(_ stored: JSONValue?) -> Double {
    let v = JS.number(stored)
    let isSet: Bool = {
      switch stored {
      case nil, .null?: return false
      case .string(let s)?: return !s.isEmpty && v.isFinite && v >= 0
      default: return v.isFinite && v >= 0
      }
    }()
    return isSet ? v : JS.round(defaultKcal * 0.27 / 4)
  }
}

/// Sổ thử thách tuần của một tài khoản.
@MainActor
@Observable
public final class WeeklyChallengesBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed(TodayController.RefreshFailure)
    case ready([WeeklyChallenges.Row])
  }

  /// Lượt đo lại không xong — màn nói ra (con số trên màn có thể đã cũ).
  public enum ProgressFailure: Error, Sendable, Hashable {
    case seed
    case measure
    case reward(MascotFailure)
    case nothingWritten
  }

  public let userId: String
  public private(set) var weekStart: LocalDate
  public private(set) var phase: Phase = .loading
  public private(set) var refreshing = false
  public private(set) var progressFailure: ProgressFailure?
  /// Khoá của những thử thách VỪA xong ở lượt này (đã trả thưởng), theo thứ tự màn.
  public private(set) var justCompleted: [String] = []

  @ObservationIgnored private let store: any RowStore
  @ObservationIgnored private let economy: any MascotEconomy
  @ObservationIgnored private let timeZone: TimeZone
  @ObservationIgnored private let english: @Sendable (String) -> (title: String, desc: String, reward: String)
  @ObservationIgnored private var initialized = false
  @ObservationIgnored private var closed = false

  public init(
    userId: String, today: LocalDate, store: any RowStore, economy: any MascotEconomy,
    english: @escaping @Sendable (String) -> (title: String, desc: String, reward: String),
    timeZone: TimeZone = .current
  ) {
    self.userId = userId
    self.weekStart = WeeklyChallenges.weekStart(today)
    self.store = store
    self.economy = economy
    self.english = english
    self.timeZone = timeZone
  }

  public func close() { closed = true }

  /// Đọc; lần đầu: gieo nếu trống, rồi đo lại tiến độ, rồi đọc lại.
  public func load() async {
    guard let rows = await read() else { return }
    guard !initialized else { return }
    initialized = true
    if rows.count < 3 {
      guard await seed(existing: Set(rows.map(\.key))) else {
        progressFailure = .seed
        return
      }
    }
    await refreshProgress()
  }

  @discardableResult
  private func read() async -> [WeeklyChallenges.Row]? {
    do {
      let rows = try await store.select(WeeklyChallenges.query(userId: userId, weekStart: weekStart))
      guard !closed else { return nil }
      let parsed = rows.compactMap(WeeklyChallenges.Row.init(row:))
      phase = .ready(parsed)
      return parsed
    } catch {
      guard !closed else { return nil }
      if case .ready = phase { return nil }
      phase = .failed(.unavailable)
      return nil
    }
  }

  /// `useInitWeeklyChallenges`. Khác RN: gieo ĐÚNG những cái còn thiếu (một lần
  /// gieo đứt giữa chừng không để tuần kẹt ở 1/3); trùng (23505 — máy khác vừa
  /// gieo) không phải lỗi.
  private func seed(existing: Set<String>) async -> Bool {
    let wanted = WeeklyChallenges.pick(weekStart: weekStart).filter { !existing.contains($0.key) }
    guard !wanted.isEmpty else { return true }
    for item in wanted {
      do {
        try await store.insert(
          "weekly_challenges",
          WeeklyChallenges.seedRow(item, userId: userId, weekStart: weekStart, english: english))
      } catch {
        if error.code != "23505" { return false }
      }
    }
    return true
  }

  /// `useUpdateChallengeProgress`: mỗi thử thách chưa xong đo riêng; vừa xong
  /// thì TRẢ trước (bước lặp lại vô hại — `ref_key` cố định cả tuần) rồi mới
  /// ghi hàng; một cái hỏng không kéo cái khác; lỗi đầu tiên được báo.
  public func refreshProgress() async {
    guard !refreshing, !closed else { return }
    refreshing = true
    defer { refreshing = false }
    progressFailure = nil
    justCompleted = []

    let all: [WeeklyChallenges.Row]
    do {
      all = try await store.select(WeeklyChallenges.query(userId: userId, weekStart: weekStart))
        .compactMap(WeeklyChallenges.Row.init(row:))
    } catch {
      progressFailure = .measure
      return
    }
    let open = all.filter { !$0.completed }
    guard !open.isEmpty else { return }

    let reads = WeeklyChallenges.reads(userId: userId, weekStart: weekStart, in: timeZone)
    // Hồ sơ đọc hỏng không cho phép bịa ngưỡng → ngưỡng mặc định như mọi màn.
    let profile = (try? await store.select(reads.profile))?.first
    let targets = WeeklyChallenges.Targets(profile: profile)

    var cache: [WeeklyChallenges.Source: [JSONValue]] = [:]
    var firstFailure: ProgressFailure?
    for ch in open {
      guard !closed else { return }
      let src = WeeklyChallenges.source(ch.key)
      var rows: [JSONValue] = []
      if src != .nothing {
        if let hit = cache[src] {
          rows = hit
        } else {
          let q: RowQuery
          switch src {
          case .workouts: q = reads.workouts
          case .loggedDays: q = reads.loggedDays
          case .dailyLogs: q = reads.dailyLogs
          case .water: q = reads.water
          case .nothing: q = reads.dailyLogs
          }
          do {
            rows = try await store.select(q)
            cache[src] = rows
          } catch {
            // Khác RN (đọc hỏng = 0 rồi GHI 0): đọc hỏng thì không ghi gì.
            firstFailure = firstFailure ?? .measure
            continue
          }
        }
      }
      let value = WeeklyChallenges.measure(ch.key, rows: rows, targets: targets)
      let step = WeeklyChallenges.step(
        currentValue: ch.currentValue, targetValue: ch.targetValue, completed: ch.completed,
        completedAt: ch.completedAt, newValue: value)

      if step.justCompleted {
        let tier = ch.rewardTier ?? "bronze"
        do {
          _ = try await economy.claimReward(
            refKey: MascotRules.challengeRefKey(tier: tier, weekStart: weekStart.description, key: ch.key),
            reason: "challenge \(ch.key)")
        } catch let f as MascotFailure {
          if f != .server(code: "23505") {
            firstFailure = firstFailure ?? .reward(f)
            continue
          }
        } catch {
          firstFailure = firstFailure ?? .reward(.server(code: nil))
          continue
        }
      }

      if !step.unchanged {
        var patch: [String: JSONValue] = [
          "current_value": .number(Double(step.value)), "completed": .bool(step.completed),
        ]
        if step.completed && (ch.completedAt ?? "").isEmpty {
          patch["completed_at"] = .string(WorkoutSessionRecord.iso8601(EpochMillis(Date())))
        }
        do {
          let touched = try await store.update(
            "weekly_challenges", patch, where: [.eq("id", .string(ch.id)), .eq("user_id", .string(userId))])
          if touched == 0 {
            firstFailure = firstFailure ?? .nothingWritten
            continue
          }
        } catch {
          firstFailure = firstFailure ?? .measure
          continue
        }
      }
      if step.justCompleted && ch.rewardTitle != nil { justCompleted.append(ch.key) }
    }
    guard !closed else { return }
    progressFailure = firstFailure
    await read()
  }
}
