import Foundation

/// Đối chiếu khối tổng quan model trả về với số thật của hôm nay (16/10, chủ dự
/// án: "tránh đưa ra thông tin không chính xác"). Model nhẹ có lúc đặt mục tiêu
/// vào chỗ giá trị, hay đem trung bình 7 ngày so với mục tiêu MỘT ngày
/// ("Đạm 7 ngày 6.9 / 121 g") — hình vẽ ra trông chắc chắn mà sai.
///
/// Luật:
/// - Chỉ số của hôm nay có số thật (calo, đạm, sẵn sàng, bước, giấc ngủ): giá trị
///   lệch quá 10 % → bỏ dòng; mục tiêu lệch → thay bằng mục tiêu thật.
/// - Dòng nói về nhiều ngày / trung bình: không kiểm được giá trị, nhưng bỏ thanh
///   mục tiêu (không so trung bình với mục tiêu một ngày).
/// - Chỉ số app không có (nước, buổi tập, khác): giữ nguyên.
/// - Xu hướng nhiều ngày: giữ nguyên (không có số để đối chiếu ở đây).
extension CoachOverview {
  public func checked(against s: AssistantSuggestions.Signal) -> CoachOverview? {
    let kept = items.compactMap { $0.checked(against: s) }
    guard !kept.isEmpty || trend != nil else { return nil }
    return CoachOverview(title: title, items: kept, trend: trend)
  }

  /// Câu trả lời với khối tổng quan đã đối chiếu (viết lại khối, hoặc bỏ hẳn nếu
  /// không còn dòng nào đúng). Không có khối → trả nguyên văn.
  public static func sanitize(_ message: String, against s: AssistantSuggestions.Signal) -> String {
    let (overview, text) = split(message)
    guard let overview else { return message }
    guard let good = overview.checked(against: s) else { return text }
    return "```ascnd\n\(good.json)\n```\n\(text)"
  }

  /// JSON cùng định dạng model trả về (để lưu lại sau khi đối chiếu).
  public var json: String {
    func str(_ s: String) -> String {
      let data = (try? JSONSerialization.data(withJSONObject: [s])) ?? Data("[\"\"]".utf8)
      return String(String(decoding: data, as: UTF8.self).dropFirst().dropLast())
    }
    func num(_ v: Double) -> String { v.rounded() == v ? String(Int(v)) : String(v) }
    var parts: [String] = []
    if let title { parts.append("\"title\":\(str(title))") }
    if !items.isEmpty {
      let list = items.map { i in
        var f = ["\"label\":\(str(i.label))", "\"value\":\(num(i.value))"]
        if let g = i.goal { f.append("\"goal\":\(num(g))") }
        f.append("\"unit\":\(str(i.unit))")
        f.append("\"tone\":\(str(i.tone.rawValue))")
        return "{\(f.joined(separator: ","))}"
      }
      parts.append("\"items\":[\(list.joined(separator: ","))]")
    }
    if let trend {
      let pts = trend.points.map { "{\"label\":\(str($0.label)),\"value\":\(num($0.value))}" }
      parts.append(
        "\"trend\":{\"label\":\(str(trend.label)),\"unit\":\(str(trend.unit)),\"points\":[\(pts.joined(separator: ","))]}")
    }
    return "{\(parts.joined(separator: ","))}"
  }
}

extension CoachOverview.Item {
  /// Từ chỉ nhiều ngày / trung bình trong nhãn (đã bỏ dấu).
  static let multiDay = [
    "7 ngay", "tuan", "trung binh", "thang", "gan day", "week", "weekly", "avg", "average", "month", "semana",
    "promedio", "mes",
  ]

  func checked(against s: AssistantSuggestions.Signal) -> Self? {
    let folded = CoachQuickReply.fold(label)
    if Self.multiDay.contains(where: { folded.contains($0) }) {
      return Self(label: label, value: value, goal: nil, unit: unit, tone: tone)
    }
    func close(_ a: Double, _ b: Double) -> Bool { abs(a - b) <= max(1, 0.1 * max(abs(a), abs(b))) }
    let actual: Double?, target: Double?
    switch tone {
    case .meal: (actual, target) = (s.kcal, s.kcalTarget)
    case .protein: (actual, target) = (s.proteinG, s.proteinTarget)
    case .readiness: (actual, target) = (s.readiness.map(Double.init), 100)
    case .steps: (actual, target) = (s.steps > 0 ? s.steps : nil, nil)
    case .sleep:
      guard s.sleepMin > 0 else { return nil }
      // Giờ (7.3) hay phút (440): đối chiếu theo đơn vị model dùng.
      let minutes = value > 24 || CoachQuickReply.fold(unit).hasPrefix("m")
      (actual, target) = (minutes ? s.sleepMin : s.sleepMin / 60, nil)
    case .water, .workout, .other: return self
    }
    // Chưa có số thật mà model vẫn đưa số → không tin được.
    guard let actual, close(value, actual) else { return nil }
    var goal = goal
    if let target {
      if let g = goal, !close(g, target) { goal = target }
    } else {
      goal = nil
    }
    return Self(label: label, value: value, goal: goal, unit: unit, tone: tone)
  }
}
