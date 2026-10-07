import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Harness hồi quy native (D-7, #282): mọi tệp golden vector trong
/// `spec/vectors` đều phải có một runner Swift đã đăng ký ở đây — hoặc nằm
/// trong `rnOnly` với lý do được chính test này kiểm.
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
    ("personal-record.json", "PersonalRecordVectorTests"),
    ("workout-history.json", "WorkoutHistoryVectorTests (WH-3a: notPorted, #266)"),
    ("remove-set-undo.json", "RemoveSetVectorTests (RS-1: native gỡ đúng hàng, không phải set cuối cùng tên)"),
  ]

  /// Tệp vector CHỈ chạy ở RN, kèm lý do. Đây không phải chỗ để giấu một
  /// runner còn thiếu: mỗi mục phải nói native khác ở đâu hoặc chờ việc gì, và
  /// `rnOnlyListStaysHonest` đỏ khi mục ấy thôi đúng.
  static let rnOnly: [(file: String, reason: String)] = [
    ("append.json",
     "mô tả cờ trạng thái của day-plan.tsx (appending/canFinish/pendingReady); native cố ý khác — "
       + "nối thêm cả khi offline qua outbox, canAppend tách khỏi canFinish — và MỖI ca ghi `nativeDiffers`. "
       + "Hành vi native có test riêng: AppendToSessionTests"),
    // Các mục dưới: CHƯA có runner Swift đọc JSON — là khoảng hở thật, ghi ở
    // PARITY_MATRIX (#523). Hành vi đang được giữ bằng test viết tay nêu tên.
    ("template-write.json",
     "payload ghi template/routine_days của use-library.ts; đường ghi native đã có (A22 #435, `PlanEditor`) "
       + "nhưng chưa có runner Swift đọc JSON — hành vi giữ bằng PlanEditTests"),
    ("adhoc-exercise.json",
     "bài thêm ngoài kế hoạch (#413); chưa có runner Swift đọc JSON — hành vi giữ bằng "
       + "AdHocExerciseTests / AdHocPlanTests"),
    ("today-controller.json",
     "TC-1 `todayCta` (extra/log-free/none) CHƯA port; TC-3 khoá ngày giữ bằng WorkoutDayTests "
       + "(DayProgressStore.key), TC-2/TC-4 bằng TodayControllerTests; chưa có runner Swift"),
  ]

  /// Tệp vector trong `spec/vectors` — trừ `runners.json`, bảng runner JS
  /// (#359), không phải một tệp vector.
  static func vectorFiles() -> [URL] {
    GoldenVectors.allFiles().filter { $0.lastPathComponent != "runners.json" }
  }

  @Test func everyVectorFileHasASwiftRunner() throws {
    let files = Self.vectorFiles().map { $0.lastPathComponent }.sorted()
    #expect(!files.isEmpty, "spec/vectors rỗng — harness không có gì để giữ")
    for f in files where !Self.rnOnly.contains(where: { $0.file == f }) {
      #expect(
        Self.runners.contains { $0.file == f },
        "spec/vectors/\(f) chưa có runner Swift — viết runner rồi đăng ký ở VectorRegressionTests.runners")
    }
    for r in Self.runners {
      #expect(files.contains(r.file), "runner đăng ký cho tệp không tồn tại: \(r.file)")
    }
  }

  /// Danh sách chỉ-RN phải còn đúng: tệp tồn tại, không đồng thời có runner
  /// Swift, và với `append.json` thì mọi ca vẫn ghi `nativeDiffers` (lý do của
  /// mục ấy).
  @Test func rnOnlyListStaysHonest() throws {
    let files = Set(Self.vectorFiles().map { $0.lastPathComponent })
    for e in Self.rnOnly {
      #expect(files.contains(e.file), "rnOnly ghi \(e.file) nhưng tệp không còn — bỏ dòng ấy")
      #expect(!Self.runners.contains { $0.file == e.file }, "\(e.file) đã có runner Swift — bỏ khỏi rnOnly")
      #expect(!e.reason.isEmpty)
    }
    let append = try JSONDecoder().decode(
      JSONValue.self, from: Data(contentsOf: RepoPaths.specVectors.appendingPathComponent("append.json")))
    guard case .array(let cases) = append else {
      Issue.record("append.json không còn là mảng vector")
      return
    }
    for c in cases {
      // Tính trước rồi mới #expect: swift-testing 6.1 trên Linux bóc sai
      // `!(x ?? "").isEmpty` (ghi `.isEmpty → ()`) và báo đỏ cả khi chuỗi có chữ.
      let note = c["nativeDiffers"]?.stringValue ?? ""
      let documented = !note.isEmpty
      #expect(documented,
              "append.json \(c["rule"]?.stringValue ?? "?"): thiếu nativeDiffers — lý do chỉ-RN không còn đúng")
    }
  }

  /// Mọi tệp vector phải đọc được (định dạng hợp đồng #230) — hỏng ở đây thì
  /// các runner cũng không chạy nổi, báo sớm cho rõ.
  ///
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
