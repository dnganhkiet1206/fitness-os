@testable import ASCNDCore
import Foundation
import Testing

/// Chữ chia sẻ của thẻ bài (lát 16) — cùng khuôn với `shareText` của ba thẻ RN
/// @ fac9ac2: dòng đầu, rồi mỗi bài tập / ô số liệu / nguyên liệu một dòng "• ".
struct CommunityShareTextTests {
  static func json(_ s: String) throws -> JSONValue {
    try JSONDecoder().decode(JSONValue.self, from: Data(s.utf8))
  }

  @Test func workoutLinesUseTheCardsSetText() throws {
    let w = CommunityPayloads.workout(
      try Self.json(
        #"{"title":"Push","exerciseCount":2,"exercises":[{"exerciseName":"Bench","sets":4,"weight":62.5,"reps":8},{"exerciseName":"Dips","sets":3,"weight":0,"reps":12}]}"#
      ))
    #expect(
      CommunityShareText.workout(w, head: "Push trên ASCND — 2 bài tập", unit: .kg)
        == "Push trên ASCND — 2 bài tập\n\n• Bench — 62.5 kg × 8\n• Dips — 3 × 12")
    // tạ theo đơn vị của tài khoản, như thẻ
    let lbs = CommunityShareText.workout(w, head: "h", unit: .lbs)
    #expect(lbs == "h\n\n• Bench — \(CommunityCard.setText(w.exercises[0], unit: .lbs))\n• Dips — 3 × 12")
    #expect(lbs.contains(" lb × 8"))
  }

  @Test func progressOneLinePerTile() throws {
    let p = CommunityPayloads.progress(
      try Self.json(
        #"{"weeks":8,"weight":{"start":82.4,"end":79.1,"series":[]},"waist":{"start":90,"end":86.5,"series":[]}}"#))
    let tiles = CommunityCard.tiles(p, unit: .kg)
    let text = CommunityShareText.progress(
      head: "Tiến trình 8 tuần trên ASCND", tiles: [("Cân nặng", tiles[0]), ("Vòng eo", tiles[1])])
    #expect(text == "Tiến trình 8 tuần trên ASCND\n• Cân nặng: 82.4 → 79.1 kg\n• Vòng eo: 90 → 86.5 cm")
    #expect(CommunityShareText.progress(head: "h", tiles: []) == "h")
  }

  @Test func recipeMacrosAndGrams() throws {
    let r = CommunityPayloads.recipe(
      try Self.json(
        #"{"title":"Bowl","ingredients":[{"name":"Rice","grams":1500,"kcal":520.4,"protein":10.2,"carbs":110.6,"fat":1.4},{"name":"Salt","kcal":0,"protein":0,"carbs":0,"fat":0}]}"#
      ))
    let m = CommunityShareText.MacroLabels(protein: "Protein", carbs: "Carbs", fat: "Fat")
    #expect(
      CommunityShareText.recipe(r, head: "Bowl on ASCND — 520 kcal", macros: m, locale: Locale(identifier: "en_US"))
        == "Bowl on ASCND — 520 kcal\nProtein 10 g · Carbs 111 g · Fat 1 g\n\n• Rice — 1,500 g\n• Salt")
  }
}
