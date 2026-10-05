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

  /// Hợp đồng định dạng cho mọi tệp D đặt vào spec/vectors (#230): mảng không
  /// rỗng, mỗi ca có `rule` không rỗng, và không có hai ca trùng `rule` — trùng
  /// tên thì báo lỗi của runner chỉ không ra ca nào hỏng.
  @Test func everySpecVectorFileIsWellFormed() throws {
    for url in GoldenVectors.allFiles() {
      let cases = try GoldenVectors.load(url, as: GoldenVector<JSONValue, JSONValue>.self)
      #expect(!cases.isEmpty, "\(url.lastPathComponent) rỗng")
      var seen = Set<String>()
      for c in cases {
        #expect(!c.rule.trimmingCharacters(in: .whitespaces).isEmpty, "\(url.lastPathComponent): rule rỗng")
        #expect(seen.insert(c.rule).inserted, "\(url.lastPathComponent): trùng rule '\(c.rule)'")
      }
    }
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
