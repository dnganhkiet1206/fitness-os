public import ASCNDCore
import Foundation
import Supabase

/// Đọc cho phòng linh vật (#527 Phase 7) — cùng truy vấn với RN
/// (`use-mascot-room.ts`, `use-daily-quests.ts`, `use-extras.ts`), mọi truy vấn
/// lọc `user_id` của phiên (RLS cũng chỉ cho đọc hàng của mình).
public struct SupabaseMascotSource: MascotSource {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  struct LedgerDTO: Decodable, Sendable {
    let amount: Int
    let ref_key: String?
  }

  /// `useMascotWallet`: `mascot_transactions.select('amount, ref_key')`.
  public func ledger(userId: String) async throws -> [LedgerRow] {
    let rows: [LedgerDTO] = try await client.from("mascot_transactions")
      .select("amount, ref_key")
      .eq("user_id", value: userId)
      .execute().value
    return rows.map { LedgerRow(amount: $0.amount, refKey: $0.ref_key) }
  }

  struct DateDTO: Decodable, Sendable {
    let date: String
  }

  /// `useDailyStreak`: ngày đã ghi, mới → cũ (`LOGGED_DAY_FILTER`, `STREAK_WINDOW`).
  public func loggedDates(userId: String, limit: Int) async throws -> [LocalDate] {
    let rows: [DateDTO] = try await client.from("daily_logs")
      .select("date")
      .eq("user_id", value: userId)
      .or(Streak.loggedDayFilter)
      .order("date", ascending: false)
      .limit(limit)
      .execute().value
    return rows.compactMap { LocalDate(String($0.date.prefix(10))) }
  }

  struct FreezeDTO: Decodable, Sendable {
    let used_on: String?
  }

  /// `streak_freezes.select('used_on')`.
  public func freezes(userId: String) async throws -> [FreezeRow] {
    let rows: [FreezeDTO] = try await client.from("streak_freezes")
      .select("used_on")
      .eq("user_id", value: userId)
      .execute().value
    return rows.map { FreezeRow(usedOn: $0.used_on.flatMap { LocalDate(String($0.prefix(10))) }) }
  }

  struct ChallengeDTO: Decodable, Sendable {
    let id: JSONValue
    let challenge_key: String
    let title: String?
    let completed: Bool?
    let reward_tier: String?
  }

  /// `useWeeklyChallenges`: tuần bắt đầu Thứ Hai, theo thứ tự tạo.
  public func weeklyChallenges(userId: String, weekStart: LocalDate) async throws -> [WeeklyChallenge] {
    let rows: [ChallengeDTO] = try await client.from("weekly_challenges")
      .select("id, challenge_key, title, completed, reward_tier")
      .eq("user_id", value: userId)
      .eq("week_start", value: weekStart.description)
      .order("created_at", ascending: true)
      .execute().value
    return rows.map { r in
      let id = r.id.stringValue ?? r.id.doubleValue.map { String(Int($0)) } ?? r.challenge_key
      return WeeklyChallenge(
        id: id, key: r.challenge_key, title: r.title ?? r.challenge_key, completed: r.completed ?? false,
        rewardTier: r.reward_tier)
    }
  }

  /// `useAwards` — màn chỉ hiện SỐ huy hiệu, nên chỉ đếm.
  public func awardCount(userId: String) async throws -> Int {
    let response = try await client.from("awards")
      .select("id", head: true, count: .exact)
      .eq("user_id", value: userId)
      .execute()
    return response.count ?? 0
  }

  struct StepsDTO: Decodable, Sendable {
    let steps: JSONValue?
  }

  struct WaterDTO: Decodable, Sendable {
    let amount_ml: JSONValue?
  }

  struct TargetDTO: Decodable, Sendable {
    let water_target_ml: JSONValue?
  }

  struct SleepDTO: Decodable, Sendable {
    let id: JSONValue?
  }

  /// `use-daily-quests.ts`: nhật ký ngày, nước, giấc ngủ, mục tiêu nước, nguồn bước.
  public func dailySignals(userId: String, date: LocalDate) async throws -> DailySignals {
    let day = date.description
    // `localDayRangeISO` — cùng hàm với lượt dựng `daily_logs` (#552).
    let range = DailyLog.dayRange(date, in: .current)
    async let log: [JSONValue] = client.from("daily_logs")
      .select("kcal, workout_count, sleep_duration_min, steps")
      .eq("user_id", value: userId)
      .eq("date", value: day)
      .limit(1)
      .execute().value
    async let water: [WaterDTO] = client.from("water_logs")
      .select("amount_ml")
      .eq("user_id", value: userId)
      .eq("date", value: day)
      .execute().value
    async let sleep: [SleepDTO] = client.from("sleep_logs")
      .select("id")
      .eq("user_id", value: userId)
      .gte("waketime", value: range.start)
      .lt("waketime", value: range.end)
      .limit(1)
      .execute().value
    async let target: [TargetDTO] = client.from("profiles")
      .select("water_target_ml")
      .eq("user_id", value: userId)
      .limit(1)
      .execute().value
    async let stepsEver: [StepsDTO] = client.from("daily_logs")
      .select("steps")
      .eq("user_id", value: userId)
      .gt("steps", value: 0)
      .limit(1)
      .execute().value
    let (l, w, s, t, e) = try await (log, water, sleep, target, stepsEver)
    let row = l.first
    return DailySignals(
      kcal: Self.number(row?["kcal"]), workoutCount: Self.number(row?["workout_count"]),
      sleepMinutes: Self.number(row?["sleep_duration_min"]), steps: Self.number(row?["steps"]),
      hasSleepRow: !s.isEmpty, waterMl: w.reduce(0) { $0 + (Self.number($1.amount_ml) ?? 0) },
      waterTargetMl: Self.number(t.first?.water_target_ml), stepsEverRecorded: !e.isEmpty)
  }

  /// `Number(x)` khoan dung: số, hoặc chuỗi số (cột `numeric`).
  static func number(_ v: JSONValue?) -> Double? {
    switch v {
    case .number(let n)?: n
    case .string(let s)?: Double(s)
    default: nil
    }
  }
}

/// Hai RPC kinh tế — server định giá, kiểm số dư, chặn trùng. App không gửi số xu.
public struct SupabaseMascotEconomy: MascotEconomy {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  struct ClaimParams: Encodable, Sendable {
    let p_ref_key: String
    let p_reason: String
  }

  struct FreezeParams: Encodable, Sendable {
    let p_request_id: String
  }

  public func claimReward(refKey: String, reason: String) async throws -> Int {
    do {
      return try await client.rpc("claim_quest_reward", params: ClaimParams(p_ref_key: refKey, p_reason: reason))
        .execute().value
    } catch {
      throw Self.failure(error)
    }
  }

  public func buyStreakFreeze(requestId: UUID) async throws -> Int {
    do {
      return try await client.rpc(
        "buy_streak_freeze", params: FreezeParams(p_request_id: requestId.uuidString.lowercased())
      )
      .execute().value
    } catch {
      throw Self.failure(error)
    }
  }

  /// Thông điệp `RAISE EXCEPTION` của các hàm SQL → lỗi có tên.
  static func failure(_ error: any Error) -> MascotFailure {
    if NetworkFailure.isOffline(error) { return .offline }
    guard let e = error as? PostgrestError else { return .server(code: nil) }
    return failure(message: e.message, code: e.code)
  }

  static func failure(message: String, code: String?) -> MascotFailure {
    let m = message.lowercased()
    if m.contains("not signed in") { return .notSignedIn }
    if m.contains("insufficient coins") { return .insufficientCoins }
    if m.contains("freeze limit") { return .freezeLimit }
    if m.contains("daily reward ceiling") { return .dailyCeiling }
    if m.contains("unknown reward") { return .unknownReward }
    if m.contains("already owned") { return .alreadyOwned }
    if m.contains("unknown item") { return .unknownItem }
    return .server(code: code)
  }
}

/// Tủ đồ của cửa hàng (#527) — `useMascotInventory`, `useBuyItem`,
/// `useToggleEquip` (`use-mascot-room.ts`). Mua qua RPC (server định giá); mặc /
/// cởi là UPDATE cột `equipped` của hàng của mình (RLS + trigger chặn đổi
/// `item_key` / `user_id`).
public struct SupabaseMascotWardrobe: MascotWardrobe {
  private let client: SupabaseClient

  public init(backend: Backend) {
    self.client = backend.client
  }

  struct InventoryDTO: Decodable, Sendable {
    let item_key: String
    let equipped: Bool?
  }

  struct BuyParams: Encodable, Sendable {
    let p_item_key: String
  }

  public func inventory(userId: String) async throws -> [InventoryRow] {
    let rows: [InventoryDTO] = try await client.from("mascot_inventory")
      .select("item_key, equipped")
      .eq("user_id", value: userId)
      .execute().value
    return rows.map { InventoryRow(itemKey: $0.item_key, equipped: $0.equipped ?? false) }
  }

  public func buy(itemKey: String) async throws -> Int {
    do {
      return try await client.rpc("buy_mascot_item", params: BuyParams(p_item_key: itemKey)).execute().value
    } catch {
      throw SupabaseMascotEconomy.failure(error)
    }
  }

  public func setWorn(userId: String, on: String?, off: [String]) async throws -> Bool {
    do {
      var found = true
      if let on {
        // Trả hàng để biết món còn trong kho (`'gone'` của RN khi 0 hàng).
        let rows: [InventoryDTO] = try await client.from("mascot_inventory")
          .update(["equipped": true])
          .eq("user_id", value: userId)
          .eq("item_key", value: on)
          .select("item_key, equipped")
          .execute().value
        found = !rows.isEmpty
      }
      if !off.isEmpty {
        _ = try await client.from("mascot_inventory")
          .update(["equipped": false])
          .eq("user_id", value: userId)
          .in("item_key", values: off)
          .execute()
      }
      return found
    } catch {
      throw SupabaseMascotEconomy.failure(error)
    }
  }
}
