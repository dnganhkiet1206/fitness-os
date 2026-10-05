import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

private struct SumInput: Decodable, Sendable {
  let a: Int
  let b: Int
}

struct GoldenVectorTests {
  private func fixture(_ name: String) throws -> URL {
    try #require(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
  }

  @Test func loadsTypedVectorsAndIgnoresExtraFields() throws {
    let cases = try GoldenVectors.load(try fixture("sample-vectors"), as: GoldenVector<SumInput, Int>.self)
    #expect(cases.count == 2)
    for c in cases {
      #expect(c.input.a + c.input.b == c.expected, "\(c.rule)")
    }
  }

  /// Lỗi phải chỉ ra đúng tệp và đúng ca, không chỉ "data corrupted".
  @Test func decodeErrorNamesFileAndCase() throws {
    let url = try fixture("broken-vectors")
    do {
      _ = try GoldenVectors.load(url, as: GoldenVector<SumInput, Int>.self)
      Issue.record("tệp hỏng mà vẫn đọc được")
    } catch let e as VectorFileError {
      #expect(e.file == "broken-vectors.json")
      #expect(e.path.hasPrefix("[1]"), "đường dẫn lỗi: \(e.path)")
    }
  }

  /// Hợp đồng định dạng cho mọi tệp D đặt vào spec/vectors (#230) — xem
  /// `vectorFileProblems`.
  @Test func everySpecVectorFileIsWellFormed() throws {
    for url in GoldenVectors.allFiles() {
      for problem in try vectorFileProblems(url) { Issue.record("\(problem)") }
    }
  }

  /// Bộ kiểm nhận cả hai dạng và bảng runner; bắt trùng khoá, thiếu
  /// `expected`, khoá rỗng, mảng rỗng, dạng lạ.
  @Test func wellFormednessAcceptsBothShapesAndRejectsJunk() throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("vec-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: dir) }
    func file(_ name: String, _ body: String) throws -> URL {
      let url = dir.appendingPathComponent(name)
      try Data(body.utf8).write(to: url)
      return url
    }
    let good = [
      try file("v0.json", #"[{"rule":"R-1","input":{},"expected":1}]"#),
      try file("v1.json", #"{"$schema":"golden-vectors/v1","domain":"x","source":{},"vectors":[{"id":"X-1","name":"a","input":{},"expected":{}}]}"#),
      try file("runners.json", #"{"v1.json":"run-v1.mjs"}"#),
    ]
    for url in good { #expect(try vectorFileProblems(url).isEmpty, "\(url.lastPathComponent)") }
    let bad = [
      try file("dup.json", #"[{"rule":"R","input":1,"expected":1},{"rule":"R","input":1,"expected":1}]"#),
      try file("noexp.json", #"{"$schema":"golden-vectors/v1","vectors":[{"id":"X","input":{}}]}"#),
      try file("blank.json", #"[{"rule":" ","input":1,"expected":1}]"#),
      try file("empty.json", "[]"),
      try file("shape.json", #"{"vectors":[{"id":"X","input":{},"expected":{}}]}"#),
    ]
    for url in bad { #expect(try !vectorFileProblems(url).isEmpty, "\(url.lastPathComponent) phải bị bắt") }
    let badRunners = try file("runners.json", #"["v1.json"]"#)
    #expect(try !vectorFileProblems(badRunners).isEmpty)
  }

  @Test func repoRootIsFound() {
    let marker = RepoPaths.root.appendingPathComponent("supabase/migrations").path
    #expect(FileManager.default.fileExists(atPath: marker), "RepoPaths.root = \(RepoPaths.root.path)")
  }

  @Test func fixedClockParsesOffset() {
    let clock = FixedWallClock(iso8601: "2026-10-05T14:00:00+07:00")
    #expect(clock.now().timeIntervalSince1970 == 1_791_183_600)
  }
}

/// Lỗi định dạng của một tệp trong spec/vectors (#230, #478). Hai dạng cùng
/// tồn tại trong repo:
/// - mảng `{rule, input, expected}` — `rule` không rỗng, không trùng;
/// - `"$schema": "golden-vectors/v1"` — object `{domain, source, vectors}`, mỗi
///   ca `{id, name, input, expected}` — `id` không rỗng, không trùng.
/// Trùng khoá thì báo lỗi của runner chỉ không ra ca nào hỏng. `runners.json`
/// không phải vector mà là bảng `tệp vectors → runner` của D (tệp có thật hay
/// không là việc của `check-runners.mjs`) — ở đây chỉ kiểm dạng.
private func vectorFileProblems(_ url: URL) throws -> [String] {
  let name = url.lastPathComponent
  let json = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  if name == "runners.json" {
    guard case .object(let map) = json, !map.isEmpty else { return ["runners.json phải là object tệp → runner"] }
    return map.compactMap { file, runner in
      file.hasSuffix(".json") && runner.stringValue?.isEmpty == false ? nil : "runners.json: \(file)"
    }
  }
  let cases: [JSONValue]
  let key: String
  switch json {
  case .array(let a):
    (cases, key) = (a, "rule")
  case .object(let o) where o["$schema"]?.stringValue == "golden-vectors/v1":
    guard case .array(let a)? = o["vectors"] else { return ["\(name): golden-vectors/v1 thiếu mảng vectors"] }
    (cases, key) = (a, "id")
  default:
    return ["\(name): không phải mảng vector, cũng không phải golden-vectors/v1"]
  }
  guard !cases.isEmpty else { return ["\(name) rỗng"] }
  var problems: [String] = []
  var seen = Set<String>()
  for c in cases {
    let id = (c[key]?.stringValue ?? "").trimmingCharacters(in: .whitespaces)
    if id.isEmpty { problems.append("\(name): \(key) rỗng") }
    if !seen.insert(id).inserted { problems.append("\(name): trùng \(key) '\(id)'") }
    if c["input"] == nil || c["expected"] == nil { problems.append("\(name): ca '\(id)' thiếu input / expected") }
  }
  return problems
}
