public import Foundation

/// Luật của phòng linh vật (#527 Phase 7) — `native/src/lib/mascot-room.ts`
/// @ fac9ac2, chép từng con số. Golden: `mascot-golden.json`
/// (`tools/insights-golden/gen-mascot.mjs`, sinh bằng CHÍNH mã RN).
///
/// Quyền định giá nằm ở SERVER (`claim_quest_reward`, `buy_streak_freeze`,
/// bảng `reward_prices` / `shop_prices`): app không bao giờ gửi số xu, không
/// tự ghi sổ. Các con số ở đây chỉ để HIỆN và để tính XP / cấp từ sổ đã đọc
/// — đúng như RN (`xpForRefKey`).
public enum MascotRules {
  public enum Quest: String, Sendable, Hashable, CaseIterable {
    case meal, workout, water, sleep, steps
  }

  public struct QuestDef: Sendable, Hashable {
    public let key: Quest
    /// Xu server trả (`reward_prices['quest:<key>']` — cùng số với RN).
    public let coins: Int
    public let xp: Int
    /// vi / en / es; `steps` có `{n}` = mục tiêu bước.
    let names: [String]

    public func name(_ lang: AppPreferences.Lang, stepsGoal: Int) -> String {
      let raw = switch lang {
      case .vi: names[0]
      case .en: names[1]
      case .es: names[2]
      }
      return raw.replacingOccurrences(of: "{n}", with: stepsGoal.formatted(.number.locale(Locale(identifier: lang.rawValue))))
    }
  }

  /// `DAILY_QUESTS`.
  public static let dailyQuests: [QuestDef] = [
    QuestDef(key: .meal, coins: 10, xp: 10, names: ["Ghi 1 bữa ăn", "Log a meal", "Registra una comida"]),
    QuestDef(key: .workout, coins: 25, xp: 30, names: ["Hoàn thành 1 buổi tập", "Complete a workout", "Completa un entrenamiento"]),
    QuestDef(key: .water, coins: 15, xp: 15, names: ["Đạt mục tiêu nước", "Hit your water target", "Alcanza tu objetivo de agua"]),
    QuestDef(key: .sleep, coins: 15, xp: 15, names: ["Ghi giấc ngủ", "Log your sleep", "Registra tu sueño"]),
    QuestDef(key: .steps, coins: 10, xp: 12, names: ["Đi {n} bước", "Walk {n} steps", "Camina {n} pasos"]),
  ]

  /// `ENERGY_SIGNALS`: năm tín hiệu của vòng năng lượng, theo thứ tự này.
  public static let energySignals: [Quest] = [.meal, .workout, .water, .sleep, .steps]

  /// `WEEKLY_BONUS_XP` — đường cũ `w:<id>`, chỉ còn để định giá sổ cũ.
  public static let weeklyBonusXp = 40
  /// `STREAK_XP`.
  public static let streakXp = 15
  /// `LEVEL_XP`: XP mỗi cấp.
  public static let levelXp = 120
  /// `FREEZE_MAX`: số băng chuỗi được giữ cùng lúc (server cũng chặn: `freeze limit`).
  public static let freezeMax = 2
  /// `FREEZE_PRICE` (= `CONSUMABLES.streak_freeze.price`, = `shop_prices`).
  public static let freezePrice = 150

  /// `streakCoins` — con số RN HIỆN cạnh dòng thưởng chuỗi.
  public static func streakCoins(_ streak: Int) -> Int { min(5 + streak * 2, 25) }

  /// Số xu server THẬT SỰ trả cho `d:<ngày>:streak`: `reward_prices['streak:max']`
  /// (`20260819120000_reward_amount_authority.sql`) — cố định 25, mọi độ dài
  /// chuỗi. Màn native hiện con số này (xem `MascotRoomController.streakBonus`).
  public static let streakPayout = 25

  /// `CHALLENGE_REWARD`: theo hạng thử thách tuần.
  public static let challengeReward: [String: (coins: Int, xp: Int)] = [
    "bronze": (25, 25), "silver": (50, 50), "gold": (80, 80), "platinum": (120, 120),
  ]

  /// `COLLECTIONS[].rewardXp` theo `set:<id>`.
  static let collectionXp: [String: Int] = ["gym": 60, "runner": 90, "tet": 60, "xmas": 60, "halloween": 60]

  /// `questRefKey`.
  public static func questRefKey(_ date: LocalDate, _ quest: Quest) -> String { "d:\(date):\(quest.rawValue)" }
  public static func streakRefKey(_ date: LocalDate) -> String { "d:\(date):streak" }
  /// `challengeRefKey`.
  public static func challengeRefKey(tier: String, weekStart: String, key: String) -> String {
    "ch:\(tier):\(weekStart):\(key)"
  }

  /// `xpForRefKey`: XP của một dòng sổ, đọc từ chính `ref_key` của nó. Khoá
  /// lạ (kể cả `welcome`, `buy:`, `freeze:`) không có XP.
  public static func xpForRefKey(_ refKey: String) -> Int {
    if refKey.hasPrefix("w:") { return weeklyBonusXp }
    if refKey.hasPrefix("ch:") {
      let parts = refKey.split(separator: ":", omittingEmptySubsequences: false)
      return parts.count > 1 ? challengeReward[String(parts[1])]?.xp ?? 0 : 0
    }
    if refKey.hasPrefix("set:") { return collectionXp[String(refKey.dropFirst(4))] ?? 0 }
    // `^d:\d{4}-\d{2}-\d{2}:(.+)$` — chữ số ASCII.
    let u = Array(refKey.utf8)
    guard u.count > 13, u[0] == UInt8(ascii: "d"), u[1] == UInt8(ascii: ":"), u[12] == UInt8(ascii: ":") else { return 0 }
    let digits = [2, 3, 4, 5, 7, 8, 10, 11]
    guard digits.allSatisfy({ (48...57).contains(u[$0]) }), u[6] == UInt8(ascii: "-"), u[9] == UInt8(ascii: "-") else {
      return 0
    }
    let tail = String(decoding: u[13...], as: UTF8.self)
    if tail == "streak" { return streakXp }
    return dailyQuests.first { $0.key.rawValue == tail }?.xp ?? 0
  }

  /// `levelFromXp`.
  public static func level(xp: Int) -> Int { Int((Double(xp) / Double(levelXp)).rounded(.down)) + 1 }

  public struct Rank: Sendable, Hashable {
    public let key: String
    /// Cấp đầu tiên thuộc hạng này.
    public let minLevel: Int
    /// Màu nhấn (`RANKS[].color`), "#rrggbb".
    public let colorHex: String
    let names: [String]

    public func name(_ lang: AppPreferences.Lang) -> String {
      switch lang {
      case .vi: names[0]
      case .en: names[1]
      case .es: names[2]
      }
    }
  }

  /// `RANKS`.
  public static let ranks: [Rank] = [
    Rank(key: "rookie", minLevel: 1, colorHex: "#8b93a4", names: ["Tập sự", "Rookie", "Novato"]),
    Rank(key: "active", minLevel: 5, colorHex: "#2bf5a8", names: ["Năng động", "Active", "Activo"]),
    Rank(key: "prime", minLevel: 10, colorHex: "#3ba6ff", names: ["Sung sức", "Prime", "En forma"]),
    Rank(key: "peak", minLevel: 20, colorHex: "#b07de0", names: ["Đỉnh cao", "Peak", "Cima"]),
    Rank(key: "apex", minLevel: 35, colorHex: "#e08a3a", names: ["Tối thượng", "Apex", "Ápice"]),
    Rank(key: "legend", minLevel: 55, colorHex: "#ffd93d", names: ["Huyền thoại", "Legend", "Leyenda"]),
  ]

  /// `rankForLevel`: hạng cao nhất mà cấp đã chạm; dưới cấp 1 vẫn là hạng đầu.
  public static func rank(level: Int) -> Rank {
    ranks.last { level >= $0.minLevel } ?? ranks[0]
  }

  /// `nextRank`: hạng kế tiếp, `nil` ở hạng cuối.
  public static func nextRank(level: Int) -> Rank? { ranks.first { $0.minLevel > level } }

  /// Câu dưới vòng năng lượng (`mascot-room.tsx:410–417`).
  public enum EnergyHeadline: String, Sendable, Hashable {
    case empty, low, mid, full
  }

  public static func energyHeadline(_ count: Int) -> EnergyHeadline {
    if count == 0 { return .empty }
    if count >= energySignals.count { return .full }
    return count >= 3 ? .mid : .low
  }

  /// Hạng → bậc pháo hoa (`RANK_TIER`), cho màn chúc mừng lên hạng.
  public static func celebrationTier(_ rankKey: String) -> String {
    ["rookie": "bronze", "active": "bronze", "prime": "silver", "peak": "gold", "apex": "platinum", "legend": "platinum"][
      rankKey] ?? "gold"
  }
}
