/// Số học kiểu JavaScript cho các phép port nguyên văn từ RN (#266).
///
/// Readiness / `daily_logs` là phép tính trên dữ liệu thật — có ô trống, chuỗi,
/// số lạ. RN để `NaN` đi xuyên qua phép tính rồi `JSON.stringify` ghi nó thành
/// `null`; `Math.max(NaN, 0)` là `NaN`, còn `Swift.max` thì KHÔNG. Mọi phép ở
/// đây theo đúng JS để hàng ghi ra giống từng cột (`DailyLogGoldenTests`).
enum JS {
  /// `Number(x)`: `null` → 0, chuỗi rỗng → 0, chuỗi số → số, còn lại → NaN.
  static func number(_ v: JSONValue?) -> Double {
    switch v {
    case .number(let n)?: return n
    case .null?: return 0
    case .bool(let b)?: return b ? 1 : 0
    case .string(let s)?:
      let t = RepEntry.trimJS(s)
      if t.isEmpty { return 0 }
      // `Double("nan")` / `Double("inf")` nhận; `Number` của JS thì không.
      if t.lowercased().contains("n") && t != "Infinity" && t != "-Infinity" && t != "+Infinity" { return .nan }
      return Double(t) ?? .nan
    default: return .nan
    }
  }

  /// `x != null` của JS: có trường và không phải `null`.
  static func present(_ v: JSONValue?) -> Bool {
    switch v {
    case nil, .null?: return false
    default: return true
    }
  }

  /// Giá trị "truthy" của một số (`x ? … : …`): 0 và NaN là sai.
  static func truthy(_ x: Double) -> Bool { x != 0 && !x.isNaN }

  static func max(_ a: Double, _ b: Double) -> Double { a.isNaN || b.isNaN ? .nan : Swift.max(a, b) }
  static func min(_ a: Double, _ b: Double) -> Double { a.isNaN || b.isNaN ? .nan : Swift.min(a, b) }
  static func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double { min(max(v, lo), hi) }

  /// `Math.round`: nửa làm tròn LÊN (về +∞), NaN giữ NaN.
  static func round(_ x: Double) -> Double {
    guard x.isFinite else { return x }
    return (x + 0.5).rounded(.down)
  }

  /// `Math.ceil`.
  static func ceil(_ x: Double) -> Double { x.isFinite ? x.rounded(.up) : x }

  /// Cột ghi ra: `JSON.stringify` biến NaN / ±∞ thành `null`.
  static func json(_ x: Double) -> JSONValue { x.isFinite ? .number(x) : .null }

  /// `x.toFixed(digits)`: điểm giữa CHÍNH XÁC (giá trị nhị phân đúng là …5)
  /// lấy số xa 0 hơn — `printf` lấy số chẵn (0.25 → "0.3", printf "0.2").
  /// `-0` in ra "0", NaN ra "NaN" như JS.
  static func fixed(_ x: Double, _ digits: Int) -> String {
    if x.isNaN { return "NaN" }
    let v = x == 0 ? 0 : x
    let exact = String(format: "%.100f", v)
    if let dot = exact.firstIndex(of: ".") {
      let frac = exact[exact.index(after: dot)...]
      if frac.count > digits {
        let cut = frac.index(frac.startIndex, offsetBy: digits)
        if frac[cut] == "5" && frac[frac.index(after: cut)...].allSatisfy({ $0 == "0" }) {
          return String(format: "%.\(digits)f", v > 0 ? v.nextUp : v.nextDown)
        }
      }
    }
    return String(format: "%.\(digits)f", v)
  }
}
