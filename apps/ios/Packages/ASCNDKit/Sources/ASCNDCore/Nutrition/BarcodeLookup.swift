public import Foundation

/// Tra mã vạch qua Open Food Facts (#527, `scan-barcode`) — `lookupBarcode` của
/// `app/scan-barcode.tsx` @ fac9ac2, port nguyên văn phần đọc trả lời; lời gọi
/// mạng ở app (Core build được trên Linux, không kéo `URLSession`).
///
/// Như RN:
/// - một sản phẩm = MỘT khẩu phần: `serving_quantity`, không có thì
///   `product_quantity`, không có nữa thì 100 g; mọi số `Math.round` theo khẩu
///   phần ấy;
/// - kcal là `energy-kcal_100g`, thiếu thì `energy-kcal`, thiếu nữa thì 0;
/// - tên: bản tiếng Việt (chỉ khi app đang tiếng Việt) → tên chung → tên tiếng
///   Anh → chính mã vạch;
/// - `status` khác 1, không có `product`, HTTP lỗi → không tìm thấy.
///
/// Golden: `barcode-golden.json` sinh từ chính hàm RN (`gen-barcode.mjs`).
public enum BarcodeLookup {
  /// Món đọc được — cùng các trường với `ScannedFood` của `scan-bridge.ts`.
  /// Số là `Double` vì RN để `NaN` đi xuyên (khẩu phần là chuỗi hỏng).
  public struct Food: Sendable, Hashable {
    public let foodName: String
    public let kcal: Double
    public let proteinG: Double
    public let carbsG: Double
    public let fatG: Double
    public let fiberG: Double
    public let servingG: Double
  }

  /// Loại mã camera nhận (`barcodeScannerSettings.barcodeTypes`).
  public static let symbologies = ["ean13", "ean8", "upc_a", "upc_e", "code128"]

  /// `https://world.openfoodfacts.org/api/v2/product/<mã>.json`. Mã chỉ giữ
  /// ký tự an toàn cho đường dẫn (mã vạch là chữ số; Code 128 có thể có chữ).
  public static func url(_ code: String) -> URL? {
    let safe = code.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/?#")))
    guard let safe, !safe.isEmpty else { return nil }
    return URL(string: "https://world.openfoodfacts.org/api/v2/product/\(safe).json")
  }

  /// Đọc trả lời (`res.json()`). `ok == false` (HTTP lỗi) → `nil`.
  ///
  /// `packageAsServing`: `true` = luật RN (thiếu `serving_quantity` thì CẢ GÓI
  /// `product_quantity` là một khẩu phần — golden khoá đúng luật này); `false` =
  /// luật của app native (thiết kế lại 13/10, NATIVE_IMPROVEMENTS): thiếu khẩu
  /// phần thì 100 g — số của nhãn là trên 100 g, cả hũ 400 g Nutella thành một
  /// lần thêm 2.156 kcal là sai cho gần như mọi người.
  public static func parse(
    _ body: JSONValue?, ok: Bool, code: String, lang: String, packageAsServing: Bool = true
  ) -> Food? {
    guard ok, let body else { return nil }
    // `json.status !== 1`: so sánh nghiêm ngặt — chuỗi "1" không phải 1.
    guard case .number(let status)? = body["status"], status == 1 else { return nil }
    guard let p = body["product"], JS.truthyValue(p) else { return nil }
    let n = p["nutriments"].flatMap { JS.truthyValue($0) ? $0 : nil }

    let servingG: Double
    if let sq = p["serving_quantity"], JS.truthyValue(sq) {
      servingG = JS.number(sq)
    } else if packageAsServing, let pq = p["product_quantity"], JS.truthyValue(pq) {
      servingG = JS.number(pq)
    } else {
      servingG = 100
    }
    let factor = servingG / 100

    /// `(a || b || 0) * factor` rồi `Math.round`.
    func per(_ keys: String...) -> Double {
      let v = keys.lazy.compactMap { n?[$0] }.first { JS.truthyValue($0) }
      return JS.round((v.map { JS.number($0) } ?? 0) * factor)
    }

    // Tên tiếng Việt chỉ được xét khi app đang tiếng Việt (`lang === 'vi' ? … : null`).
    var names: [JSONValue?] = [p["product_name"], p["product_name_en"]]
    if lang.hasPrefix("vi") && lang.count == 2 { names.insert(p["product_name_vi"], at: 0) }
    let name = names.lazy.compactMap { $0 }.first { JS.truthyValue($0) }.map(text) ?? code

    return Food(
      foodName: name,
      kcal: per("energy-kcal_100g", "energy-kcal"),
      proteinG: per("proteins_100g"),
      carbsG: per("carbohydrates_100g"),
      fatG: per("fat_100g"),
      fiberG: per("fiber_100g"),
      servingG: servingG)
  }

  /// Một ô "truthy" thành chữ như JS ghép chuỗi (tên gần như luôn là chuỗi).
  private static func text(_ v: JSONValue) -> String {
    switch v {
    case .string(let s): s
    case .number(let x): ReadinessEngine.jsString(x)
    case .bool(let b): b ? "true" : "false"
    default: "\(v)"
    }
  }
}

extension BarcodeLookup.Food {
  /// Thành món tìm được của màn Ghi bữa (`consumePendingScan` của `log-meal.tsx`):
  /// không gắn `food_items` (`food_item_id: null`), một khẩu phần. Số NaN (khẩu
  /// phần là chuỗi hỏng) thành 0 — RN để NaN đi vào bữa; ở đây không ghi NaN.
  public func mealFood(id: String) -> MealLog.Food {
    func n(_ x: Double) -> Double { x.isFinite ? x : 0 }
    return MealLog.Food(
      id: id, foodItemId: nil, name: foodName, kcal: n(kcal), protein: n(proteinG), carbs: n(carbsG), fat: n(fatG),
      fiber: n(fiberG))
  }
}
