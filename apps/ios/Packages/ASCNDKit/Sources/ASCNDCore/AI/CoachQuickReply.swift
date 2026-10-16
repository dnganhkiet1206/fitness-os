import Foundation

/// Câu hỏi gần như không cần AI (16/10, chủ dự án): lời chào, cảm ơn, "ok", tin
/// thử / gõ nhầm, và tra một con số của hôm nay ("hôm nay ăn bao nhiêu calo?").
/// App trả lời ngay bằng kho câu mẫu điền SỐ THẬT của người dùng — nhanh, không
/// tốn lượt AI, không bao giờ "quá tải".
///
/// Không lặp: mỗi loại câu có nhiều mẫu; `Memory` nhớ các mẫu vừa dùng và lần
/// sau chọn mẫu khác (chủ dự án: "hỏi lần thứ 2 thì không được lặp lại cùng một
/// kiểu trả lời"). Ba ngôn ngữ vi / en / es.
///
/// Cố ý hẹp: câu có "vì sao / nên / làm sao / gợi ý…" (cần suy luận) luôn đi AI,
/// kể cả khi nhắc tới một con số.
public enum CoachQuickReply {
  public enum Intent: String, CaseIterable, Codable, Sendable {
    case greeting, thanks, ack, vague, readiness, calories, protein, steps, sleep, today
  }

  /// Các mẫu vừa dùng theo từng loại — lưu được (Codable) để mở lại app vẫn nhớ.
  public struct Memory: Codable, Equatable, Sendable {
    public var recent: [String: [Int]] = [:]
    public init() {}
  }

  /// Câu trả lời dựng sẵn cho `text`, hoặc `nil` khi câu cần AI.
  public static func answer(
    _ text: String, signal: AssistantSuggestions.Signal?, lang: String, memory: inout Memory
  ) -> String? {
    var rng = SystemRandomNumberGenerator()
    return answer(text, signal: signal, lang: lang, memory: &memory, rng: &rng)
  }

  static func answer(
    _ text: String, signal: AssistantSuggestions.Signal?, lang: String, memory: inout Memory,
    rng: inout some RandomNumberGenerator
  ) -> String? {
    guard let intent = intent(for: text) else { return nil }
    // Tra số mà chưa có dữ liệu buổi này (Trợ lý chưa tải xong): để AI trả lời.
    if intent.needsData, signal == nil { return nil }
    let l = Lang(lang)
    let options = templates(intent, signal ?? .init(), l)
    guard !options.isEmpty else { return nil }
    let i = pick(options.count, avoiding: memory.recent[intent.rawValue] ?? [], rng: &rng)
    remember(i, for: intent, count: options.count, in: &memory)
    let body = options[i]
    guard intent.needsData, let signal, let block = overview(intent, signal, l) else { return body }
    return "```ascnd\n\(block)\n```\n\(body)"
  }

  // MARK: - Nhận diện

  public static func intent(for raw: String) -> Intent? {
    let text = fold(raw)
    let words = text.split(whereSeparator: { !$0.isLetter && !$0.isNumber }).map(String.init)
    let joined = words.joined(separator: " ")
    let letters = text.filter(\.isLetter).count

    if letters < 2 { return .vague }
    if greetings.contains(joined) { return .greeting }
    if acks.contains(joined) { return .ack }
    if words.count <= 6, thanks.contains(where: { has(joined, $0) }) { return .thanks }
    if testy.contains(joined) { return .vague }

    // Cần suy luận → AI, dù có nhắc số liệu. Nhắc thời gian khác hôm nay (hôm
    // qua, tuần, tháng, trung bình…) cũng → AI: app chỉ có số của hôm nay, trả
    // lời tự động ở đó là trả lời sai (16/10, chủ dự án: "tránh đưa ra thông tin
    // không chính xác, không lạm dụng câu trả lời tự động").
    if advice.contains(where: { has(joined, $0) }) { return nil }
    if otherTimes.contains(where: { has(joined, $0) }) { return nil }
    if words.count <= 8 {
      if today.contains(where: { has(joined, $0) }) { return .today }
      // Tra số thuần: có từ hỏi số VÀ đúng một chỉ số. Hai chỉ số trở lên ("calo
      // và đạm so với…") là câu ghép — để AI.
      let lookup = lookupCues.contains(where: { has(joined, $0) })
      let hits = metricKeys.filter { _, keys in keys.contains(where: { has(joined, $0) }) }
      if lookup, hits.count == 1 { return hits[0].0 }
    }
    // Một chữ ngắn không phải chỉ số ("thees", "asdf"): gõ nhầm / chưa rõ.
    if words.count == 1, letters <= 6 { return .vague }
    return nil
  }

  /// Chữ thường, bỏ dấu (người dùng hay gõ không dấu), đ → d.
  static func fold(_ s: String) -> String {
    s.lowercased().replacingOccurrences(of: "đ", with: "d")
      .folding(options: .diacriticInsensitive, locale: Locale(identifier: "en_US_POSIX"))
  }

  /// Khớp nguyên cụm từ (không khớp "dam" trong "adam").
  static func has(_ text: String, _ phrase: String) -> Bool {
    " \(text) ".contains(" \(phrase) ")
  }

  static let greetings: Set<String> = [
    "hi", "hello", "hey", "helo", "chao", "xin chao", "chao ban", "chao koa", "hi koa", "hello koa", "hey koa",
    "alo", "hola", "hola koa", "buenas", "buenos dias", "buenas tardes", "yo", "good morning", "morning",
  ]
  static let acks: Set<String> = [
    "ok", "okay", "oke", "okie", "uh", "uhm", "u", "um", "vang", "da", "duoc", "roi", "ok roi", "hieu roi",
    "got it", "cool", "nice", "great", "vale", "bueno", "ya", "si", "de acuerdo", "perfecto",
  ]
  static let thanks = ["cam on", "thank", "thanks", "thank you", "thx", "tks", "gracias", "muchas gracias"]
  static let testy: Set<String> = ["test", "testing", "thu", "asdf", "qwerty", "abc", "aaa", "prueba"]
  static let advice = [
    "vi sao", "tai sao", "sao lai", "lam sao", "nen", "the nao de", "goi y", "cai thien", "tang", "giam",
    "co du khong", "co tot khong", "so voi", "binh thuong", "an gi", "tap gi", "y nghia",
    "why", "how to", "how can", "how do", "should", "suggest", "recommend", "improve", "increase", "reduce",
    "enough", "good", "normal", "compare", "mean", "what to",
    "por que", "como puedo", "como hago", "debo", "deberia", "sugiere", "recomienda", "mejorar", "suficiente",
    "normal", "comparar", "que como", "que entreno",
  ]
  /// Thời gian khác hôm nay — app không có sẵn số đó để tra.
  static let otherTimes = [
    "hom qua", "tuan", "thang", "nam nay", "trung binh", "tuan nay", "tuan truoc", "gan day", "7 ngay",
    "yesterday", "week", "month", "average", "lately", "last 7", "ayer", "semana", "mes", "promedio",
  ]
  /// Từ hỏi một con số. Cố ý không có "?" hay "what" chung chung.
  static let lookupCues = [
    // "mấy" bỏ dấu là "may" — trùng tiếng Anh ("may I…"), nên chỉ nhận theo cụm.
    "bao nhieu", "bao lau", "duoc bao", "may tieng", "may gio", "may buoc", "may calo", "may kcal", "may diem",
    "may gam", "how much", "how many", "how long", "what s my", "whats my", "what is my",
    "cuanto", "cuantos", "cuantas", "cual es mi",
  ]
  static let today = [
    "hom nay the nao", "hom nay toi the nao", "tong quan", "tom tat", "how am i doing", "today summary",
    "my day", "como voy", "resumen", "como estoy",
  ]
  static let metricKeys: [(Intent, [String])] = [
    (.readiness, ["san sang", "readiness", "diem", "score", "preparacion", "puntuacion"]),
    (.calories, ["calo", "calories", "calorie", "kcal", "calorias", "nang luong nap"]),
    (.protein, ["dam", "protein", "proteina", "proteinas"]),
    (.steps, ["buoc", "buoc chan", "steps", "pasos"]),
    (.sleep, ["ngu", "giac ngu", "sleep", "slept", "sueno", "dormi", "dormido"]),
  ]

  // MARK: - Chọn mẫu không lặp

  static func pick(_ count: Int, avoiding recent: [Int], rng: inout some RandomNumberGenerator) -> Int {
    let fresh = (0..<count).filter { !recent.contains($0) }
    return (fresh.isEmpty ? Array(0..<count) : fresh).randomElement(using: &rng) ?? 0
  }

  /// Nhớ tới (count − 1) mẫu gần nhất: lần sau luôn còn ít nhất một mẫu mới.
  static func remember(_ i: Int, for intent: Intent, count: Int, in memory: inout Memory) {
    var list = memory.recent[intent.rawValue] ?? []
    list.append(i)
    memory.recent[intent.rawValue] = Array(list.suffix(max(1, count - 1)))
  }

  // MARK: - Số liệu

  enum Lang {
    case vi, en, es
    init(_ code: String) { self = code == "en" ? .en : code == "es" ? .es : .vi }
  }

  static func grouped(_ v: Double, _ l: Lang) -> String {
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.maximumFractionDigits = 0
    f.locale = Locale(identifier: l == .en ? "en_US" : l == .es ? "es_ES" : "vi_VN")
    if l == .es { f.usesGroupingSeparator = true; f.minimumGroupingDigits = 1 }
    return f.string(from: NSNumber(value: v.rounded())) ?? String(Int(v.rounded()))
  }

  static func duration(_ minutes: Double, _ l: Lang) -> String {
    let h = Int(minutes) / 60, m = Int(minutes) % 60
    switch l {
    case .vi: return m == 0 ? "\(h) giờ" : "\(h) giờ \(m) phút"
    case .en: return m == 0 ? "\(h)h" : "\(h)h \(m)m"
    case .es: return m == 0 ? "\(h) h" : "\(h) h \(m) min"
    }
  }

  /// Khối tổng quan dựng bằng code từ số thật (cùng định dạng model trả về).
  static func overview(_ intent: Intent, _ s: AssistantSuggestions.Signal, _ l: Lang) -> String? {
    func item(_ label: String, _ value: Double, _ goal: Double?, _ unit: String, _ tone: String) -> String {
      let g = goal.map { ",\"goal\":\(Int($0.rounded()))" } ?? ""
      return "{\"label\":\"\(label)\",\"value\":\(Int(value.rounded()))\(g),\"unit\":\"\(unit)\",\"tone\":\"\(tone)\"}"
    }
    let n = names(l)
    var items: [String] = []
    switch intent {
    case .readiness: if let r = s.readiness { items = [item(n.readiness, Double(r), 100, "", "readiness")] }
    case .calories: items = [item(n.kcal, s.kcal, s.kcalTarget, "kcal", "meal")]
    case .protein: items = [item(n.protein, s.proteinG, s.proteinTarget, "g", "protein")]
    case .steps: if s.steps > 0 { items = [item(n.steps, s.steps, nil, "", "steps")] }
    case .sleep: break  // dựng riêng bên dưới (cần một chữ số thập phân)
    case .today:
      if let r = s.readiness { items.append(item(n.readiness, Double(r), 100, "", "readiness")) }
      items.append(item(n.kcal, s.kcal, s.kcalTarget, "kcal", "meal"))
      items.append(item(n.protein, s.proteinG, s.proteinTarget, "g", "protein"))
      if s.steps > 0 { items.append(item(n.steps, s.steps, nil, "", "steps")) }
    default: break
    }
    // Giấc ngủ: giờ, một chữ số thập phân (7.3 h).
    if intent == .sleep, s.sleepMin > 0 {
      let hours = (s.sleepMin / 6).rounded() / 10
      items = ["{\"label\":\"\(n.sleep)\",\"value\":\(hours),\"unit\":\"h\",\"tone\":\"sleep\"}"]
    }
    return items.isEmpty ? nil : "{\"items\":[\(items.joined(separator: ","))]}"
  }

  static func names(_ l: Lang) -> (readiness: String, kcal: String, protein: String, steps: String, sleep: String) {
    switch l {
    case .vi: ("Sẵn sàng", "Calo", "Đạm", "Bước chân", "Giấc ngủ")
    case .en: ("Readiness", "Calories", "Protein", "Steps", "Sleep")
    case .es: ("Preparación", "Calorías", "Proteína", "Pasos", "Sueño")
    }
  }
}

extension CoachQuickReply.Intent {
  var needsData: Bool {
    switch self {
    case .readiness, .calories, .protein, .steps, .sleep, .today: true
    case .greeting, .thanks, .ack, .vague: false
    }
  }
}
