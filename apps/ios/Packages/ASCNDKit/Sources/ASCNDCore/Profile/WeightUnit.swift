public import Foundation

/// Đơn vị cân nặng người dùng XEM và GÕ (#527 1.9-A) — `WeightUnit` của
/// `lib/units.ts` + `useUnits` (`hooks/use-units.ts`) @ fac9ac2.
///
/// RN behavior (giữ nguyên):
/// - chỉ đúng chuỗi `"lbs"` trong `profiles.units_weight` là lb; mọi thứ khác
///   (`nil`, rỗng, `"LBS"`, `"lb"`, hồ sơ chưa nạp) là kg;
/// - DB luôn lưu kg: số gõ theo lb đổi về kg KHÔNG làm tròn (`weightToKg`);
///   lúc ghi set, mọi tạ (kg hay lb) làm tròn 2 chữ số lẻ
///   (`use-fitness-data.ts:410`) — việc của `WorkoutSessionRecord`, không phải ở đây;
/// - hiển thị một chữ số lẻ (`displayWeight`), nhãn `lb` / `kg` (`weightLabel`);
/// - khối lượng (tổng tạ × reps) làm tròn hai lần như màn RN:
///   `Math.round(displayWeight(v))`.
/// - Đơn vị là của TÀI KHOẢN, không của từng set: đổi đơn vị giữa ngày thì chữ
///   trong ô đọc lại theo đơn vị mới (như RN) — không có metadata đơn vị theo set.
public enum WeightUnit: String, Sendable, Hashable, CaseIterable {
  case kg
  case lbs

  /// `useUnits().weight`.
  public init(stored: String?) {
    self = stored == "lbs" ? .lbs : .kg
  }

  /// Hồ sơ chưa nạp → kg (`profile?.units_weight`).
  public init(profile: Profile?) {
    self.init(stored: profile?.unitsWeight)
  }

  /// `weightLabel`: "lb" / "kg" — ký hiệu đơn vị, không dịch.
  public var label: String { self == .lbs ? "lb" : "kg" }

  /// `convertWeight`: kg → đơn vị hiển thị, chưa làm tròn.
  public func convert(_ kg: Double) -> Double {
    self == .lbs ? kg * Units.lbPerKg : kg
  }

  /// `displayWeight`: kg → đơn vị hiển thị, một chữ số lẻ.
  public func display(_ kg: Double) -> Double {
    Units.jsRound1(convert(kg))
  }

  /// `weightToKg`: số gõ theo đơn vị hiển thị → kg để lưu, KHÔNG làm tròn.
  public func toKg(_ value: Double) -> Double {
    self == .lbs ? value / Units.lbPerKg : value
  }

  /// Chữ trong ô tạ (`day-plan.tsx:1011`):
  /// `String(Math.round(displayWeight(kg) * 10) / 10)` — 60 kg → "132.3" lb.
  public func text(_ kg: Double) -> String {
    Units.text(Units.jsRound1(display(kg)))
  }

  /// Ô tạ hạt giống của hàng chưa gõ (`day-plan.tsx:1013`):
  /// `row.weight > 0 ? String(Math.round(displayWeight(w) * 10) / 10) : ''` —
  /// bài không tạ là ô trống (placeholder), không phải "0".
  public func seed(_ kg: Double) -> String {
    kg.isFinite && kg > 0 ? text(kg) : ""
  }

  /// Mức tạ kèm nhãn (`day-plan.tsx:1401`, `:1820`):
  /// `${Math.round(displayWeight(kg) * 10) / 10} ${wl}` — "132.3 lb", "60 kg".
  public func load(_ kg: Double) -> String {
    "\(text(kg)) \(label)"
  }

  /// Mức tạ cho dòng kế hoạch (Today): số của `load` (`day-plan.tsx:1820`,
  /// một chữ số lẻ, không nhóm nghìn) với dấu thập phân của máy — "62,5 kg"
  /// trên máy tiếng Việt, "137.8 lb" trên máy tiếng Anh. `nil` = bài không tạ
  /// (không hiện "0 kg").
  public func localizedLoad(_ kg: Double, locale: Locale = .current) -> String? {
    guard kg.isFinite, kg > 0 else { return nil }
    let separator = locale.decimalSeparator ?? "."
    return "\(text(kg).replacingOccurrences(of: ".", with: separator)) \(label)"
  }

  /// Khối lượng nguyên (`day-plan.tsx:1604`, `sessions.tsx:187`):
  /// `Math.round(displayWeight(v))` — 100 kg → 221 lb (không phải 220).
  public func volume(_ kg: Double) -> Int {
    let v = (display(kg) + 0.5).rounded(.down)
    return v.isFinite && abs(v) < 1e15 ? Int(v) : 0
  }
}
