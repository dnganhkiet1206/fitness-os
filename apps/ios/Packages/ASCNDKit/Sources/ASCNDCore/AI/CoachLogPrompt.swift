import Foundation

/// "Tôi ngủ được 7 tiếng" → nút "Ghi 7 giờ ngủ" dưới câu trả lời (16/10, chủ dự
/// án: AI nói "đã ghi nhận" trong khi app chưa lưu gì). App tự nhận ra người dùng
/// KỂ một việc đã làm — ngủ, tập, ăn, uống nước, cân — và chỉ gợi ý ghi khi
/// HÔM NAY chưa có bản ghi đó (chủ dự án: "phải nhận diện là đã log ngày hôm đó
/// chưa"). Không phụ thuộc AI trả lời gì. vi / en / es, có dấu hay không dấu.
///
/// Cố ý hẹp: câu hỏi hay câu nói về mục tiêu ("nên ngủ 8 tiếng?", "mục tiêu 2 lít")
/// không phải lời kể — không gợi ý.
public enum CoachLogPrompt {
  public enum Kind: String, Sendable, CaseIterable, Codable {
    case sleep, workout, meal, water, weight
  }

  public struct Detected: Equatable, Sendable {
    public let kind: Kind
    /// Phút (ngủ / tập), ml (nước), kg (cân); `nil` khi câu không nói số.
    public let value: Double?
    /// Bữa nào (`breakfast` / `lunch` / `dinner` / `snack`) — chỉ cho `.meal`.
    public let meal: String?

    public init(kind: Kind, value: Double? = nil, meal: String? = nil) {
      self.kind = kind
      self.value = value
      self.meal = meal
    }
  }

  /// Hôm nay đã ghi gì (đọc từ `daily_logs`, `meal_entries`, `weight_logs`).
  public struct LoggedToday: Equatable, Sendable {
    /// Phút ngủ của đêm qua (0 = chưa ghi).
    public var sleepMin: Double
    public var workout: Bool
    public var waterMl: Double
    /// Cân hôm nay (`nil` = chưa cân).
    public var weightKg: Double?
    public var meals: Set<String>

    public var sleep: Bool { sleepMin > 0 }
    public var weight: Bool { weightKg != nil }

    public init(sleepMin: Double = 0, workout: Bool = false, waterMl: Double = 0, weightKg: Double? = nil,
                meals: Set<String> = []) {
      self.sleepMin = sleepMin
      self.workout = workout
      self.waterMl = waterMl
      self.weightKg = weightKg
      self.meals = meals
    }
  }

  /// Lời người dùng nói khác số đã ghi hôm nay (16/10, chủ dự án): cả hai số được
  /// gửi cho AI để nó hỏi lại cái nào đúng; chọn số mới → app hỏi có ghi lại không.
  public struct Conflict: Equatable, Sendable, Codable {
    public let kind: Kind
    /// Số đã ghi và số vừa nói — phút (ngủ), ml (nước), kg (cân).
    public let logged: Double
    public let stated: Double

    public init(kind: Kind, logged: Double, stated: Double) {
      self.kind = kind
      self.logged = logged
      self.stated = stated
    }
  }

  public struct Analysis: Equatable, Sendable {
    /// Chưa ghi hôm nay → nút "Ghi …".
    public var suggestions: [Detected] = []
    /// Đã ghi nhưng khác lời kể → AI hỏi lại.
    public var conflicts: [Conflict] = []
  }

  /// Lời kể so với hôm nay: chưa ghi → gợi ý; ghi rồi mà khác → lệch; khớp → không gì.
  public static func analyze(_ text: String, logged: LoggedToday, hour: Int) -> Analysis {
    var a = Analysis()
    for d in detect(text, hour: hour) {
      switch d.kind {
      case .sleep:
        guard let m = d.value else { continue }
        if !logged.sleep {
          a.suggestions.append(d)
        } else if abs(m - logged.sleepMin) > 15 {
          a.conflicts.append(Conflict(kind: .sleep, logged: logged.sleepMin, stated: m))
        }
      case .weight:
        guard let kg = d.value else { continue }
        if let w = logged.weightKg {
          if abs(kg - w) >= 0.3 { a.conflicts.append(Conflict(kind: .weight, logged: w, stated: kg)) }
        } else {
          a.suggestions.append(d)
        }
      case .water:
        // Nước cộng dồn: nói nhiều hơn đã ghi → ghi thêm phần thiếu; ít hơn → lệch.
        guard let ml = d.value else { continue }
        let left = ml - logged.waterMl
        if left >= 100 {
          a.suggestions.append(Detected(kind: .water, value: (left / 50).rounded() * 50))
        } else if left <= -250 {
          a.conflicts.append(Conflict(kind: .water, logged: logged.waterMl, stated: ml))
        }
      case .workout:
        if !logged.workout { a.suggestions.append(d) }
      case .meal:
        if !logged.meals.contains(d.meal ?? "") { a.suggestions.append(d) }
      }
    }
    return a
  }

  /// Gợi ý ghi cho `text`, bỏ những gì hôm nay đã có. Nước: chỉ phần còn thiếu.
  public static func suggestions(_ text: String, logged: LoggedToday, hour: Int) -> [Detected] {
    analyze(text, logged: logged, hour: hour).suggestions
  }

  /// Số để hiện trên nút / hộp thoại: "7 giờ 30 phút", "1.5 L", "60.5 kg".
  public static func display(_ kind: Kind, _ v: Double, lang: String) -> String {
    let l = CoachQuickReply.Lang(lang)
    switch kind {
    case .sleep, .workout: return CoachQuickReply.duration(v, l)
    case .water: return v >= 1000 ? "\(CoachOverview.format((v / 100).rounded() / 10)) L" : "\(Int(v.rounded())) ml"
    case .weight: return "\(CoachOverview.format((v * 10).rounded() / 10)) kg"
    case .meal: return ""
    }
  }

  /// Câu hỏi lại dựng sẵn — dùng khi AI làm lộ chỉ dẫn thay vì hỏi (16/10).
  public static func question(_ c: Conflict, lang: String) -> String {
    let said = display(c.kind, c.stated, lang: lang), logged = display(c.kind, c.logged, lang: lang)
    switch CoachQuickReply.Lang(lang) {
    case .en: return "You said \(said), but the app has \(logged) logged — which one is correct?"
    case .es: return "Dijiste \(said), pero la app tiene registrado \(logged). ¿Cuál es el correcto?"
    case .vi: return "Bạn vừa nói \(said), nhưng app đang ghi \(logged) — số nào mới đúng nhỉ?"
    }
  }

  /// Câu trả lời chép lại chữ của chỉ dẫn hệ thống.
  public static func leaksInstructions(_ answer: String) -> Bool {
    let t = CoachQuickReply.fold(answer)
    return ["kiem tra du lieu", "data check", "chi dan", "instruction", "quan trong", "important", "app se hien nut",
            "nguoi dung vua noi", "the user just said", "the user's message", "tin nhan cua nguoi dung"]
      .contains { t.contains($0) }
  }

  /// Người dùng đã chọn số nào trong một câu trả lời tự gõ: số mới / số cũ / chưa rõ.
  public enum Choice: Equatable, Sendable { case stated, logged, unclear }

  public static func choice(_ reply: String, for c: Conflict) -> Choice {
    let t = " " + CoachQuickReply.fold(reply).replacingOccurrences(of: ",", with: ".") + " "
    let numbers = (try? NSRegularExpression(pattern: #"\d+(?:\.\d+)?"#))
      .map { r in r.matches(in: t, range: NSRange(t.startIndex..., in: t)).compactMap { Range($0.range, in: t).map { Double(t[$0]) ?? .nan } } } ?? []
    func display(_ v: Double) -> Double { c.kind == .sleep ? v / 60 : c.kind == .water && v >= 1000 ? v / 1000 : v }
    let near = { (v: Double, target: Double) in abs(v - target) < 0.26 || abs(v - target * 60) < 10 }
    let saysStated = numbers.contains { near($0, display(c.stated)) || near($0, c.stated) }
    let saysLogged = numbers.contains { near($0, display(c.logged)) || near($0, c.logged) }
    if saysStated != saysLogged { return saysStated ? .stated : .logged }
    return .unclear
  }

  // MARK: - Nhận diện

  public static func detect(_ raw: String, hour: Int) -> [Detected] {
    let t = " " + CoachQuickReply.fold(raw).replacingOccurrences(of: ",", with: ".") + " "
    // Mục tiêu / lời khuyên: không phải lời kể.
    if notReport.contains(where: { t.contains(" \($0) ") }) { return [] }
    let question = raw.contains("?") || questionCues.contains(where: { t.contains(" \($0) ") })
    var out: [Detected] = []

    if let m = sleepMinutes(t) { out.append(Detected(kind: .sleep, value: m)) }
    if let ml = waterMl(t) { out.append(Detected(kind: .water, value: ml)) }
    if let kg = weightKg(t) { out.append(Detected(kind: .weight, value: kg)) }
    // Không có số thì phải là câu kể, không phải câu hỏi.
    if !question, didWorkout(t) { out.append(Detected(kind: .workout, value: workoutMinutes(t))) }
    if !question, didEat(t) { out.append(Detected(kind: .meal, meal: meal(t, hour: hour))) }
    return out
  }

  static let notReport = [
    // "nên" một mình hay là liên từ ("ngủ ít nên mệt") — chỉ chặn khi nó hỏi lời khuyên.
    "co nen", "toi nen", "minh nen", "nen ngu", "nen tap", "nen an", "nen uong", "muc tieu", "can phai", "should", "goal", "target", "need to", "debo", "deberia",
    "meta", "objetivo", "bao nhieu la du", "how much should",
  ]
  static let questionCues = [
    "bao nhieu", "the nao", "sao", "khong", "gi", "how", "what", "why", "cuanto", "que", "como", "por que",
  ]

  static func first(_ t: String, _ pattern: String) -> [String]? {
    guard let r = try? NSRegularExpression(pattern: pattern),
      let m = r.firstMatch(in: t, range: NSRange(t.startIndex..., in: t))
    else { return nil }
    return (0..<m.numberOfRanges).map { i in
      Range(m.range(at: i), in: t).map { String(t[$0]) } ?? ""
    }
  }

  static func has(_ t: String, _ words: [String]) -> Bool { words.contains { t.contains(" \($0) ") } }

  static func sleepMinutes(_ t: String) -> Double? {
    guard has(t, ["ngu", "slept", "sleep", "dormi", "dormido", "dorm"]) else { return nil }
    guard let g = first(t, #"(\d+(?:\.\d+)?)\s*(tieng|gio|h|hours?|hrs?|horas?)\b(\s*ruoi)?(?:\s*(\d+)\s*(?:phut|p|min|mins|minutes|minutos))?"#),
      let h = Double(g[1])
    else { return nil }
    var minutes = h * 60
    if !g[3].isEmpty { minutes += 30 }
    if let extra = Double(g[4]) { minutes += extra }
    return (60...16 * 60).contains(minutes) ? minutes : nil
  }

  static func waterMl(_ t: String) -> Double? {
    guard has(t, ["uong", "drank", "drink", "bebi", "tome"]) else { return nil }
    guard let g = first(t, #"(\d+(?:\.\d+)?)\s*(ml|l|lit|liter|litre|liters|litres|litros?|coc|ly|glass|glasses|vasos?)\b"#),
      let n = Double(g[1])
    else { return nil }
    let ml: Double
    switch g[2] {
    case "ml": ml = n
    case "coc", "ly", "glass", "glasses", "vaso", "vasos": ml = n * 250
    default: ml = n * 1000
    }
    return (100...6000).contains(ml) ? ml : nil
  }

  static func weightKg(_ t: String) -> Double? {
    guard has(t, ["nang", "can", "weigh", "weighed", "weight", "peso", "pese"]) else { return nil }
    guard let g = first(t, #"(\d+(?:\.\d+)?)\s*(kg|ky|ki|kilo|kilos|kilograms?)\b"#), let kg = Double(g[1])
    else { return nil }
    return (25...300).contains(kg) ? kg : nil
  }

  static let workoutWords = [
    "tap", "tap gym", "workout", "worked out", "trained", "gym", "entrene", "entreno", "chay bo", "ran", "corri",
    "squat", "deadlift",
  ]
  static let doneMarkers = [
    "da", "vua", "xong", "roi", "hom nay", "sang nay", "trua nay", "chieu nay", "toi nay", "toi qua", "just", "today", "this morning",
    "finished", "hoy", "ya", "acabo de", "esta manana",
  ]

  static func didWorkout(_ t: String) -> Bool { has(t, workoutWords) && has(t, doneMarkers) }

  static func workoutMinutes(_ t: String) -> Double? {
    guard let g = first(t, #"(\d+)\s*(phut|p|min|mins|minutes|minutos)\b"#), let m = Double(g[1]) else {
      if let g = first(t, #"(\d+(?:\.\d+)?)\s*(tieng|gio|h|hours?|horas?)\b"#), let h = Double(g[1]) {
        return (0.25...5).contains(h) ? h * 60 : nil
      }
      return nil
    }
    return (5...300).contains(m) ? m : nil
  }

  static func didEat(_ t: String) -> Bool {
    // "had" chỉ tính khi đi với một bữa ("had salad for dinner").
    let meals = ["for lunch", "for dinner", "for breakfast"]
    return (has(t, ["an", "ate", "eaten", "comi", "desayune", "almorce", "cene"]) && has(t, doneMarkers + meals))
      || (has(t, ["had"]) && has(t, meals))
  }

  static func meal(_ t: String, hour: Int) -> String {
    if has(t, ["sang", "an sang", "breakfast", "desayune", "desayuno"]) { return "breakfast" }
    if has(t, ["trua", "lunch", "almorce", "almuerzo"]) { return "lunch" }
    // "tối" bỏ dấu trùng "tôi" — chỉ nhận theo cụm.
    if has(t, ["bua toi", "an toi", "toi nay", "dinner", "cene", "cena"]) { return "dinner" }
    switch hour {
    case 4..<11: return "breakfast"
    case 11..<15: return "lunch"
    case 15..<17: return "snack"
    default: return "dinner"
    }
  }
}
