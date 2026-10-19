public import Foundation

/// Khớp tên món người dùng KỂ ("phở bò", "2 eggs") với món có thật trong thư
/// viện / món gần đây (18/10, "Kể cho Koa"). Chỉ nhận khi chắc: thà để người
/// dùng tự chọn còn hơn ghi nhầm "phở gà" thành "phở bò".
public enum FoodMatch {
  /// Mức chắc của một lần khớp.
  public enum Confidence: Int, Comparable, Sendable {
    /// Cùng tên (bỏ dấu, hoa thường, khoảng trắng).
    case exact = 3
    /// Tên trong thư viện là tên kể cộng phần mô tả ("Trứng gà" ⊃ "trứng"
    /// mà tên kể là một từ đầy đủ của nó), hoặc ngược lại chỉ khác số nhiều.
    case strong = 2

    public static func < (a: Self, b: Self) -> Bool { a.rawValue < b.rawValue }
  }

  /// Món tốt nhất cho `spoken` trong `candidates` (thứ tự = ưu tiên: món gần
  /// đây trước, thư viện sau). `nil` khi không có món nào đủ chắc.
  public static func best(_ spoken: String, in candidates: [MealLog.Food]) -> (food: MealLog.Food, confidence: Confidence)? {
    let want = words(spoken)
    guard !want.isEmpty else { return nil }
    var best: (MealLog.Food, Confidence)?
    for food in candidates {
      guard let c = confidence(want, words(food.name)) else { continue }
      if best == nil || c > best!.1 { best = (food, c) }
      if c == .exact { break }
    }
    return best.map { ($0.0, $0.1) }
  }

  static func confidence(_ want: [String], _ have: [String]) -> Confidence? {
    if want == have || singular(want) == singular(have) { return .exact }
    // Tên thư viện có đủ mọi từ đã kể, theo đúng thứ tự, thêm tối đa 1 từ mô tả
    // ("trứng" → "trứng gà", "toast" → "white toast"), và tên kể ≥ 1 từ có nghĩa.
    let w = singular(want), h = singular(have)
    if h.count - w.count == 1, isSubsequence(w, of: h), w.joined().count >= 3 { return .strong }
    return nil
  }

  static func isSubsequence(_ a: [String], of b: [String]) -> Bool {
    var i = 0
    for x in b where i < a.count && x == a[i] { i += 1 }
    return i == a.count
  }

  /// "eggs" → "egg", "huevos" → "huevo"; tiếng Việt không đổi.
  static func singular(_ ws: [String]) -> [String] {
    ws.map { w in
      if w.count > 3, w.hasSuffix("es"), ["o", "s", "x", "z", "h"].contains(String(w.dropLast(2).suffix(1))) { return String(w.dropLast(2)) }
      if w.count > 3, w.hasSuffix("s"), !w.hasSuffix("ss") { return String(w.dropLast()) }
      return w
    }
  }

  static func words(_ s: String) -> [String] {
    CoachQuickReply.fold(s)
      .components(separatedBy: CharacterSet.alphanumerics.inverted)
      .filter { !$0.isEmpty }
  }
}
