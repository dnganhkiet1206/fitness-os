public import Foundation

/// Thước chiều cao / cân nặng của onboarding (#527 1.3) — `HeightBody` /
/// `WeightBody` (`onboarding-flow.tsx`) + `useRulerIndex` @ fac9ac2. Chỉ số học;
/// cây thước là việc của màn.
///
/// RN behavior (giữ nguyên):
/// - thang theo đơn vị đang hiện, mỗi vạch 0,1 đơn vị, từ `ceil(min × 10)` tới
///   `floor(max × 10)` của `BOUNDS` (100–250 cm, 20–400 kg) đổi sang đơn vị ấy;
/// - vạch hạt giống = số đang lưu đổi sang đơn vị hiện, kẹp vào thang; ô trống /
///   sai dạng là 0, tức vạch đầu (`Number(cm) || 0`);
/// - câu ghi của một vạch: đổi về cm / kg rồi làm tròn 0,1 — `String(...)` của
///   JS (170 → "170", 169.9 → "169.9"). Không khép vòng giữa các thang: 170 cm
///   → 66.9 in → 169.9 cm; 70 kg → 154.3 lbs → 70 kg nhưng nhiều vạch lbs ghi ra
///   cùng một số kg (0,1 kg thô hơn 0,1 lbs) — đúng như RN.
///
/// Golden: `Fixtures/ruler-golden.json` (`apps/ios/tools/insights-golden/gen-ruler.mjs`).
public enum OnboardingRuler {
  public enum Quantity: String, Sendable, Hashable { case height, weight }

  public struct Scale: Sendable, Hashable {
    public let quantity: Quantity
    public let unit: String
    /// Vạch đầu, theo phần mười đơn vị.
    public let min10: Int
    public let count: Int

    /// `(min10 + index) / 10`.
    public func value(at index: Int) -> Double { Double(min10 + index) / 10 }

    /// Câu ghi của vạch `index` (`commit`, `onboarding-flow.tsx`).
    public func text(at index: Int) -> String {
      let metric = quantity == .height
        ? Units.heightToCm(value(at: index), unit: unit) : Units.weightToKg(value(at: index), unit: unit)
      return Units.text(Units.jsRound1(metric))
    }

    /// Vạch của một số đã lưu (cm / kg, dạng chữ).
    public func seed(_ text: String) -> Int {
      let n = OnboardingRuler.jsNumber(text) ?? 0
      let shown = OnboardingRuler.display(quantity, n, unit: unit)
      return max(0, min(count - 1, FitnessCalc.jsRound(shown * 10) - min10))
    }
  }

  public static func scale(_ q: Quantity, unit: String) -> Scale {
    let bounds = q == .height ? FitnessCalc.heightBounds : FitnessCalc.weightBounds
    let lo = Int((display(q, bounds.lowerBound, unit: unit) * 10).rounded(.up))
    let hi = Int((display(q, bounds.upperBound, unit: unit) * 10).rounded(.down))
    return Scale(quantity: q, unit: unit, min10: lo, count: hi - lo + 1)
  }

  static func display(_ q: Quantity, _ v: Double, unit: String) -> Double {
    q == .height ? Units.displayHeight(v, unit: unit) : Units.displayWeight(v, unit: unit)
  }

  /// `Number(text)` cho chữ của thước: trống → 0, sai dạng → nil (`NaN`).
  static func jsNumber(_ text: String) -> Double? {
    let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if t.isEmpty { return 0 }
    guard let n = Double(t), n.isFinite else { return nil }
    return n
  }

  /// `formatHeight` (`lib/units.ts`): `5'7"` khi theo inch, `170 cm` khi theo cm.
  public static func formatHeight(_ cm: Double, unit: String) -> String {
    if unit == "in" {
      let totalIn = FitnessCalc.jsRound(cm / Units.cmPerIn)
      return "\(totalIn / 12)'\(totalIn % 12)\""
    }
    return "\(FitnessCalc.jsRound(cm)) cm"
  }

  /// `toFixed(1)` cho số đã nằm trên vạch 0,1 (không còn ca nửa vạch).
  public static func fixed1(_ v: Double) -> String { String(format: "%.1f", v) }

  /// `weightLabel`: `lbs` hiện là `lb`.
  public static func weightLabel(_ unit: String) -> String { unit == "lbs" ? "lb" : "kg" }

  /// Nước của màn kế hoạch (`displayVolume`): ml nguyên; oz một chữ số lẻ.
  public static let mlPerFloz = 29.5735296
  public static func displayVolume(_ ml: Int, unit: AppPreferences.VolumeUnit) -> Double {
    unit == .oz ? Units.jsRound1(Double(ml) / mlPerFloz) : Double(FitnessCalc.jsRound(Double(ml)))
  }
}
