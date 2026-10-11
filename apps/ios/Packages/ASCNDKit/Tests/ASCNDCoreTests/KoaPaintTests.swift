@testable import ASCNDCore
import Foundation
import Testing

/// Koa K3: kế hoạch vẽ — path SVG, cung, khung bao, kế thừa kiểu, dải màu,
/// clip, độ mờ nhóm, khung nhìn.
struct KoaPaintTests {
  typealias P = KoaPaint.Point

  static func close(_ a: Double, _ b: Double, _ eps: Double = 1e-9) -> Bool { abs(a - b) <= eps }
  static func close(_ a: P, _ b: P, _ eps: Double = 1e-9) -> Bool { close(a.x, b.x, eps) && close(a.y, b.y, eps) }

  static func end(_ s: KoaPaint.Segment) -> P? {
    switch s {
    case .move(let p), .line(let p), .quad(_, let p), .cubic(_, _, let p): p
    case .close: nil
    }
  }

  @Test func absoluteCommands() {
    let s = KoaPaint.parsePath("M10 20 L30 40 H50 Q60 70 80 90 C1 2 3 4 5 6 Z")
    #expect(
      s == [
        .move(P(10, 20)), .line(P(30, 40)), .line(P(50, 40)), .quad(P(60, 70), P(80, 90)),
        .cubic(P(1, 2), P(3, 4), P(5, 6)), .close,
      ])
  }

  @Test func relativeImplicitAndCompactNumbers() {
    #expect(
      KoaPaint.parsePath("m1 2 l3 4 h5 v6 z") == [
        .move(P(1, 2)), .line(P(4, 6)), .line(P(9, 6)), .line(P(9, 12)), .close,
      ])
    // tọa độ sau moveto là lineto; số dính nhau bằng dấu / dấu chấm / số mũ
    #expect(KoaPaint.parsePath("M0 0 10 10 20 0") == [.move(P(0, 0)), .line(P(10, 10)), .line(P(20, 0))])
    #expect(KoaPaint.parsePath("M1-2.5.5.5L3e1,4") == [.move(P(1, -2.5)), .line(P(0.5, 0.5)), .line(P(30, 4))])
    // path hỏng: dừng ở chỗ hỏng, giữ phần đã đọc (luật xử lý lỗi của SVG)
    #expect(KoaPaint.parsePath("M1-2.5.5L3e1,4") == [.move(P(1, -2.5))])
    // S / T phản chiếu điểm điều khiển trước
    #expect(
      KoaPaint.parsePath("M0 0 C0 10 10 10 10 0 S20 -10 20 0") == [
        .move(P(0, 0)), .cubic(P(0, 10), P(10, 10), P(10, 0)), .cubic(P(10, -10), P(20, -10), P(20, 0)),
      ])
    // sau Z, điểm hiện tại về đầu đường
    #expect(KoaPaint.parsePath("M5 5 L9 9 Z l1 1") == [.move(P(5, 5)), .line(P(9, 9)), .close, .line(P(6, 6))])
  }

  @Test func arcIsTheSVGArc() {
    // nửa vòng tròn tâm (10, 0), quét dương trong hệ y hướng xuống → qua (10, −10)
    let s = KoaPaint.parsePath("M0 0 A10 10 0 0 1 20 0")
    #expect(s.count == 3)
    #expect(Self.end(s[1]).map { Self.close($0, P(10, -10)) } == true)
    #expect(Self.end(s[2]) == P(20, 0))
    // quét âm → qua (10, 10)
    let t = KoaPaint.parsePath("M0 0 A10 10 0 0 0 20 0")
    #expect(Self.end(t[1]).map { Self.close($0, P(10, 10)) } == true)
    // bán kính quá nhỏ được nới đúng cỡ (λ > 1)
    let u = KoaPaint.parsePath("M0 0 A1 1 0 0 1 20 0")
    #expect(Self.end(u[1]).map { Self.close($0, P(10, -10)) } == true)
    // mọi điểm giữa của mỗi khúc bezier nằm trên đường tròn
    if case .cubic(let c1, let c2, let p)? = s.dropFirst().first {
      let a = P(0, 0)
      let mx: Double = (a.x + 3.0 * c1.x + 3.0 * c2.x + p.x) / 8.0
      let my: Double = (a.y + 3.0 * c1.y + 3.0 * c2.y + p.y) / 8.0
      let r: Double = ((mx - 10.0) * (mx - 10.0) + my * my).squareRoot()
      #expect(Self.close(r, 10, 1e-2))  // sai số của bezier một phần tư vòng ≈ 2,7e-4 r
    }
    // các lá của cảnh: "M64 96 A18 23.5 0 0 1 100 96 Z"
    let leaf = KoaPaint.parsePath("M64 96 A18 23.5 0 0 1 100 96 Z")
    let b = KoaPaint.bounds(leaf)
    #expect(Self.close(b.x, 64) && Self.close(b.width, 36) && Self.close(b.y, 96 - 23.5, 1e-3))
  }

  @Test func boundsAreTight() {
    let c = KoaPaint.bounds(KoaPaint.parsePath("M0 0 C0 10 10 10 10 0"))
    #expect(Self.close(c.height, 7.5) && Self.close(c.width, 10))
    let q = KoaPaint.bounds(KoaPaint.parsePath("M0 0 Q5 10 10 0"))
    #expect(Self.close(q.height, 5))
    let e = KoaPaint.bounds(KoaPaint.ellipse(cx: 10, cy: 20, rx: 3, ry: 4))
    #expect(Self.close(e.x, 7) && Self.close(e.y, 16) && Self.close(e.width, 6) && Self.close(e.height, 8))
    let r = KoaPaint.rect(x: 0, y: 0, width: 10, height: 4, rx: 8, ry: nil)
    #expect(KoaPaint.bounds(r) == KoaPaint.Rect(x: 0, y: 0, width: 10, height: 4))
  }

  @Test func colours() {
    #expect(KoaPaint.colour("#FFF") == KoaPaint.RGBA(r: 1, g: 1, b: 1, a: 1))
    #expect(KoaPaint.colour("#ff0000") == KoaPaint.RGBA(r: 1, g: 0, b: 0, a: 1))
    #expect(KoaPaint.colour("none") == nil)
    #expect(KoaPaint.colour("#12") == nil)
  }

  @Test func viewportIsXMidYMaxMeet() {
    #expect(KoaPaint.viewport(width: 160, height: 200) == [160.0 / 240, 0, 0, 160.0 / 240, 0, 0])
    let wide = KoaPaint.viewport(width: 200, height: 200)
    #expect(Self.close(wide[0], 200.0 / 300) && Self.close(wide[4], 20) && Self.close(wide[5], 0))
    let tall = KoaPaint.viewport(width: 120, height: 300)
    #expect(Self.close(tall[0], 0.5) && Self.close(tall[4], 0) && Self.close(tall[5], 150))
  }

  static func shapes(_ ops: [KoaPaint.Op]) -> [KoaPaint.Shape] {
    ops.flatMap { op -> [KoaPaint.Shape] in
      switch op {
      case .shape(let s): [s]
      case .group(_, _, let inner): shapes(inner)
      }
    }
  }

  static func groups(_ ops: [KoaPaint.Op]) -> [(Double, [KoaPaint.Clip]?)] {
    ops.flatMap { op -> [(Double, [KoaPaint.Clip]?)] in
      switch op {
      case .shape: []
      case .group(let o, let c, let inner): [(o, c)] + groups(inner)
      }
    }
  }

  /// Mọi `url(#…)` trong cây đều tìm được dải màu; mọi path đều đọc trọn.
  @Test func everyPoseAndItemPlansCompletely() {
    var sawClip = false, sawFade = false
    for (i, pose) in KoaFlags.Pose.allCases.enumerated() {
      for j in 0..<10 {
        var o = KoaRender.Options()
        o.pose = pose
        o.expression = KoaFlags.Expression.allCases[(i + j) % KoaFlags.Expression.allCases.count]
        for slot in KoaFlags.Slot.allCases { o.worn[slot] = KoaFlags.items[slot]?[(j + i) % 10] }
        o.t = Double(j) * 731
        o.paper = j % 2 == 1
        let plan = KoaPaint.plan(KoaRender.figure(o))
        let all = Self.shapes(plan)
        #expect(all.count > 50, "\(pose) \(j)")
        for s in all {
          for paint in [s.style.fill, s.style.stroke] {
            if case .gradient(let g) = paint {
              switch g {
              case .linear(_, _, _, _, _, let stops), .radial(_, _, _, _, let stops): #expect(!stops.isEmpty)
              }
            }
          }
          #expect(!s.segments.isEmpty)
        }
        for (opacity, clip) in Self.groups(plan) {
          if clip != nil { sawClip = true }
          if opacity < 1 { sawFade = true }
        }
      }
    }
    #expect(sawClip && sawFade)
  }

  @Test func everyScenePathParsesToTheEnd() {
    // một path đọc hỏng giữa chừng sẽ ít đoạn hơn số lệnh của nó
    for (d, segs) in KoaPaint.pathCache {
      let letters = d.filter { $0.isLetter && $0 != "e" && $0 != "E" }
      let arcs = d.filter { $0 == "A" || $0 == "a" }.count
      #expect(segs.count >= letters.count - arcs, "\(d)")
    }
  }

  @Test func fillsInheritAndUrlsResolve() {
    let tree = KoaRender.Element(
      "Svg",
      kids: [
        KoaRender.Element(
          "Defs",
          kids: [
            KoaRender.Element(
              "LinearGradient", ["id": .string("g"), "gradientUnits": .string("userSpaceOnUse"), "y2": .number(10)],
              kids: [KoaRender.Element("Stop", ["offset": .number(0), "stopColor": .string("#000"), "stopOpacity": .number(0.5)])])
          ]),
        KoaRender.Element(
          "G", ["fill": .string("url(#g)"), "strokeWidth": .number(3), "opacity": .number(0.5)], matrix: [1, 0, 0, 1, 5, 0],
          kids: [KoaRender.Element("Rect", ["width": .number(2), "height": .number(2), "stroke": .string("#fff")])]),
      ])
    let plan = KoaPaint.plan(tree)
    guard case .group(let o, .none, let inner)? = plan.first, case .shape(let s)? = inner.first else {
      Issue.record("\(plan)")
      return
    }
    #expect(o == 0.5)
    #expect(s.matrix == [1, 0, 0, 1, 5, 0])
    #expect(s.style.strokeWidth == 3)
    #expect(s.style.stroke == .colour(KoaPaint.RGBA(r: 1, g: 1, b: 1, a: 1)))
    #expect(
      s.style.fill
        == .gradient(
          .linear(
            x1: 0, y1: 0, x2: 0, y2: 10, bbox: false,
            stops: [KoaPaint.Stop(offset: 0, colour: KoaPaint.RGBA(r: 0, g: 0, b: 0, a: 0.5))])))
  }
}
