@testable import ASCNDCore
import Foundation
import Testing

/// Dáng đĩa huy chương (#527) so với CHÍNH `medalPath` của `medal.tsx` @ fac9ac2
/// (`Fixtures/medal-golden.json`, `gen-medal.mjs`): 10 loại × 4 bán kính, từng ký tự.
struct MedalGeometryGoldenTests {
  static func cases() throws -> [JSONValue] {
    let url = try #require(Bundle.module.url(forResource: "medal-golden", withExtension: "json", subdirectory: "Fixtures"))
    let g = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
    guard case .array(let a)? = g["cases"] else { throw CocoaError(.fileReadCorruptFile) }
    return a
  }

  @Test func pathIsRNsCharacterForCharacter() throws {
    let cases = try Self.cases()
    #expect(cases.count == 40)
    for c in cases {
      let type = try #require(c["type"]?.stringValue)
      let r = try #require(c["r"]?.doubleValue)
      #expect(MedalGeometry.path(type: type, r: r) == c["d"]?.stringValue, "\(type) r=\(r)")
    }
  }

  /// `toFixed(2)` lấy số lớn hơn ở điểm giữa chính xác; `printf` lấy số chẵn.
  @Test func fixedTwoRoundsTiesLikeJS() {
    #expect(MedalGeometry.fixed2(41.625) == "41.63")
    #expect(MedalGeometry.fixed2(-41.625) == "-41.63")
    #expect(MedalGeometry.fixed2(1.005) == "1.00")  // 1.005 thật ra là 1.00499…
    #expect(MedalGeometry.fixed2(36) == "36.00")
  }

  @Test func commandsReadEveryShapeBack() throws {
    for c in try Self.cases() {
      guard let d = c["d"]?.stringValue else { continue }
      let cmds = MedalGeometry.commands(d)
      #expect(cmds.first.map { if case .move = $0 { true } else { false } } == true, "\(d)")
      #expect(cmds.last == .close)
      // Mỗi lệnh trong chuỗi ra đúng một `Command`.
      let ops = d.split(separator: " ").filter { ["M", "L", "Q", "Z"].contains($0) }.count
      #expect(cmds.count == ops, "\(d)")
    }
  }

  @Test func commandsParseNumbers() {
    #expect(
      MedalGeometry.commands("M 1.5,2 L 3,4 Q 5 6 7 8 Z") == [
        .move(1.5, 2), .line(3, 4), .quad(cx: 5, cy: 6, x: 7, y: 8), .close,
      ])
  }
}

@MainActor
struct CelebrationQueueTests {
  @Test func showsOneAtATimeInArrivalOrder() {
    let q = CelebrationQueue()
    #expect(q.head == nil)
    q.enqueue(title: "A", description: "a", icon: "flame", tier: "gold", awardKey: "streak_7")
    q.enqueue(title: "B", description: "b", icon: "target", tier: "silver")
    #expect(q.head?.title == "A")
    #expect(q.head?.tier == .gold)
    #expect(q.head?.awardKey == "streak_7")
    q.dequeue()
    #expect(q.head?.title == "B")
    #expect(q.head?.awardKey == nil)
    q.dequeue()
    #expect(q.head == nil)
    q.dequeue()  // rỗng: không sập
    #expect(q.items.isEmpty)
  }

  @Test func idsAreDistinctAndUnknownTierIsBronze() {
    let q = CelebrationQueue()
    q.enqueue(title: "A", description: "", icon: "x", tier: "mythic")
    q.enqueue(title: "A", description: "", icon: "x", tier: "mythic")
    #expect(q.items[0].id != q.items[1].id)
    #expect(q.items[0].tier == .bronze)
  }

  @Test func clearDropsEverything() {
    let q = CelebrationQueue()
    q.enqueue(title: "A", description: "", icon: "x", tier: "gold")
    q.enqueue(title: "B", description: "", icon: "x", tier: "gold")
    q.clear()
    #expect(q.head == nil)
  }
}

struct MedalSheenTests {
  /// Hai cung của vệt sáng: điểm đầu/cuối đúng chuỗi SVG, mọi điểm nằm trên
  /// đúng vòng tròn, và lát nằm ở góc TRÊN TRÁI của đĩa (tâm 36, 36).
  @Test func sheenFollowsTheSVGArcs() {
    let pts = MedalGeometry.sheen
    #expect(pts.first == MedalGeometry.Point(x: 13, y: 30))
    #expect(pts.contains(MedalGeometry.Point(x: 44, y: 13)))
    #expect(pts.last == MedalGeometry.Point(x: 13, y: 44))
    for p in pts {
      #expect(p.x <= 44.0001 && p.y <= 44.0001, "\(p)")
      #expect(p.x + p.y < 72, "lát phải ở nửa trên-trái: \(p)")
    }
  }

  @Test func arcStaysOnItsCircle() {
    // Nửa vòng r=10 quanh (36, 36), từ trái sang phải đi qua phía trên (sweep).
    let pts = MedalGeometry.arc(
      from: .init(x: 26, y: 36), to: .init(x: 46, y: 36), r: 10, large: false, sweep: true)
    for p in pts {
      #expect(abs(((p.x - 36) * (p.x - 36) + (p.y - 36) * (p.y - 36)).squareRoot() - 10) < 1e-9)
      #expect(p.y <= 36 + 1e-9)
    }
    let down = MedalGeometry.arc(
      from: .init(x: 26, y: 36), to: .init(x: 46, y: 36), r: 10, large: false, sweep: false)
    #expect(down.allSatisfy { $0.y >= 36 - 1e-9 })
  }
}
