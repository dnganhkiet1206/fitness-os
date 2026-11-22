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
  /// tâm các elip nắp (ry 25) trong cả cây con; nil nếu cây con có hình khác
  static func coverCentres(_ e: KoaRender.Element) -> Set<Double>? {
    if e.tag == "Ellipse" {
      guard e.props["ry"] == .number(25), case .number(let x)? = e.props["cx"] else { return nil }
      return [x]
    }
    guard e.tag == "G", !e.kids.isEmpty else { return nil }
    var out: Set<Double> = []
    for k in e.kids {
      guard let c = coverCentres(k) else { return nil }
      out.formUnion(c)
    }
    return out
  }

  static func blinks(_ e: KoaRender.Element) -> Int {
    // nhóm nháy = `G` chỉ gồm elip nắp (ry 25) phủ ĐÚNG hai mắt (hai tâm), con của nó thì chưa (cảnh tủ đồ chia
    // nắp theo từng mắt — Kiệt 21/11). Mỗi nắp có thể có thêm lớp quầng sáng đầu cùng hình — đếm theo tâm.
    let mine = coverCentres(e)?.count == 2 && !e.kids.contains { coverCentres($0)?.count == 2 }
    return (mine ? 1 : 0) + e.kids.reduce(0) { $0 + blinks($1) }
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

/// Mắt lờ đờ nhắm bằng mí hạ xuống (Kiệt 04/11), không bằng elip vẽ thêm. Từ 21/11: mép mí trượt xuống đường
/// mắt nhắm (`KoaLid`), không còn kéo giãn cả nhóm mí — xem `KoaLidCloseTests`.
struct KoaLidBlinkTests {
  static func paths(_ e: KoaRender.Element, into out: inout Set<String>) {
    if case .string(let d)? = e.props["d"] { out.insert(d) }
    for k in e.kids { paths(k, into: &out) }
  }
  static func drawn(_ o: KoaRender.Options) -> Set<String> {
    var out: Set<String> = []
    paths(KoaRender.figure(o), into: &out)
    return out
  }

  @Test func lazyLidsDropToClose() {
    var o = KoaRender.Options()
    o.expression = .sleepy
    o.blink = 1
    let shut = KoaLid.swaps("lidsHeavy", close: 1)
    let closed = Self.drawn(o)
    #expect(shut.values.allSatisfy { closed.contains($0) }, "mí nặng hạ tới đường mắt nhắm")
    o.blink = 0
    let open = Self.drawn(o)
    #expect(shut.keys.allSatisfy { open.contains($0) }, "không chớp: mí như vẽ")
    o.expression = .happy
    o.blink = 1
    let happy = Self.drawn(o)
    #expect(!shut.values.contains { happy.contains($0) }, "mắt mở to vẫn nháy kiểu cũ")
    #expect(KoaLazyEyesTests.blinks(KoaRender.figure(o)) == 2)
  }
}

/// Chạm đúng chỗ ở mọi tư thế (Kiệt 04/11): vùng theo mốc THẬT của dáng đang vẽ.
struct KoaTapPoseTests {
  static func check(_ o: KoaRender.Options, _ label: String) {
    let a = KoaRender.anchors(o)
    for (id, zone) in [("nose", KoaTap.Zone.nose), ("ear_right", .ear), ("head_top_fur", .head), ("belly", .belly)] {
      guard let p = a[id] else {
        Issue.record("thiếu mốc \(id) ở \(label)")
        continue
      }
      #expect(KoaTap.zone(x: p.x, y: p.y, anchors: a) == zone, "\(label): chạm \(id)")
    }
  }

  @Test func everyPoseMapsTouchesToTheRightPart() {
    for pose in KoaFlags.Pose.allCases {
      var o = KoaRender.Options()
      o.pose = pose
      Self.check(o, "\(pose)")
    }
    var tilted = KoaRender.Options()
    tilted.gaze = KoaMath.Gaze(x: 0.8, y: -0.5, k: 1)
    Self.check(tilted, "nghiêng đầu")
    for g in [KoaGesture.flop, .pout, .taDa, .curious] {
      var o = KoaRender.Options()
      o.gesture = g
      Self.check(o, "dáng \(g)")
    }
  }

  /// Vươn vai (người nghiêng), quay người: mũi dời khỏi chỗ của dáng đứng — mốc đi theo dáng thật.
  @Test func anchorsFollowThePose() {
    let stand = KoaRender.anchors(KoaRender.Options())["nose"]!
    for pose in [KoaFlags.Pose.stretching, .turn34] {
      var o = KoaRender.Options()
      o.pose = pose
      let moved = KoaRender.anchors(o)["nose"]!
      #expect(hypot(moved.x - stand.x, moved.y - stand.y) > 3, "\(pose)")
    }
  }
}

/// Nắp mắt dùng đèn của da đầu (Kiệt 21/11: "lúc Koa nhắm mắt mí mắt bị dính như 2 lớp chồng lên nhau"):
/// nắp chớp mắt (màu lông, trong FACE) có quầng sáng đầu như `head_front`; bản RN giữ nguyên.
struct KoaLidLightTests {
  static func glows(_ e: KoaRender.Element, under blink: Bool = false) -> (covers: Int, lit: Int) {
    var covers = 0, lit = 0
    let isCover = e.tag == "Ellipse" && e.props["ry"] == .number(25)
    if blink, isCover {
      covers += 1
      if case .string(let f)? = e.props["fill"], f.hasPrefix("url(#koaGlow") { lit += 1 }
    }
    for k in e.kids { let r = glows(k, under: blink || e.tag == "G"); covers += r.covers; lit += r.lit }
    return (covers, lit)
  }

  @Test func blinkCoversGetTheHeadGlow() {
    var o = KoaRender.Options()
    o.expression = .happy
    o.t = 4800
    let wardrobe = Self.glows(KoaRender.figure(o))
    #expect(wardrobe.lit >= 2, "nắp chớp mắt phải có quầng sáng đầu: \(wardrobe)")
    let rn = KoaScene.$rn.withValue(true) { Self.glows(KoaRender.figure(o)) }
    #expect(rn.lit == 0, "bản RN giữ nguyên: \(rn)")
  }
}

/// Nắp chớp mắt co HÌNH, không co màu / đèn (Kiệt 21/11): lúc nửa nhắm, dải đèn của nắp vẫn ở không gian da
/// đầu — không có hình nào mang phép co dọc của cú chớp trong ma trận vẽ. Bản RN giữ cách cũ.
struct KoaBlinkGeometryTests {
  static func squashed(_ ops: [KoaPaint.Op], _ sy: Double) -> Int {
    ops.reduce(0) { n, op in
      switch op {
      case .shape(let s):
        // chỉ hình tô bằng dải đèn (gradient): màu đặc (đường mi) co theo mép nắp là đúng
        guard case .gradient = s.style.fill else { return n }
        return n + (s.matrix[0] != 0 && abs(s.matrix[3] / s.matrix[0] - sy) < 0.001 ? 1 : 0)
      case .group(_, _, let inner): return n + squashed(inner, sy)
      default: return n
      }
    }
  }

  static func plan(rn: Bool) -> [KoaPaint.Op] {
    var o = KoaRender.Options()
    o.expression = .happy
    o.live = true
    o.blink = 0.5
    return KoaScene.$rn.withValue(rn) { KoaPaint.plan(KoaRender.figure(o)) }
  }

  @Test func halfBlinkKeepsThePaintUnsquashed() {
    #expect(Self.squashed(Self.plan(rn: false), 0.5) == 0)
    #expect(Self.squashed(Self.plan(rn: true), 0.5) > 0, "bản RN vẫn co cả nắp lẫn màu")
  }

  /// tâm elip của mọi nắp chớp, gom theo độ khép (matrix[3]) của nhóm chớp chứa nó
  static func coversBySquash(_ e: KoaRender.Element, _ sy: Double? = nil, into out: inout [Double: [Double]]) {
    let here: Double? = e.tag == "G" && e.props[KoaPaint.geometryOnly] != nil ? e.matrix?[3] : sy
    if e.tag == "Ellipse", e.props["ry"] == .number(25), let sy = here, case .number(let x)? = e.props["cx"] {
      out[sy, default: []].append(x)
    }
    for k in e.kids { coversBySquash(k, here, into: &out) }
  }

  /// Hai mắt chớp lệch (phòng Koa, Koa V2): ở giao diện tối mỗi nắp có thêm lượt quầng sáng — vẫn phải
  /// tách đúng mắt, cả lượt nền lẫn lượt quầng của mắt phải theo độ khép của mắt phải (Devin #996).
  @Test func rightLidKeepsItsOwnBlinkWithTheGlowPass() {
    for flat in [false, true] {
      var o = KoaRender.Options()
      o.expression = .happy
      o.live = true
      o.flat = flat
      o.blink = 0.6
      o.blinkRight = 0.3
      var got: [Double: [Double]] = [:]
      Self.coversBySquash(KoaRender.figure(o), into: &got)
      let left = got.filter { abs($0.key - 0.6) < 1e-9 }.flatMap(\.value)
      let right = got.filter { abs($0.key - 0.3) < 1e-9 }.flatMap(\.value)
      #expect(Set(left) == [82], "flat \(flat): mắt trái khép 0,6 — \(got)")
      #expect(Set(right) == [158], "flat \(flat): mắt phải khép 0,3 — \(got)")
      #expect(left.count == right.count, "flat \(flat): mỗi mắt cùng số lượt tô")
      if !flat { #expect(right.count >= 2, "tối: nắp phải có cả lượt nền lẫn lượt quầng sáng") }
    }
  }
}

/// Mí mắt vẽ lại (Kiệt 21/11): mí phủ KÍN mép trên của mắt (trước: nắp bằng khít mắt lộ viền, mí nặng dời
/// xuống hở hai vệt trắng) và phủ đủ bề ngang mắt; không còn nắp mí cũ của cảnh RN trong cảnh tủ đồ.
struct KoaLidShapeTests {
  static func groups(_ n: KoaScene.Node, _ cond: String, into out: inout [KoaScene.Node]) {
    if n.cond == cond { out.append(n) }
    for k in n.kids ?? [] { groups(k, cond, into: &out) }
  }

  @Test func lidsCoverTheTopOfTheEye() throws {
    for cond in ["lidsHalf", "lidsHeavy", "lidsSad"] {
      var found: [KoaScene.Node] = []
      for n in KoaScene.wardrobePayload.nodes { Self.groups(n, cond, into: &found) }
      let g = try #require(found.first, "\(cond)")
      let covers = (g.kids ?? []).filter { if case .string(let f)? = $0.a?["fill"] { return f.uppercased() == "#BFC7CF" } else { return false } }
      #expect(covers.count == 2, "\(cond): hai nắp")
      for c in covers {
        guard case .string(let d)? = c.a?["d"] else { Issue.record("\(cond): nắp không có d"); continue }
        #expect(!d.contains(" A18 23.5 0 0 1 "), "\(cond): còn nắp cũ (nửa elip bằng khít mắt)")
        let b = KoaPaint.bounds(KoaPaint.parsePath(d))
        #expect(b.y <= 96 - 23.5 - 1, "\(cond): mí phải phủ quá mép trên của mắt (\(b))")
        // mí buồn cố ý chừa đầu mắt (mép mí cao hơn mắt ở đó)
        #expect(b.width >= (cond == "lidsSad" ? 30 : 36), "\(cond): mí phải phủ đủ bề ngang mắt (\(b))")
      }
    }
  }
}

/// Mắt có mí nhắm dần khi chớp (Kiệt 21/11 "rà lại kỹ"): mép mí trượt xuống đường mắt nhắm (`KoaLid`) thay cho
/// kéo giãn cả nhóm — trước đó lộ vệt trắng hai bên mắt, đường mi thành vệt đen dày, mí buồn không nhắm hết,
/// bọng mắt (mặt mệt) tụt xuống má.
struct KoaLidCloseTests {
  static func str(_ v: KoaScene.Value?) -> String? { if case .string(let x)? = v { return x } else { return nil } }
  static func group(_ cond: String) -> KoaScene.Node? {
    var out: KoaScene.Node?
    func walk(_ n: KoaScene.Node) {
      if n.cond == cond, out == nil { out = n }
      n.kids?.forEach(walk)
    }
    KoaScene.wardrobePayload.nodes.forEach(walk)
    return out
  }
  static func points(_ d: String) -> [(Double, Double)] {
    let body = d.components(separatedBy: " Z")[0]
    let nums = body.split { !"0123456789.-".contains($0) }.compactMap { Double($0) }
    return stride(from: 0, to: nums.count - 1, by: 2).map { (nums[$0], nums[$0 + 1]) }
  }
  static func inside(_ pts: [(Double, Double)], _ x: Double, _ y: Double) -> Bool {
    var c = false
    var j = pts.count - 1
    for i in pts.indices {
      let (xi, yi) = pts[i], (xj, yj) = pts[j]
      if (yi > y) != (yj > y), x < (xj - xi) * (y - yi) / (yj - yi) + xi { c.toggle() }
      j = i
    }
    return c
  }

  /// độ khép 0 trùng từng ký tự với mí vẽ sẵn của cảnh tủ đồ (build.py `lid_kids`)
  @Test func openLidMatchesTheScene() throws {
    for (cond, kind) in KoaLid.kinds {
      let g = try #require(Self.group(cond), "\(cond)")
      let ds = (g.kids ?? []).compactMap { Self.str($0.a?["d"]) }
      for e in KoaLid.eyes.indices {
        let p = KoaLid.paths(kind, eye: e, close: 0)
        #expect(ds.contains(p.fur), "\(cond) mắt \(e): lông mí")
        #expect(ds.contains(p.lash), "\(cond) mắt \(e): đường mi")
      }
    }
  }

  /// nhắm hẳn: lông mí phủ kín lòng trắng; ở mọi độ khép, phần lòng trắng còn hở chỉ nằm DƯỚI mép mí, và khép
  /// thêm thì phần phủ chỉ lớn lên (mép mí chỉ đi xuống)
  @Test func lidCoversTheEyeAsItCloses() {
    for (cond, kind) in KoaLid.kinds {
      for e in KoaLid.eyes.indices {
        let cx = KoaLid.eyes[e].cx
        var before: [Int: Int] = [:]
        for step in 0...10 {
          let b = Double(step) / 10
          let fur = Self.points(KoaLid.paths(kind, eye: e, close: b).fur)
          for xi in -34...34 {
            let dx = Double(xi) / 2
            let half = (1 - pow(dx / 18, 2)).squareRoot()
            let top = 96 - 23.5 * half + 0.4, bottom = 96 + 23.5 * half - 0.4
            var y = top
            var seenOpen = false
            var covered = 0
            while y <= bottom {
              let isIn = Self.inside(fur, cx + dx, y)
              if isIn, seenOpen { Issue.record("\(cond) mắt \(e) khép \(b): lông mí nằm dưới chỗ hở tại x \(cx + dx) y \(y)") }
              if !isIn { seenOpen = true } else { covered += 1 }
              if step == 10, !isIn { Issue.record("\(cond) mắt \(e) nhắm hẳn còn hở tại x \(cx + dx) y \(y)") }
              y += 0.5
            }
            if let was = before[xi], covered + 1 < was { Issue.record("\(cond) mắt \(e) khép \(b): mí lùi lên tại x \(cx + dx)") }
            before[xi] = covered
          }
        }
      }
    }
  }

  /// đường mi giữ độ dày khi khép (trước: giãn theo mí, nhắm hẳn dày gấp đôi / gấp ba)
  @Test func lashKeepsItsThickness() {
    func thickness(_ d: String) -> Double {
      let pts = Self.points(d)
      let half = pts.count / 2
      var best = 0.0
      for i in 0..<half {
        let a = pts[i], b = pts[pts.count - 1 - i]
        best = max(best, hypot(a.0 - b.0, a.1 - b.1))
      }
      return best
    }
    for (cond, kind) in KoaLid.kinds {
      let open = thickness(KoaLid.paths(kind, eye: 0, close: 0).lash)
      let shut = thickness(KoaLid.paths(kind, eye: 0, close: 1).lash)
      #expect(abs(shut - open) < 0.6, "\(cond): \(open) → \(shut)")
    }
  }

  /// trong hình vẽ: chớp thì mí đổi hình, không có phép giãn dọc nào; bọng mắt giữ nguyên
  @Test func renderSwapsTheLidAndKeepsTheBag() throws {
    var o = KoaRender.Options()
    o.expression = .tired
    o.live = true
    o.blink = 1
    let g = try #require(Self.group("lidsHeavy"))
    let sceneDs = Set((g.kids ?? []).compactMap { Self.str($0.a?["d"]) })
    let bag = (g.kids ?? []).filter { Self.str($0.a?["stroke"]) != nil && Self.str($0.a?["fill"]) == "none" }.compactMap { Self.str($0.a?["d"]) }
    #expect(bag.count == 2)
    let want = KoaLid.swaps("lidsHeavy", close: 1)
    var drawn: Set<String> = []
    var stretched = false
    func scan(_ e: KoaRender.Element) {
      if case .string(let d)? = e.props["d"] { drawn.insert(d) }
      if let m = e.matrix, m[0] != 0, abs(m[3] / m[0] - 1) > 0.01, e.kids.contains(where: { k in
        if case .string(let d)? = k.props["d"] { return sceneDs.contains(d) || want.values.contains(d) } else { return false }
      }) { stretched = true }
      e.kids.forEach(scan)
    }
    scan(KoaRender.figure(o))
    for v in want.values { #expect(drawn.contains(v), "vẽ mí ở độ khép 1") }
    for k in want.keys { #expect(!drawn.contains(k), "không còn mí đứng yên") }
    for b in bag { #expect(drawn.contains(b), "bọng mắt giữ nguyên chỗ") }
    #expect(!stretched, "không còn phép giãn dọc nhóm mí")
  }
}

/// Mắt + nắp chớp một khối (Kiệt 21/11: "gộp mắt và mí … ít bị lỗi"): trong cảnh tủ đồ mỗi nhóm chớp là hai nhóm
/// con, mỗi mắt một nhóm; mặt mắt to (`eyesWide`, lớp `koaPop` phồng ×1,07) có nắp lớn phủ hết lòng trắng ở mọi
/// mức phồng — trước đó nhắm mắt hở viền trắng quanh mắt (mặt plead).
struct KoaWideEyeBlinkTests {
  static func walk(_ n: KoaScene.Node, _ f: (KoaScene.Node) -> Void) {
    f(n)
    for k in n.kids ?? [] { walk(k, f) }
  }
  static func num(_ n: KoaScene.Node, _ k: String) -> Double { n.a?[k]?.number ?? .nan }

  @Test func blinkGroupsArePerEyeAndCoverTheWideEyes() throws {
    var pop: KoaScene.Node?
    var groups: [KoaScene.Node] = []
    for r in KoaScene.wardrobePayload.nodes {
      Self.walk(r) { n in
        if n.anim?.k == "koaPop" { pop = n }
        if let k = n.anim?.k, KoaMath.blinkAnims.contains(k) { groups.append(n) }
      }
    }
    let p = try #require(pop)
    let frames = try #require(KoaScene.keyframes["koaPop"]?.tf)
    var scale: Double = 1
    for f in frames {
      for op in f.ops + (f.to ?? []) where op.kind == "s" { scale = max(scale, op.values[0]) }
    }
    #expect(scale > 1.05, "lớp mắt to có phồng")
    let o = p.o ?? [120, 96]
    let big: [KoaScene.Node] = (p.kids ?? []).filter { $0.t == "ellipse" && Self.num($0, "rx") >= 14 }
    let whites = big.sorted { Self.num($0, "cx") < Self.num($1, "cx") }
    #expect(whites.count == 2)
    #expect(groups.count == 2)
    for g in groups {
      func eyeX(_ n: KoaScene.Node) -> Double { Self.num(n.kids?.first ?? n, "cx") }
      let eyes = (g.kids ?? []).sorted { eyeX($0) < eyeX($1) }
      #expect(eyes.count == 2, "mỗi mắt một nhóm con")
      for (eye, w) in zip(eyes, whites) {
        // nắp lớn (chỉ khi eyesWide) phủ lòng trắng mắt to lúc phồng nhất, quanh tâm phồng của lớp
        let wide = try #require(eye.kids?.first { $0.cond == "eyesWide" }?.kids?.first)
        let (cx, cy, rx, ry) = (Self.num(wide, "cx"), Self.num(wide, "cy"), Self.num(wide, "rx"), Self.num(wide, "ry"))
        let (wx, wy, wrx, wry) = (Self.num(w, "cx"), Self.num(w, "cy"), Self.num(w, "rx"), Self.num(w, "ry"))
        // mọi mức phồng ×1 … ×max (lúc chưa phồng, mép trong mắt nằm xa tâm mặt hơn lúc phồng)
        for step in 0...8 {
          let k: Double = 1 + (scale - 1) * Double(step) / 8
          for i in 0..<72 {
            let t: Double = Double(i) / 72 * 2 * Double.pi
            let px: Double = wx + wrx * cos(t)
            let py: Double = wy + wry * sin(t)
            let x: Double = o[0] + (px - o[0]) * k
            let y: Double = o[1] + (py - o[1]) * k
            let u: Double = (x - cx) / rx
            let v: Double = (y - cy) / ry
            #expect(u * u + v * v <= 1, "mức \(k), điểm \(i) của lòng trắng mắt to lọt ra ngoài nắp")
          }
        }
      }
    }
  }

  /// Nắp lớn chỉ vẽ cho mặt mắt to (plead); mặt thường (happy) không có.
  @Test func wideCoverShowsOnlyForWideEyes() {
    func coverRadii(_ e: KoaFlags.Expression) -> [Double] {
      var o = KoaRender.Options()
      o.expression = e
      o.live = true
      o.blink = 1
      var ry: [Double] = []
      func walk(_ el: KoaRender.Element) {
        if el.tag == "Ellipse", case .number(let r)? = el.props["ry"] { ry.append(r) }
        el.kids.forEach(walk)
      }
      walk(KoaRender.figure(o))
      return ry
    }
    #expect(coverRadii(.plead).contains { $0 > 28 }, "mặt plead có nắp lớn")
    #expect(!coverRadii(.happy).contains { $0 > 28 }, "mặt thường không có")
  }
}

/// Nét mi lúc nhắm vẽ SAU mọi nắp chớp (Kiệt 21/11): trước đó nét mi đi cùng nhóm chớp đầu, nhóm chớp thứ hai
/// vẽ nắp đè lên — nét mi mất nửa trong, mắt to (plead) mất gần hết.
struct KoaLashOnTopTests {
  /// thứ tự vẽ: (là nét mi?, là nắp?) của mọi hình, theo đúng thứ tự trong cây
  static func order(_ e: KoaRender.Element, into out: inout [(lash: Bool, cover: Bool)]) {
    if e.tag == "Path", e.props["strokeWidth"] == .number(KoaMath.lashWidth), case .string(let d)? = e.props["d"], KoaMath.lashPaths.contains(d) {
      out.append((true, false))
    } else if e.tag == "Ellipse", case .number(let ry)? = e.props["ry"], ry >= 25 {
      out.append((false, true))
    }
    for k in e.kids { order(k, into: &out) }
  }

  @Test func lashDrawsAfterEveryCover() {
    for e: KoaFlags.Expression in [.happy, .plead] {
      for right in [nil, 0.6] as [Double?] {
        var o = KoaRender.Options()
        o.expression = e
        o.live = true
        o.blink = 1
        o.blinkRight = right
        var seq: [(lash: Bool, cover: Bool)] = []
        Self.order(KoaRender.figure(o), into: &seq)
        let lastCover = seq.lastIndex { $0.cover } ?? -1
        let firstLash = seq.firstIndex { $0.lash } ?? -1
        #expect(firstLash >= 0, "\(e): có nét mi")
        #expect(firstLash > lastCover, "\(e) right \(String(describing: right)): nét mi phải vẽ sau mọi nắp")
      }
    }
  }
}
