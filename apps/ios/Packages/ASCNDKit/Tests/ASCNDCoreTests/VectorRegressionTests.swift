import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Harness hồi quy native (D-7, #282): mọi tệp golden vector trong
/// `spec/vectors` đều phải có một runner Swift đã đăng ký ở đây.
///
/// Thêm tệp vector mới mà quên runner Swift → test này đỏ. Đây là chốt chặn
/// để "mọi golden vector có runner Swift" luôn đúng, không phải lời hứa.
struct VectorRegressionTests {
  /// Tệp vector → nơi chạy nó. Giữ đồng bộ với các test struct bên dưới.
  static let runners: [(file: String, runner: String)] = [
    ("rest-timer.json", "WorkoutVectorTests.goldenVectors"),
    ("workout-state.json", "WorkoutVectorTests.goldenVectors"),
    ("sync.json", "SyncVectorTests"),
    ("workout-session.json", "WorkoutSessionVectorTests"),
  ]

  /// Tệp vector trong `spec/vectors` — trừ `runners.json`, bảng runner JS
  /// (#359), không phải một tệp vector.
  static func vectorFiles() -> [URL] {
    GoldenVectors.allFiles().filter { $0.lastPathComponent != "runners.json" }
  }

  @Test func everyVectorFileHasASwiftRunner() throws {
    let files = Self.vectorFiles().map { $0.lastPathComponent }.sorted()
    #expect(!files.isEmpty, "spec/vectors rỗng — harness không có gì để giữ")
    for f in files {
      #expect(
        Self.runners.contains { $0.file == f },
        "spec/vectors/\(f) chưa có runner Swift — viết runner rồi đăng ký ở VectorRegressionTests.runners")
    }
    for r in Self.runners {
      #expect(files.contains(r.file), "runner đăng ký cho tệp không tồn tại: \(r.file)")
    }
  }

  /// Mọi tệp vector phải đọc được (định dạng hợp đồng #230) — hỏng ở đây thì
  /// các runner cũng không chạy nổi, báo sớm cho rõ.
  /// Hai dạng tệp hợp lệ, như `vectorFileProblems` ở GoldenVectorTests: mảng
  /// vector (`rule`), hoặc object `golden-vectors/v1` với mảng `vectors` (`id`).
  @Test func everyVectorFileLoads() throws {
    for url in Self.vectorFiles() {
      let name = url.lastPathComponent
      let json = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
      switch json {
      case .array:
        let cases = try GoldenVectors.load(url, as: GoldenVector<JSONValue, JSONValue>.self)
        #expect(!cases.isEmpty, "\(name) rỗng")
      case .object(let o) where o["$schema"]?.stringValue == "golden-vectors/v1":
        guard case .array(let cases)? = o["vectors"] else {
          Issue.record("\(name): golden-vectors/v1 thiếu mảng vectors")
          continue
        }
        #expect(!cases.isEmpty, "\(name) rỗng")
        for c in cases {
          #expect(c["input"] != nil && c["expected"] != nil, "\(name): ca thiếu input / expected")
        }
      default:
        Issue.record("\(name): không phải mảng vector, cũng không phải golden-vectors/v1")
      }
    }
  }
}
