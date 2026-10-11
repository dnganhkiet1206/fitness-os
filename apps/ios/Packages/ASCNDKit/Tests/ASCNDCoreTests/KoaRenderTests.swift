@testable import ASCNDCore
import Foundation
import Testing

/// Koa K2 = CHÍNH `KoaFigure` của RN @ fac9ac2 — `Fixtures/koa-render-golden.json`
/// (`gen-koa-render.mjs`: `koa-figure.tsx` và mọi module `koa/*` lấy bằng
/// `git show`, dựng bằng react-test-renderer; chỉ react-native-svg /
/// reanimated / react-native là bản giả). Mỗi ca so CẢ cây: thẻ, từng thuộc
/// tính, ma trận, thứ tự con.
struct KoaRenderGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "koa-render-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] { CommunityUserGoldenTests.array(v) }

  static func options(_ c: JSONValue) throws -> KoaRender.Options {
    var o = KoaRender.Options()
    o.expression = try #require(KoaFlags.Expression(rawValue: c["e"]?.stringValue ?? ""))
    o.pose = try #require(KoaFlags.Pose(rawValue: c["p"]?.stringValue ?? ""))
    o.dress = c["dress"]?.boolValue ?? false
    o.live = c["live"]?.boolValue ?? true
    o.paper = c["paper"]?.boolValue ?? false
    o.t = c["t"]?.doubleValue ?? 0
    o.blend = c["blend"]?.doubleValue
    for slot in KoaFlags.Slot.allCases {
      if let id = c["worn"]?[slot.rawValue]?.stringValue { o.worn[slot] = id }
    }
    if let g = c["gaze"], case .object = g {
      o.gaze = KoaMath.Gaze(x: g["x"]?.doubleValue ?? 0, y: g["y"]?.doubleValue ?? 0, k: g["k"]?.doubleValue ?? 0)
    }
    return o
  }

  /// Golden in số với 12 chữ số có nghĩa.
  static func close(_ a: Double, _ b: Double) -> Bool { abs(a - b) <= 1e-9 * max(1, abs(a), abs(b)) }

  /// Chỗ lệch đầu tiên, hoặc `nil` khi khớp.
  static func diff(_ e: KoaRender.Element, _ j: JSONValue, _ path: String) -> String? {
    guard j["t"]?.stringValue == e.tag else { return "\(path): thẻ \(e.tag) ≠ \(j["t"] ?? .null)" }
    guard case .object(let want)? = j["p"] else { return "\(path): thiếu p" }
    if Set(want.keys) != Set(e.props.keys) {
      return "\(path) \(e.tag): thuộc tính \(e.props.keys.sorted()) ≠ \(want.keys.sorted())"
    }
    for (k, w) in want {
      switch (e.props[k], w) {
      case (.number(let a)?, .number(let b)) where close(a, b): continue
      case (.string(let a)?, .string(let b)) where a == b: continue
      default: return "\(path) \(e.tag).\(k): \(String(describing: e.props[k])) ≠ \(w)"
      }
    }
    let wm = array(j["m"]).compactMap { $0.doubleValue }
    let mOK =
      e.matrix.map { m in m.count == wm.count && zip(m, wm).allSatisfy { close($0, $1) } } ?? (j["m"] == nil)
    if !mOK { return "\(path) \(e.tag): ma trận \(String(describing: e.matrix)) ≠ \(wm)" }
    let kids = array(j["k"])
    guard kids.count == e.kids.count else {
      return "\(path) \(e.tag): \(e.kids.map { $0.tag }) ≠ \(kids.compactMap { $0["t"]?.stringValue })"
    }
    for (i, (k, w)) in zip(e.kids, kids).enumerated() {
      if let d = diff(k, w, "\(path)/\(i)") { return d }
    }
    return nil
  }

  @Test func everyFigureIsRNs() throws {
    let cases = Self.array(try Self.golden()["cases"])
    #expect(cases.count == 38)
    for (i, c) in cases.enumerated() {
      let tree = KoaRender.figure(try Self.options(c))
      let d = Self.diff(tree, c["tree"] ?? .null, "#\(i)")
      #expect(d == nil, "\(d ?? "")")
    }
  }

  /// `toFixed(3)` của JS — khoá gộp hệ toạ độ của đèn; `%.3f` làm tròn số hoà
  /// về số chẵn nên không dùng được.
  @Test func toFixedIsJSs() {
    let cases: [(Double, String)] = [
      (0.0625, "0.063"), (1.0625, "1.063"), (-1.0625, "-1.063"), (-0.0, "0.000"), (-0.0004, "-0.000"),
      (0.9995, "1.000"), (9.9995, "9.999"), (0.1875, "0.188"), (123.4565, "123.457"), (-0.00025, "-0.000"),
      (0.3125, "0.313"), (999.9996, "1000.000"),
    ]
    for (v, s) in cases { #expect(KoaLight.toFixed3(v) == s, "\(v)") }
  }
}
