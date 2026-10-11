/// Câu báo một kỷ lục (#527, `log-workout` → `RecordCelebration`) —
/// `lib/record-line.ts` @ fac9ac2: nhánh nào và các số của nó; chữ là việc
/// của bảng dịch.
///
/// Hai trong bốn nhánh tồn tại để một số THẬT SỰ bằng 0 không bị in ra:
/// - kỷ lục tạ mà mức trước ≤ 0 là "lần đầu có tạ", không phải "trước là 0 kg";
/// - kỷ lục reps không tạ (hít xà, chống đẩy) không nói "ở 0 kg".
public enum RecordLine {
  public enum Form: Sendable, Hashable { case weight, firstLoad, reps, repsBodyweight }

  public struct Parts: Sendable, Hashable {
    public let form: Form
    public let exercise: String
    /// Tạ theo đơn vị hiển thị (`weight` / `firstLoad`) hoặc số lần (`reps…`).
    public let value: String
    /// Mức trước: tạ (`weight`) hoặc số lần (`reps…`); trống ở `firstLoad`.
    public let previous: String
    /// Tạ của kỷ lục reps; trống ở các nhánh khác.
    public let atWeight: String
    /// Số lần — để chọn số ít / số nhiều (`{value:rep|reps}`).
    public let count: Int
  }

  public static func form(_ r: PersonalRecord) -> Form {
    if r.kind == .weight { return r.previous <= 0 ? .firstLoad : .weight }
    return (r.atWeight ?? 0) <= 0 ? .repsBodyweight : .reps
  }

  /// `recordLine`: tạ qua `String(Math.round(displayWeight(v) * 10) / 10)`
  /// (`WeightUnit.text`), số lần qua `String(n)`.
  public static func parts(_ r: PersonalRecord, unit: WeightUnit) -> Parts {
    let f = form(r)
    switch f {
    case .weight, .firstLoad:
      return Parts(
        form: f, exercise: r.exercise, value: unit.text(r.value), previous: f == .weight ? unit.text(r.previous) : "",
        atWeight: "", count: 0)
    case .reps, .repsBodyweight:
      return Parts(
        form: f, exercise: r.exercise, value: Units.text(r.value), previous: Units.text(r.previous),
        atWeight: f == .reps ? unit.text(r.atWeight ?? 0) : "", count: Int(r.value))
    }
  }
}
