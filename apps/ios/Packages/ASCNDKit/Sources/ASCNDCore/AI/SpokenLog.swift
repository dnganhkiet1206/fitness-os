public import Foundation

/// "Kể cho Koa" (18/10, chủ dự án: ghi bằng lời trong chat và ở Hôm nay, có nói
/// thay gõ, "phải log chính xác, tránh bug nhiều nhất có thể"). Một câu kể —
/// gõ hay đọc ra từ giọng nói — thành các mục ghi: ngủ, nước, cân, tập, bữa.
/// vi / en / es; có dấu hay không dấu.
///
/// Luật thuần, không AI. Nguyên tắc chính xác:
/// - không đoán: phần không hiểu trả về trong `unparsed` để màn hiện ra, không
///   bỏ lặng lẽ và không nhét vào mục gần nhất;
/// - câu hỏi, câu nói về sau ("sẽ tập", "will run", "voy a correr") và việc của
///   ngày khác ("hôm qua ăn phở") không thành mục ghi;
/// - "nước cam", "nước mía"… là đồ uống có calo (thành món của bữa), không phải
///   nước lọc; chỉ "nước", "nước lọc / suối / khoáng", water, agua mới là nước;
/// - số nằm ngoài khoảng hợp lý (ngủ 1–16 giờ, nước 50 ml–5 L, cân 25–300 kg)
///   thì bỏ, không kẹp.
///
/// Không tự lưu gì: màn xác nhận hiện các mục, người dùng sửa rồi mới lưu qua
/// đúng các sổ đã có (giấc ngủ, nước, cân, bữa, buổi tập).
public enum SpokenLog {
  // MARK: - Kết quả

  public enum Item: Equatable, Sendable {
    case sleep(Sleep)
    /// `nil` = có nói uống nước mà không nói bao nhiêu — màn hỏi lại.
    case water(ml: Int?)
    case weight(kg: Double)
    case workout(Workout)
    case meal(Meal)
  }

  public struct Sleep: Equatable, Sendable {
    /// Thời lượng đã nói ("ngủ 7 tiếng"); khi có cả giờ ngủ và giờ dậy thì là
    /// khoảng giữa hai giờ ấy.
    public var minutes: Int?
    public var bed: SleepLog.Clock?
    public var wake: SleepLog.Clock?

    public init(minutes: Int? = nil, bed: SleepLog.Clock? = nil, wake: SleepLog.Clock? = nil) {
      self.minutes = minutes
      self.bed = bed
      self.wake = wake
    }
  }

  public struct Workout: Equatable, Sendable {
    public enum Kind: String, Sendable, CaseIterable {
      case run, walk, cycle, swim, yoga, gym, other
    }

    public var kind: Kind
    public var minutes: Int?

    public init(kind: Kind, minutes: Int? = nil) {
      self.kind = kind
      self.minutes = minutes
    }
  }

  public struct Meal: Equatable, Sendable {
    /// `breakfast` / `lunch` / `dinner` / `snack` — đúng khoá của `MealLog`.
    public var slot: String
    public var foods: [Food]

    public init(slot: String, foods: [Food]) {
      self.slot = slot
      self.foods = foods
    }
  }

  public struct Food: Equatable, Sendable {
    /// Tên như người dùng nói (giữ dấu) — để tìm trong thư viện món.
    public var name: String
    /// Số phần ("2 quả trứng" → 2).
    public var servings: Double
    /// Đơn vị đã nói, chữ thường ("tô", "slice"); `nil` khi không nói.
    public var unit: String?
    /// Gram khi người dùng nói theo gram ("200g ức gà").
    public var grams: Double?

    public init(name: String, servings: Double = 1, unit: String? = nil, grams: Double? = nil) {
      self.name = name
      self.servings = servings
      self.unit = unit
      self.grams = grams
    }
  }

  public struct Result: Equatable, Sendable {
    public var items: [Item] = []
    /// Đoạn không hiểu được, đúng chữ người dùng (để màn hiện "Koa chưa hiểu: …").
    public var unparsed: [String] = []
    /// Đoạn nói về ngày khác hôm nay ("hôm qua…") — không ghi, màn nói rõ lý do.
    public var otherDay: [String] = []

    public init(items: [Item] = [], unparsed: [String] = [], otherDay: [String] = []) {
      self.items = items
      self.unparsed = unparsed
      self.otherDay = otherDay
    }

    public var isEmpty: Bool { items.isEmpty }
  }

  // MARK: - Đọc

  /// `hour`: giờ địa phương lúc kể (đoán bữa khi người dùng không nói bữa nào).
  /// `weightUnit`: đơn vị cân của tài khoản, dùng khi câu không nói đơn vị.
  public static func parse(_ raw: String, hour: Int, weightUnit: WeightUnit = .kg) -> Result {
    var result = Result()
    let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return result }
    // Cả tin nhắn là câu hỏi → không phải lời kể.
    if text.hasSuffix("?") || text.hasPrefix("¿") { return result }

    var lastMeal: Int?  // chỉ số trong `result.items` của bữa gần nhất
    for clause in clauses(tokenize(text)) {
      let c = Clause(clause)
      guard !c.isEmpty else { continue }
      if c.isFuture || c.isQuestion || c.isGoal { continue }
      if c.isOtherDay(sleepOK: c.isSleep) {
        result.otherDay.append(c.original)
        continue
      }
      for part in c.parts() {
        if let item = part.nonMealItem(weightUnit: weightUnit) {
          result.items.append(item)
          continue
        }
        // Bữa: có từ ăn / bữa / đồ uống; hoặc chỉ là món nối tiếp ngay sau một bữa.
        if let meal = part.meal(hour: hour) {
          if let i = lastMeal, case .meal(var m) = result.items[i], !part.namesSlot, m.slot == meal.slot || !part.namesSlot {
            m.foods += meal.foods
            result.items[i] = .meal(m)
          } else {
            result.items.append(.meal(meal))
            lastMeal = result.items.count - 1
          }
          continue
        }
        if let i = lastMeal, case .meal(var m) = result.items[i], let foods = part.foodsOnly(), !foods.isEmpty {
          m.foods += foods
          result.items[i] = .meal(m)
          continue
        }
        if !part.isFiller { result.unparsed.append(part.original) }
      }
    }
    result.items = merged(result.items)
    return result
  }

  /// Hai mục cùng loại trong một câu: bữa cùng bữa thì gộp món; nước cộng dồn.
  static func merged(_ items: [Item]) -> [Item] {
    var out: [Item] = []
    for item in items {
      switch item {
      case .meal(let m):
        if let i = out.firstIndex(where: { if case .meal(let o) = $0 { o.slot == m.slot } else { false } }),
          case .meal(var o) = out[i]
        {
          o.foods += m.foods
          out[i] = .meal(o)
        } else {
          out.append(item)
        }
      case .sleep(let sl):
        if let i = out.firstIndex(where: { if case .sleep = $0 { true } else { false } }), case .sleep(var prev) = out[i] {
          prev.bed = prev.bed ?? sl.bed
          prev.wake = prev.wake ?? sl.wake
          if let b = prev.bed, let w = prev.wake {
            var m = (w.hour * 60 + w.minute) - (b.hour * 60 + b.minute)
            if m <= 0 { m += 24 * 60 }
            prev.minutes = (60...16 * 60).contains(m) ? m : nil
          } else {
            prev.minutes = prev.minutes ?? sl.minutes
          }
          out[i] = .sleep(prev)
        } else {
          out.append(item)
        }
      case .water(let ml):
        if let i = out.firstIndex(where: { if case .water = $0 { true } else { false } }), case .water(let prev) = out[i] {
          out[i] = .water(ml: (prev ?? 0) + (ml ?? 0) > 0 ? (prev ?? 0) + (ml ?? 0) : nil)
        } else {
          out.append(item)
        }
      default:
        out.append(item)
      }
    }
    return out.filter {
      if case .meal(let m) = $0 { return !m.foods.isEmpty }
      return true
    }
  }

  // MARK: - Tách từ

  struct Token: Equatable {
    /// Chữ gốc (giữ hoa thường, dấu).
    let raw: String
    /// Chữ thường, giữ dấu tiếng Việt ("tư" ≠ "từ").
    let lower: String
    /// Chữ thường bỏ dấu, đ → d.
    let fold: String
    /// Dấu câu tách mệnh đề.
    var isBreak: Bool { [",", ";", ".", "!", "\n", ":", "+"].contains(raw) }
    /// Số (7, 7.5, 7,5, 6:30 → nil — giờ đọc riêng).
    var number: Double? { SpokenLog.number(raw) }
  }

  static func tokenize(_ text: String) -> [Token] {
    var s = text
    // "500ml" → "500 ml", "7h30" → "7 h 30", "68,5kg" → "68,5 kg", "11pm" → "11 pm".
    for (pattern, template) in [
      (#"(\d)([^\d\s.,:])"#, "$1 $2"), (#"([^\d\s.,:])(\d)"#, "$1 $2"),
      // Dấu câu dính chữ: "phở, trứng" → "phở , trứng" (giữ 7,5 và 6:30).
      (#"([^\d])([,;!+])"#, "$1 $2 "), (#"([,;!+])([^\d])"#, " $1 $2"),
      (#"([^\d\s])\.(\s|$)"#, "$1 . "), (#"([^\d])\:"#, "$1 : "),
    ] {
      s = s.replacingOccurrences(of: pattern, with: template, options: .regularExpression)
    }
    s = s.replacingOccurrences(of: "\n", with: " . ")
    return s.split(whereSeparator: { $0 == " " || $0 == "\t" }).map { w in
      let raw = String(w)
      let lower = raw.lowercased()
      return Token(raw: raw, lower: lower, fold: CoachQuickReply.fold(lower))
    }
  }

  /// Mệnh đề: tách ở dấu câu và ở từ nối MẠNH ("rồi", "then", "luego"). Từ nối
  /// yếu ("và", "and", "y", "với") tách sau, trong `Clause.parts()`.
  static func clauses(_ tokens: [Token]) -> [[Token]] {
    var out: [[Token]] = [], cur: [Token] = []
    var i = 0
    while i < tokens.count {
      let t = tokens[i]
      if t.isBreak {
        out.append(cur)
        cur = []
        i += 1
        continue
      }
      if let n = strongConnector(tokens, at: i) {
        out.append(cur)
        cur = []
        i += n
        continue
      }
      // Lời nói không có dấu câu ("ngủ 7 tiếng uống 2 lít nước sáng ăn phở"):
      // tách trước một động từ của LOẠI KHÁC với những gì mệnh đề đã có, và
      // trước tên bữa mới khi mệnh đề đã có món.
      if !cur.isEmpty, startsNewClause(tokens, at: i, current: cur) {
        out.append(cur)
        cur = []
      }
      cur.append(t)
      i += 1
    }
    out.append(cur)
    return out.filter { !$0.isEmpty }
  }

  enum VerbKind { case sleep, water, weight, workout, eat, slot }

  /// Loại việc mà một từ mở đầu. vi theo chữ có dấu (không dấu thì mơ hồ quá).
  static func verbKind(_ t: Token, next: Token?) -> VerbKind? {
    switch t.lower {
    case "ngủ", "dậy", "slept", "woke", "dormí", "dormi", "desperté", "desperte", "acosté", "acoste": return .sleep
    case "uống", "drank", "bebí", "bebi", "tomé", "tome": return .water
    case "cân", "nặng", "weighed", "weigh", "pesé", "pese", "peso": return .weight
    case "tập", "chạy", "bơi", "đạp", "ran", "walked", "swam", "cycled", "biked", "trained", "corrí", "nadé", "caminé", "entrené":
      return .workout
    case "ăn", "ate", "had", "comí", "comi", "desayuné", "almorcé", "cené": return .eat
    case "sáng", "trưa", "tối", "chiều", "breakfast", "lunch", "dinner", "desayuno", "almuerzo", "cena":
      // "sáng nay", "trưa ăn", "tối qua"… — tên bữa / buổi mở một mệnh đề mới.
      return .slot
    case "đi" where next?.lower == "ngủ": return .sleep
    case "đi" where next?.lower == "tập" || next?.lower == "bộ": return .workout
    default: return nil
    }
  }

  static func startsNewClause(_ tokens: [Token], at i: Int, current: [Token]) -> Bool {
    let next = i + 1 < tokens.count ? tokens[i + 1] : nil
    guard let kind = verbKind(tokens[i], next: next) else { return false }
    // "đi ngủ" / "đi tập": "đi" đã mở, từ sau không mở thêm.
    if let prev = current.last, prev.lower == "đi" { return false }
    let had = current.indices.compactMap { j in verbKind(current[j], next: j + 1 < current.count ? current[j + 1] : tokens[i]) }
    guard !had.isEmpty else {
      // Chưa có động từ: tên bữa sau vài từ món ("phở bò trưa ăn…") vẫn mở mệnh đề mới.
      return kind == .slot && current.count >= 2 && current.contains { $0.number == nil }
    }
    // Tên buổi đứng trước động từ ("tối qua ngủ", "chiều chạy bộ", "sáng ăn") thuộc
    // về động từ ấy: chỉ có tên buổi thì chưa tách.
    if kind != .slot, had.allSatisfy({ $0 == .slot }) { return false }
    switch kind {
    case .slot:
      // "for breakfast", "para el desayuno", "en la cena": tên bữa đi SAU món.
      if let prev = current.last, ["for", "para", "de", "en", "el", "la", "at", "in", "the", "my"].contains(prev.fold) { return false }
      // "ăn sáng", "tối qua ngủ" — tên bữa ngay sau động từ là một phần của nó.
      if let prev = current.last, verbKind(prev, next: tokens[i]) != nil { return false }
      // "11 giờ tối", "6 giờ sáng": buổi đi sau giờ.
      // ("7 tiếng sáng nay ăn…": "tiếng" là thời lượng, "sáng" mở mệnh đề mới.)
      if let prev = current.last, prev.number != nil || isClockLike([prev], at: 0) || ["gio", "h"].contains(prev.fold) { return false }
      return true
    case .eat:
      // "sáng ăn": ăn ngay sau tên bữa.
      if had.last == .slot, current.count <= 2 { return false }
      return !had.allSatisfy { $0 == .slot } || current.count > 2
    case .sleep:
      return !had.contains(.sleep)
    default:
      return !had.contains(kind)
    }
  }

  static let strongConnectors: [[String]] = [
    ["roi"], ["xong", "roi"], ["sau", "do"], ["sau", "khi", "do"], ["then"], ["after", "that"], ["afterwards"],
    ["luego"], ["despues"], ["mas", "tarde"], ["later"],
  ]

  /// Số token của từ nối mạnh bắt đầu ở `i` (0 = không phải). "rồi" ở CUỐI câu
  /// ("ăn rồi") là dấu đã xong, không phải từ nối.
  static func strongConnector(_ tokens: [Token], at i: Int) -> Int? {
    for c in strongConnectors {
      guard i + c.count <= tokens.count else { continue }
      guard zip(c, tokens[i..<(i + c.count)]).allSatisfy({ $0 == $1.fold }) else { continue }
      let next = i + c.count
      if next >= tokens.count || tokens[next].isBreak { continue }
      // "rồi" chỉ nối khi trước nó đã có gì.
      if i == 0 { continue }
      // "xong" đứng một mình sau động từ ("tập xong") giữ nguyên: chỉ nối "xong rồi".
      return c.count
    }
    return nil
  }

  // MARK: - Mệnh đề

  struct Clause {
    let tokens: [Token]

    init(_ tokens: [Token]) { self.tokens = tokens }

    var isEmpty: Bool { tokens.isEmpty }
    var original: String { tokens.map(\.raw).joined(separator: " ") }
    var folded: String { " " + tokens.map(\.fold).joined(separator: " ") + " " }
    var lowered: String { " " + tokens.map(\.lower).joined(separator: " ") + " " }

    func has(_ phrases: [String]) -> Bool { phrases.contains { folded.contains(" \($0) ") } }
    func hasLower(_ phrases: [String]) -> Bool { phrases.contains { lowered.contains(" \($0) ") } }

    var isQuestion: Bool {
      tokens.contains { $0.raw.contains("?") }
        || has(["bao nhieu", "the nao", "co nen", "nen khong", "how much", "how many", "should i", "cuanto", "cuantos", "debo", "deberia"])
        || hasLower(["không?", "chưa?"])
    }

    var isFuture: Bool {
      hasLower(["sẽ", "định", "sắp", "chuẩn bị", "muốn", "dự định", "lát nữa", "ngày mai", "mai sẽ", "tối nay sẽ"])
        || has(["se tap", "se an", "se uong", "se ngu", "dinh tap", "ngay mai", "lat nua"])
        || has(["will", "going to", "gonna", "plan to", "planning to", "want to", "tomorrow", "later today"])
        || has(["voy a", "vamos a", "pienso", "quiero", "manana voy", "manana"]) && !has(["esta manana", "por la manana", "de la manana"])
    }

    var isSleep: Bool { sleepTrigger }

    /// Nói về mục tiêu ("mục tiêu ngủ 8 tiếng", "goal 70 kg") — không phải lời kể.
    var isGoal: Bool {
      has(["muc tieu", "goal", "target", "objetivo", "meta", "can dat", "phai dat"])
    }

    /// Việc của hôm qua (trừ giấc ngủ đêm qua — đó là giấc của hôm nay).
    func isOtherDay(sleepOK: Bool) -> Bool {
      if sleepOK { return false }
      return hasLower(["hôm qua", "hôm kia", "tuần trước", "bữa qua"]) || has(["hom qua", "hom kia"])
        || has(["yesterday", "last week", "the day before"]) || has(["ayer", "anteayer", "la semana pasada"])
    }

    /// Câu chỉ có lời đệm ("ok", "nha", "vậy thôi") — không báo là không hiểu.
    var isFiller: Bool {
      tokens.allSatisfy { SpokenLog.filler.contains($0.fold) || SpokenLog.pronouns.contains($0.fold) || SpokenLog.doneWords.contains($0.fold) }
    }

    /// Tách ở từ nối yếu: mỗi phần tự thành một mục nếu nó là ngủ / nước / cân /
    /// tập; phần là món thì để nguyên cụm để "cơm và trứng" vẫn là một bữa.
    /// "seven and a half", "siete horas y media": "and" / "y" ấy là nửa, không phải từ nối.
    func halfFollows(after t: Token) -> Bool {
      guard let i = tokens.firstIndex(where: { $0 == t }) else { return false }
      let rest = tokens[(i + 1)...].map(\.fold)
      return rest.starts(with: ["a", "half"]) || rest.starts(with: ["half"]) || rest.first == "media" || rest.first == "medio"
    }

    func parts() -> [Clause] {
      var out: [[Token]] = [], cur: [Token] = []
      for t in tokens {
        if SpokenLog.weakConnectors.contains(t.fold), !cur.isEmpty, !halfFollows(after: t) {
          out.append(cur)
          cur = []
        } else {
          cur.append(t)
        }
      }
      out.append(cur)
      let pieces = out.filter { !$0.isEmpty }.map(Clause.init)
      guard pieces.count > 1 else { return [self] }
      // Gộp lại các mảnh liền nhau không phải ngủ / nước / cân / tập — đó là món.
      var merged: [Clause] = []
      var foodRun: [Token] = []
      for p in pieces {
        if p.nonMealItem(weightUnit: .kg) != nil {
          if !foodRun.isEmpty { merged.append(Clause(foodRun)); foodRun = [] }
          merged.append(p)
        } else {
          if !foodRun.isEmpty { foodRun.append(Token(raw: ",", lower: ",", fold: ",")) }
          foodRun += p.tokens
        }
      }
      if !foodRun.isEmpty { merged.append(Clause(foodRun)) }
      return merged
    }

    // MARK: ngủ / nước / cân / tập

    func nonMealItem(weightUnit: WeightUnit) -> Item? {
      if let w = water() { return w }
      if let s = sleep() { return .sleep(s) }
      if let kg = weightKg(defaultUnit: weightUnit) { return .weight(kg: kg) }
      if let w = workout() { return .workout(w) }
      return nil
    }

    var sleepTrigger: Bool {
      hasLower(["ngủ", "thức dậy", "dậy", "đi ngủ", "lên giường"]) || has(["ngu", "di ngu", "thuc day"])
        || has(["slept", "sleep", "asleep", "went to bed", "go to bed", "bed at", "woke", "woke up", "got up", "wake up"])
        || has(["dormi", "dormido", "me dormi", "me acoste", "desperte", "me desperte", "me levante"])
    }

    func sleep() -> Sleep? {
      guard sleepTrigger else { return nil }
      var s = Sleep()
      s.minutes = SpokenLog.duration(tokens, maxHours: 16)
      let bedCues: [[String]] = [["ngu", "luc"], ["di", "ngu", "luc"], ["ngu", "tu"], ["went", "to", "bed", "at"], ["bed", "at"],
        ["fell", "asleep", "at"], ["slept", "at"], ["asleep", "at"], ["slept", "from"], ["me", "acoste", "a", "las"],
        ["me", "dormi", "a", "las"], ["dormi", "desde", "las"], ["dormi", "de"], ["ngu", "luc"], ["from"]]
      let wakeCues: [[String]] = [["day", "luc"], ["thuc", "day", "luc"], ["den"], ["toi"], ["woke", "up", "at"], ["woke", "at"],
        ["got", "up", "at"], ["to"], ["until"], ["me", "desperte", "a", "las"], ["desperte", "a", "las"], ["me", "levante", "a", "las"],
        ["hasta", "las"], ["a", "las"]]
      if let bed = SpokenLog.clock(after: bedCues, in: tokens, role: .bed) { s.bed = bed }
      if let wake = SpokenLog.clock(after: wakeCues, in: tokens, role: .wake, skipFirstOf: s.bed == nil ? nil : bedCues) {
        s.wake = wake
      }
      if let b = s.bed, let w = s.wake {
        var m = (w.hour * 60 + w.minute) - (b.hour * 60 + b.minute)
        if m <= 0 { m += 24 * 60 }
        s.minutes = m
      }
      if let m = s.minutes, !(60...16 * 60).contains(m) { return nil }
      // Chỉ có giờ ngủ hay giờ dậy (câu kia ở mệnh đề sau): vẫn là giấc ngủ —
      // `merged` ghép hai nửa; thiếu nửa nào thì màn điền theo giờ quen.
      guard s.minutes != nil || s.bed != nil || s.wake != nil else { return nil }
      return s
    }

    /// Nước: có từ nước (đúng nghĩa nước lọc) — hoặc động từ uống + đơn vị nước
    /// mà không gọi tên đồ uống khác.
    func water() -> Item? {
      let waterAt = tokens.indices.first { i in
        let t = tokens[i]
        if t.fold == "water" || t.fold == "agua" { return true }
        guard t.fold == "nuoc" else { return false }
        let next = i + 1 < tokens.count ? tokens[i + 1] : nil
        guard let next else { return true }
        return next.number != nil || SpokenLog.waterUnits[next.fold] != nil || SpokenLog.plainWater.contains(next.fold)
          || SpokenLog.weakConnectors.contains(next.fold) || SpokenLog.doneWords.contains(next.fold) || SpokenLog.filler.contains(next.fold)
      }
      let drinks = has(["uong", "drank", "drink", "had", "bebi", "tome", "tomado"])
      let otherDrink = SpokenLog.otherDrinks.contains { has([$0]) } || tokens.enumerated().contains { i, t in
        t.fold == "nuoc" && i + 1 < tokens.count && !(tokens[i + 1].number != nil || SpokenLog.waterUnits[tokens[i + 1].fold] != nil
          || SpokenLog.plainWater.contains(tokens[i + 1].fold) || SpokenLog.weakConnectors.contains(tokens[i + 1].fold)
          || SpokenLog.doneWords.contains(tokens[i + 1].fold) || SpokenLog.filler.contains(tokens[i + 1].fold))
      }
      guard waterAt != nil || (drinks && !otherDrink && amountMl() != nil) else { return nil }
      if otherDrink && waterAt == nil { return nil }
      guard let ml = amountMl() else { return .water(ml: nil) }
      guard (50...5000).contains(ml) else { return nil }
      return .water(ml: ml)
    }

    /// Lượng nước đã nói, ml.
    func amountMl() -> Int? {
      for i in tokens.indices {
        // "a bottle of water", "un litro de agua", "một ly nước".
        if ["a", "an", "one", "un", "una", "uno"].contains(tokens[i].fold) || tokens[i].lower == "một",
          i + 1 < tokens.count, let per = SpokenLog.waterUnits[tokens[i + 1].fold]
        {
          return Int(per)
        }
        guard let n = SpokenLog.quantity(tokens, at: i) else { continue }
        let next = i + n.width < tokens.count ? tokens[i + n.width] : nil
        // "nửa lít", "half a liter", "medio litro".
        let unitTok = next?.fold == "a" || next?.fold == "of" || next?.fold == "de" ? (i + n.width + 1 < tokens.count ? tokens[i + n.width + 1] : nil) : next
        if let u = unitTok, let per = SpokenLog.waterUnits[u.fold] { return Int((n.value * per).rounded()) }
      }
      return nil
    }

    func weightKg(defaultUnit: WeightUnit) -> Double? {
      let trigger = hasLower(["cân", "nặng", "cân nặng", "cân được"]) || has(["can nang"])
        || has(["weigh", "weighed", "weight", "weighing", "scale"]) || has(["peso", "pese", "pesaba", "bascula"])
      guard trigger else { return nil }
      for i in tokens.indices {
        guard let v = tokens[i].number else { continue }
        let unit = i + 1 < tokens.count ? tokens[i + 1].fold : ""
        let kg: Double
        if ["kg", "kgs", "ky", "ki", "kilo", "kilos", "kilogram", "kilograms", "kilogramos", "can"].contains(unit) {
          kg = v
        } else if ["lb", "lbs", "pound", "pounds", "libra", "libras"].contains(unit) {
          kg = v * 0.45359237
        } else if unit.isEmpty || !unit.allSatisfy(\.isLetter) || SpokenLog.filler.contains(unit) || SpokenLog.doneWords.contains(unit) {
          kg = defaultUnit == .lbs ? v * 0.45359237 : v
        } else {
          continue
        }
        if (25...300).contains(kg) { return (kg * 100).rounded() / 100 }
      }
      return nil
    }

    func workout() -> Workout? {
      let kinds: [(Workout.Kind, [String])] = [
        (.run, ["chay", "chay bo", "ran", "run", "running", "jogged", "jog", "corri", "correr", "trote"]),
        (.walk, ["di bo", "walked", "walk", "walking", "camine", "caminar", "caminata"]),
        (.cycle, ["dap xe", "cycled", "biked", "cycling", "bike ride", "bici", "bicicleta", "pedalee"]),
        (.swim, ["boi", "swam", "swim", "swimming", "nade", "nadar", "natacion"]),
        (.yoga, ["yoga"]),
        (.gym, ["tap", "tap gym", "di tap", "tap ta", "gym", "workout", "worked out", "trained", "training", "lifted", "lifting",
          "entrene", "entreno", "gimnasio", "pesas"]),
      ]
      guard let kind = kinds.first(where: { has($0.1) })?.0 else { return nil }
      // "tập" bỏ dấu trùng "tấp", "tạp"…; với từ có dấu thì phải đúng "tập".
      if kind == .gym, has(["tap"]), !has(["tap gym", "di tap", "tap ta"]), !hasLower(["tập"]),
        tokens.contains(where: { $0.fold == "tap" && $0.lower != "tap" })
      {
        return nil
      }
      // "chạy" / "bơi" phải có dấu đúng nếu người dùng gõ có dấu ("chảy", "bói").
      if kind == .run, has(["chay"]), !has(["ran", "run", "running", "jogged", "corri", "correr"]),
        tokens.contains(where: { $0.fold == "chay" && $0.lower != "chạy" && $0.lower != "chay" })
      {
        return nil
      }
      if kind == .swim, has(["boi"]), !has(["swam", "swim", "nade", "nadar"]),
        tokens.contains(where: { $0.fold == "boi" && $0.lower != "bơi" && $0.lower != "boi" })
      {
        return nil
      }
      // "đi bộ" phải có cả hai từ; "chạy" một mình được.
      let minutes = SpokenLog.duration(tokens, maxHours: 5).flatMap { (5...300).contains($0) ? $0 : nil }
      return Workout(kind: kind, minutes: minutes)
    }

    // MARK: bữa

    /// Có nói tên bữa ("bữa sáng", "lunch", "cena").
    var namesSlot: Bool { slotWord != nil }

    var slotWord: String? {
      if hasLower(["bữa sáng", "ăn sáng", "sáng", "sáng nay"]) || has(["bua sang", "an sang", "breakfast", "desayune", "desayuno", "desayunar"]) {
        return "breakfast"
      }
      if hasLower(["bữa trưa", "ăn trưa", "trưa", "trưa nay"]) || has(["bua trua", "an trua", "lunch", "almorce", "almuerzo"]) {
        return "lunch"
      }
      if hasLower(["bữa tối", "ăn tối", "tối", "tối nay", "bữa khuya", "khuya"]) || has(["bua toi", "an toi", "dinner", "supper", "cene", "cena"]) {
        return "dinner"
      }
      if hasLower(["ăn vặt", "bữa phụ", "ăn nhẹ", "chiều"]) || has(["an vat", "bua phu", "snack", "snacked", "merienda", "merende"]) {
        return "snack"
      }
      return nil
    }

    var eatTrigger: Bool {
      hasLower(["ăn", "đã ăn", "vừa ăn", "uống"]) || has(["an sang", "an trua", "an toi", "an vat", "bua sang", "bua trua", "bua toi"])
        || has(["ate", "eaten", "eat", "had", "drank", "breakfast", "lunch", "dinner", "snack", "snacked"])
        || has(["comi", "desayune", "almorce", "cene", "merende", "bebi", "tome"])
        // Không dấu: "an" chỉ tính khi đứng đầu câu hay sau bữa / đại từ ("toi an pho").
        || noAccentEat
    }

    var noAccentEat: Bool {
      tokens.indices.contains { i in
        guard tokens[i].lower == "an" else { return false }
        if i == 0 { return true }
        let prev = tokens[i - 1].fold
        return SpokenLog.pronouns.contains(prev) || ["da", "vua", "moi", "sang", "trua", "toi", "chieu", "nay"].contains(prev)
      }
    }

    func meal(hour: Int) -> Meal? {
      if sleepTrigger { return nil }
      let slot = slotWord
      let drinkOnly = !eatTrigger && SpokenLog.otherDrinks.contains { has([$0]) }
      guard eatTrigger || slot != nil || drinkOnly else { return nil }
      guard let foods = foodsOnly(), !foods.isEmpty else { return nil }
      return Meal(slot: slot ?? SpokenLog.slot(hour: hour), foods: foods)
    }

    /// Các món trong mệnh đề, sau khi bỏ đại từ, động từ ăn, tên bữa, lời đệm.
    func foodsOnly() -> [Food]? {
      var kept: [Token] = []
      var i = 0
      while i < tokens.count {
        if let n = SpokenLog.skipPhrase(tokens, at: i) {
          i += n
          continue
        }
        kept.append(tokens[i])
        i += 1
      }
      // Món tách ở dấu phẩy và từ nối món.
      var groups: [[Token]] = [], cur: [Token] = []
      for t in kept {
        if t.raw == "," || SpokenLog.foodJoiners.contains(t.fold) {
          if !cur.isEmpty { groups.append(cur) }
          cur = []
        } else {
          cur.append(t)
        }
      }
      if !cur.isEmpty { groups.append(cur) }
      let foods = groups.compactMap(SpokenLog.food)
      return foods.isEmpty ? nil : foods
    }
  }

  // MARK: - Từ vựng

  static let weakConnectors: Set<String> = ["va", "voi", "cung", "and", "with", "plus", "y", "con", "e", "tambien", "also"]
  /// Nối món trong bữa (giống từ nối yếu, thêm "với").
  static let foodJoiners: Set<String> = ["va", "voi", "cung", "and", "with", "plus", "y", "con", "e"]
  static let pronouns: Set<String> = ["toi", "minh", "em", "anh", "chi", "tao", "i", "me", "my", "yo"]
  static let doneWords: Set<String> = ["da", "vua", "moi", "xong", "roi", "het", "duoc", "just", "already", "ya", "acabo", "de"]
  static let filler: Set<String> = [
    "ok", "oke", "nha", "nhe", "a", "ah", "the", "thoi", "vay", "do", "nay", "hom", "luc", "chung", "them", "more", "mas",
    "around", "about", "roughly", "today", "this", "morning", "so", "well", "hoy", "esta", "manana", "unos", "unas", "como",
  ]
  /// Đồ uống có calo — món của bữa, không phải nước.
  static let otherDrinks = [
    "ca phe", "cafe", "coffee", "tra sua", "tra", "tea", "sua", "milk", "bia", "beer", "nuoc ngot", "soda", "coca", "pepsi",
    "sinh to", "smoothie", "nuoc cam", "nuoc ep", "juice", "nuoc mia", "ruou", "wine", "vino", "cerveza", "leche", "jugo",
    "zumo", "refresco", "batido", "te", "whey", "protein shake", "sua chua",
  ]
  /// Chữ sau "nước" vẫn là nước lọc.
  static let plainWater: Set<String> = ["loc", "suoi", "khoang", "tinh", "trang", "lanh", "nong", "am", "da", "uong", "nha"]
  /// ml cho một đơn vị nước.
  static let waterUnits: [String: Double] = [
    "ml": 1, "l": 1000, "lit": 1000, "liter": 1000, "liters": 1000, "litre": 1000, "litres": 1000, "litro": 1000, "litros": 1000,
    "ly": 250, "coc": 250, "glass": 250, "glasses": 250, "cup": 250, "cups": 250, "vaso": 250, "vasos": 250, "taza": 250, "tazas": 250,
    "chai": 500, "bottle": 500, "bottles": 500, "botella": 500, "botellas": 500, "binh": 500,
  ]
  /// Đơn vị món — thành `Food.unit`.
  static let foodUnits: Set<String> = [
    "to", "bat", "chen", "dia", "cai", "qua", "trai", "mieng", "lat", "ly", "coc", "hop", "goi", "phan", "suat", "chiec", "cuon",
    "banh", "nam", "thia", "muong", "lon", "chai",
    "bowl", "bowls", "plate", "plates", "slice", "slices", "piece", "pieces", "cup", "cups", "glass", "glasses", "can", "cans",
    "serving", "servings", "portion", "portions", "handful", "scoop", "scoops", "bar", "bars", "tbsp", "tsp", "bottle",
    "plato", "platos", "taza", "tazas", "rebanada", "rebanadas", "pieza", "piezas", "vaso", "vasos", "lata", "latas",
    "porcion", "porciones", "cucharada", "cucharadas", "puñado", "botella",
  ]

  /// Cụm bỏ đi khi lấy tên món, dài trước ngắn sau.
  static let skipPhrases: [[String]] = [
    ["bua", "sang"], ["bua", "trua"], ["bua", "toi"], ["bua", "phu"], ["bua", "khuya"], ["an", "sang"], ["an", "trua"], ["an", "toi"],
    ["an", "vat"], ["an", "nhe"], ["sang", "nay"], ["trua", "nay"], ["toi", "nay"], ["chieu", "nay"], ["hom", "nay"],
    ["for", "breakfast"], ["for", "lunch"], ["for", "dinner"], ["for", "a", "snack"], ["this", "morning"], ["for", "snack"],
    ["para", "desayunar"], ["de", "desayuno"], ["para", "el", "almuerzo"], ["para", "cenar"], ["de", "cena"], ["esta", "manana"],
    ["en", "el", "desayuno"], ["en", "la", "cena"], ["acabo", "de", "comer"], ["just", "had"], ["just", "ate"],
    ["breakfast"], ["lunch"], ["dinner"], ["supper"], ["snack"], ["snacked", "on"], ["desayune"], ["almorce"], ["cene"],
    ["desayuno"], ["almuerzo"], ["cena"], ["merienda"], ["merende"], ["comi"], ["bebi"], ["tome"], ["ate"], ["eaten"], ["had"],
    ["eat"], ["drank"], ["uong"],
  ]

  static func skipPhrase(_ tokens: [Token], at i: Int) -> Int? {
    let t = tokens[i]
    // "ăn", "sáng", "trưa", "tối" (có dấu) và các từ đơn bỏ được.
    if ["ăn", "sáng", "trưa", "tối", "chiều", "bữa", "khuya", "tầm", "khoảng", "thêm"].contains(t.lower) { return 1 }
    if t.lower == "an", i == 0 || pronouns.contains(tokens[i - 1].fold) || ["da", "vua", "moi"].contains(tokens[i - 1].fold) {
      return 1
    }
    for p in skipPhrases {
      guard i + p.count <= tokens.count else { continue }
      if zip(p, tokens[i..<(i + p.count)]).allSatisfy({ $0 == $1.fold }) {
        // "sáng" / "trưa" không dấu chỉ bỏ khi đi trong cụm (đã khớp ở đây).
        return p.count
      }
    }
    if pronouns.contains(t.fold) || doneWords.contains(t.fold) && t.fold != "de" { return 1 }
    if filler.contains(t.fold) && !["a", "de", "the"].contains(t.fold) { return 1 }
    if t.fold == "the" { return 1 }
    return nil
  }

  /// Một món từ một nhóm từ: số lượng đầu (hoặc cuối với gram), đơn vị, tên.
  static func food(_ group: [Token]) -> Food? {
    var g = group
    // Bỏ "rồi" / "xong" cuối ("ăn phở rồi").
    while let last = g.last, doneWords.contains(last.fold) || filler.contains(last.fold) { g.removeLast() }
    while let first = g.first, ["of", "de", "la", "el", "los", "las"].contains(first.fold) { g.removeFirst() }
    guard !g.isEmpty else { return nil }
    var servings = 1.0, unit: String?, grams: Double?
    // Gram ở cuối: "ức gà 200g", "200 gram".
    if g.count >= 3, let v = g[g.count - 2].number, ["g", "gr", "gram", "grams", "gramos"].contains(g[g.count - 1].fold) {
      grams = v
      g.removeLast(2)
    }
    if let q = quantity(g, at: 0) {
      var rest = Array(g[q.width...])
      if let u = rest.first, ["g", "gr", "gram", "grams", "gramos"].contains(u.fold) {
        grams = q.value
        rest.removeFirst()
      } else {
        servings = q.value
        if let u = rest.first, foodUnits.contains(u.fold), rest.count > 1 {
          unit = u.lower
          rest.removeFirst()
        }
      }
      while let f = rest.first, ["of", "de"].contains(f.fold) { rest.removeFirst() }
      g = rest
    } else if let a = g.first, ["a", "an", "un", "una", "uno"].contains(a.fold), g.count > 1 {
      g.removeFirst()
      if let u = g.first, foodUnits.contains(u.fold), g.count > 1 {
        unit = u.lower
        g.removeFirst()
        while let f = g.first, ["of", "de"].contains(f.fold) { g.removeFirst() }
      }
    } else if let u = g.first, foodUnits.contains(u.fold), g.count > 1, !["banh", "nam", "can", "bar"].contains(u.fold) {
      // "tô phở" = một tô.
      unit = u.lower
      g.removeFirst()
    }
    let name = g.map(\.raw).joined(separator: " ").trimmingCharacters(in: CharacterSet(charactersIn: " ,.;:!"))
    guard name.count >= 2, name.contains(where: \.isLetter) else { return nil }
    guard (0.25...20).contains(servings) else { return nil }
    if let gr = grams, !(1...3000).contains(gr) { return nil }
    return Food(name: name, servings: servings, unit: unit, grams: grams)
  }

  static func slot(hour: Int) -> String {
    switch hour {
    case 4..<11: "breakfast"
    case 11..<15: "lunch"
    case 15..<17: "snack"
    default: "dinner"
    }
  }

  // MARK: - Số, giờ, thời lượng

  static func number(_ s: String) -> Double? {
    guard s.first?.isNumber == true, !s.contains(":") else { return nil }
    let n = s.replacingOccurrences(of: ",", with: ".")
    guard n.filter({ $0 == "." }).count <= 1, n.allSatisfy({ $0.isNumber || $0 == "." }) else { return nil }
    return Double(n)
  }

  /// Số chữ: vi theo chữ có dấu ("tư" ≠ "từ", "sáu" ≠ "sau"), en / es bỏ dấu.
  static let wordNumbers: [String: Double] = [
    "một": 1, "hai": 2, "ba": 3, "bốn": 4, "tư": 4, "năm": 5, "sáu": 6, "bảy": 7, "bẩy": 7, "tám": 8, "chín": 9, "mười": 10,
    "mười một": 11, "mười hai": 12, "nửa": 0.5, "rưỡi": 0.5,
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "half": 0.5, "a couple of": 2, "couple of": 2,
    "uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9,
    "diez": 10, "once": 11, "doce": 12, "medio": 0.5, "media": 0.5,
  ]

  /// Số lượng bắt đầu ở `i`: số ("2", "1,5"), chữ ("hai", "two", "dos"), có thể
  /// kèm "rưỡi" / "and a half" / "y medio".
  static func quantity(_ tokens: [Token], at i: Int) -> (value: Double, width: Int)? {
    guard i < tokens.count else { return nil }
    var value: Double?, width = 0
    if let n = tokens[i].number {
      value = n
      width = 1
    } else {
      for w in [3, 2, 1] where i + w <= tokens.count {
        let phrase = tokens[i..<(i + w)].map(\.lower).joined(separator: " ")
        // Tra chữ như đã viết trước ("tư" ≠ "từ", "sáu" ≠ "sau"); chỉ tra bản bỏ
        // dấu khi chính chữ ấy không có dấu ("dós" → "dos"), để "bà" không thành 3.
        if let v = wordNumbers[phrase] {
          value = v
          width = w
          break
        }
      }
    }
    guard var v = value else { return nil }
    // "rưỡi", "and a half", "y medio".
    let rest = tokens[(i + width)...].map(\.fold)
    if rest.first == "ruoi" {
      v += 0.5
      width += 1
    } else if rest.starts(with: ["and", "a", "half"]) {
      v += 0.5
      width += 3
    } else if rest.starts(with: ["y", "medio"]) || rest.starts(with: ["y", "media"]) {
      v += 0.5
      width += 2
    }
    return (v, width)
  }

  static let hourUnits: Set<String> = ["tieng", "gio", "h", "hour", "hours", "hr", "hrs", "hora", "horas"]
  static let minuteUnits: Set<String> = ["phut", "p", "min", "mins", "minute", "minutes", "minuto", "minutos", "m"]

  /// Thời lượng trong câu, phút: "7 tiếng rưỡi", "7h30", "7.5 hours", "45 phút",
  /// "siete horas y media", "1 tiếng 15 phút". Bỏ qua số đứng sau "lúc" / "at" /
  /// "a las" (đó là giờ, không phải thời lượng).
  static func duration(_ tokens: [Token], maxHours: Double) -> Int? {
    var i = 0
    while i < tokens.count {
      if i > 0, ["luc", "at", "las", "tu", "from", "den", "to", "until", "hasta"].contains(tokens[i - 1].fold) || isClockLike(tokens, at: i) {
        i += 1
        continue
      }
      guard let q = quantity(tokens, at: i) else {
        i += 1
        continue
      }
      var j = i + q.width
      guard j < tokens.count else { break }
      let unit = tokens[j].fold
      if hourUnits.contains(unit) {
        var minutes = q.value * 60
        j += 1
        if j < tokens.count, tokens[j].fold == "ruoi" {
          minutes += 30
          j += 1
        } else if tokens[j...].map(\.fold).starts(with: ["and", "a", "half"]) {
          minutes += 30
        } else if tokens[j...].map(\.fold).starts(with: ["y", "media"]) {
          minutes += 30
        } else if j < tokens.count, let extra = tokens[j].number, extra < 60 {
          // "7h30", "7 tiếng 15 (phút)".
          minutes += extra
        }
        guard q.value <= maxHours else { return nil }
        return Int(minutes.rounded())
      }
      if minuteUnits.contains(unit), unit != "m" || q.value >= 5 {
        return Int(q.value.rounded())
      }
      i += 1
    }
    return nil
  }

  /// Số kiểu giờ đồng hồ "6:30".
  static func isClockLike(_ tokens: [Token], at i: Int) -> Bool { tokens[i].raw.contains(":") && tokens[i].raw.first?.isNumber == true }

  enum ClockRole { case bed, wake }

  /// Giờ ngay sau một cụm báo hiệu ("ngủ lúc", "woke up at", "a las").
  static func clock(after cues: [[String]], in tokens: [Token], role: ClockRole, skipFirstOf: [[String]]? = nil) -> SleepLog.Clock? {
    var skipped = skipFirstOf == nil
    var i = 0
    while i < tokens.count {
      var matched: [String]?
      for c in cues where i + c.count <= tokens.count {
        if zip(c, tokens[i..<(i + c.count)]).allSatisfy({ $0 == $1.fold }) {
          matched = c
          break
        }
      }
      if !skipped, let s = skipFirstOf {
        if s.contains(where: { c in i + c.count <= tokens.count && zip(c, tokens[i..<(i + c.count)]).allSatisfy { $0 == $1.fold } }) {
          skipped = true
          // Vượt qua cụm giờ ngủ và giờ đã đọc.
          let cueLen = s.first(where: { c in i + c.count <= tokens.count && zip(c, tokens[i..<(i + c.count)]).allSatisfy { $0 == $1.fold } })?.count ?? 1
          i += cueLen
          while i < tokens.count, ["la", "las", "khoang", "around", "about", "tam", "luc"].contains(tokens[i].fold) { i += 1 }
          while i < tokens.count, tokens[i].number != nil || isClockLike(tokens, at: i) || hourUnits.contains(tokens[i].fold)
            || minuteUnits.contains(tokens[i].fold) || dayParts[tokens[i].fold] != nil || ["ruoi"].contains(tokens[i].fold)
          {
            i += 1
          }
          continue
        }
      }
      if let c = matched, let clock = readClock(tokens, at: i + c.count, role: role) {
        return clock
      }
      i += 1
    }
    return nil
  }

  enum DayPart { case morning, afternoon, evening, night }

  /// Buổi trong ngày nói sau giờ.
  static let dayParts: [String: DayPart] = [
    "sang": .morning, "am": .morning, "a.m.": .morning, "manana": .morning, "morning": .morning,
    "trua": .afternoon, "chieu": .afternoon, "pm": .evening, "p.m.": .evening, "tarde": .afternoon,
    "toi": .evening, "evening": .evening, "noche": .night, "night": .night, "dem": .night, "khuya": .night,
  ]

  /// "23h", "11 giờ tối", "6h30", "6:30", "11pm", "6 rưỡi", "las 11 de la noche".
  static func readClock(_ tokens: [Token], at start: Int, role: ClockRole) -> SleepLog.Clock? {
    var i = start
    while i < tokens.count, ["la", "las", "khoang", "around", "about", "tam", "luc"].contains(tokens[i].fold) { i += 1 }
    guard i < tokens.count else { return nil }
    var hour: Int, minute = 0
    if isClockLike(tokens, at: i) {
      let parts = tokens[i].raw.split(separator: ":")
      guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]) else { return nil }
      hour = h
      minute = m
      i += 1
    } else if let q = quantity(tokens, at: i), q.value == q.value.rounded(.down) || q.value.truncatingRemainder(dividingBy: 1) == 0.5 {
      hour = Int(q.value)
      if q.value.truncatingRemainder(dividingBy: 1) == 0.5 { minute = 30 }
      i += q.width
      if i < tokens.count, hourUnits.contains(tokens[i].fold) { i += 1 }
      if i < tokens.count, tokens[i].fold == "ruoi" {
        minute = 30
        i += 1
      } else if i < tokens.count, let m = tokens[i].number, m < 60, m == m.rounded() {
        minute = Int(m)
        i += 1
        if i < tokens.count, minuteUnits.contains(tokens[i].fold) { i += 1 }
      } else if tokens[i...].map(\.fold).starts(with: ["y", "media"]) {
        minute = 30
        i += 2
      }
    } else {
      return nil
    }
    // "tối", "pm", "de la noche".
    var part: DayPart?
    var k = i
    while k < min(tokens.count, i + 4) {
      if let p = dayParts[tokens[k].fold] {
        // "tối" bỏ dấu = "tôi": chỉ nhận khi có dấu đúng hay đi sau giờ.
        if tokens[k].fold == "toi", tokens[k].lower == "tôi" { break }
        part = p
        break
      }
      if !["de", "la", "in", "the", "buoi", "gio"].contains(tokens[k].fold) { break }
      k += 1
    }
    guard (0...24).contains(hour), (0...59).contains(minute) else { return nil }
    if hour == 24 { hour = 0 }
    if let part, hour <= 12 {
      switch part {
      case .morning: if hour == 12 { hour = 0 }
      // "12 giờ trưa" = 12; "2 giờ chiều" = 14.
      case .afternoon: if hour < 12 { hour += 12 }
      case .evening: if hour < 12 { hour += 12 }
      // Đêm / khuya: "12 giờ đêm" = 0, "1 giờ đêm" = 1, "10 giờ đêm" = 22.
      case .night: if hour == 12 { hour = 0 } else if hour >= 6 { hour += 12 }
      }
    } else if hour <= 12 {
      switch role {
      // Giờ đi ngủ không nói buổi: 6…11 là tối (18…23), 12 là nửa đêm.
      case .bed: if (6...11).contains(hour) { hour += 12 } else if hour == 12 { hour = 0 }
      // Giờ dậy không nói buổi: buổi sáng.
      case .wake: if hour == 12 { hour = 12 }
      }
    }
    return SleepLog.Clock(hour: hour, minute: minute)
  }
}
