public import Foundation

/// Cảnh của Koa (#527, K1) — kiểu dữ liệu của `koa-scene.ts` @ fac9ac2: cây
/// SVG của bản export thiết kế, mỗi lớp kèm cờ điều kiện, transform và hoạt
/// ảnh; `keyframes` là mọi `@keyframes` CSS đã lấy mẫu thành khung.
///
/// Dữ liệu nằm nguyên văn trong `KoaSceneData.swift` (sinh bằng
/// `gen-koa-scene.mjs`), giải mã một lần khi dùng tới.
public enum KoaScene {
  /// Một bước transform: `["r", deg]` / `["r", deg, cx, cy]` / `["t", x, y]` /
  /// `["s", sx, sy]` — giữ nguyên dạng mảng như RN (`op.length === 4`).
  public struct Op: Sendable, Hashable, Decodable {
    public let kind: String
    public let values: [Double]
    /// Số phần tử của mảng gốc (kể cả tên phép).
    public var count: Int { values.count + 1 }

    public init(_ kind: String, _ values: [Double]) {
      self.kind = kind
      self.values = values
    }

    /// `op[j]` của RN: `j = 0` là tên phép, số bắt đầu từ `j = 1`.
    public subscript(j: Int) -> Double { values[j - 1] }

    public init(from decoder: any Decoder) throws {
      var c = try decoder.unkeyedContainer()
      kind = try c.decode(String.self)
      var v: [Double] = []
      while !c.isAtEnd { v.append(try c.decode(Double.self)) }
      values = v
    }
  }

  public struct TFrame: Sendable, Hashable, Decodable {
    public let o: Double
    public let ops: [Op]
    /// Danh sách của khung kế, đã khớp từng phép với `ops`.
    public let to: [Op]?
  }

  public struct OFrame: Sendable, Hashable, Decodable {
    public let o: Double
    public let v: Double
  }

  /// Mỗi thuộc tính hoạt ảnh một rãnh; vắng rãnh = hoạt ảnh không đụng tới.
  public struct Track: Sendable, Hashable, Decodable {
    public let tf: [TFrame]?
    public let op: [OFrame]?
  }

  public struct Anim: Sendable, Hashable, Decodable {
    public let k: String
    public let dur: Double
    public let delay: Double
    /// `lin` / `out` / `io`.
    public let ease: String

    public init(k: String, dur: Double, delay: Double, ease: String) {
      self.k = k
      self.dur = dur
      self.delay = delay
      self.ease = ease
    }
  }

  /// Giá trị một thuộc tính trình bày: chuỗi hoặc số, như bản export.
  public enum Value: Sendable, Hashable, Decodable {
    case string(String)
    case number(Double)

    public init(from decoder: any Decoder) throws {
      let c = try decoder.singleValueContainer()
      if let d = try? c.decode(Double.self) {
        self = .number(d)
      } else {
        self = .string(try c.decode(String.self))
      }
    }

    public var number: Double? {
      switch self {
      case .number(let d): d
      case .string(let s): Double(s)
      }
    }

    public var text: String {
      switch self {
      case .string(let s): s
      case .number(let d): d == d.rounded() && abs(d) < 1e15 ? String(Int(d)) : String(d)
      }
    }
  }

  public struct Node: Sendable, Hashable, Decodable {
    public let t: String
    public let id: String?
    /// Chỉ vẽ khi cờ này đúng (`if` của bản export).
    public let cond: String?
    public let a: [String: Value]?
    public let tf: [Op]?
    /// Transform do lớp logic đưa xuống, theo tên.
    public let bind: String?
    /// Hoạt ảnh do lớp logic đưa xuống, theo tên.
    public let animBind: String?
    public let anim: Anim?
    /// Thuộc tính CSS `translate` — áp ngoài `transform`.
    public let tr: [Double]?
    /// `transform-origin`, theo toạ độ của chính lớp.
    public let o: [Double]?
    public let x: String?
    public let kids: [Node]?

    enum CodingKeys: String, CodingKey {
      case t, id, cond = "if", a, tf, bind, animBind, anim, tr, o, x, kids
    }
  }

  struct Payload: Sendable, Decodable {
    let nodes: [Node]
    let keyframes: [String: Track]
  }

  static let payload: Payload = {
    do {
      return try JSONDecoder().decode(Payload.self, from: Data(json.utf8))
    } catch {
      preconditionFailure("koa-scene: \(error)")
    }
  }()

  /// `NODES`.
  public static var nodes: [Node] { payload.nodes }
  /// `KEYFRAMES`.
  public static var keyframes: [String: Track] { payload.keyframes }
}
