public import Foundation
public import Observation

/// Hồ sơ (#425) — `useProfile` (`hooks/use-today-data.ts:32`) và màn sửa hồ sơ
/// (`app/edit-profile.tsx`) @ fac9ac2. Chỉ các cột RN thật sự đọc / sửa.
public struct Profile: Sendable, Hashable, Codable {
  public var userId: String
  public var name: String?
  public var dob: LocalDate?
  public var sex: String?
  public var activityLevel: String?
  public var trainingLevel: String?
  public var dietaryPreference: String?
  public var heightCm: Double?
  public var weightKg: Double?
  public var goal: String?
  public var tdeeTargetKcal: Double?
  public var macroProteinG: Double?
  public var macroCarbsG: Double?
  public var macroFatG: Double?
  public var macroFiberG: Double?
  public var waterTargetMl: Double?
  public var unitsWeight: String?
  public var unitsHeight: String?
  public var sleepTargetHours: Double?
  public var sleepTargetBedtime: String?
  public var sleepTargetWaketime: String?
  public var allergies: [String]?
  public var dislikedFoods: [String]?
  public var onboardingCompleted: Bool?

  public init(userId: String) { self.userId = userId }

  /// Một hàng `profiles` (`select('*')`). Số đọc khoan dung (số hoặc chuỗi số,
  /// như `Number(…)`); cột thiếu / null là `nil` — không bao giờ thay bằng mặc định.
  public init?(row: JSONValue) {
    guard let id = row["user_id"]?.stringValue, !id.isEmpty else { return nil }
    func num(_ k: String) -> Double? {
      switch row[k] {
      case .number(let n)? where n.isFinite: n
      case .string(let s)?: Double(s.trimmingCharacters(in: .whitespaces)).flatMap { $0.isFinite ? $0 : nil }
      default: nil
      }
    }
    func strings(_ k: String) -> [String]? {
      guard case .array(let a)? = row[k] else { return nil }
      return a.compactMap(\.stringValue)
    }
    self.init(userId: id.lowercased())
    name = row["name"]?.stringValue
    dob = row["dob"]?.stringValue.flatMap { LocalDate(String($0.prefix(10))) }
    sex = row["sex"]?.stringValue
    activityLevel = row["activity_level"]?.stringValue
    trainingLevel = row["training_level"]?.stringValue
    dietaryPreference = row["dietary_preference"]?.stringValue
    heightCm = num("height_cm")
    weightKg = num("weight_kg")
    goal = row["goal"]?.stringValue
    tdeeTargetKcal = num("tdee_target_kcal")
    macroProteinG = num("macro_protein_g")
    macroCarbsG = num("macro_carbs_g")
    macroFatG = num("macro_fat_g")
    macroFiberG = num("macro_fiber_g")
    waterTargetMl = num("water_target_ml")
    unitsWeight = row["units_weight"]?.stringValue
    unitsHeight = row["units_height"]?.stringValue
    sleepTargetHours = num("sleep_target_hours")
    sleepTargetBedtime = row["sleep_target_bedtime"]?.stringValue
    sleepTargetWaketime = row["sleep_target_waketime"]?.stringValue
    allergies = strings("allergies")
    dislikedFoods = strings("disliked_foods")
    onboardingCompleted = row["onboarding_completed"]?.boolValue
  }
}

/// Đơn vị (`lib/units.ts`): `kg | lbs`, `cm | in`; hiển thị một chữ số lẻ.
public enum Units {
  public static let lbPerKg = 2.2046226218
  public static let cmPerIn = 2.54

  public static func displayWeight(_ kg: Double, unit: String) -> Double {
    jsRound1(unit == "lbs" ? kg * lbPerKg : kg)
  }
  public static func weightToKg(_ value: Double, unit: String) -> Double { unit == "lbs" ? value / lbPerKg : value }
  public static func displayHeight(_ cm: Double, unit: String) -> Double { jsRound1(unit == "in" ? cm / cmPerIn : cm) }
  public static func heightToCm(_ value: Double, unit: String) -> Double { unit == "in" ? value * cmPerIn : value }

  /// `Math.round(v * 10) / 10`.
  static func jsRound1(_ v: Double) -> Double { (v * 10 + 0.5).rounded(.down) / 10 }

  /// `String(n)` của JS cho số đã làm tròn: 70 → "70", 72.5 → "72.5".
  public static func text(_ v: Double) -> String {
    v == v.rounded() && abs(v) < 1e15 ? String(Int(v)) : String(v)
  }
}

/// Dị ứng và món không ăn (`lib/food-preferences.ts`).
public enum FoodPreferences {
  /// `COMMON_ALLERGIES`: giá trị lưu + nhãn vi / en / es.
  static let allergies: [(value: String, labels: [String])] = [
    ("Dairy", ["Dairy", "Sữa", "Lácteos"]), ("Peanuts", ["Peanuts", "Đậu phộng", "Cacahuetes"]),
    ("Tree nuts", ["Tree nuts", "Hạt cây", "Frutos secos"]), ("Eggs", ["Eggs", "Trứng", "Huevos"]),
    ("Soy", ["Soy", "Đậu nành", "Soja"]), ("Wheat", ["Wheat", "Lúa mì", "Trigo"]),
    ("Shellfish", ["Shellfish", "Hải sản", "Mariscos"]), ("Fish", ["Fish", "Cá", "Pescado"]),
  ]

  /// `canonicalAllergy`: tài khoản từng lưu nhãn tiếng Việt vẫn chọn đúng ô.
  public static func canonicalAllergy(_ stored: String) -> String {
    let s = stored.lowercased()
    return allergies.first { $0.value.lowercased() == s || $0.labels.contains { $0.lowercased() == s } }?.value ?? stored
  }

  /// `parseDislikes`: tách theo dấu phẩy, cắt, bỏ rỗng.
  public static func parseDislikes(_ text: String) -> [String] {
    text.split(separator: ",", omittingEmptySubsequences: false)
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
  }

  public static func dislikesText(_ list: [String]?) -> String { (list ?? []).joined(separator: ", ") }
}

/// Form sửa hồ sơ — luật của `edit-profile.tsx`, không có chữ nào của màn.
///
/// RN behavior (giữ nguyên):
/// - mở trên đúng hồ sơ đã lưu; cột trống là ô TRỐNG, không bao giờ là số bịa
///   (175 cm, 70 kg, 2200 kcal từng được lưu như số đo thật);
/// - chiều cao / cân nặng: trống được (hồ sơ có thể chưa có), sai dạng / ngoài
///   cận thì báo và khoá nút Lưu; số GHI chính là số đã kiểm;
/// - "Tính lại": cùng chuỗi với onboarding; thiếu số đo nào thì từ chối và nói
///   đúng ô thiếu — không có số dự phòng;
/// - mục tiêu calo / macro / nước / giờ ngủ ghi theo `Number(x) || null`.
public struct ProfileForm: Sendable, Hashable {
  public var name = ""
  /// "YYYY-MM-DD" hoặc trống.
  public var dob = ""
  public var sex = "male"
  public var activityLevel = "moderate"
  public var trainingLevel = "intermediate"
  public var dietaryPreference = "omnivore"
  /// Theo cm / kg (ô hiển thị đổi đơn vị là việc của màn).
  public var heightCm = ""
  public var weightKg = ""
  public var goal = "maintain"
  public var tdeeTargetKcal = ""
  public var macroProteinG = ""
  public var macroCarbsG = ""
  public var macroFatG = ""
  public var macroFiberG = ""
  public var waterTargetMl = ""
  public var unitsWeight = "kg"
  public var unitsHeight = "cm"
  public var sleepTargetHours = ""
  public var sleepTargetBedtime = "23:00"
  public var sleepTargetWaketime = "07:00"
  public var allergies: [String] = []
  public var dislikes = ""

  public init() {}

  /// `useFormSeed`: điền từ hồ sơ đã lưu.
  public init(_ p: Profile) {
    func text(_ v: Double?) -> String { v.map(Units.text) ?? "" }
    name = p.name ?? ""
    dob = p.dob?.description ?? ""
    sex = p.sex ?? "male"
    activityLevel = p.activityLevel ?? "moderate"
    trainingLevel = p.trainingLevel ?? "intermediate"
    dietaryPreference = p.dietaryPreference ?? "omnivore"
    heightCm = text(p.heightCm)
    weightKg = text(p.weightKg)
    goal = p.goal ?? "maintain"
    tdeeTargetKcal = text(p.tdeeTargetKcal)
    macroProteinG = text(p.macroProteinG)
    macroCarbsG = text(p.macroCarbsG)
    macroFatG = text(p.macroFatG)
    macroFiberG = text(p.macroFiberG)
    waterTargetMl = text(p.waterTargetMl)
    unitsWeight = p.unitsWeight ?? "kg"
    unitsHeight = p.unitsHeight ?? "cm"
    sleepTargetHours = text(p.sleepTargetHours)
    sleepTargetBedtime = String((p.sleepTargetBedtime ?? "23:00").prefix(5))
    sleepTargetWaketime = String((p.sleepTargetWaketime ?? "07:00").prefix(5))
    allergies = (p.allergies ?? []).map(FoodPreferences.canonicalAllergy)
    dislikes = FoodPreferences.dislikesText(p.dislikedFoods)
  }

  public enum StatReading: Sendable, Hashable {
    case blank
    case value(Double)
    case outOfRange
  }

  /// `readStat(q, text, false)`: trống là hợp lệ (ghi `null`).
  static func read(_ text: String, _ bounds: ClosedRange<Double>) -> StatReading {
    if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return .blank }
    return FitnessCalc.readStat(text, bounds).map(StatReading.value) ?? .outOfRange
  }

  public var height: StatReading { Self.read(heightCm, FitnessCalc.heightBounds) }
  public var weight: StatReading { Self.read(weightKg, FitnessCalc.weightBounds) }
  /// Ô nào ngoài cận — nút Lưu khoá.
  public var statsBad: Bool { height == .outOfRange || weight == .outOfRange }

  /// "Tính lại" (`recalcTargets`): điền mục tiêu từ số đo, hoặc nói đúng các ô thiếu.
  public mutating func recalcTargets(today: LocalDate) -> [FitnessCalc.StatField] {
    let attempt = FitnessCalc.planFromEntry(
      heightText: heightCm, weightText: weightKg, dob: LocalDate(dob.trimmingCharacters(in: .whitespaces)),
      sex: FitnessCalc.Sex(rawValue: sex) ?? .other, goal: goal, activityLevel: activityLevel, today: today)
    guard let plan = attempt.plan else { return attempt.missing }
    tdeeTargetKcal = String(plan.targetKcal)
    macroProteinG = String(plan.proteinG)
    macroCarbsG = String(plan.carbsG)
    macroFatG = String(plan.fatG)
    macroFiberG = String(plan.fiberG)
    waterTargetMl = String(plan.waterMl)
    return []
  }

  /// `Number(x) || null` của JS: trống, 0, sai dạng → `null`.
  static func numberOrNull(_ text: String) -> JSONValue {
    let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let v = t.isEmpty ? 0 : jsNumber(t), v.isFinite, v != 0 else { return .null }
    return .number(v)
  }

  /// `Number(s)` của JS cho chuỗi đã cắt (không có dạng hex / mũ thì như Double).
  static func jsNumber(_ t: String) -> Double? {
    if t.lowercased().hasPrefix("0x") { return UInt64(t.dropFirst(2), radix: 16).map(Double.init) }
    return Double(t)
  }

  /// Hàng `update` của `save` (`edit-profile.tsx:275`). `nil` khi số đo ngoài
  /// cận (nút Lưu khoá — đây là chốt thứ hai).
  public func updateRow() -> JSONValue? {
    guard !statsBad else { return nil }
    func stat(_ r: StatReading) -> JSONValue {
      if case .value(let v) = r { return .number(v) }
      return .null
    }
    var o: [String: JSONValue] = [:]
    o["name"] = .string(name)
    o["dob"] = dob.isEmpty ? .null : .string(dob)
    o["sex"] = .string(sex)
    o["activity_level"] = .string(activityLevel)
    o["training_level"] = .string(trainingLevel)
    o["dietary_preference"] = .string(dietaryPreference)
    o["height_cm"] = stat(height)
    o["weight_kg"] = stat(weight)
    o["goal"] = .string(goal)
    let numbers: [(String, String)] = [
      ("tdee_target_kcal", tdeeTargetKcal), ("macro_protein_g", macroProteinG), ("macro_carbs_g", macroCarbsG),
      ("macro_fat_g", macroFatG), ("macro_fiber_g", macroFiberG), ("water_target_ml", waterTargetMl),
      ("sleep_target_hours", sleepTargetHours),
    ]
    for (k, v) in numbers { o[k] = Self.numberOrNull(v) }
    o["units_weight"] = .string(unitsWeight)
    o["units_height"] = .string(unitsHeight)
    o["sleep_target_bedtime"] = .string(sleepTargetBedtime)
    o["sleep_target_waketime"] = .string(sleepTargetWaketime)
    // Người dùng vừa tự đặt giờ: thôi là mặc định của cơ sở dữ liệu (P0-3).
    o["sleep_target_bedtime_set"] = .bool(true)
    o["sleep_target_waketime_set"] = .bool(true)
    o["allergies"] = .array(allergies.map(JSONValue.string))
    o["disliked_foods"] = .array(FoodPreferences.parseDislikes(dislikes).map(JSONValue.string))
    return .object(o)
  }
}

/// Đọc hồ sơ (`ASCNDBackend.SupabaseProfileSource`): hàng thô, `nil` khi không có.
public protocol ProfileSource: Sendable {
  func profile(userId: String) async throws -> JSONValue?
}

/// Ghi hồ sơ (`update … eq('user_id')` + `confirmWrite`).
public protocol ProfileWriter: Sendable {
  /// Ném `ProfileSaveFailure`.
  func update(userId: String, row: JSONValue) async throws
}

public protocol ProfileCache: Sendable {
  func load(userId: String) async throws -> Profile?
  func save(userId: String, _ profile: Profile) async throws
}

/// Vì sao lưu hồ sơ không xong.
public enum ProfileSaveFailure: Error, Sendable, Hashable {
  /// Số đo ngoài cận — nút đã khoá.
  case invalidStats
  case offline
  /// `confirmWrite` không chạm hàng nào (`nCxNothingWrittenProfile`): hồ sơ
  /// không còn / không phải của mình — nên đọc lại, không nên gửi lại.
  case nothingWritten
  case server(code: String?)
}

/// Hồ sơ của người đang đăng nhập, local-first.
///
/// RN behavior: `useQuery(['profile', user.id])` — bản nhớ (persisted cache)
///   hiện ngay; sửa xong thì đọc lại. Lưu cần mạng.
/// Native behavior: như vậy, cache theo người; lưu xong thì hồ sơ trên máy đổi
///   ngay theo đúng hàng vừa ghi (không đợi lượt đọc lại).
@MainActor @Observable
public final class ProfileBook {
  public let userId: String
  public private(set) var profile: Profile?
  public private(set) var loaded = false
  public private(set) var failure: TodayController.RefreshFailure?
  public private(set) var saving = false

  @ObservationIgnored private let source: any ProfileSource
  @ObservationIgnored private let writer: any ProfileWriter
  @ObservationIgnored private let cache: any ProfileCache

  public init(userId: String, source: any ProfileSource, writer: any ProfileWriter, cache: any ProfileCache) {
    self.userId = userId
    self.source = source
    self.writer = writer
    self.cache = cache
  }

  public func load() async {
    if !loaded, let cached = try? await cache.load(userId: userId), cached.userId == userId {
      profile = cached
      loaded = true
    }
    await refresh()
  }

  public func refresh() async {
    do {
      let row = try await source.profile(userId: userId)
      let fresh = row.flatMap(Profile.init(row:))
      // Hàng của người khác (RLS hỏng) không bao giờ thành hồ sơ của mình.
      profile = fresh?.userId == userId.lowercased() ? fresh : nil
      loaded = true
      failure = nil
      if let profile { try? await cache.save(userId: userId, profile) }
    } catch {
      failure = TodayController.failure([error])
    }
  }

  /// Form mở trên hồ sơ đang có.
  public func makeForm() -> ProfileForm { profile.map(ProfileForm.init) ?? ProfileForm() }

  /// Lưu form. Xong thì hồ sơ trên máy theo đúng hàng vừa ghi.
  public func save(_ form: ProfileForm) async throws(ProfileSaveFailure) {
    guard let row = form.updateRow() else { throw .invalidStats }
    saving = true
    defer { saving = false }
    do {
      try await writer.update(userId: userId, row: row)
    } catch let f as ProfileSaveFailure {
      throw f
    } catch {
      throw NetworkFailure.isOffline(error) ? .offline : .server(code: nil)
    }
    var merged: [String: JSONValue] = ["user_id": .string(userId)]
    if case .object(let o)? = profile.map(Self.row) { merged.merge(o) { _, new in new } }
    if case .object(let o) = row { merged.merge(o) { _, new in new } }
    if let next = Profile(row: .object(merged)) {
      profile = next
      try? await cache.save(userId: userId, next)
    }
  }

  /// Hồ sơ → hàng (để trộn với hàng vừa ghi).
  static func row(_ p: Profile) -> JSONValue {
    func n(_ v: Double?) -> JSONValue { v.map(JSONValue.number) ?? .null }
    func s(_ v: String?) -> JSONValue { v.map(JSONValue.string) ?? .null }
    var o: [String: JSONValue] = [:]
    o["user_id"] = .string(p.userId)
    o["name"] = s(p.name)
    o["dob"] = s(p.dob?.description)
    o["sex"] = s(p.sex)
    o["activity_level"] = s(p.activityLevel)
    o["training_level"] = s(p.trainingLevel)
    o["dietary_preference"] = s(p.dietaryPreference)
    o["height_cm"] = n(p.heightCm)
    o["weight_kg"] = n(p.weightKg)
    o["goal"] = s(p.goal)
    o["tdee_target_kcal"] = n(p.tdeeTargetKcal)
    o["macro_protein_g"] = n(p.macroProteinG)
    o["macro_carbs_g"] = n(p.macroCarbsG)
    o["macro_fat_g"] = n(p.macroFatG)
    o["macro_fiber_g"] = n(p.macroFiberG)
    o["water_target_ml"] = n(p.waterTargetMl)
    o["units_weight"] = s(p.unitsWeight)
    o["units_height"] = s(p.unitsHeight)
    o["sleep_target_hours"] = n(p.sleepTargetHours)
    o["sleep_target_bedtime"] = s(p.sleepTargetBedtime)
    o["sleep_target_waketime"] = s(p.sleepTargetWaketime)
    o["allergies"] = p.allergies.map { .array($0.map(JSONValue.string)) } ?? .null
    o["disliked_foods"] = p.dislikedFoods.map { .array($0.map(JSONValue.string)) } ?? .null
    o["onboarding_completed"] = p.onboardingCompleted.map(JSONValue.bool) ?? .null
    return .object(o)
  }
}
