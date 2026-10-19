import Foundation
import Testing

@testable import ASCNDCore

/// "Kể cho Koa": câu kể → mục ghi. Mỗi ca là một câu người dùng thật có thể gõ
/// hay nói; vi / en / es; có dấu và không dấu. Sai một ca = ghi sai nhật ký của
/// người dùng, nên ca "không được ghi" quan trọng ngang ca "ghi đúng".
@Suite struct SpokenLogTests {
  func items(_ s: String, hour: Int = 9, unit: WeightUnit = .kg) -> [SpokenLog.Item] {
    SpokenLog.parse(s, hour: hour, weightUnit: unit).items
  }

  func sleepMinutes(_ s: String) -> Int? {
    for i in items(s) { if case .sleep(let sl) = i { return sl.minutes } }
    return nil
  }

  func water(_ s: String) -> Int?? {
    for i in items(s) { if case .water(let ml) = i { return .some(ml) } }
    return .none
  }

  func weight(_ s: String, unit: WeightUnit = .kg) -> Double? {
    for i in items(s, unit: unit) { if case .weight(let kg) = i { return kg } }
    return nil
  }

  func workout(_ s: String) -> SpokenLog.Workout? {
    for i in items(s) { if case .workout(let w) = i { return w } }
    return nil
  }

  func meals(_ s: String, hour: Int = 9) -> [SpokenLog.Meal] {
    items(s, hour: hour).compactMap { if case .meal(let m) = $0 { m } else { nil } }
  }

  // MARK: ngủ

  @Test(arguments: [
    ("ngủ 7 tiếng", 420), ("tối qua ngủ được 7 tiếng rưỡi", 450), ("ngu 6h30", 390), ("ngủ 8 giờ", 480),
    ("đêm qua ngủ 6 tiếng 15 phút", 375), ("ngủ 7,5 tiếng", 450), ("ngủ bảy tiếng", 420),
    ("I slept 7 hours", 420), ("slept 7.5 hrs last night", 450), ("slept seven and a half hours", 450),
    ("dormí 7 horas", 420), ("dormi siete horas y media", 450), ("dormí 6 horas", 360),
  ])
  func sleepDuration(_ s: String, _ m: Int) {
    #expect(sleepMinutes(s) == m)
  }

  @Test(arguments: [
    ("ngủ lúc 23h dậy lúc 6h30", 23, 0, 6, 30), ("đi ngủ lúc 11 giờ tối, thức dậy lúc 6 giờ sáng", 23, 0, 6, 0),
    ("ngủ từ 12 giờ đêm đến 7 giờ", 0, 0, 7, 0), ("went to bed at 11pm and woke up at 6:30", 23, 0, 6, 30),
    ("slept from 10:30 pm to 6 am", 22, 30, 6, 0), ("me acosté a las 11 y me desperté a las 7", 23, 0, 7, 0),
  ])
  func sleepClock(_ s: String, _ bh: Int, _ bm: Int, _ wh: Int, _ wm: Int) throws {
    let sl = try #require(items(s).compactMap { if case .sleep(let x) = $0 { x } else { nil } }.first)
    #expect(sl.bed == SleepLog.Clock(hour: bh, minute: bm))
    #expect(sl.wake == SleepLog.Clock(hour: wh, minute: wm))
    var m = (wh * 60 + wm) - (bh * 60 + bm)
    if m <= 0 { m += 1440 }
    #expect(sl.minutes == m)
  }

  @Test(arguments: [
    "nên ngủ mấy tiếng?", "mục tiêu ngủ 8 tiếng", "tối nay sẽ ngủ 8 tiếng", "I will sleep 8 hours", "should I sleep 8 hours?",
    "¿cuántas horas debo dormir?", "ngủ 30 tiếng", "ngủ ngon", "I want to sleep 9 hours",
  ])
  func sleepNotLogged(_ s: String) {
    #expect(sleepMinutes(s) == nil)
  }

  // MARK: nước

  @Test(arguments: [
    ("uống 2 lít nước", 2000), ("uong 500ml nuoc", 500), ("uống 2 ly nước", 500), ("vừa uống nửa lít nước lọc", 500),
    ("uống 1 chai nước suối", 500), ("2 cốc nước", 500), ("uống 1,5 lít nước", 1500),
    ("drank 2 glasses of water", 500), ("I drank 1 liter of water", 1000), ("had a bottle of water", 500), ("drank 750 ml water", 750),
    ("bebí 2 vasos de agua", 500), ("tomé un litro de agua", 1000), ("bebí medio litro de agua", 500),
  ])
  func waterAmount(_ s: String, _ ml: Int) {
    #expect(water(s) == .some(ml))
  }

  @Test func waterWithoutAmountAsksLater() {
    #expect(water("uống nước rồi") == .some(nil))
  }

  /// Đồ uống có calo không phải nước — nó thành món.
  @Test(arguments: ["uống nước cam", "uống 1 ly nước mía", "uống trà sữa", "drank a glass of orange juice", "bebí un vaso de leche",
    "uống 2 ly cà phê", "uống 1 lon nước ngọt"])
  func otherDrinksAreNotWater(_ s: String) {
    #expect(water(s) == .none)
    #expect(!meals(s).isEmpty)
  }

  @Test func waterOutOfRangeIsDropped() {
    #expect(water("uống 20 lít nước") == .none)
  }

  @Test func waterTwiceAddsUp() {
    #expect(water("sáng uống 2 ly nước, chiều uống thêm 1 lít nước") == .some(1500))
  }

  // MARK: cân

  @Test(arguments: [
    ("cân nặng 68,5 kg", 68.5), ("hôm nay cân được 70 ký", 70), ("nặng 65kg", 65), ("cân 72.3", 72.3),
    ("I weigh 70 kg", 70), ("weighed 154 lbs", 69.85), ("peso 68 kilos", 68), ("pesé 70 kg", 70),
  ])
  func weightKg(_ s: String, _ kg: Double) {
    #expect(weight(s) == kg)
  }

  @Test func weightUsesAccountUnitWhenUnsaid() {
    #expect(weight("weighed 150 today", unit: .lbs) == 68.04)
    #expect(weight("cân 68", unit: .kg) == 68)
  }

  @Test(arguments: ["cần ăn thêm đạm", "I can run 5 km", "cân nặng mục tiêu 60kg", "nặng 500 kg"])
  func weightNotLogged(_ s: String) {
    #expect(weight(s) == nil)
  }

  // MARK: tập

  @Test(arguments: [
    ("vừa tập gym 45 phút", SpokenLog.Workout.Kind.gym, 45 as Int?), ("chạy bộ 30 phút", .run, 30), ("đi bộ 1 tiếng", .walk, 60),
    ("bơi 40 phút", .swim, 40), ("đạp xe 1 tiếng rưỡi", .cycle, 90), ("tập yoga 20 phút", .yoga, 20),
    ("ran 5k in 28 minutes", .run, 28), ("worked out for an hour", .gym, nil), ("did yoga for 30 min", .yoga, 30),
    ("corrí 30 minutos", .run, 30), ("entrené una hora en el gimnasio", .gym, 60), ("nadé 40 minutos", .swim, 40),
  ])
  func workoutKind(_ s: String, _ k: SpokenLog.Workout.Kind, _ m: Int?) throws {
    let w = try #require(workout(s))
    #expect(w.kind == k)
    if let m { #expect(w.minutes == m) }
  }

  @Test func workoutWithoutMinutes() {
    #expect(workout("hôm nay tập xong rồi") == SpokenLog.Workout(kind: .gym, minutes: nil))
  }

  @Test(arguments: ["mai sẽ tập chân", "I'm going to run later", "voy a correr mañana", "nên tập bao lâu?", "tấp xe vào lề"])
  func workoutNotLogged(_ s: String) {
    #expect(workout(s) == nil)
  }

  // MARK: bữa

  @Test func vietnameseBreakfast() throws {
    let m = try #require(meals("sáng ăn 1 tô phở bò và 1 ly cà phê sữa").first)
    #expect(m.slot == "breakfast")
    #expect(m.foods.map(\.name) == ["phở bò", "cà phê sữa"])
    #expect(m.foods.map(\.unit) == ["tô", "ly"])
  }

  @Test func quantitiesAndGrams() throws {
    let m = try #require(meals("trưa ăn cơm trắng, 200g ức gà và 2 quả trứng").first)
    #expect(m.slot == "lunch")
    #expect(m.foods == [
      .init(name: "cơm trắng"), .init(name: "ức gà", grams: 200), .init(name: "trứng", servings: 2, unit: "quả"),
    ])
  }

  @Test func noAccentVietnamese() throws {
    let m = try #require(meals("toi an com ga va canh chua", hour: 19).first)
    #expect(m.slot == "dinner")
    #expect(m.foods.map(\.name) == ["com ga", "canh chua"])
  }

  @Test func englishMeal() throws {
    let m = try #require(meals("had 2 eggs and a slice of toast for breakfast").first)
    #expect(m.slot == "breakfast")
    #expect(m.foods == [.init(name: "eggs", servings: 2), .init(name: "toast", unit: "slice")])
  }

  @Test func spanishMeal() throws {
    let m = try #require(meals("desayuné avena con plátano").first)
    #expect(m.slot == "breakfast")
    #expect(m.foods.map(\.name) == ["avena", "plátano"])
  }

  @Test func slotFromHourWhenUnsaid() {
    #expect(meals("vừa ăn bánh mì", hour: 8).first?.slot == "breakfast")
    #expect(meals("vừa ăn bánh mì", hour: 12).first?.slot == "lunch")
    #expect(meals("vừa ăn bánh mì", hour: 16).first?.slot == "snack")
    #expect(meals("vừa ăn bánh mì", hour: 20).first?.slot == "dinner")
  }

  @Test func twoMealsInOneMessage() {
    let ms = meals("sáng ăn phở, trưa ăn cơm tấm")
    #expect(ms.map(\.slot) == ["breakfast", "lunch"])
    #expect(ms.map { $0.foods.map(\.name) } == [["phở"], ["cơm tấm"]])
  }

  @Test func foodListAfterMealClauseJoinsIt() {
    let ms = meals("trưa nay ăn cơm. thêm canh rau và trứng chiên")
    #expect(ms.count == 1)
    #expect(ms.first?.foods.map(\.name) == ["cơm", "canh rau", "trứng chiên"])
  }

  // MARK: cả câu

  @Test func wholeDayInOneSentence() {
    let r = SpokenLog.parse("tối qua ngủ 7 tiếng, sáng ăn bánh mì trứng, uống 2 ly nước rồi đi tập gym 1 tiếng, cân 68,2kg", hour: 11)
    #expect(r.items.count == 5)
    #expect(r.items.contains(.sleep(.init(minutes: 420))))
    #expect(r.items.contains(.water(ml: 500)))
    #expect(r.items.contains(.workout(.init(kind: .gym, minutes: 60))))
    #expect(r.items.contains(.weight(kg: 68.2)))
    #expect(r.items.contains(.meal(.init(slot: "breakfast", foods: [.init(name: "bánh mì trứng")]))))
    #expect(r.unparsed.isEmpty)
  }

  @Test func englishWholeDay() {
    let r = SpokenLog.parse("Slept 8 hours, had oatmeal for breakfast, drank 2 liters of water and ran 30 minutes", hour: 18)
    #expect(r.items.contains(.sleep(.init(minutes: 480))))
    #expect(r.items.contains(.water(ml: 2000)))
    #expect(r.items.contains(.workout(.init(kind: .run, minutes: 30))))
    #expect(r.items.contains(.meal(.init(slot: "breakfast", foods: [.init(name: "oatmeal")]))))
  }

  @Test func spanishWholeDay() {
    let r = SpokenLog.parse("Dormí 7 horas, bebí 1 litro de agua y corrí 25 minutos", hour: 10)
    #expect(r.items == [.sleep(.init(minutes: 420)), .water(ml: 1000), .workout(.init(kind: .run, minutes: 25))])
  }

  @Test func yesterdayIsNotLoggedToday() {
    let r = SpokenLog.parse("hôm qua ăn phở, hôm nay uống 1 lít nước", hour: 10)
    #expect(r.items == [.water(ml: 1000)])
    #expect(r.otherDay == ["hôm qua ăn phở"])
  }

  @Test func questionLogsNothing() {
    #expect(SpokenLog.parse("hôm nay tôi ăn phở được không?", hour: 9).items.isEmpty)
    #expect(SpokenLog.parse("how much water should I drink?", hour: 9).items.isEmpty)
    #expect(SpokenLog.parse("¿qué debo comer?", hour: 9).items.isEmpty)
  }

  @Test func gibberishIsReportedNotGuessed() {
    let r = SpokenLog.parse("asdf qwerty", hour: 9)
    #expect(r.items.isEmpty)
    #expect(r.unparsed == ["asdf qwerty"])
  }

  @Test func emptyText() {
    #expect(SpokenLog.parse("   ", hour: 9) == SpokenLog.Result())
  }
}

/// Giọng nói thường ra cả câu không dấu chấm phẩy.
@Suite struct SpokenLogVoiceTests {
  @Test func vietnameseRunOn() {
    let r = SpokenLog.parse("tối qua ngủ 7 tiếng sáng nay ăn phở bò uống 2 ly nước trưa ăn cơm gà chiều chạy bộ 30 phút", hour: 18)
    #expect(r.items.contains(.sleep(.init(minutes: 420))))
    #expect(r.items.contains(.water(ml: 500)))
    #expect(r.items.contains(.workout(.init(kind: .run, minutes: 30))))
    #expect(r.items.contains(.meal(.init(slot: "breakfast", foods: [.init(name: "phở bò")]))))
    #expect(r.items.contains(.meal(.init(slot: "lunch", foods: [.init(name: "cơm gà")]))))
    #expect(r.unparsed.isEmpty)
  }

  @Test func englishRunOn() {
    let r = SpokenLog.parse("I slept 8 hours drank 1 liter of water ate a banana and ran 20 minutes", hour: 9)
    #expect(r.items.contains(.sleep(.init(minutes: 480))))
    #expect(r.items.contains(.water(ml: 1000)))
    #expect(r.items.contains(.workout(.init(kind: .run, minutes: 20))))
    #expect(r.items.contains(.meal(.init(slot: "breakfast", foods: [.init(name: "banana")]))))
  }

  @Test func spanishRunOn() {
    let r = SpokenLog.parse("dormí 7 horas bebí 2 vasos de agua y comí arroz con pollo", hour: 13)
    #expect(r.items.contains(.sleep(.init(minutes: 420))))
    #expect(r.items.contains(.water(ml: 500)))
    #expect(r.items.contains(.meal(.init(slot: "lunch", foods: [.init(name: "arroz"), .init(name: "pollo")]))))
  }

  @Test func sleepSpanStaysTogether() {
    let r = SpokenLog.parse("đi ngủ lúc 11 giờ tối dậy lúc 6 giờ sáng", hour: 8)
    #expect(r.items == [.sleep(.init(minutes: 420, bed: .init(hour: 23, minute: 0), wake: .init(hour: 6, minute: 0)))])
  }

  @Test func eatAndDrinkSameMeal() {
    let r = SpokenLog.parse("sáng ăn bánh mì uống cà phê sữa", hour: 8)
    #expect(r.items == [.meal(.init(slot: "breakfast", foods: [.init(name: "bánh mì"), .init(name: "cà phê sữa")]))])
  }
}

/// Không chắc thì hỏi lại (chủ dự án, 18/10).
@Suite struct SpokenLogDoubtTests {
  func doubts(_ s: String, hour: Int = 9) -> [SpokenLog.Doubt] { SpokenLog.parse(s, hour: hour).doubts }

  @Test func clearStoryHasNoDoubts() {
    #expect(doubts("tối qua ngủ 7 tiếng, sáng ăn phở, uống 2 lít nước, chạy 30 phút").isEmpty)
    #expect(doubts("slept 8 hours and had eggs for breakfast").isEmpty)
    #expect(doubts("dormí 7 horas y bebí un litro de agua").isEmpty)
  }

  @Test func waterWithoutAmount() { #expect(doubts("uống nước rồi") == [.waterAmount]) }
  @Test func mealSlotGuessed() {
    #expect(doubts("vừa ăn bánh mì", hour: 16) == [.mealSlot(guess: "snack")])
    #expect(doubts("just ate a sandwich", hour: 13) == [.mealSlot(guess: "lunch")])
  }
  @Test func onlyBedTime() { #expect(doubts("tối qua đi ngủ lúc 11 giờ") == [.sleepHalf]) }
  @Test func hoursOrClock() { #expect(doubts("ngủ 7 giờ") == [.sleepHoursOrClock(hours: 7)]) }
  @Test func workoutWithoutMinutes() { #expect(doubts("hôm nay đi tập rồi") == [.workoutMinutes]) }
  @Test func storyWithAQuestion() {
    #expect(doubts("sáng ăn phở. ăn vậy có đủ đạm không?").contains(.mixedQuestion))
  }
}

/// "Ghi hôm nay" đọc bằng AI (19/10): JSON của `ai-log-parse` → `Result`.
struct SpokenLogAITests {
  static func json(_ s: String) -> JSONValue { try! JSONDecoder().decode(JSONValue.self, from: Data(s.utf8)) }

  @Test func turnsAIItemsIntoTheSameResult() throws {
    let r = try #require(SpokenLog.fromAI(Self.json("""
      {"items":[
        {"type":"sleep","bed":"02:00","wake":"08:00","minutes":480},
        {"type":"water","ml":null},
        {"type":"meal","slot":"dinner","foods":[{"name":"Lẩu","servings":1,"unit":null,"grams":null}]},
        {"type":"meal","slot":null,"foods":[{"name":"bún bò","servings":1,"unit":"tô","grams":null}]},
        {"type":"weight","kg":900},
        {"type":"workout","kind":"walk","minutes":null}
      ],"otherDay":["hôm qua ngủ muộn"],"unclear":[]}
      """), hour: 12))
    #expect(r.items.first == .sleep(SpokenLog.Sleep(minutes: 360, bed: .init(hour: 2, minute: 0), wake: .init(hour: 8, minute: 0))))
    #expect(r.items.contains(.water(ml: nil)))
    #expect(r.items.contains(.meal(SpokenLog.Meal(slot: "dinner", foods: [SpokenLog.Food(name: "lẩu")]))))
    #expect(r.items.contains(.meal(SpokenLog.Meal(slot: "lunch", foods: [SpokenLog.Food(name: "bún bò", unit: "tô")]))))
    #expect(!r.items.contains { if case .weight = $0 { true } else { false } }, "900 kg bị bỏ")
    #expect(r.doubts.contains(.waterAmount) && r.doubts.contains(.mealSlot(guess: "lunch")) && r.doubts.contains(.workoutMinutes))
    #expect(r.otherDay == ["hôm qua ngủ muộn"])
  }

  @Test func shortcutsAreKept() throws {
    let r = try #require(SpokenLog.fromAI(Self.json(#"{"items":[{"type":"meals_like_yesterday"},{"type":"workout_as_planned"}]}"#), hour: 12))
    #expect(r.items.isEmpty && r.shortcuts == [.mealsLikeYesterday, .workoutAsPlanned])
  }

  @Test func unreadableIsNil() {
    #expect(SpokenLog.fromAI(Self.json(#"{"error":"ai_unavailable"}"#), hour: 12) == nil)
    #expect(SpokenLog.fromAI(Self.json(#"{"items":[]}"#), hour: 12)?.items.isEmpty == true)
  }
}
