public import Foundation

/// Tên theo ngôn ngữ của app cho hàng `food_items` / `exercises` có tên 3 thứ tiếng
/// (`name_vi` / `name_en` / `name_es`, migration `20261018120000_food_exercise_library`).
/// Hàng của người dùng và hàng cũ không có các cột ấy → dùng `name` như trước.
public enum FoodNames {
  /// Mã ngôn ngữ đang hiện: vi / en / es (còn lại → en).
  public static var lang: String {
    switch Locale.app.language.languageCode?.identifier {
    case "vi": "vi"
    case "es": "es"
    default: "en"
    }
  }

  /// `name_<lang>` nếu có chữ, không thì `name`.
  public static func pick(_ r: JSONValue, lang: String = FoodNames.lang) -> String? {
    if let s = r["name_\(lang)"]?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty { return s }
    return r["name"]?.stringValue
  }

  /// `portion_<lang>` ("1 tô", "1 bowl").
  public static func portion(_ r: JSONValue, lang: String = FoodNames.lang) -> String? {
    guard let s = r["portion_\(lang)"]?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
    return s
  }

  /// Cột của món có tên 3 thứ tiếng — thêm vào mọi `select` của `food_items`.
  public static let columns = "name_vi, name_en, name_es, portion_vi, portion_en, portion_es, is_estimate"

  /// Chữ tìm cho `search_text` (đã gập ở server): chữ thường, bỏ dấu, đ → d. Bỏ ký
  /// tự có nghĩa trong cú pháp lọc của PostgREST (`,` `(` `)` `*` `%` `\` `"`).
  public static func searchKey(_ text: String) -> String {
    let folded = CoachQuickReply.fold(text)
    let cleaned = folded.unicodeScalars.filter { !",()*%\\\"".unicodeScalars.contains($0) }
    return String(String.UnicodeScalarView(cleaned)).split(whereSeparator: \.isWhitespace).joined(separator: " ")
  }

  /// Chữ gốc cho `name.ilike` — chỉ bỏ ký tự cú pháp, giữ dấu.
  public static func nameKey(_ text: String) -> String {
    let cleaned = text.unicodeScalars.filter { !",()*%\\\"".unicodeScalars.contains($0) }
    return String(String.UnicodeScalarView(cleaned)).trimmingCharacters(in: .whitespacesAndNewlines)
  }
}
