@testable import ASCNDCore
import Foundation
import Testing

/// Koa K1 = CHÍNH RN @ fac9ac2 — `Fixtures/koa-golden.json` (`gen-koa.mjs`:
/// `koa-flags` / `koa-pose` / `koa-dress` / `figure-clock` biên dịch, toán
/// của `koa-figure.tsx` cắt nguyên văn bằng `extract-koa.mjs`).
struct KoaGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "koa-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] { CommunityUserGoldenTests.array(v) }
  static func numbers(_ v: JSONValue?) -> [Double] { array(v).compactMap { $0.doubleValue } }

  static func op(_ v: JSONValue) -> KoaScene.Op {
    let a = array(v)
    return KoaScene.Op(a.first?.stringValue ?? "", a.dropFirst().compactMap { $0.doubleValue })
  }
  static func ops(_ v: JSONValue?) -> [KoaScene.Op] { array(v).map(op) }

  static func close(_ a: Double, _ b: Double) -> Bool {
    abs(a - b) <= 1e-9 * max(1, abs(a), abs(b))
  }
  static func close(_ a: [Double]?, _ b: [Double]) -> Bool {
    guard let a, a.count == b.count else { return false }
    return zip(a, b).allSatisfy { close($0, $1) }
  }

  @Test func sceneDecodesWhole() throws {
    let g = try Self.golden()
    func count(_ ns: [KoaScene.Node]) -> Int { ns.reduce(0) { $0 + 1 + count($1.kids ?? []) } }
    #expect(Double(count(KoaScene.nodes)) == g["nodeCount"]?.doubleValue)
    #expect(Double(KoaScene.keyframes.count) == g["keyframeCount"]?.doubleValue)
    #expect(Self.close(KoaMath.insetMat, Self.numbers(g["inset"])))
  }

  @Test func flagsAreRNs() throws {
    let cases = Self.array(try Self.golden()["flags"])
    #expect(cases.count == 66)
    for c in cases {
      let e = try #require(KoaFlags.Expression(rawValue: c["e"]?.stringValue ?? ""))
      let p = try #require(KoaFlags.Pose(rawValue: c["p"]?.stringValue ?? ""))
      var worn: KoaFlags.Worn = [:]
      for slot in KoaFlags.Slot.allCases {
        if let id = c["worn"]?[slot.rawValue]?.stringValue { worn[slot] = id }
      }
      let f = KoaFlags.flags(e, p, worn: worn)
      guard case .object(let want)? = c["out"] else {
        Issue.record("thiếu out: \(c)")
        continue
      }
      #expect(f.count == want.count, "\(e) \(p)")
      for (key, v) in want {
        let mine = f[key]
        switch v {
        case .bool(let b): #expect(mine == .bool(b), "\(e) \(p) \(key)")
        case .string(let s): #expect(mine == .text(s), "\(e) \(p) \(key)")
        default: Issue.record("kiểu lạ \(key)")
        }
      }
      #expect(KoaMath.restsAt(f) == c["rests"]?.boolValue, "\(e) \(p)")
    }
  }

  @Test func parseIsRNs() throws {
    let cases = Self.array(try Self.golden()["parse"])
    #expect(cases.count == 46)
    for c in cases {
      let s = c["s"]?.stringValue ?? ""
      #expect(KoaMath.parseOps(s) == Self.ops(c["ops"]), "\(s)")
      let got = KoaMath.parseAnim(s)
      guard let want = c["anim"], want != .null else {
        #expect(got == nil, "\(s)")
        continue
      }
      let a = want["anim"]
      #expect(got?.anim.k == a?["k"]?.stringValue, "\(s)")
      #expect(got?.anim.dur == a?["dur"]?.doubleValue, "\(s)")
      #expect(got?.anim.delay == a?["delay"]?.doubleValue, "\(s)")
      #expect(got?.anim.ease == a?["ease"]?.stringValue, "\(s)")
      let origin = want["origin"].map { Self.numbers($0) }
      #expect(got?.origin == origin, "\(s)")
      let tr = want["tr"].map { Self.ops($0) }
      #expect(got?.tr == tr, "\(s)")
    }
  }

  @Test func matricesAndEaseAreRNs() throws {
    let g = try Self.golden()
    let opMats = Self.array(g["opMats"])
    #expect(opMats.count == 120)
    for c in opMats {
      #expect(Self.close(KoaMath.opMat(Self.op(c["op"] ?? .null)), Self.numbers(c["m"])), "\(c)")
    }
    let lists = Self.array(g["lists"])
    #expect(lists.count == 60)
    for c in lists {
      let m = KoaMath.opsMat(Self.ops(c["ops"]), c["ox"]?.doubleValue ?? 0, c["oy"]?.doubleValue ?? 0)
      #expect(Self.close(m, Self.numbers(c["m"])), "\(c)")
    }
    let ease = Self.array(g["ease"])
    #expect(ease.count == 123)
    for c in ease {
      let v = KoaMath.ease(c["t"]?.doubleValue ?? 0, c["kind"]?.stringValue ?? "")
      #expect(Self.close(v, c["v"]?.doubleValue ?? .nan), "\(c)")
    }
  }

  @Test func everyKeyframeTrackSamplesAsRN() throws {
    let tracks = Self.array(try Self.golden()["tracks"])
    #expect(tracks.count == 936)
    for c in tracks {
      let k = c["k"]?.stringValue ?? ""
      let track = try #require(KoaScene.keyframes[k], "\(k)")
      let t = c["t"]?.doubleValue ?? 0, kind = c["kind"]?.stringValue ?? ""
      if let m = c["m"], m != .null {
        let frames = try #require(track.tf, "\(k)")
        let got = KoaMath.sampleMat(frames, t, kind, c["ox"]?.doubleValue ?? 0, c["oy"]?.doubleValue ?? 0)
        #expect(Self.close(got, Self.numbers(m)), "\(c)")
      } else {
        #expect(track.tf == nil, "\(k)")
      }
      if let v = c["v"]?.doubleValue {
        let frames = try #require(track.op, "\(k)")
        #expect(Self.close(KoaMath.sampleOp(frames, t, kind), v), "\(c)")
      } else {
        #expect(track.op == nil, "\(k)")
      }
    }
  }

  @Test func restDressAndGazeAreRNs() throws {
    let g = try Self.golden()
    guard case .object(let rest)? = g["rest"] else {
      Issue.record("thiếu rest")
      return
    }
    #expect(rest.count == KoaMath.rest.count)
    for (id, m) in rest { #expect(Self.close(KoaMath.restMat(id), Self.numbers(m)), "\(id)") }
    #expect(KoaMath.restMat("POSERIG") == nil)

    let dress = Self.array(g["dress"])
    #expect(dress.count == 192)
    for c in dress {
      let part = try #require(KoaMath.DressPart(rawValue: c["part"]?.stringValue ?? ""))
      let m = KoaMath.dressMat(part, c["t"]?.doubleValue ?? 0, c["k"]?.doubleValue ?? 0)
      #expect(Self.close(m, Self.numbers(c["m"])), "\(c)")
    }

    let gaze = Self.array(g["gaze"])
    #expect(gaze.count == 40)
    for c in gaze {
      let gz = KoaMath.Gaze(
        x: c["g"]?["x"]?.doubleValue ?? 0, y: c["g"]?["y"]?.doubleValue ?? 0, k: c["g"]?["k"]?.doubleValue ?? 0)
      #expect(Self.close(KoaMath.headMat(gz), Self.numbers(c["head"])), "\(c)")
      #expect(Self.close(KoaMath.eyeMat(gz), Self.numbers(c["eye"])), "\(c)")
    }
  }

  @Test func clockStepsAsRN() throws {
    let runs = Self.array(try Self.golden()["clock"])
    #expect(runs.count == 30)
    for run in runs {
      var clock = 0.0, last = KoaMath.clockReset
      for s in Self.array(run) {
        KoaMath.stepClock(
          clock: &clock, last: &last, t: s["t"]?.doubleValue ?? 0, frameMs: s["frameMs"]?.doubleValue ?? 0)
        #expect(Self.close(clock, s["clock"]?.doubleValue ?? .nan), "\(s)")
        #expect(Self.close(last, s["last"]?.doubleValue ?? .nan), "\(s)")
      }
    }
  }
}
