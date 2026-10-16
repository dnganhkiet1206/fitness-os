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

  /// Một chỉ số nằm ở vùng nào (ACWR 3.43 trong vùng an toàn 0.8–1.3…).
  public struct Gauge: Equatable, Sendable {
    public struct Zone: Equatable, Sendable {
      public let from: Double
      public let to: Double
      public let label: String
    }
    public let label: String
    public let value: Double
    public let min: Double
    public let max: Double
    public let unit: String
    public let zones: [Zone]
  }

  /// Các phần của một tổng (đạm / carb / béo…).
  public struct Split: Equatable, Sendable {
    public struct Part: Equatable, Sendable {
      public let label: String
      public let value: Double
    }
    public let label: String
    public let unit: String
    public let parts: [Part]
  }

  /// Kế hoạch / cách làm theo bước.
  public struct Step: Equatable, Sendable {
    public let title: String
    public let detail: String
  }

  public let title: String?
  public let items: [Item]
  public let trend: Trend?
  public var gauge: Gauge? = nil
  public var split: Split? = nil
  public var steps: [Step] = []

  public init(
    title: String?, items: [Item], trend: Trend?, gauge: Gauge? = nil, split: Split? = nil, steps: [Step] = []
  ) {
    self.title = title
    self.items = items
    self.trend = trend
    self.gauge = gauge
    self.split = split
    self.steps = steps
  }

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

  /// Số trong JSON: số hoặc chuỗi số. `true` / `false` không phải số — giải mã
  /// bằng `JSONDecoder` (không ép kiểu Bool → số như `JSONSerialization` + NSNumber,
  /// và chạy được trên Linux, nơi không có `CFGetTypeID`).
  struct Number: Decodable {
    let value: Double?
    init(from decoder: any Decoder) throws {
      let c = try decoder.singleValueContainer()
      if let d = try? c.decode(Double.self) {
        value = d
      } else if let s = try? c.decode(String.self) {
        value = Double(s)
      } else {
        value = nil
      }
    }
  }

  struct RawItem: Decodable {
    let label: String?, value: Number?, goal: Number?, unit: String?, tone: String?
  }

  struct RawPoint: Decodable {
    let label: String?, value: Number?
  }

  struct RawTrend: Decodable {
    let label: String?, unit: String?, points: [Lenient<RawPoint>]?
  }

  struct RawZone: Decodable { let from: Number?, to: Number?, label: String? }
  struct RawGauge: Decodable {
    let label: String?, value: Number?, min: Number?, max: Number?, unit: String?, zones: [Lenient<RawZone>]?
  }
  struct RawPart: Decodable { let label: String?, value: Number? }
  struct RawSplit: Decodable { let label: String?, unit: String?, parts: [Lenient<RawPart>]? }
  struct RawStep: Decodable { let title: String?, detail: String? }

  struct Raw: Decodable {
    let gauge: RawGauge?
    let split: RawSplit?
    let steps: [Lenient<RawStep>]?
    let title: String?, items: [Lenient<RawItem>]?, trend: RawTrend?
  }

  /// Một phần tử hỏng không làm hỏng cả mảng.
  struct Lenient<T: Decodable>: Decodable {
    let value: T?
    init(from decoder: any Decoder) throws { value = try? T(from: decoder) }
  }

  static func parse(_ json: String) -> CoachOverview? {
    guard let data = json.data(using: .utf8), let root = try? JSONDecoder().decode(Raw.self, from: data)
    else { return nil }
    let items = (root.items ?? []).compactMap(\.value).compactMap { d -> Item? in
      guard let label = d.label?.trimmingCharacters(in: .whitespaces), !label.isEmpty,
        let value = d.value?.value, value.isFinite, value >= 0
      else { return nil }
      let goal = d.goal?.value.flatMap { $0.isFinite && $0 > 0 ? $0 : nil }
      return Item(
        label: String(label.prefix(24)), value: value, goal: goal,
        unit: String((d.unit ?? "").prefix(8)),
        tone: Tone(rawValue: d.tone ?? "") ?? .other)
    }
    let trend = root.trend.flatMap(parseTrend)
    let gauge = root.gauge.flatMap(parseGauge)
    let split = root.split.flatMap(parseSplit)
    let steps = (root.steps ?? []).compactMap(\.value).compactMap { r -> Step? in
      guard let t = r.title?.trimmingCharacters(in: .whitespaces), !t.isEmpty else { return nil }
      return Step(title: String(t.prefix(60)), detail: String((r.detail ?? "").prefix(140)))
    }.prefix(5)
    guard !items.isEmpty || trend != nil || gauge != nil || split != nil || !steps.isEmpty else { return nil }
    let title = root.title.map { String($0.trimmingCharacters(in: .whitespaces).prefix(40)) }
    return CoachOverview(
      title: title?.isEmpty == false ? title : nil, items: Array(items.prefix(maxItems)), trend: trend,
      gauge: gauge, split: split, steps: Array(steps))
  }

  /// Đồng hồ vùng: cần value trong [min, max] và min < max; vùng hỏng bị bỏ.
  static func parseGauge(_ g: RawGauge) -> Gauge? {
    guard let v = g.value?.value, let lo = g.min?.value, let hi = g.max?.value,
      v.isFinite, lo.isFinite, hi.isFinite, lo < hi
    else { return nil }
    let zones = (g.zones ?? []).compactMap(\.value).compactMap { z -> Gauge.Zone? in
      guard let a = z.from?.value, let b = z.to?.value, a < b else { return nil }
      return Gauge.Zone(from: Swift.max(lo, a), to: Swift.min(hi, b), label: String((z.label ?? "").prefix(20)))
    }
    return Gauge(
      label: String((g.label ?? "").prefix(24)), value: Swift.min(Swift.max(v, lo), hi), min: lo, max: hi,
      unit: String((g.unit ?? "").prefix(8)), zones: Array(zones.prefix(4)))
  }

  /// Chia phần: ít nhất hai phần dương.
  static func parseSplit(_ s: RawSplit) -> Split? {
    let parts = (s.parts ?? []).compactMap(\.value).compactMap { p -> Split.Part? in
      guard let l = p.label?.trimmingCharacters(in: .whitespaces), !l.isEmpty, let v = p.value?.value, v.isFinite, v > 0
      else { return nil }
      return Split.Part(label: String(l.prefix(16)), value: v)
    }
    guard parts.count >= 2 else { return nil }
    return Split(label: String((s.label ?? "").prefix(24)), unit: String((s.unit ?? "").prefix(8)), parts: Array(parts.prefix(5)))
  }

  static func parseTrend(_ d: RawTrend) -> Trend? {
    let points = (d.points ?? []).compactMap(\.value).compactMap { p -> Point? in
      guard let label = p.label?.trimmingCharacters(in: .whitespaces), !label.isEmpty,
        let value = p.value?.value, value.isFinite, value >= 0
      else { return nil }
      return Point(label: String(label.prefix(6)), value: value)
    }
    // Một cột không phải xu hướng.
    guard points.count >= 2 else { return nil }
    return Trend(
      label: String((d.label ?? "").prefix(24)),
      unit: String((d.unit ?? "").prefix(8)),
      points: Array(points.suffix(maxPoints)))
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
