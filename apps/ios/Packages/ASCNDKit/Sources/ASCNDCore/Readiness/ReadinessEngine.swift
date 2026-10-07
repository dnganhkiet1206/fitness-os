/// Điểm sẵn sàng — `lib/readiness-engine.ts` @ fac9ac2, nguyên văn từng nhánh.
///
/// Bốn chiều (HRV, nhịp tim nghỉ, giấc ngủ, tải tập), chiều nào không đo được
/// thì bỏ và chia lại trọng số. Những gì `daily_logs` lưu (điểm, trạng thái,
/// `explainToken`, `recommendationKey`, ACWR) đều ở đây; câu chữ tiếng Việt RN
/// dựng kèm (`explain`, `recommendation`) KHÔNG port — RN cũng không lưu
/// chúng, UI dịch từ token / key (render-by-key).
public struct ReadinessInput: Sendable, Hashable {
  public var hrvToday: Double?
  public var rhrToday: Double?
  public var sleepMinLastNight: Double
  public var sleepTargetMin: Double
  public var sleepDebt7dMin: Double
  public var trainingLoad7d: Double
  public var trainingLoad28d: Double
  /// Số ngày cửa sổ 28 ngày thật sự phủ; `nil` = cả cửa sổ (28).
  public var trainingDays28d: Double?
  public var sorenessToday: Double?
  public var illness: Bool
  public var painFlagMax: Double?
  public var hrvHistory28d: [Double]
  public var rhrHistory28d: [Double]

  public init(
    hrvToday: Double?, rhrToday: Double?, sleepMinLastNight: Double, sleepTargetMin: Double,
    sleepDebt7dMin: Double, trainingLoad7d: Double, trainingLoad28d: Double, trainingDays28d: Double?,
    sorenessToday: Double?, illness: Bool, painFlagMax: Double?, hrvHistory28d: [Double], rhrHistory28d: [Double]
  ) {
    self.hrvToday = hrvToday
    self.rhrToday = rhrToday
    self.sleepMinLastNight = sleepMinLastNight
    self.sleepTargetMin = sleepTargetMin
    self.sleepDebt7dMin = sleepDebt7dMin
    self.trainingLoad7d = trainingLoad7d
    self.trainingLoad28d = trainingLoad28d
    self.trainingDays28d = trainingDays28d
    self.sorenessToday = sorenessToday
    self.illness = illness
    self.painFlagMax = painFlagMax
    self.hrvHistory28d = hrvHistory28d
    self.rhrHistory28d = rhrHistory28d
  }
}

public struct ReadinessResult: Sendable, Hashable {
  public enum Status: String, Sendable, Hashable { case green, yellow, red }
  public enum Confidence: String, Sendable, Hashable { case high, medium, low }
  public let score: Double
  public let status: Status
  /// `hrv:62|sleep:80|…` — sub-score đã làm tròn, thấp trước (`readiness_explain`).
  public let explainToken: String
  public let recommendationKey: String
  public let subscores: [String: Double]
  /// Làm tròn 2 chữ số; `nil` khi không có nền 28 ngày.
  public let acwr: Double?
  public let confidence: Confidence
}

public enum ReadinessEngine {
  static func median(_ a: [Double]) -> Double {
    if a.isEmpty { return 0 }
    // `sort((a, b) => a - b)`; dữ liệu đã lọc `null`, NaN không vào tới đây
    // trừ khi cột hỏng — khi ấy thứ tự của JS cũng không xác định.
    let s = a.sorted()
    let mid = s.count / 2
    return s.count % 2 != 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  }

  static func mad(_ a: [Double]) -> Double {
    let med = median(a)
    return median(a.map { abs($0 - med) })
  }

  static func robustZ(_ x: Double, _ med: Double, _ madVal: Double, _ floor: Double) -> Double {
    (x - med) / (1.4826 * JS.max(madVal, floor) + 1e-6)
  }

  static func hrvScore(_ hrv: Double, _ history: [Double]) -> Double? {
    if history.count < 5 { return nil }
    let z = JS.clamp(robustZ(hrv, median(history), mad(history), 1), -3, 3)
    return JS.clamp(50 + 15 * z, 0, 100)
  }

  static func rhrScore(_ rhr: Double, _ history: [Double]) -> Double? {
    if history.count < 5 { return nil }
    let z = JS.clamp(robustZ(rhr, median(history), mad(history), 1), -3, 3)
    return JS.clamp(50 - 12 * z, 0, 100)
  }

  static let overGraceH = 1.0
  static let overPerH = 20.0
  static let overMax = 40.0

  static func sleepScore(_ sleepMin: Double?, _ targetMin: Double, _ debtMin: Double) -> Double? {
    guard let sleepMin, !(sleepMin <= 0) else { return nil }
    let target = JS.truthy(targetMin) ? targetMin : 480
    let ratio = sleepMin / target
    var score: Double
    if ratio >= 1.0 {
      let overH = (sleepMin - target) / 60
      score = 100 - JS.clamp((overH - overGraceH) * overPerH, 0, overMax)
    } else if ratio >= 0.85 {
      score = 60 + ((ratio - 0.85) / 0.15) * 40
    } else {
      score = 20 + (ratio / 0.85) * 40
    }
    score -= JS.clamp((debtMin / 60) * 5, 0, 15)
    return JS.clamp(score, 0, 100)
  }

  static func acwr(_ load7d: Double, _ load28d: Double, _ chronicDays: Double) -> Double {
    let acute = load7d / 7
    let chronic = load28d / JS.max(chronicDays, 7)
    return acute / (chronic + 1e-6)
  }

  static func loadScore(_ load7d: Double, _ load28d: Double, _ chronicDays: Double, _ soreness: Double?) -> Double? {
    if load28d <= 0 { return nil }
    let a = acwr(load7d, load28d, chronicDays)
    var score: Double
    if a >= 0.8 && a <= 1.3 {
      score = 80
    } else if a >= 0.65 && a < 0.8 {
      score = 65
    } else if a > 1.3 && a <= 1.6 {
      score = 55
    } else if a < 0.65 {
      score = 45
    } else {
      score = 35
    }
    if let soreness, soreness > 6 { score -= (soreness - 6) * 4 }
    return JS.clamp(score, 0, 100)
  }

  public static func confidence(_ dimensions: Int) -> ReadinessResult.Confidence {
    if dimensions >= 3 { return .high }
    if dimensions == 2 { return .medium }
    return .low
  }

  /// Ba chiều đo PHỤC HỒI (`RECOVERY_COMPONENTS`); tải tập không phải.
  static let recoveryComponents: Set<String> = ["hrv", "rhr", "sleep"]

  public static func compute(_ input: ReadinessInput) -> ReadinessResult? {
    let hasHRV = (input.hrvToday?.isFinite ?? false) && input.hrvHistory28d.count >= 5
    let hrv = hasHRV ? hrvScore(input.hrvToday!, input.hrvHistory28d) : nil
    let rhr = input.rhrToday.flatMap { JS.truthy($0) ? rhrScore($0, input.rhrHistory28d) : nil }
    let sleep = sleepScore(input.sleepMinLastNight, input.sleepTargetMin, input.sleepDebt7dMin)
    let chronicDays = input.trainingDays28d ?? 28
    let load = loadScore(input.trainingLoad7d, input.trainingLoad28d, chronicDays, input.sorenessToday)
    let ratio = input.trainingLoad28d > 0 ? acwr(input.trainingLoad7d, input.trainingLoad28d, chronicDays) : nil

    var present: [(w: Double, score: Double)] = []
    func add(_ w: Double, _ s: Double?) { if let s { present.append((w, s)) } }
    if hrv != nil && sleep != nil && load != nil {
      add(0.30, hrv); add(0.20, rhr); add(0.30, sleep); add(0.20, load)
    } else if hrv == nil && sleep != nil && load != nil {
      add(0.25, rhr); add(0.45, sleep); add(0.30, load)
    } else {
      add(0.30, hrv); add(0.20, rhr); add(0.30, sleep); add(0.20, load)
    }
    if present.isEmpty { return nil }

    let totalWeight = present.reduce(0) { $0 + $1.w }
    var raw = present.reduce(0) { $0 + $1.w * $1.score } / (JS.truthy(totalWeight) ? totalWeight : 1)
    if input.illness { raw = JS.min(raw, 35) }
    if let pain = input.painFlagMax, pain >= 7 { raw = JS.min(raw, 45) }
    if sleep != nil && input.sleepMinLastNight < 240 { raw = JS.min(raw, 40) }

    let score = JS.round(JS.clamp(raw, 0, 100))
    let status: ReadinessResult.Status = score >= 75 ? .green : score >= 50 ? .yellow : .red

    var factors: [(key: String, score: Double)] = []
    if let hrv { factors.append(("hrv", hrv)) }
    if let rhr { factors.append(("rhr", rhr)) }
    if let sleep { factors.append(("sleep", sleep)) }
    if let load { factors.append(("load", load)) }
    // `Array.prototype.sort` ổn định: bằng điểm thì giữ thứ tự thêm vào.
    factors = factors.enumerated()
      .sorted { $0.element.score != $1.element.score ? $0.element.score < $1.element.score : $0.offset < $1.offset }
      .map(\.element)
    let explainToken = factors.map { "\($0.key):\(Self.jsString(JS.round($0.score)))" }.joined(separator: "|")
    // `hasRecoverySignal(explainToken)`: token đọc lại, phần nào số hợp lệ.
    let recovery = factors.contains { recoveryComponents.contains($0.key) && !JS.round($0.score).isNaN }

    let key: String
    if status == .green && ratio == nil {
      key = "green_no_load"
    } else if status == .green, let ratio, ratio <= 1.2 {
      key = "green_optimal"
    } else if status == .green {
      key = "green_watch"
    } else if status == .yellow, let sleep, sleep < 50 {
      key = "yellow_sleep"
    } else if status == .yellow {
      key = "yellow_reduce"
    } else if status == .red, let rhr, rhr < 40, let sleep, sleep < 40 {
      key = "red_rest"
    } else if status == .red && recovery {
      key = "red_recover"
    } else if status == .red {
      key = "red_load_only"
    } else {
      key = "listen"
    }

    var subscores: [String: Double] = [:]
    if let hrv { subscores["hrv"] = JS.round(hrv) }
    if let rhr { subscores["rhr"] = JS.round(rhr) }
    if let sleep { subscores["sleep"] = JS.round(sleep) }
    if let load { subscores["load"] = JS.round(load) }

    return ReadinessResult(
      score: score, status: status, explainToken: explainToken, recommendationKey: key, subscores: subscores,
      acwr: ratio.map { JS.round($0 * 100) / 100 }, confidence: confidence(present.count))
  }

  /// `String(n)` của JS cho số nguyên đã làm tròn (`-0` → "0", NaN → "NaN").
  static func jsString(_ x: Double) -> String {
    if x.isNaN { return "NaN" }
    if x == 0 { return "0" }
    if x == x.rounded(), abs(x) < 1e15 { return String(Int(x)) }
    return String(x)
  }
}
