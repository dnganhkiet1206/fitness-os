public import Foundation

/// Kế hoạch dinh dưỡng từ số đo cơ thể — `lib/fitness-calc.ts` @ fac9ac2, port
/// nguyên công thức (Mifflin-St Jeor, hệ số vận động, sàn calo theo giới, đạm
/// theo cân nặng tham chiếu, sàn chất béo / tinh bột, nước theo BMI).
///
/// Golden: `Fixtures/plan-golden.json` — 513 ca sinh bằng chính mã RN biên dịch
/// (`apps/ios/tools/insights-golden/gen-plan.mjs`).
public enum FitnessCalc {
  public enum Sex: String, Sendable, Hashable, Codable, CaseIterable { case male, female, other }

  /// `Math.round` của JS (nửa làm tròn LÊN).
  static func jsRound(_ x: Double) -> Int { Int((x + 0.5).rounded(.down)) }

  /// `calcBMR`: Mifflin-St Jeor; "other" theo công thức nam.
  public static func bmr(weightKg: Double, heightCm: Double, age: Int, sex: Sex) -> Int {
    let base = 10 * weightKg + 6.25 * heightCm - 5 * Double(age)
    return jsRound(sex == .female ? base - 161 : base + 5)
  }

  static let activityMultipliers: [String: Double] = [
    "sedentary": 1.2, "light": 1.375, "moderate": 1.55, "high": 1.725, "athlete": 1.9,
  ]

  /// `calcTDEE`: hệ số lạ / trống → 1.55.
  public static func tdee(bmr: Int, activityLevel: String) -> Int {
    jsRound(Double(bmr) * (activityMultipliers[activityLevel] ?? 1.55))
  }

  static func calorieFloor(_ sex: Sex) -> Int { sex == .female ? 1200 : 1500 }

  /// `calcTargetCalories`.
  public static func targetCalories(tdee: Int, goal: String, sex: Sex) -> Int {
    let t = Double(tdee)
    let target: Int = switch goal {
    case "bulk": jsRound(t * 1.1)
    case "cut": jsRound(t * 0.8)
    case "strength", "endurance": jsRound(t * 1.05)
    default: jsRound(t)
    }
    return max(target, calorieFloor(sex))
  }

  public static let fiberPer1000Kcal = 14.0
  static let fatFloorFraction = 0.2
  public static let fatTargetFraction = 0.25
  static let minCarbG = 50
  static let proteinFloorPerKg = 1.2

  /// `proteinReferenceWeight`: không quá cân nặng ở BMI 30.
  public static func proteinReferenceWeight(weightKg: Double, heightCm: Double?) -> Double {
    guard let h = heightCm, h != 0, h >= 100, h <= 250 else { return weightKg }
    let m = h / 100
    return min(weightKg, 30 * m * m)
  }

  public struct Macros: Sendable, Hashable, Codable {
    public let proteinG: Int
    public let carbsG: Int
    public let fatG: Int
    public let fiberG: Int
  }

  /// `calcMacros`.
  public static func macros(targetKcal: Int, weightKg: Double, goal: String, heightCm: Double?) -> Macros {
    let kcal = Double(targetKcal)
    let refKg = proteinReferenceWeight(weightKg: weightKg, heightCm: heightCm)
    let perKg = switch goal {
    case "bulk": 2.2
    case "cut": 2.4
    case "strength": 2.0
    default: 1.8
    }
    var protein = jsRound(refKg * perKg)
    var fat = jsRound(kcal * fatTargetFraction / 9)
    var short = minCarbG * 4 + protein * 4 + fat * 9 - targetKcal
    if short > 0 {
      let fatFloor = jsRound(kcal * fatFloorFraction / 9)
      let fromFat = min(short, max(fat - fatFloor, 0) * 9)
      fat -= jsRound(Double(fromFat) / 9)
      short -= fromFat
    }
    if short > 0 {
      let proteinFloor = jsRound(refKg * proteinFloorPerKg)
      let fromProtein = min(short, max(protein - proteinFloor, 0) * 4)
      protein -= jsRound(Double(fromProtein) / 4)
    }
    let carbs = max(jsRound(Double(targetKcal - protein * 4 - fat * 9) / 4), 0)
    let fiber = jsRound(kcal / 1000 * fiberPer1000Kcal)
    return Macros(proteinG: protein, carbsG: carbs, fatG: fat, fiberG: fiber)
  }

  /// `calcWaterTarget`: 35 ml/kg; BMI ≥ 30 thì theo cân nặng ở BMI 30, không
  /// dưới 25 ml/kg.
  public static func waterTarget(weightKg: Double, heightCm: Double?) -> Int {
    guard let h = heightCm, h != 0, h >= 100, h <= 250 else { return jsRound(weightKg * 35) }
    let m = h / 100
    if weightKg / (m * m) < 30 { return jsRound(weightKg * 35) }
    return jsRound(max(weightKg * 25, 30 * m * m * 35))
  }

  public struct Plan: Sendable, Hashable, Codable {
    public let bmr: Int
    public let tdee: Int
    public let targetKcal: Int
    public let proteinG: Int
    public let carbsG: Int
    public let fatG: Int
    public let fiberG: Int
    public let waterMl: Int
  }

  /// `BOUNDS.weight_kg` / `BOUNDS.height_cm` (`plausible.ts:138`, `:197`).
  public static let weightBounds = 20.0...400.0
  public static let heightBounds = 100.0...250.0

  /// `calcPlan` — đầu vào đã qua cổng (`entry`).
  static func plan(weightKg: Double, heightCm: Double, age: Int, sex: Sex, goal: String, activityLevel: String) -> Plan {
    let b = bmr(weightKg: weightKg, heightCm: heightCm, age: age, sex: sex)
    let t = tdee(bmr: b, activityLevel: activityLevel)
    let target = targetCalories(tdee: t, goal: goal, sex: sex)
    let m = macros(targetKcal: target, weightKg: weightKg, goal: goal, heightCm: heightCm)
    return Plan(
      bmr: b, tdee: t, targetKcal: target, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG, fiberG: m.fiberG,
      waterMl: waterTarget(weightKg: weightKg, heightCm: heightCm))
  }

  public enum StatField: String, Sendable, Hashable, Codable { case heightCm = "height_cm", weightKg = "weight_kg", dob }

  public enum Attempt: Sendable, Hashable {
    case ok(plan: Plan, heightCm: Double, weightKg: Double, age: Int)
    case missing([StatField])

    public var plan: Plan? {
      if case .ok(let p, _, _, _) = self { return p }
      return nil
    }
    public var missing: [StatField] {
      if case .missing(let m) = self { return m }
      return []
    }
  }

  /// `readStat(q, text, true)`: chữ số thập phân thật (`-?\d+(\.\d*)?|\.\d+`),
  /// trong cận; trống hay sai dạng → `nil`. Không bao giờ thay bằng mặc định.
  static func readStat(_ text: String, _ bounds: ClosedRange<Double>) -> Double? {
    // `text.trim()` của JS: bỏ BOM (U+FEFF), giữ NEL (U+0085) — khác
    // `whitespacesAndNewlines` ở đúng hai ký tự ấy.
    let t = RepEntry.trimJS(text)
    guard !t.isEmpty, isDecimal(t), let v = Double(t), v.isFinite, bounds.contains(v) else { return nil }
    return v
  }

  static func isDecimal(_ s: String) -> Bool {
    var body = Substring(s)
    if body.first == "-" { body = body.dropFirst() }
    let digits = { (x: Substring) in x.unicodeScalars.allSatisfy { $0.value >= 48 && $0.value <= 57 } }
    if body.first == "." { return body.count > 1 && digits(body.dropFirst()) }
    let parts = body.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false)
    guard let whole = parts.first, !whole.isEmpty, digits(whole) else { return false }
    return parts.count == 1 || digits(parts[1])
  }

  /// `calcAge`: tuổi tròn theo lịch tại `today`.
  public static func age(dob: LocalDate, today: LocalDate) -> Int {
    var a = today.year - dob.year
    if today.month < dob.month || (today.month == dob.month && today.day < dob.day) { a -= 1 }
    return a
  }

  /// `planFromEntry`: cổng duy nhất từ ô nhập tới kế hoạch. Thiếu / sai thì
  /// nói đúng ô nào; tuổi ngoài 0…130 (ngày sinh tương lai) là `dob`.
  public static func planFromEntry(
    heightText: String, weightText: String, dob: LocalDate?, sex: Sex, goal: String, activityLevel: String,
    today: LocalDate
  ) -> Attempt {
    let height = readStat(heightText, heightBounds)
    let weight = readStat(weightText, weightBounds)
    var missing: [StatField] = []
    if height == nil { missing.append(.heightCm) }
    if weight == nil { missing.append(.weightKg) }
    if dob == nil { missing.append(.dob) }
    guard let height, let weight, let dob else { return .missing(missing) }
    let a = age(dob: dob, today: today)
    guard a >= 0, a <= 130 else { return .missing([.dob]) }
    return .ok(
      plan: plan(weightKg: weight, heightCm: height, age: a, sex: sex, goal: goal, activityLevel: activityLevel),
      heightCm: height, weightKg: weight, age: a)
  }
}
