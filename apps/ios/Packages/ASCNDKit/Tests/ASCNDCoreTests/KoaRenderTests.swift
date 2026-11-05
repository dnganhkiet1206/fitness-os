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
      // So với cảnh RN nguyên văn: tủ đồ vẽ lại (19/10) cố ý khác RN.
      let o = try Self.options(c)
      let tree = KoaScene.$rn.withValue(true) { KoaRender.figure(o) }
      let d = Self.diff(tree, c["tree"] ?? .null, "#\(i)")
      #expect(d == nil, "\(d ?? "")")
    }
  }

  /// Tay không có viền sáng / dải sáng riêng (Kiệt 24/10: chỗ nối vai lộ ra):
  /// bản app ít hơn bản RN đúng hai viền (hai tay).
  @Test func armsCarryNoRimLight() {
    func rims(_ e: KoaRender.Element) -> Int {
      (e.props["stroke"] == .string("url(#\(KoaLight.rimGradient))") ? 1 : 0) + e.kids.reduce(0) { $0 + rims($1) }
    }
    let native = rims(KoaRender.figure(KoaRender.Options()))
    let rn = KoaScene.$rn.withValue(true) { rims(KoaRender.figure(KoaRender.Options())) }
    #expect(native > 0)
    #expect(rn - native == 2)
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

  /// `flat`: màu gốc của bản vẽ, không dải đèn (url(#koaL…)), không lượt tô theo mảnh.
  @Test func flatKeepsTheDrawingsColours() {
    var o = KoaRender.Options()
    let lit = String(describing: KoaRender.figure(o))
    o.flat = true
    let flat = String(describing: KoaRender.figure(o))
    #expect(lit.contains("url(#koaL"))
    #expect(!flat.contains("url(#koaL") && !flat.contains("url(#koaRim)"))
    #expect(!flat.contains("url(#koaGlow") && !flat.contains("url(#koaForm)"))
  }
}

/// Mắt lờ đờ không nháy (Kiệt 04/11): hai lớp nháy là elip phủ cả mắt, mọc lên dưới mí thành
/// "một hình elip vẽ thêm". Mắt mở to vẫn nháy; bản RN giữ nguyên.
struct KoaLazyEyesTests {
  static func blinks(_ e: KoaRender.Element) -> Int {
    // nhóm nháy = `G` có đúng hai elip màu mí (#BFC7CF) phủ hai mắt
    let own = e.tag == "G" && e.kids.count == 2 && e.kids.allSatisfy { $0.tag == "Ellipse" && $0.props["ry"] == .number(25) } ? 1 : 0
    return own + e.kids.reduce(0) { $0 + blinks($1) }
  }

  static func figure(_ e: KoaFlags.Expression, rn: Bool = false) -> KoaRender.Element {
    var o = KoaRender.Options()
    o.expression = e
    o.t = 4800  // ngay giữa một cái nháy của `koaBlink`
    return KoaScene.$rn.withValue(rn) { KoaRender.figure(o) }
  }

  @Test func lazyEyesDoNotBlinkOpenEyesDo() {
    #expect(Self.blinks(Self.figure(.happy)) == 2)
    for e: KoaFlags.Expression in [.confident, .tired, .sleepy] {
      #expect(KoaMath.lidded(KoaRender.flags({ var o = KoaRender.Options(); o.expression = e; return o }())))
      #expect(Self.blinks(Self.figure(e)) == 0, "\(e)")
      #expect(Self.blinks(Self.figure(e, rn: true)) == 2, "RN \(e)")
    }
  }
}

/// Chạm theo chỗ (Kiệt 04/11) và miệng nói tách khỏi nét mặt.
struct KoaTapTests {
  @Test func zonesFollowTheFigure() {
    #expect(KoaTap.zone(x: 120, y: 40) == .head)
    #expect(KoaTap.zone(x: 50, y: 90) == .ear && KoaTap.zone(x: 190, y: 90) == .ear)
    #expect(KoaTap.zone(x: 121, y: 134) == .nose, "đo trên máy")
    #expect(KoaTap.zone(x: 85, y: 150) == .face)
    #expect(KoaTap.zone(x: 120, y: 215) == .belly)
    #expect(KoaTap.zone(x: 120, y: 285) == .feet)
    #expect(KoaTap.zone(x: 30, y: 210) == .body)
    // mỗi chỗ một câu và một tiếng riêng
    #expect(Set(KoaTap.Zone.allCases.map(\.topic)).count == KoaTap.Zone.allCases.count)
    #expect(Set(KoaTap.Zone.allCases.map(\.voice)).count == KoaTap.Zone.allCases.count)
  }

  @Test func noseIsANoNoNoNotAnger() {
    let f = KoaFlags.flags(.nope, .idle)
    #expect(f["browSad"]?.truthy == true && f["mouthFrown"]?.truthy == true && f["lidsHalf"]?.truthy == true)
    #expect(f["browAngry"]?.truthy == false && f["showSteam"]?.truthy == false, "phụng phịu, không giận")
  }

  /// Gần gũi trước, phụng phịu sau (Kiệt 04/11): hai lần chạm mũi đầu chỉ "hê hê", lần ba mới "no no no";
  /// không chỗ nào mở đầu bằng mặt giận hay mặt hốt hoảng.
  @Test func firstTouchesAreFriendly() {
    #expect(KoaTap.reaction(.nose, streak: 0).voice == "hehe")
    #expect(KoaTap.reaction(.nose, streak: 1).topic == .pokeFace)
    #expect(KoaTap.reaction(.nose, streak: 2).topic == .pokeNose)
    for z in KoaTap.Zone.allCases where z != .body {
      let face = KoaTalk.face(KoaTap.reaction(z, streak: 0).topic).peak
      #expect(![.angry, .surprised, .nope, .sad].contains(face), "\(z)")
    }
  }

  @Test func talkingMovesOnlyTheMouth() {
    var o = KoaRender.Options()
    o.expression = .sleepy
    o.mouth = .say2
    let f = KoaRender.flags(o)
    #expect(f["lidsHeavy"]?.truthy == true, "mắt giữ lim dim")
    #expect(f["mouthSay2"]?.truthy == true && f["mouthSoft"]?.truthy != true)
  }
}

/// Mắt lờ đờ nhắm bằng mí hạ xuống (Kiệt 04/11), không bằng elip vẽ thêm.
struct KoaLidBlinkTests {
  static func lidScale(_ e: KoaRender.Element) -> Double? {
    if e.tag == "G", let m = e.matrix, m[0] == 1, m[3] > 1, abs(m[5] - 72.5 * (1 - m[3])) < 1e-9 { return m[3] }
    return e.kids.lazy.compactMap(lidScale).first
  }

  @Test func lazyLidsDropToClose() {
    var o = KoaRender.Options()
    o.expression = .sleepy
    o.blink = 1
    #expect(Self.lidScale(KoaRender.figure(o)) == 1.5, "mí nặng giãn 1,5 lần")
    o.blink = 0
    #expect(Self.lidScale(KoaRender.figure(o)) == nil)
    o.expression = .happy
    o.blink = 1
    #expect(Self.lidScale(KoaRender.figure(o)) == nil, "mắt mở to vẫn nháy kiểu cũ")
  }
}
