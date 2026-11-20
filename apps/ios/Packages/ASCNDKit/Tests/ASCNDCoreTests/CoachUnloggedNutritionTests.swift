@testable import ASCNDCore
import Foundation
import Testing

/// KOA-T03 (audit Koa 17/11, P0): chưa ghi bữa nào thì Koa KHÔNG được nói "bạn đã ăn
/// 0 kcal / 0 g đạm" — nói "chưa ghi", như bước chân và giấc ngủ. Cả đường trả lời
/// nhanh lẫn đường đối chiếu khối tổng quan của AI.
struct CoachUnloggedNutritionTests {
  let fresh = AssistantSuggestions.Signal(kcalTarget: 2200, proteinTarget: 140)
  let logged = AssistantSuggestions.Signal(kcal: 640, kcalTarget: 2200, proteinG: 38, proteinTarget: 140)

  @Test func flagDefaultsFromTheNumbers() {
    #expect(AssistantSuggestions.Signal().hasNutrition == false)
    #expect(fresh.hasNutrition == false)
    #expect(logged.hasNutrition == true)
    #expect(AssistantSuggestions.Signal(proteinG: 5).hasNutrition == true)
    #expect(AssistantSuggestions.Signal(kcal: 300, hasNutrition: false).hasNutrition == false)
  }

  @Test func fromDailyLogsTreatsNullAndZeroAsUnlogged() {
    let day = LocalDate(daysSinceEpoch: 20_776)
    let tz = TimeZone(identifier: "UTC")!
    let none = AssistantSuggestions.Signal.from(log: nil, profile: nil, lastWorkoutAt: nil, today: day, in: tz)
    #expect(none.hasNutrition == false)
    let nulls = AssistantSuggestions.Signal.from(
      log: .object(["kcal": .null, "protein_g": .null]), profile: nil, lastWorkoutAt: nil, today: day, in: tz)
    #expect(nulls.hasNutrition == false)
    let ate = AssistantSuggestions.Signal.from(
      log: .object(["kcal": .number(512), "protein_g": .number(30)]), profile: nil, lastWorkoutAt: nil, today: day, in: tz)
    #expect(ate.hasNutrition == true)
    #expect(ate.kcal == 512)
  }

  @Test func quickReplySaysNotLoggedInEveryLanguage() {
    let asks: [(String, String)] = [
      ("hôm nay ăn bao nhiêu calo", "vi"), ("hôm nay ăn bao nhiêu đạm", "vi"),
      ("how many calories have I had", "en"), ("how much protein have I had", "en"),
      ("cuántas calorías llevo", "es"), ("cuántos gramos de proteína llevo", "es"),
    ]
    for (text, lang) in asks {
      for _ in 0..<6 {  // mọi mẫu, không chỉ mẫu đầu
        var m = CoachQuickReply.Memory()
        let a = CoachQuickReply.answer(text, signal: fresh, lang: lang, memory: &m)!
        #expect(!a.contains("```ascnd"), "\(text): không vẽ khối 0 / mục tiêu")
        #expect(!a.contains("**0"), "\(text): không nói đã nạp 0 — \(a)")
        #expect(!a.contains(" 0 kcal") && !a.contains(" 0 g"), "\(text): \(a)")
      }
    }
  }

  @Test func loggedDaysStillReportRealNumbers() {
    var m = CoachQuickReply.Memory()
    let kcal = CoachQuickReply.answer("how many calories have I had", signal: logged, lang: "en", memory: &m)!
    #expect(kcal.contains("640"))
    #expect(kcal.contains("```ascnd"))
    let pro = CoachQuickReply.answer("cuántos gramos de proteína llevo", signal: logged, lang: "es", memory: &m)!
    #expect(pro.contains("38"))
  }

  @Test func todaySummaryLeavesOutUnloggedNutrition() {
    let s = AssistantSuggestions.Signal(steps: 4200)
    let block = CoachQuickReply.overview(.today, s, .en)!
    #expect(!block.contains("\"meal\"") && !block.contains("\"protein\""))
    #expect(block.contains("\"steps\""))
    let withFood = CoachQuickReply.overview(.today, logged, .en)!
    #expect(withFood.contains("\"meal\"") && withFood.contains("\"protein\""))
  }

  @Test func aiOverviewCannotInventMealNumbersWhenUnlogged() {
    let o = CoachOverview.parse(
      #"{"items":[{"label":"Calories","value":0,"goal":2200,"unit":"kcal","tone":"meal"},{"label":"Protein","value":0,"goal":140,"unit":"g","tone":"protein"},{"label":"Water","value":3,"goal":8,"tone":"water"}]}"#)!
    let c = o.checked(against: fresh)
    #expect(c?.items.map(\.tone) == [.water])
    // Đã ghi thì số đúng vẫn giữ.
    let ok = CoachOverview.parse(#"{"items":[{"label":"Calories","value":640,"goal":2200,"unit":"kcal","tone":"meal"}]}"#)!
    #expect(ok.checked(against: logged)?.items.count == 1)
  }
}
