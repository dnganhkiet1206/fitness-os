public import Foundation

/// "Insight hôm nay" dạng điểm nhấn kiểu Apple Health (Kiệt duyệt mock 21/10):
/// MỘT câu chính thành tiêu đề lớn + lời giải thích, kèm thẻ số liệu của đúng
/// chủ đề ấy (giá trị / mục tiêu, vòng, hai ô số với trung bình 7 ngày); các câu
/// còn lại xuống chân thẻ. Phần này chỉ là luật — chữ do app dựng.
public enum InsightHighlight {
  /// Chủ đề của thẻ số liệu, theo `type` của câu (server: hydration, sleep,
  /// protein, steps, recovery, nutrition, training; dự phòng: readiness, calories…).
  public enum Topic: String, Sendable, Hashable, CaseIterable {
    case calories, protein, sleep, readiness, steps, water
  }

  public static func topic(_ type: String) -> Topic? {
    switch type.lowercased() {
    case "calories", "nutrition": .calories
    case "protein": .protein
    case "sleep": .sleep
    case "readiness", "recovery", "training": .readiness
    case "steps": .steps
    case "hydration", "water": .water
    default: nil
    }
  }

  /// Câu chính = mức ưu tiên cao nhất (cùng mức thì giữ thứ tự của server);
  /// phần còn lại giữ thứ tự cũ. Rỗng → `nil`.
  public static func lead(_ nudges: [SmartNudges.Nudge]) -> (lead: SmartNudges.Nudge, rest: [SmartNudges.Nudge])? {
    func rank(_ p: SmartNudges.Priority) -> Int {
      switch p {
      case .high: 0
      case .medium: 1
      case .low: 2
      }
    }
    guard let i = nudges.indices.min(by: { rank(nudges[$0].priority) < rank(nudges[$1].priority) }) else { return nil }
    var rest = nudges
    let lead = rest.remove(at: i)
    return (lead, rest)
  }

  /// Trung bình trên các ngày CÓ ghi (giá trị > 0) — ngày trống không kéo số xuống.
  public struct Average: Sendable, Hashable {
    public let value: Double
    public let days: Int

    public init(value: Double, days: Int) {
      self.value = value
      self.days = days
    }
  }

  /// Bảy ngày trước hôm nay (hàng `daily_logs`).
  public struct Week: Sendable, Hashable {
    public var kcal: Average?
    public var proteinG: Average?
    public var sleepMin: Average?
    public var steps: Average?
    public var waterMl: Average?
    public var readiness: Average?

    public init(
      kcal: Average? = nil, proteinG: Average? = nil, sleepMin: Average? = nil, steps: Average? = nil,
      waterMl: Average? = nil, readiness: Average? = nil
    ) {
      self.kcal = kcal
      self.proteinG = proteinG
      self.sleepMin = sleepMin
      self.steps = steps
      self.waterMl = waterMl
      self.readiness = readiness
    }

    /// Cột `daily_logs` cần đọc.
    public static let columns = "date, kcal, protein_g, sleep_duration_min, steps, water_ml, readiness_score"
  }

  public static func week(_ rows: [JSONValue]) -> Week {
    func avg(_ column: String) -> Average? {
      let values = rows.map { JS.number($0[column]) }.filter { $0.isFinite && $0 > 0 }
      guard !values.isEmpty else { return nil }
      return Average(value: values.reduce(0, +) / Double(values.count), days: values.count)
    }
    return Week(
      kcal: avg("kcal"), proteinG: avg("protein_g"), sleepMin: avg("sleep_duration_min"), steps: avg("steps"),
      waterMl: avg("water_ml"), readiness: avg("readiness_score"))
  }

  /// Số của hôm nay cho thẻ.
  public struct Today: Sendable, Hashable, Codable {
    public var kcal: Double
    public var kcalTarget: Double
    public var proteinG: Double
    public var proteinTarget: Double
    public var sleepMin: Double
    public var sleepTargetMin: Double
    public var steps: Double
    public var stepsGoal: Double
    public var waterMl: Double
    public var waterTargetMl: Double
    /// Điểm sẵn sàng có tín hiệu hồi phục thật (`scoredReadiness`).
    public var readiness: Int?

    public init(
      kcal: Double = 0, kcalTarget: Double = 0, proteinG: Double = 0, proteinTarget: Double = 0, sleepMin: Double = 0,
      sleepTargetMin: Double = 480, steps: Double = 0, stepsGoal: Double = 0, waterMl: Double = 0,
      waterTargetMl: Double = 0, readiness: Int? = nil
    ) {
      self.kcal = kcal
      self.kcalTarget = kcalTarget
      self.proteinG = proteinG
      self.proteinTarget = proteinTarget
      self.sleepMin = sleepMin
      self.sleepTargetMin = sleepTargetMin
      self.steps = steps
      self.stepsGoal = stepsGoal
      self.waterMl = waterMl
      self.waterTargetMl = waterTargetMl
      self.readiness = readiness
    }
  }

  /// Phần vòng đã lấp, 0…1; không có mục tiêu hay chưa có số → 0.
  public static func progress(_ topic: Topic, _ t: Today) -> Double {
    func ratio(_ v: Double, _ goal: Double) -> Double {
      guard goal > 0, v.isFinite, v > 0 else { return 0 }
      return min(1, v / goal)
    }
    switch topic {
    case .calories: return ratio(t.kcal, t.kcalTarget)
    case .protein: return ratio(t.proteinG, t.proteinTarget)
    case .sleep: return ratio(t.sleepMin, t.sleepTargetMin)
    case .readiness: return ratio(Double(t.readiness ?? 0), 100)
    case .steps: return ratio(t.steps, t.stepsGoal)
    case .water: return ratio(t.waterMl, t.waterTargetMl)
    }
  }

  /// Số nhóm theo ngôn ngữ app ("1.308" / "1,308").
  public static func number(_ v: Double, lang: String) -> String { CoachQuickReply.grouped(v, .init(lang)) }

  /// "7 giờ 5 phút" / "7h 5m" / "7 h 5 min".
  public static func duration(_ minutes: Double, lang: String) -> String {
    CoachQuickReply.duration(minutes.rounded(), .init(lang))
  }

  /// Kết quả đã CHỐT cho hôm nay — không đổi theo việc ghi trong ngày (giấc đêm qua,
  /// điểm sẵn sàng). Chỉ chủ đề này mới vẽ vòng; số còn tăng trong ngày (kcal, đạm,
  /// nước, bước) không vẽ vòng (Kiệt 22/10: vòng chỉ cho kết quả không đổi về sau).
  public static func isSettled(_ topic: Topic) -> Bool {
    switch topic {
    case .sleep, .readiness: true
    case .calories, .protein, .water, .steps: false
    }
  }

  /// Câu đã được giải quyết bằng việc người dùng vừa làm: số của chủ đề đã chạm mục
  /// tiêu. Câu AI về chủ đề ấy giờ là cũ — bỏ đi (Kiệt 22/10: insight phải đổi theo
  /// hành vi). Giấc ngủ / sẵn sàng không tự hết hạn ở đây: ghi giấc ngủ đổi dấu dữ liệu
  /// và kéo lượt AI mới.
  public static func resolved(_ nudge: SmartNudges.Nudge, _ t: Today) -> Bool {
    guard let topic = topic(nudge.type) else { return false }
    func reached(_ v: Double, _ goal: Double) -> Bool { goal > 0 && v >= goal }
    switch topic {
    case .calories: return reached(t.kcal, t.kcalTarget * 0.95)
    case .protein: return reached(t.proteinG, t.proteinTarget * 0.95)
    case .water: return reached(t.waterMl, t.waterTargetMl)
    case .steps: return reached(t.steps, t.stepsGoal)
    case .sleep, .readiness: return false
    }
  }

  /// Câu đã CŨ: người dùng đã ghi thêm đúng chủ đề ấy kể từ lúc AI viết (số của chủ đề
  /// tăng so với lúc insight về). Lời khuyên viết trên số cũ — tự ẩn (Kiệt 22/10: "tốt
  /// nhất là tự ẩn insight cũ nếu người dùng cập nhật dữ liệu mới").
  public static func stale(_ nudge: SmartNudges.Nudge, since base: Today, now t: Today) -> Bool {
    guard let topic = topic(nudge.type) else { return false }
    func grew(_ a: Double, _ b: Double) -> Bool { b > a + 0.5 }
    switch topic {
    case .calories: return grew(base.kcal, t.kcal)
    case .protein: return grew(base.proteinG, t.proteinG)
    case .water: return grew(base.waterMl, t.waterMl)
    case .steps: return grew(base.steps, t.steps)
    case .sleep: return grew(base.sleepMin, t.sleepMin)
    case .readiness: return (base.readiness ?? -1) != (t.readiness ?? -1)
    }
  }

  /// Các câu còn đúng với số hiện tại (bỏ câu đã giải quyết, và — khi biết số lúc
  /// insight về — câu đã cũ vì người dùng vừa ghi thêm), giữ thứ tự.
  public static func live(_ nudges: [SmartNudges.Nudge], _ t: Today, since base: Today? = nil) -> [SmartNudges.Nudge] {
    nudges.filter { n in !resolved(n, t) && !(base.map { stale(n, since: $0, now: t) } ?? false) }
  }

  /// Khoá "đã tắt" của một insight: cùng ngày + cùng dấu dữ liệu. Dấu đổi
  /// (vừa ghi ngủ / ăn / tập) thì insight mới hiện lại.
  public static func dismissKey(date: LocalDate, stamp: String) -> String { "\(date)|\(stamp)" }
}
