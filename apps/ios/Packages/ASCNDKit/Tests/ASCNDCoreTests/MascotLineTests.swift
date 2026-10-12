@testable import ASCNDCore
import Foundation
import Testing

/// Lời Koa / việc kế tiếp của tab Hôm nay (#527). Golden: `mascot-message.ts`
/// @ fac9ac2 biên dịch (`gen-mascot-line.mjs`).
struct MascotLineGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "mascot-line-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  static func thing(_ v: JSONValue?) -> MascotLine.Thing? { v?.stringValue.flatMap(MascotLine.Thing.init(rawValue:)) }

  @Test func windowsMatchRN() throws {
    let g = try Self.golden()
    for t in MascotLine.Thing.allCases {
      #expect(MascotLine.gapFrom[t].map(Double.init) == g["GAP_FROM"]?[t.rawValue]?.doubleValue, "\(t)")
      let span = MascotLine.gapSpan[t] ?? nil
      #expect(span.map(Double.init) == g["GAP_SPAN"]?[t.rawValue]?.doubleValue, "\(t)")
    }
  }

  @Test func linesMatchRN() throws {
    let cases = Self.array(try Self.golden()["cases"])
    #expect(cases.count == 1200)
    var kinds = Set<String>()
    for c in cases {
      let d = c["day"]
      let day = MascotLine.Day(
        sleepMin: d?["sleepMin"]?.doubleValue, meals: d?["meals"]?.doubleValue, waterPct: d?["waterPct"]?.doubleValue,
        workouts: d?["workouts"]?.doubleValue, hour: Int(d?["hour"]?.doubleValue ?? 0))
      // `order.filter((t) => ORDER.includes(t))`: mục lạ ('steps') bị bỏ, trùng thì giữ.
      let order: [MascotLine.Thing] =
        c["order"] == .null ? MascotLine.defaultOrder : Self.array(c["order"]).compactMap { Self.thing($0) }
      var due: [MascotLine.Thing: Int] = [:]
      if case .object(let o)? = c["dueFrom"] {
        for (k, v) in o { if let t = MascotLine.Thing(rawValue: k), let h = v.doubleValue { due[t] = Int(h) } }
      }
      let got = MascotLine.line(day, order: order, dueFrom: due)
      let want = c["line"]
      let kind = want?["kind"]?.stringValue ?? ""
      kinds.insert(kind)
      switch kind {
      case "silent": #expect(got == .silent, "\(c)")
      case "praise": #expect(got == .praise, "\(c)")
      case "ask": #expect(got == .ask(Self.thing(want?["gap"])!), "\(c)")
      case "notice": #expect(got == .notice(win: Self.thing(want?["win"])!, gap: Self.thing(want?["gap"])!), "\(c)")
      default: Issue.record("kind lạ: \(kind)")
      }
    }
    #expect(kinds == ["silent", "praise", "ask", "notice"])
  }
}

struct MascotLineTests {
  /// Khung qua nửa đêm: ngủ từ 22:00 trong 5 giờ → 22…02.
  @Test func windowWrapsMidnight() {
    #expect(MascotLine.withinWindow(23, from: 22, span: 5))
    #expect(MascotLine.withinWindow(2, from: 22, span: 5))
    #expect(!MascotLine.withinWindow(3, from: 22, span: 5))
    #expect(!MascotLine.withinWindow(21, from: 22, span: 5))
  }

  @Test func gapIsTheAskedThing() {
    #expect(MascotLine.Line.ask(.meal).gap == .meal)
    #expect(MascotLine.Line.notice(win: .sleep, gap: .water).gap == .water)
    #expect(MascotLine.Line.praise.gap == nil)
    #expect(MascotLine.Line.silent.gap == nil)
  }

  /// Khen một lần mỗi ngày; đã khen trong phiên thì giữ câu.
  @Test func praiseOncePerDay() {
    let today = LocalDate("2026-10-12")!
    #expect(MascotLine.allowPraise(praisedOn: nil, today: today, thisSession: false))
    #expect(MascotLine.allowPraise(praisedOn: LocalDate("2026-10-11"), today: today, thisSession: false))
    #expect(!MascotLine.allowPraise(praisedOn: today, today: today, thisSession: false))
    #expect(MascotLine.allowPraise(praisedOn: today, today: today, thisSession: true))
  }
}
