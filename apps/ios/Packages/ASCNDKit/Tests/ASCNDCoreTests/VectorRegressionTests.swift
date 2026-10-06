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
  @Test func everyVectorFileLoads() throws {
    for url in Self.vectorFiles() {
      let cases = try GoldenVectors.load(url, as: GoldenVector<JSONValue, JSONValue>.self)
      #expect(!cases.isEmpty, "\(url.lastPathComponent) rỗng")
    }
  }
}
