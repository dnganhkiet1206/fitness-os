public import Foundation

/// Chữ của nút "Chia sẻ" trên thẻ bài (#527, lát 16) — `shareText` của
/// `workout-post-card.tsx`, `progress-post-card.tsx`, `recipe-post-card.tsx`
/// @ fac9ac2 (đưa cho bảng chia sẻ hệ thống).
///
/// Dòng đầu (đã dịch, đã điền tên / số) do màn truyền vào; phần thân dựng ở đây
/// cùng cách in số với thẻ (`CommunityCard`): tạ theo đơn vị tài khoản, số kiểu
/// JS, kcal / gam làm tròn có nhóm nghìn theo ngôn ngữ app.
public enum CommunityShareText {
  /// `{head}\n\n• Tên — 60 kg × 8` (không tạ: `— 3 × 12`).
  public static func workout(_ w: CommunityPayloads.Workout, head: String, unit: WeightUnit) -> String {
    let body = w.exercises.map { "• \($0.exerciseName) — \(CommunityCard.setText($0, unit: unit))" }
    return "\(head)\n\n\(body.joined(separator: "\n"))"
  }

  /// `{head}\n• Nhãn: đầu → cuối đơn vị` — mỗi ô số liệu của thẻ một dòng.
  public static func progress(head: String, tiles: [(label: String, tile: CommunityCard.Tile)]) -> String {
    let lines = tiles.map { t in
      "• \(t.label): \(CommunityCard.number(t.tile.start)) → \(CommunityCard.number(t.tile.end)) \(t.tile.unit)"
    }
    return ([head] + lines).joined(separator: "\n")
  }

  /// Tên ba macro theo thứ tự đạm · tinh bột · béo.
  public struct MacroLabels: Sendable, Hashable {
    public let protein: String
    public let carbs: String
    public let fat: String

    public init(protein: String, carbs: String, fat: String) {
      self.protein = protein
      self.carbs = carbs
      self.fat = fat
    }
  }

  /// `{head}\n{Đạm 30 g · Tinh bột 40 g · Béo 10 g}\n\n• Nguyên liệu — 120 g`;
  /// nguyên liệu không có gam (hoặc 0 g, `i.grams ?` của JS) chỉ có tên.
  public static func recipe(
    _ r: CommunityPayloads.Recipe, head: String, macros m: MacroLabels, locale: Locale
  ) -> String {
    let g = { (v: Double) in CommunityCard.grouped(v, locale: locale) }
    let macroLine = "\(m.protein) \(g(r.protein)) g · \(m.carbs) \(g(r.carbs)) g · \(m.fat) \(g(r.fat)) g"
    let body = r.ingredients.map { i -> String in
      guard let grams = i.grams, grams != 0 else { return "• \(i.name)" }
      return "• \(i.name) — \(g(grams)) g"
    }
    return "\(head)\n\(macroLine)\n\n\(body.joined(separator: "\n"))"
  }
}
