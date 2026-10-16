import Foundation

/// Khối "tổng quan" ở đầu câu trả lời của Koa Coach (16/10, chủ dự án: "dùng code
/// để đưa ra câu trả lời tổng quan được biểu thị bằng hình học gọn gàng").
///
/// Model không vẽ — nó chỉ chọn 2–4 con số THẬT từ dữ liệu của người dùng và
/// trả về trong một khối rào ```` ```ascnd ```` chứa JSON; app vẽ bằng code —
/// hình đơn giản một màu như ChatGPT (chủ dự án: "không lấy hình của app"):
/// thanh ngang cho từng chỉ số, cột nhỏ cho xu hướng nhiều ngày. Khối hỏng, thiếu hay sai kiểu thì câu trả lời vẫn là chữ như cũ
/// — không bao giờ hiện JSON thô cho người dùng, kể cả lúc đang stream dở.
public struct CoachOverview: Equatable, Sendable {
  public struct Item: Equatable, Sendable {
    public let label: String
    public let value: Double
    /// Mục tiêu (vòng đầy = đạt). `nil`: chỉ hiện số, vòng trống.
    public let goal: Double?
    public let unit: String
    public let tone: Tone
  }

  /// Màu theo loại số liệu — cùng bảng màu với các thẻ của app.
  public enum Tone: String, Sendable {
    case readiness, sleep, meal, protein, water, steps, workout, other
  }

  /// Một điểm của xu hướng (một ngày).
  public struct Point: Equatable, Sendable {
    public let label: String
    public let value: Double
  }

  public struct Trend: Equatable, Sendable {
    public let label: String
    public let unit: String
    public let points: [Point]
  }

  public let title: String?
  public let items: [Item]
  public let trend: Trend?

  /// Tối đa bốn dòng: nhiều hơn là một bảng, không còn là "tổng quan".
  public static let maxItems = 4
  /// Tối đa 14 cột (hai tuần) — hẹp hơn là không đọc được trên điện thoại.
  public static let maxPoints = 14

  /// Tách khối khỏi câu trả lời. `text` là phần còn lại để vẽ markdown.
  public static func split(_ message: String) -> (overview: CoachOverview?, text: String) {
    // Model nhẹ đôi khi rào bằng ```json — chỉ nhận khi ngay sau là JSON có
    // "items" / "trend", để một khối code JSON thật trong câu trả lời không bị nuốt.
    let open: Range<String.Index>
    if let r = message.range(of: "```ascnd") {
      open = r
    } else if let r = message.range(of: "```json"),
      message[r.upperBound...].prefix(80).contains(where: { $0 == "{" }),
      message[r.upperBound...].prefix(120).range(of: #""(items|trend)""#, options: .regularExpression) != nil
    {
      open = r
    } else {
      return (nil, message)
    }
    let before = String(message[..<open.lowerBound])
    let rest = message[open.upperBound...]
    // Đang stream, chưa đóng rào: giấu phần dở, chưa vẽ gì.
    guard let close = rest.range(of: "```") else {
      return (nil, before.trimmingCharacters(in: .whitespacesAndNewlines))
    }
    let body = String(rest[..<close.lowerBound])
    let after = String(rest[close.upperBound...])
    let text = (before + after).trimmingCharacters(in: .whitespacesAndNewlines)
    return (parse(body), text)
  }

  static func parse(_ json: String) -> CoachOverview? {
    guard let data = json.data(using: .utf8),
      let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return nil }
    let raw = root["items"] as? [[String: Any]] ?? []
    let items = raw.compactMap { d -> Item? in
      guard let label = (d["label"] as? String)?.trimmingCharacters(in: .whitespaces), !label.isEmpty,
        let value = number(d["value"]), value.isFinite, value >= 0
      else { return nil }
      let goal = number(d["goal"]).flatMap { $0.isFinite && $0 > 0 ? $0 : nil }
      return Item(
        label: String(label.prefix(24)), value: value, goal: goal,
        unit: String(((d["unit"] as? String) ?? "").prefix(8)),
        tone: Tone(rawValue: (d["tone"] as? String) ?? "") ?? .other)
    }
    let trend = (root["trend"] as? [String: Any]).flatMap(parseTrend)
    guard !items.isEmpty || trend != nil else { return nil }
    let title = (root["title"] as? String).map { String($0.trimmingCharacters(in: .whitespaces).prefix(40)) }
    return CoachOverview(
      title: title?.isEmpty == false ? title : nil, items: Array(items.prefix(maxItems)), trend: trend)
  }

  static func parseTrend(_ d: [String: Any]) -> Trend? {
    let points = (d["points"] as? [[String: Any]] ?? []).compactMap { p -> Point? in
      guard let label = (p["label"] as? String)?.trimmingCharacters(in: .whitespaces), !label.isEmpty,
        let value = number(p["value"]), value.isFinite, value >= 0
      else { return nil }
      return Point(label: String(label.prefix(6)), value: value)
    }
    // Một cột không phải xu hướng.
    guard points.count >= 2 else { return nil }
    return Trend(
      label: String(((d["label"] as? String) ?? "").prefix(24)),
      unit: String(((d["unit"] as? String) ?? "").prefix(8)),
      points: Array(points.suffix(maxPoints)))
  }

  private static func number(_ any: Any?) -> Double? {
    switch any {
    case let n as NSNumber where CFGetTypeID(n) != CFBooleanGetTypeID(): n.doubleValue
    case let s as String: Double(s)
    default: nil
    }
  }
}

extension CoachOverview {
  /// Số hiển thị: nguyên nếu tròn (hoặc từ 100 trở lên), một chữ số thập phân nếu không.
  public static func format(_ v: Double) -> String {
    v.rounded() == v || v >= 100 ? String(Int(v.rounded())) : String(format: "%.1f", v)
  }
}

extension CoachOverview.Item {
  /// 0…1 cho vòng; vượt mục tiêu vẫn là vòng đầy.
  public var progress: Double? {
    guard let goal else { return nil }
    return min(max(value / goal, 0), 1)
  }

  public var valueText: String { CoachOverview.format(value) }
  public var goalText: String? { goal.map(CoachOverview.format) }
}
