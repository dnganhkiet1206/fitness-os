// Fixture cho native-internal-api.mjs --self-test: một "module" giả.
public enum MealDiary {
  static func jsNumber(_ x: Double) -> String { "" }
  public static func whole(_ x: Double) -> String { "" }
  public static let order = ["breakfast"]
  static let hidden = 1

  public struct Form {
    static func n(_ s: String) -> Double { 0 }
    public static func blank() -> Form { Form() }
  }
}

/// Kiểu internal: app không thấy cả kiểu.
enum JS {
  static func round(_ x: Double) -> Double { x }
}

public enum ReadinessEngine {
  static func jsString(_ x: Double) -> String { "\(x)" }
}

public extension ReadinessEngine {
  /// Thành viên trong `public extension` mặc định là public.
  static func shown() -> Int { 1 }
}
