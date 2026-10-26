@testable import ASCNDCore
import Testing

/// Gợi ý ghi khi người dùng kể việc đã làm, chỉ khi hôm nay chưa ghi (16/10).
struct CoachLogPromptTests {
  typealias D = CoachLogPrompt.Detected

  @Test func sleepReportsInThreeLanguages() {
    #expect(CoachLogPrompt.detect("Tối qua tôi ngủ được 7 tiếng", hour: 9) == [D(kind: .sleep, value: 420)])
    #expect(CoachLogPrompt.detect("Toi qua toi ngu duoc 7 tieng", hour: 9) == [D(kind: .sleep, value: 420)])
    #expect(CoachLogPrompt.detect("ngủ 6 tiếng rưỡi", hour: 9).first?.value == 390)
    #expect(CoachLogPrompt.detect("ngủ 7,5 giờ", hour: 9).first?.value == 450)
    #expect(CoachLogPrompt.detect("I slept 8 hours", hour: 9).first?.value == 480)
    #expect(CoachLogPrompt.detect("Anoche dormí 6 horas", hour: 9).first?.value == 360)
    // Câu kể kèm câu hỏi vẫn được gợi ý ghi (có số).
    #expect(CoachLogPrompt.detect("Tôi ngủ 7 tiếng, vậy có đủ không?", hour: 9).first?.kind == .sleep)
  }

  @Test func otherKinds() {
    #expect(CoachLogPrompt.detect("Hôm nay tôi uống 2 lít nước", hour: 9) == [D(kind: .water, value: 2000)])
    #expect(CoachLogPrompt.detect("uong 3 coc nuoc", hour: 9).first?.value == 750)
    #expect(CoachLogPrompt.detect("Sáng nay tôi cân nặng 60,5 kg", hour: 9) == [D(kind: .weight, value: 60.5)])
    #expect(CoachLogPrompt.detect("I weigh 72 kg", hour: 9).first?.kind == .weight)
    #expect(CoachLogPrompt.detect("Tôi vừa tập ngực 45 phút", hour: 9) == [D(kind: .workout, value: 45)])
    #expect(CoachLogPrompt.detect("I just worked out", hour: 9).first?.kind == .workout)
    #expect(CoachLogPrompt.detect("Hoy entrené pierna", hour: 9).first?.kind == .workout)
    #expect(CoachLogPrompt.detect("Trưa nay tôi ăn cơm gà", hour: 20) == [D(kind: .meal, meal: "lunch")])
    #expect(CoachLogPrompt.detect("Tôi vừa ăn phở", hour: 8).first?.meal == "breakfast")
    #expect(CoachLogPrompt.detect("I had salad for dinner", hour: 13).first?.meal == "dinner")
  }

  @Test func questionsAndGoalsAreNotReports() {
    let none = [
      "Tôi nên ngủ bao nhiêu tiếng?", "Có nên ngủ 8 tiếng không?", "Mục tiêu của tôi là uống 2 lít nước",
      "How many hours should I sleep?", "Hôm nay nên tập gì?", "Ăn gì để tăng cơ?", "Tôi bị đau gối",
      "¿Cuántas horas debo dormir?",
    ]
    for t in none { #expect(CoachLogPrompt.detect(t, hour: 9).isEmpty, "\(t)") }
    // "nên" là liên từ trong câu kể.
    #expect(CoachLogPrompt.detect("Tôi chỉ ngủ 5 tiếng nên hơi mệt", hour: 9).first?.value == 300)
  }

  @Test func alreadyLoggedTodayIsSkipped() {
    let t = "Tối qua ngủ 7 tiếng, sáng nay uống 2 lít nước và vừa tập xong"
    let none = CoachLogPrompt.LoggedToday()
    #expect(CoachLogPrompt.suggestions(t, logged: none, hour: 9).map(\.kind) == [.sleep, .water, .workout])
    let some = CoachLogPrompt.LoggedToday(sleepMin: 420, workout: true, waterMl: 500)
    let left = CoachLogPrompt.suggestions(t, logged: some, hour: 9)
    #expect(left == [D(kind: .water, value: 1500)])
    let full = CoachLogPrompt.LoggedToday(sleepMin: 420, workout: true, waterMl: 2000)
    #expect(CoachLogPrompt.suggestions(t, logged: full, hour: 9).isEmpty)
    // Bữa: theo từng bữa.
    let lunchDone = CoachLogPrompt.LoggedToday(meals: ["lunch"])
    #expect(CoachLogPrompt.suggestions("Trưa nay tôi ăn cơm", logged: lunchDone, hour: 13).isEmpty)
    #expect(CoachLogPrompt.suggestions("Tối nay tôi ăn phở", logged: lunchDone, hour: 20).first?.meal == "dinner")
  }

  @Test func conflictsWhenWhatWasSaidDiffersFromTheLog() {
    // Ví dụ của chủ dự án: ghi 9 tiếng, nhắn 8 tiếng.
    let logged = CoachLogPrompt.LoggedToday(sleepMin: 540, waterMl: 2000, weightKg: 61)
    let a = CoachLogPrompt.analyze("Tối qua tôi ngủ được 8 tiếng", logged: logged, hour: 9)
    #expect(a.conflicts == [.init(kind: .sleep, logged: 540, stated: 480)])
    #expect(a.suggestions.isEmpty)
    // Khớp (lệch ≤ 15 phút) → không gì.
    #expect(CoachLogPrompt.analyze("ngủ 9 tiếng", logged: logged, hour: 9) == .init())
    #expect(CoachLogPrompt.analyze("tôi nặng 63 kg", logged: logged, hour: 9).conflicts.first?.stated == 63)
    #expect(CoachLogPrompt.analyze("tôi nặng 61.2 kg", logged: logged, hour: 9) == .init())
    #expect(CoachLogPrompt.analyze("mới uống 1 lít nước", logged: logged, hour: 9).conflicts.first?.kind == .water)
  }

  @Test func readsWhichNumberTheUserChose() {
    let c = CoachLogPrompt.Conflict(kind: .sleep, logged: 540, stated: 480)
    #expect(CoachLogPrompt.choice("8 tiếng mới đúng", for: c) == .stated)
    #expect(CoachLogPrompt.choice("à 9 tiếng", for: c) == .logged)
    #expect(CoachLogPrompt.choice("ừ", for: c) == .unclear)
    let w = CoachLogPrompt.Conflict(kind: .weight, logged: 61, stated: 63)
    #expect(CoachLogPrompt.choice("63kg", for: w) == .stated)
  }

  /// Audit vòng 3 (26/10): tài khoản oz nói / thấy oz, không phải "473 ml".
  @Test func waterFollowsTheUsersUnit() {
    #expect(CoachLogPrompt.detect("I drank 16 oz of water", hour: 9).first?.kind == .water)
    #expect(abs((CoachLogPrompt.detect("I drank 16 oz of water", hour: 9).first?.value ?? 0) - 473.18) < 0.1)
    #expect(CoachLogPrompt.detect("bebí 20 onzas de agua", hour: 9).first?.kind == .water)
    #expect(CoachLogPrompt.display(.water, 473.176, lang: "en", unit: .oz) == "16 oz")
    #expect(CoachLogPrompt.display(.water, 473.176, lang: "en") == "473 ml")
    #expect(CoachLogPrompt.display(.water, 1500, lang: "en") == "1.5 L")
    let c = CoachLogPrompt.Conflict(kind: .water, logged: 1892.7, stated: 946.4)
    #expect(CoachLogPrompt.question(c, lang: "en", unit: .oz).contains("32 oz"))
    #expect(CoachLogPrompt.question(c, lang: "en", unit: .oz).contains("64 oz"))
    #expect(CoachLogPrompt.choice("32 is right", for: c, unit: .oz) == .stated)
    #expect(CoachLogPrompt.choice("no, 64", for: c, unit: .oz) == .logged)
    // Đã ghi 16 oz, nói "32 oz" → gợi ý đúng 16 oz (473 ml), không 15 oz (450 ml).
    let sixteen = CoachLogPrompt.LoggedToday(waterMl: 473)
    let left = CoachLogPrompt.suggestions("I drank 32 oz of water", logged: sixteen, hour: 9, unit: .oz)
    #expect(left.first.map { CoachLogPrompt.display(.water, $0.value ?? 0, lang: "en", unit: .oz) } == "16 oz")
    #expect(left.first?.value == 473)
  }

  @Test func leakedInstructionsAreReplacedByAPlainQuestion() {
    let c = CoachLogPrompt.Conflict(kind: .sleep, logged: 420, stated: 480)
    #expect(CoachLogPrompt.leaksInstructions("Kiểm tra dữ liệu: Đêm qua người dùng vừa nói 8 giờ"))
    #expect(!CoachLogPrompt.leaksInstructions("Bạn vừa nói 8 giờ, nhưng app đang ghi 7 giờ — số nào mới đúng nhỉ?"))
    #expect(CoachLogPrompt.question(c, lang: "vi") == "Bạn vừa nói 8 giờ, nhưng app đang ghi 7 giờ — số nào mới đúng nhỉ?")
    #expect(CoachLogPrompt.question(c, lang: "en").contains("7h"))
  }
}
