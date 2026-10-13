public import Foundation

/// Hai tính năng AI của Dinh dưỡng (#527, chủ dự án bật 13/10) — `scan-food`
/// (`app/scan-food.tsx`) và `ai-meal-suggest` (`components/ascnd/ai-meal-suggest.tsx`)
/// @ fac9ac2. Core chỉ dựng thân yêu cầu và đọc trả lời; lời gọi qua `EdgeCaller`.
public enum AIFood {
  // MARK: - Chụp món

  /// `ScanMode` của RN (hàm nhận thêm "barcode", app không dùng).
  public enum ScanMode: String, Sendable, Hashable, CaseIterable { case food, label }

  /// `MAX_IMAGE_CHARS` của `scan-food`: base64 dài hơn thì hàm từ chối (413).
  public static let maxImageChars = 4_000_000

  /// Thân yêu cầu `scan-food`: `{ image_base64, lang, mode }`.
  public static func scanBody(imageBase64: String, lang: String, mode: ScanMode) -> [String: JSONValue] {
    ["image_base64": .string(imageBase64), "lang": .string(lang), "mode": .string(mode.rawValue)]
  }

  /// Một món AI thấy — số của MỘT khẩu phần như `ScannedFood`.
  public struct ScannedItem: Sendable, Hashable, Identifiable {
    public var id: String
    public var name: String
    public var kcal: Double
    public var protein: Double
    public var carbs: Double
    public var fat: Double
    public var fiber: Double
    public var servingG: Double

    public init(
      id: String, name: String, kcal: Double, protein: Double, carbs: Double, fat: Double, fiber: Double = 0,
      servingG: Double = 0
    ) {
      self.id = id
      self.name = name
      self.kcal = kcal
      self.protein = protein
      self.carbs = carbs
      self.fat = fat
      self.fiber = fiber
      self.servingG = servingG
    }

    /// Thành món tìm được của màn Ghi bữa (không gắn `food_items`).
    public func mealFood() -> MealLog.Food {
      MealLog.Food(id: id, foodItemId: nil, name: name, kcal: kcal, protein: protein, carbs: carbs, fat: fat, fiber: fiber)
    }
  }

  /// `normalize` + `.filter(kcal > 0)` của RN: mọi số `Math.round(x || 0)`;
  /// món không có tên bị bỏ (RN giữ tên rỗng — một hàng không tên trong nhật ký
  /// không giúp được ai).
  public static func scannedItems(_ body: JSONValue?, makeId: () -> String = { UUID().uuidString.lowercased() })
    -> [ScannedItem]
  {
    guard case .array(let rows)? = body?["items"] else { return [] }
    return rows.compactMap { r -> ScannedItem? in
      let name = (r["food_name"]?.stringValue ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      let kcal = rounded(r["kcal"])
      guard !name.isEmpty, kcal > 0 else { return nil }
      return ScannedItem(
        id: makeId(), name: name, kcal: kcal, protein: rounded(r["protein_g"]), carbs: rounded(r["carbs_g"]),
        fat: rounded(r["fat_g"]), fiber: rounded(r["fiber_g"]), servingG: rounded(r["serving_g"]))
    }
  }

  // MARK: - Gợi ý món

  /// `meal_type` gửi đi: sáu bữa của nhật ký, còn lại "any".
  public static func suggestBody(mealType: String?, lang: String, date: LocalDate, tzOffsetMinutes: Int)
    -> [String: JSONValue]
  {
    let meal = mealType.flatMap { MealDiary.order.contains($0) ? $0 : nil } ?? "any"
    return [
      "meal_type": .string(meal), "lang": .string(lang), "date": .string(date.description),
      "tzOffset": .number(Double(tzOffsetMinutes)),
    ]
  }

  /// Một gợi ý (`MealSuggestion`).
  public struct Suggestion: Sendable, Hashable, Identifiable {
    public let id: Int
    public let name: String
    public let description: String
    public let kcal: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double
    public let ingredients: [String]
    public let prepMinutes: Int?

    /// Thêm vào bữa như một món tự nhập, một khẩu phần (native: RN chỉ cho xem).
    public func mealFood(id: String) -> MealLog.Food {
      MealLog.Food(id: id, foodItemId: nil, name: name, kcal: kcal, protein: protein, carbs: carbs, fat: fat, fiber: 0)
    }
  }

  /// `suggestions` của trả lời; gợi ý thiếu tên hoặc kcal ≤ 0 bị bỏ.
  public static func suggestions(_ body: JSONValue?) -> [Suggestion] {
    guard case .array(let rows)? = body?["suggestions"] else { return [] }
    var out: [Suggestion] = []
    for r in rows {
      let name = (r["name"]?.stringValue ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      let kcal = rounded(r["kcal"])
      guard !name.isEmpty, kcal > 0 else { continue }
      var ingredients: [String] = []
      if case .array(let xs)? = r["ingredients"] {
        ingredients = xs.compactMap { $0.stringValue?.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
      }
      let prep = rounded(r["prep_time_min"])
      out.append(
        Suggestion(
          id: out.count, name: name, description: r["description"]?.stringValue ?? "", kcal: kcal,
          protein: rounded(r["protein_g"]), carbs: rounded(r["carbs_g"]), fat: rounded(r["fat_g"]),
          ingredients: ingredients, prepMinutes: prep > 0 ? Int(prep) : nil))
    }
    return out
  }

  /// `Math.round(x || 0)`; số âm / hỏng thành 0.
  static func rounded(_ v: JSONValue?) -> Double {
    let x = JS.number(v)
    guard x.isFinite, x > 0 else { return 0 }
    return JS.round(x)
  }
}
