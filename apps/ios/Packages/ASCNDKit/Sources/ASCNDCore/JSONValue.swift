public import Foundation

/// Một giá trị JSON bất kỳ, có kiểu.
///
/// Dùng ở hai chỗ có hình dạng chưa cố định: `input`/`expected` của golden
/// vectors khi một bộ kiểm chỉ cần soát cấu trúc, và payload `jsonb` của
/// backend (ví dụ `community_posts.payload`). Code nghiệp vụ nên giải mã thẳng
/// sang kiểu riêng của nó; `JSONValue` là lối thoát, không phải mô hình dữ liệu.
public enum JSONValue: Sendable, Hashable {
  case null
  case bool(Bool)
  /// JSON chỉ có một kiểu số. `Double` giữ đúng mọi số nguyên tới 2^53.
  case number(Double)
  case string(String)
  case array([JSONValue])
  case object([String: JSONValue])
}

extension JSONValue: Codable {
  public init(from decoder: any Decoder) throws {
    let c = try decoder.singleValueContainer()
    if c.decodeNil() {
      self = .null
    } else if let b = try? c.decode(Bool.self) {
      self = .bool(b)
    } else if let n = try? c.decode(Double.self) {
      self = .number(n)
    } else if let s = try? c.decode(String.self) {
      self = .string(s)
    } else if let a = try? c.decode([JSONValue].self) {
      self = .array(a)
    } else if let o = try? c.decode([String: JSONValue].self) {
      self = .object(o)
    } else {
      throw DecodingError.dataCorruptedError(in: c, debugDescription: "Không phải giá trị JSON")
    }
  }

  public func encode(to encoder: any Encoder) throws {
    var c = encoder.singleValueContainer()
    switch self {
    case .null: try c.encodeNil()
    case .bool(let b): try c.encode(b)
    case .number(let n): try c.encode(n)
    case .string(let s): try c.encode(s)
    case .array(let a): try c.encode(a)
    case .object(let o): try c.encode(o)
    }
  }
}

extension JSONValue {
  public subscript(key: String) -> JSONValue? {
    if case .object(let o) = self { return o[key] }
    return nil
  }

  public var stringValue: String? {
    if case .string(let s) = self { return s }
    return nil
  }

  public var doubleValue: Double? {
    if case .number(let n) = self { return n }
    return nil
  }

  /// Chỉ trả về khi số là nguyên thật (3.0 → 3, 3.5 → nil).
  public var intValue: Int? {
    guard case .number(let n) = self, n.rounded() == n, abs(n) < 9_007_199_254_740_992 else { return nil }
    return Int(n)
  }

  public var boolValue: Bool? {
    if case .bool(let b) = self { return b }
    return nil
  }
}
