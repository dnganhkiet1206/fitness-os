import Foundation

/// Phần của màn sửa hồ sơ (`app/edit-profile.tsx` @ fac9ac2) mà `ProfileForm`
/// chưa có: ô HIỂN THỊ theo đơn vị của người dùng ↔ cột hệ mét của form, và
/// cảnh báo macro lệch calo (`lib/macro-targets.ts`). Golden:
/// `profile-entry-golden.json` (`tools/insights-golden/gen-profile-entry.mjs`).
///
/// RN behavior: form giữ cm / kg / ml; ô hiện theo cm|in, kg|lbs, ml|oz. Gõ vào
///   ô thì cột hệ mét đổi theo (cao làm tròn cm nguyên, nặng một chữ số lẻ,
///   nước ml nguyên); đổi đơn vị thì ô đổi ngay tại chỗ, cột không đổi.
/// Native behavior: y như vậy — cùng phép tính, cùng làm tròn kiểu JS.
public enum ProfileEntry {
  public enum Field: String, Sendable { case height, weight, water }

  /// Ô hiển thị (đã qua `NumberInput.decimal`) → chuỗi cột hệ mét của form.
  /// Trống, hay không đọc ra số → trống (`v && !isNaN(n) ? … : ''`).
  public static func metric(_ field: Field, display text: String, unit: String) -> String {
    guard !text.isEmpty, let n = parseFloat(text) else { return "" }
    switch field {
    case .height: return Units.text(Double(FitnessCalc.jsRound(Units.heightToCm(n, unit: unit))))
    case .weight: return Units.text(Units.jsRound1(Units.weightToKg(n, unit: unit)))
    case .water: return Units.text(volumeToMl(n, unit: unit))
    }
  }

  /// Cột hệ mét → ô hiển thị lúc MỞ form (`useFormSeed`): cột trống là ô
  /// trống; có số (kể cả 0) thì hiện số ấy theo đơn vị.
  public static func seed(_ field: Field, metric text: String, unit: String) -> String {
    guard !text.isEmpty else { return "" }
    return Units.text(display(field, ProfileForm.jsNumber(text) ?? .nan, unit: unit))
  }

  /// Cột hệ mét → ô hiển thị lúc ĐỔI ĐƠN VỊ (`Number(f) || 0; x ? … : ''`):
  /// 0 và trống đều thành ô trống.
  public static func flip(_ field: Field, metric text: String, unit: String) -> String {
    let x = ProfileForm.jsNumber(text) ?? 0
    guard x != 0, !x.isNaN else { return "" }
    return Units.text(display(field, x, unit: unit))
  }

  static func display(_ field: Field, _ v: Double, unit: String) -> Double {
    switch field {
    case .height: Units.displayHeight(v, unit: unit)
    case .weight: Units.displayWeight(v, unit: unit)
    case .water: displayVolume(v, unit: unit)
    }
  }

  /// `displayVolume`: ml nguyên; oz một chữ số lẻ.
  static func displayVolume(_ ml: Double, unit: String) -> Double {
    unit == "oz" ? Units.jsRound1(ml / OnboardingRuler.mlPerFloz) : (ml + 0.5).rounded(.down)
  }

  /// `volumeToMl`: luôn ml nguyên.
  static func volumeToMl(_ value: Double, unit: String) -> Double {
    ((unit == "oz" ? value * OnboardingRuler.mlPerFloz : value) + 0.5).rounded(.down)
  }

  /// `parseFloat` trên chuỗi đã qua `decText` (chỉ chữ số và một dấu chấm):
  /// "0." là 0; không có chữ số nào là NaN.
  static func parseFloat(_ s: String) -> Double? {
    guard s.contains(where: { $0.isASCII && $0.isNumber }) else { return nil }
    var t = s
    if t.hasSuffix(".") { t += "0" }
    if t.hasPrefix(".") { t = "0" + t }
    return Double(t)
  }
}

/// Bốn macro người dùng tự gõ có nói cùng một câu với mục tiêu calo không
/// (`macroDriftFor`, `lib/macro-targets.ts`). Chỉ CẢNH BÁO — không chặn lưu:
/// một tỉ lệ macro khác là điều người ta được quyền chọn.
public enum MacroTargets {
  /// `DEFAULT_KCAL`: điều một hồ sơ chưa qua onboarding nhận được.
  public static let defaultKcal = 2200.0
  /// `MACRO_DRIFT_TOLERANCE_KCAL`: trên biên làm tròn lý thuyết (±9 kcal), nên
  /// không bao giờ kêu vì làm tròn.
  public static let driftToleranceKcal = 10.0

  public struct Drift: Sendable, Hashable {
    /// Năng lượng bốn macro cộng lại.
    public let sum: Double
    /// `sum` trừ mục tiêu calo. Dương là ăn vượt.
    public let drift: Double
    public let kcalTarget: Double
  }

  /// `stored`: trống là chưa đặt; số âm / không phải số là hàng hỏng — cũng
  /// chưa đặt. Số 0 VẪN là 0.
  static func stored(_ text: String) -> Double? {
    guard !text.isEmpty, let n = ProfileForm.jsNumber(text), n.isFinite, n >= 0 else { return nil }
    return n
  }

  /// `calorieTargetFor`: 0 kcal không phải một kế hoạch → mặc định.
  public static func calorieTarget(_ kcal: String) -> Double {
    let v = stored(kcal)
    return Double(FitnessCalc.jsRound(v.map { $0 > 0 ? $0 : defaultKcal } ?? defaultKcal))
  }

  /// `nil` khi không có gì để nói: thiếu một macro (khi ấy app suy ra cho khớp),
  /// hoặc lệch nằm trong biên làm tròn.
  public static func drift(kcal: String, protein: String, carbs: String, fat: String, fiber: String) -> Drift? {
    guard let p = stored(protein), let c = stored(carbs), let f = stored(fat), stored(fiber) != nil else { return nil }
    let target = calorieTarget(kcal)
    let sum = p * 4 + c * 4 + f * 9
    let drift = sum - target
    guard abs(drift) >= driftToleranceKcal else { return nil }
    return Drift(sum: sum, drift: drift, kcalTarget: target)
  }
}

extension ProfileForm {
  /// Cảnh báo macro trên chính các ô đang ở trên màn (không trên hồ sơ đã lưu).
  public var macroDrift: MacroTargets.Drift? {
    MacroTargets.drift(kcal: tdeeTargetKcal, protein: macroProteinG, carbs: macroCarbsG, fat: macroFatG, fiber: macroFiberG)
  }
}

extension FoodPreferences {
  /// Tám dị ứng thường gặp (`COMMON_ALLERGIES`), theo thứ tự của RN.
  public static var commonAllergies: [String] { allergies.map(\.value) }

  /// `allergyLabel`: nhãn theo ngôn ngữ; giá trị lạ (gõ trước khi có danh sách)
  /// hiện nguyên văn.
  public static func allergyLabel(_ value: String, lang: AppPreferences.Lang) -> String {
    guard let a = allergies.first(where: { $0.value == value }) else { return value }
    switch lang {
    case .en: return a.labels[0]
    case .vi: return a.labels[1]
    case .es: return a.labels[2]
    }
  }
}
