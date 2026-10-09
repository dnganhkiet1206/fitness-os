@testable import ASCNDCore
import Foundation
import Testing

/// Dinh dưỡng 7 ngày (#527 Phase 3 · 3.6) — `nutrition-insights.tsx` +
/// `macroTargetsFor` @ fac9ac2, viết tay theo mã RN.
struct NutritionInsightsTests {
  static func day(_ d: String, protein: Double, fiber: Double = 30) -> NutritionInsights.Day {
    NutritionInsights.Day(date: LocalDate(d)!, protein: protein, fiber: fiber, kcal: 0)
  }

  /// `macroTargetsFor`: đủ bốn số thì dùng nguyên; thiếu thì suy từ calo.
  @Test func macroTargetsLikeRN() {
    let set = MacroTargets.grams(tdeeKcal: 2500, protein: 150, carbs: 250, fat: 70, fiber: 35)
    #expect(set.protein == 150)
    #expect(set.fiber == 35)
    // Mặc định 2200: đạm round(2200·0.27/4)=149 (148.5 nửa lên), béo round(2200·0.25/9)=61,
    // tinh bột round((2200−596−549)/4)=264 (263.75), chất xơ round(2.2·14)=31.
    let d = MacroTargets.grams(tdeeKcal: nil, protein: nil, carbs: nil, fat: nil, fiber: nil)
    #expect(d.protein == 149)
    #expect(d.fat == 61)
    #expect(d.carbs == 264)
    #expect(d.fiber == 31)
    // Số âm / 0 calo là "chưa đặt".
    let e = MacroTargets.grams(tdeeKcal: 0, protein: -5, carbs: nil, fat: nil, fiber: nil)
    #expect(e.protein == 149)
    // Đạm đã đặt mà thiếu số khác: giữ đạm, suy phần còn lại.
    let f = MacroTargets.grams(tdeeKcal: 2000, protein: 180, carbs: nil, fat: nil, fiber: nil)
    #expect(f.protein == 180)
    #expect(f.fat == 56)
    #expect(f.carbs == 194)
  }

  /// Đọc đúng bảy ngày (RN đọc tám).
  @Test func queryCoversSevenLocalDays() throws {
    let q = NutritionInsights.query(userId: "u1", today: try #require(LocalDate("2026-10-09")))
    #expect(q.table == "daily_logs")
    #expect(q.filters.contains(.gte("date", .string("2026-10-03"))))
    #expect(q.filters.contains(.eq("user_id", .string("u1"))))
  }

  /// Ô hỏng / trống là 0; hàng không có ngày bị bỏ.
  @Test func rowsParse() {
    let r = NutritionInsights.rows([
      .object(["date": .string("2026-10-08"), "protein_g": .string("120.5"), "fiber_g": .null]),
      .object(["protein_g": .number(10)]),
    ])
    #expect(r.count == 1)
    #expect(r[0].protein == 120.5)
    #expect(r[0].fiber == 0)
  }

  /// Thiếu > 10 g → "thiếu"; không thì ≥ 5 ngày đạt → "giữ vững"; chất xơ < 60 % → "thấp".
  @Test func insightsLikeRN() {
    let t = MacroTargets.Grams(protein: 150, carbs: 0, fat: 0, fiber: 30)
    let low = (3...9).map { Self.day("2026-10-0\($0)", protein: 120, fiber: 10) }
    let s1 = NutritionInsights.stats(low, proteinTarget: 150)
    #expect(NutritionInsights.insights(s1, targets: t) == [.proteinGap(avg: 120, gap: 30, target: 150), .fiberLow(avg: 10, target: 30)])
    let hit = (3...9).map { Self.day("2026-10-0\($0)", protein: $0 < 5 ? 140 : 160) }
    let s2 = NutritionInsights.stats(hit, proteinTarget: 150)
    #expect(s2?.proteinDays == 5)
    #expect(NutritionInsights.insights(s2, targets: t) == [.proteinHit(days: 5, of: 7)])
    // Thiếu ≤ 10 g (trung bình 141,4) và chỉ 4 ngày đạt: không câu nào về đạm.
    let edge = (3...9).map { Self.day("2026-10-0\($0)", protein: $0 < 7 ? 150 : 130) }
    #expect(NutritionInsights.insights(NutritionInsights.stats(edge, proteinTarget: 150), targets: t).isEmpty)
    #expect(NutritionInsights.insights(nil, targets: t).isEmpty)
    #expect(NutritionInsights.maxProtein(low, target: 150) == 150 * 1.15)
    #expect(NutritionInsights.maxProtein([Self.day("2026-10-09", protein: 300)], target: 150) == 300)
  }
}
