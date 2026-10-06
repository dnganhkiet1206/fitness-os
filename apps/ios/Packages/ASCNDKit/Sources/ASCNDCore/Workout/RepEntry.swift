/// Ô reps của một set: số lần ("10") hoặc thời gian giữ ("45s").
///
/// Theo `native/src/lib/rep-entry.ts` @ fac9ac2 — nguồn, không phải bản chép
/// trong `spec/vectors/run.mjs` (hai bên lệch nhau ở "45.5s" và "45 s", xem
/// review #237). Chỉ chữ số ASCII: ô là bàn phím số, và một mẫu nói đúng điều
/// đó từ chối `1e3`, `+8`, `8.5`, `-5`, `abc` trong một luật.
public struct RepEntry: Sendable, Hashable {
  public static let maxReps = 1000
  public static let maxHoldSeconds = 3600

  public let reps: Int
  /// `nil` khi không phải set giữ — không phải 0: "không có" khác "giữ 0 giây".
  public let durationSec: Int?

  public static let empty = RepEntry(reps: 0, durationSec: nil)

  /// Set "đã làm": có reps hoặc có thời gian giữ.
  public var isEntered: Bool { reps > 0 || (durationSec ?? 0) > 0 }

  public static func parse(_ raw: String?) -> RepEntry {
    let text = trimJS(raw ?? "")
    guard !text.isEmpty else { return .empty }

    // Giữ: /^(\d+(?:\.\d+)?)\s*s$/i
    if let last = text.unicodeScalars.last, last == "s" || last == "S" {
      let number = trimEndJS(String(text.unicodeScalars.dropLast()))
      guard isDecimal(number), let value = Double(number) else { return .empty }
      // Math.round: nửa làm tròn lên. Số dương nên `.rounded()` trùng nghĩa.
      let sec = value.rounded()
      return sec > 0 && sec <= Double(maxHoldSeconds)
        ? RepEntry(reps: 0, durationSec: Int(sec)) : .empty
    }

    // Reps: /^\d+$/, 1…1000.
    guard isDigits(text) else { return .empty }
    // Chuỗi dài hơn 4 chữ số đã chắc chắn > 1000 (kể cả "0001001") — tránh tràn Int.
    let significant = text.drop(while: { $0 == "0" })
    guard significant.count <= 4, let n = Int(significant.isEmpty ? "0" : String(significant)) else { return .empty }
    return n > 0 && n <= maxReps ? RepEntry(reps: n, durationSec: nil) : .empty
  }

  private static func isDigits<S: StringProtocol>(_ s: S) -> Bool {
    !s.isEmpty && s.unicodeScalars.allSatisfy { $0.value >= 48 && $0.value <= 57 }
  }

  /// \d+(\.\d+)?
  private static func isDecimal(_ s: String) -> Bool {
    let parts = s.split(separator: ".", omittingEmptySubsequences: false)
    switch parts.count {
    case 1: return isDigits(parts[0])
    case 2: return isDigits(parts[0]) && isDigits(parts[1])
    default: return false
    }
  }

  /// Khoảng trắng mà `String.prototype.trim` / `\s` của JS bỏ.
  private static func isJSWhitespace(_ u: Unicode.Scalar) -> Bool {
    switch u.value {
    case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF:
      return true
    default:
      return false
    }
  }

  private static func trimJS(_ s: String) -> String {
    var scalars = Substring(s).unicodeScalars
    while let f = scalars.first, isJSWhitespace(f) { scalars.removeFirst() }
    while let l = scalars.last, isJSWhitespace(l) { scalars.removeLast() }
    return String(scalars)
  }

  private static func trimEndJS(_ s: String) -> String {
    var scalars = Substring(s).unicodeScalars
    while let l = scalars.last, isJSWhitespace(l) { scalars.removeLast() }
    return String(scalars)
  }
}
