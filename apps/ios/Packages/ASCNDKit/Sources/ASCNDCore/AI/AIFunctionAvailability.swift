/// Function AI nào đã deploy, theo từng function (`AppServices.probeAI`).
///
/// Trước: một `Bool?` duy nhất, dò chỉ `ai-coach` — coach sập thì mọi lối vào
/// AI ẩn dù function của chính nó vẫn chạy. Nay: mỗi function có một cờ riêng,
/// mỗi lối vào chỉ nhìn cờ của function nó gọi.
///
/// Chỉ các function có lối vào bị ẩn khi chưa deploy mới được dò. Cố tình
/// KHÔNG dò:
/// - `ai-log-parse`: đường ghi bằng câu kể không bị chặn bao giờ — AI hỏng thì
///   luật trên máy vẫn đọc câu, nên không có cờ nào để nhìn.
/// - `body-check`: lối đo không bị ẩn; đo hỏng thì kết quả mang lỗi
///   (`BodyCheck.Outcome.failed`).
/// - `verify-purchase` / `store-webhook` / `delete-account` / `admin-art`:
///   không phải AI, không có lối vào nào nhìn cờ dò.
public struct AIFunctionAvailability: Sendable, Equatable {
  /// Các function được dò lúc mở app — đúng các function có lối vào bị chặn.
  public static let probed: [EdgeFunction.Name] = [
    .coach, .coachMemory, .mealSuggest, .scanFood, .weeklyReview, .smartNudges,
  ]

  /// Cờ đã biết. Vắng = chưa biết (chưa dò / mất mạng): lối vào ẩn như `false`.
  public private(set) var flags: [EdgeFunction.Name: Bool] = [:]

  public init() {}

  /// Function đã deploy chưa. Chưa biết và `false` đều ẩn lối vào.
  public func isDeployed(_ fn: EdgeFunction.Name) -> Bool { flags[fn] == true }

  public mutating func set(_ fn: EdgeFunction.Name, deployed: Bool) { flags[fn] = deployed }

  /// UI test: máy chủ giả trả lời mọi edge function — mọi lối vào hiện.
  public mutating func markAllDeployed() {
    for fn in Self.probed { flags[fn] = true }
  }
}
