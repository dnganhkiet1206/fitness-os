public import Foundation

/// Chữ trên thẻ bài Cộng đồng (#527) — `workout-post-card.tsx`,
/// `progress-post-card.tsx`, `recipe-post-card.tsx`, `useful-this-week.tsx`
/// @ fac9ac2. Số in như JS (`String(n)`), tạ theo đơn vị của tài khoản.
public enum CommunityCard {
  /// Thẻ gọn trên feed hiện ba dòng (bài tập / nguyên liệu).
  public static let previewLines = 3

  /// `String(n)` của JS.
  public static func number(_ v: Double) -> String { ReadinessEngine.jsString(v) }

  /// Dòng bài tập: `60 kg × 8` khi có tạ, không thì `3 × 12`.
  public static func setText(_ l: CommunityPayloads.WorkoutLine, unit: WeightUnit) -> String {
    l.weight > 0
      ? "\(number(unit.display(l.weight))) \(unit.label) × \(number(l.reps))"
      : "\(number(l.sets)) × \(number(l.reps))"
  }

  /// `Math.round(n).toLocaleString(locale)` — số nguyên có nhóm nghìn.
  public static func grouped(_ v: Double, locale: Locale) -> String {
    let f = NumberFormatter()
    f.locale = locale
    f.numberStyle = .decimal
    f.maximumFractionDigits = 0
    return f.string(from: NSNumber(value: JS.round(v))) ?? number(JS.round(v))
  }

  /// Tổng khối lượng buổi tập theo đơn vị tài khoản; `nil` khi 0.
  public static func volumeText(_ kg: Double, unit: WeightUnit, locale: Locale) -> String? {
    kg > 0 ? "\(grouped(unit.display(kg), locale: locale)) \(unit.label)" : nil
  }

  // MARK: - Tiến trình

  public enum MetricKind: Sendable, Hashable { case weight, waist, lift }

  /// Một ô số liệu: đầu → cuối theo đơn vị hiển thị, chênh lệch một chữ số lẻ.
  public struct Tile: Sendable, Hashable {
    public let kind: MetricKind
    /// Tên bài nâng (ô `lift`); hai ô kia dùng nhãn của app.
    public let liftName: String?
    public let unit: String
    public let start: Double
    public let end: Double
    public let series: [Double]

    /// `Math.round((end − start) * 10) / 10`, có dấu `+` khi tăng.
    public var deltaText: String {
      let d = JS.round((end - start) * 10) / 10
      return (d > 0 ? "+" : "") + "\(CommunityCard.number(d)) \(unit)"
    }

    public var startText: String { "\(CommunityCard.number(start)) \(unit)" }
    public var endText: String { "\(CommunityCard.number(end)) \(unit)" }
  }

  /// Ô theo thứ tự cân → eo → bài nâng; ô đầu là dòng "Từ … → …". Vòng eo in
  /// cm (`displayLength`).
  public static func tiles(_ p: CommunityPayloads.Progress, unit: WeightUnit) -> [Tile] {
    let kg = { (v: Double) in unit.display(v) }
    let cm = { (v: Double) in Units.jsRound1(v) }
    var out: [Tile] = []
    if let w = p.weight {
      out.append(Tile(kind: .weight, liftName: nil, unit: unit.label, start: kg(w.start), end: kg(w.end), series: w.series.map(kg)))
    }
    if let w = p.waist {
      out.append(Tile(kind: .waist, liftName: nil, unit: "cm", start: cm(w.start), end: cm(w.end), series: w.series.map(cm)))
    }
    if let l = p.lift, let name = p.liftName {
      out.append(Tile(kind: .lift, liftName: name, unit: unit.label, start: kg(l.start), end: kg(l.end), series: l.series.map(kg)))
    }
    return out
  }

  // MARK: - Hữu ích tuần này

  /// Tiêu đề hàng; `nil` = dùng nhãn chung theo loại bài ("Buổi tập" /
  /// "Công thức" / "Tiến trình").
  public static func usefulTitle(_ p: CommunityFeed.Post) -> String? {
    let firstLine = RepEntry.trimJS(p.caption.split(separator: "\n", omittingEmptySubsequences: false).first.map(String.init) ?? "")
    let own: String? =
      switch p.kind {
      case .workout: p.workout.title.map(RepEntry.trimJS)
      case .recipe: p.recipe?.title
      case .progress: nil
      }
    if let own, !own.isEmpty { return own }
    return firstLine.isEmpty ? nil : firstLine
  }

  public enum Reason: Sendable, Hashable {
    case tries(Int)
    case saves(Int)
    case comments(Int)
    case likes(Int)
  }

  /// Hai tín hiệu mạnh nhất, theo thứ tự trọng số của server.
  public static func reasons(_ p: CommunityFeed.Post) -> [Reason] {
    var out: [Reason] = []
    if let t = p.tries, t > 0 { out.append(.tries(t)) }
    if p.saveCount > 0 { out.append(.saves(p.saveCount)) }
    if p.commentCount > 0 { out.append(.comments(p.commentCount)) }
    if p.likeCount > 0 { out.append(.likes(p.likeCount)) }
    return Array(out.prefix(2))
  }
}
