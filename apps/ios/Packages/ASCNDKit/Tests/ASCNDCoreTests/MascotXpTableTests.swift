import ASCNDCore
import Foundation
import Testing

/// Bảng XP theo `ref_key` (`MascotRules.xpForRefKey`) — MỘT bảng, ghim từng
/// không gian tên, kể cả các khoá 0 XP có chủ đích (R2-ECO-06: xu do server
/// trả, XP đọc từ khoá — đổi giá xu không đổi XP). Đổi một con số ở đây là
/// quyết định sản phẩm, không phải sửa test cho xanh.
///
/// Khác với `MascotGoldenTests` (so với vector của RN): test này ghim trực
/// tiếp giá trị native, gồm bảng nhiệm vụ mới (#527 đợt 1) và các khoá native
/// mới (`x:`, `d:…:overload`, `cc:`) mà vector cũ không có.
struct MascotXpTableTests {
  private let day = LocalDate("2026-10-08")!

  /// `w:` — thưởng tuần đường cũ: mọi hậu tố đều 40, chỉ còn để định giá sổ cũ.
  @Test func weeklyBonusPaysFortyForAnySuffix() {
    for key in ["w:1", "w:xp", "w:"] {
      #expect(MascotRules.xpForRefKey(key) == 40, "\(key)")
    }
    #expect(MascotRules.xpForRefKey("w") == 0, "thiếu dấu hai chấm thì không phải khoá tuần")
  }

  /// `ch:` — chỉ đọc phần bậc; bậc lạ / thiếu bậc thì 0.
  @Test func challengePaysByTierOnly() {
    let table: [(String, Int)] = [
      ("ch:bronze:2026-10-05:workouts_3", 25), ("ch:silver:2026-10-05:steps_50k", 50),
      ("ch:gold:2026-10-05:protein_7", 80), ("ch:platinum:2026-10-05:all", 120),
    ]
    for (key, xp) in table { #expect(MascotRules.xpForRefKey(key) == xp, "\(key)") }
    #expect(MascotRules.xpForRefKey("ch:gold") == 80, "chỉ cần bậc, tuần và khoá không ảnh hưởng")
    #expect(MascotRules.xpForRefKey("ch:diamond:2026-10-05:x") == 0)
    #expect(MascotRules.xpForRefKey("ch:") == 0)
    #expect(MascotRules.xpForRefKey("ch") == 0)
  }

  /// Tuần của Koa đi đường `ch:silver:…:koa_week` nên được 50 XP.
  @Test func koaWeekPaysSilverTier() {
    let key = KoaWeek.refKey(day)
    #expect(key == "ch:silver:2026-10-08:koa_week")
    #expect(MascotRules.xpForRefKey(key) == 50)
    #expect(
      MascotRules.xpForRefKey(MascotRules.challengeRefKey(tier: "gold", weekStart: "2026-10-05", key: "steps_week"))
        == 80)
  }

  /// `set:` — theo bộ sưu tập; bộ lạ thì 0.
  @Test func collectionsPayBySet() {
    let table: [(String, Int)] = [
      ("set:gym", 60), ("set:runner", 90), ("set:tet", 60), ("set:xmas", 60), ("set:halloween", 60),
    ]
    for (key, xp) in table { #expect(MascotRules.xpForRefKey(key) == xp, "\(key)") }
    #expect(MascotRules.xpForRefKey("set:nope") == 0)
    #expect(MascotRules.xpForRefKey("set:") == 0)
    #expect(MascotRules.xpForRefKey("set:gym:extra") == 0, "id phải khớp đúng, không có phần thừa")
  }

  /// `d:` — nhiệm vụ ngày và chuỗi, qua đúng hàm dựng khoá của từng loại.
  @Test func dailyQuestsAndStreakPayQuestXp() {
    let table: [(MascotRules.Quest, Int)] = [
      (.workout, 40), (.recovery, 25), (.meal, 10), (.water, 8), (.sleep, 8), (.steps, 8),
    ]
    for (quest, xp) in table {
      #expect(MascotRules.xpForRefKey(MascotRules.questRefKey(day, quest)) == xp, "\(quest)")
    }
    #expect(MascotRules.xpForRefKey(MascotRules.streakRefKey(day)) == 15)
  }

  /// `d:` — đuôi lạ và ngày sai dạng thì 0. Ngày phải đúng `YYYY-MM-DD`,
  /// chữ số ASCII, đuôi phải khớp đúng tên nhiệm vụ.
  @Test func malformedDayKeysPayNothing() {
    for key in [
      "d:2026-10-08:unknown", "d:2026-10-08:meal:extra", "d:2026-1-08:meal", "d:2026/10/08:meal",
      "d:2026-10-08:", "d:2026-10-08", "D:2026-10-08:meal", "d:２０２６-10-08:meal",
    ] {
      #expect(MascotRules.xpForRefKey(key) == 0, "\(key)")
    }
  }

  /// 0 XP có chủ đích: các dòng có xu (server trả) nhưng không cộng XP.
  /// Tăng tải có +3 Gains thay cho XP; khám phá và thử thách cộng đồng chỉ xu.
  @Test func coinOnlyNamespacesPayZeroXp() {
    #expect(MascotRules.xpForRefKey(OverloadQuest.refKey(day)) == 0, "d:…:overload")
    for quest in ExploreQuest.allCases {
      #expect(MascotRules.xpForRefKey(quest.refKey) == 0, "\(quest.refKey)")
    }
    #expect(MascotRules.xpForRefKey("cc:123") == 0, "thử thách cộng đồng, không rơi vào nhánh ch:")
    #expect(MascotRules.xpForRefKey("cc:") == 0)
    #expect(MascotRules.xpForRefKey("welcome") == 0)
  }

  /// Dòng trừ xu khi mua không cộng XP — và mọi khoá lạ khác cũng 0.
  @Test func PurchasesAndUnknownKeysPayNothing() {
    for key in [
      "buy:neon_lamp", "buy:streak_freeze", "freeze:550e8400-e29b-41d4-a716-446655440000", "dev:300", "meal", "",
    ] {
      #expect(MascotRules.xpForRefKey(key) == 0, "\(key)")
    }
  }
}
