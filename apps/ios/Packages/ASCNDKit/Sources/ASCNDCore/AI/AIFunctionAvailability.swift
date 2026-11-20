public import Foundation

/// Function AI nào đã deploy, theo từng function (`AppServices.probeAI`).
///
/// Trước: một `Bool?` duy nhất, dò chỉ `ai-coach` — coach sập thì mọi lối vào
/// AI ẩn dù function của chính nó vẫn chạy. Nay: mỗi function có một trạng thái
/// riêng, mỗi lối vào chỉ nhìn trạng thái của function nó gọi.
///
/// KOA-T08 (audit Koa 17/11): bốn trạng thái thay cho có/không, kèm lúc dò —
/// - `unknown`: chưa dò được (mất mạng lúc mở app): lối vào hiện GIỮ CHỖ có lý do +
///   chạm để dò lại, không biến mất im lặng;
/// - `available`: function có (gateway trả bất kỳ mã nào trừ 404 / 5xx);
/// - `unhealthy`: function có nhưng đang trả 5xx: giữ chỗ "đang trục trặc", không
///   phải một lối vào chết;
/// - `missing`: 404, chưa deploy: ẩn như trước.
/// Đã biết vẫn dò lại khi cũ (`needsProbe`): "có" cũ hơn 30 phút, "trục trặc" /
/// "không có" cũ hơn 2 phút.
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

  public enum State: Sendable, Equatable {
    case unknown, available, unhealthy, missing
  }

  /// "Có" được tin trong 30 phút rồi dò lại (function có thể sập giữa phiên).
  public static let staleAfter: TimeInterval = 30 * 60
  /// "Trục trặc" / "không có" dò lại sau 2 phút — không dội function đang hỏng.
  public static let retryAfter: TimeInterval = 2 * 60

  private var entries: [EdgeFunction.Name: (state: State, at: Date)] = [:]

  public init() {}

  public static func == (a: Self, b: Self) -> Bool {
    a.entries.count == b.entries.count
      && a.entries.allSatisfy { k, v in b.entries[k].map { $0.state == v.state && $0.at == v.at } ?? false }
  }

  public func state(_ fn: EdgeFunction.Name) -> State { entries[fn]?.state ?? .unknown }

  /// Function đã deploy và đang khoẻ: lối vào hiện đầy đủ.
  public func isDeployed(_ fn: EdgeFunction.Name) -> Bool { state(fn) == .available }

  /// Lối vào hiện GIỮ CHỖ (lý do + dò lại) thay vì biến mất: chưa biết hoặc trục trặc.
  public func showsPlaceholder(_ fn: EdgeFunction.Name) -> Bool {
    let s = state(fn)
    return s == .unknown || s == .unhealthy
  }

  /// Mã HTTP của lượt dò (POST `{}` chỉ có apikey) → trạng thái. 401/403/400/429…
  /// nghĩa là function có và từ chối lượt dò — đó là "có".
  public static func state(forStatus status: Int) -> State {
    if status == 404 { return .missing }
    if (500..<600).contains(status) { return .unhealthy }
    return .available
  }

  /// Ghi kết quả một lượt dò. `status == nil` (mất mạng / hết giờ): "có" đã biết thì
  /// giữ (một lần rớt mạng không ẩn lối vào), còn lại là "chưa biết".
  public mutating func record(_ fn: EdgeFunction.Name, status: Int?, at now: Date) {
    if let status {
      entries[fn] = (Self.state(forStatus: status), now)
    } else if state(fn) != .available {
      entries[fn] = (.unknown, now)
    }
  }

  /// Cần dò (lại) chưa.
  public func needsProbe(_ fn: EdgeFunction.Name, now: Date) -> Bool {
    guard let e = entries[fn] else { return true }
    switch e.state {
    case .unknown: return true
    case .available: return now.timeIntervalSince(e.at) > Self.staleAfter
    case .unhealthy, .missing: return now.timeIntervalSince(e.at) > Self.retryAfter
    }
  }

  public mutating func set(_ fn: EdgeFunction.Name, deployed: Bool, at now: Date = Date()) {
    entries[fn] = (deployed ? .available : .missing, now)
  }

  /// UI test: máy chủ giả trả lời mọi edge function — mọi lối vào hiện.
  public mutating func markAllDeployed(at now: Date = Date()) {
    for fn in Self.probed { entries[fn] = (.available, now) }
  }
}
