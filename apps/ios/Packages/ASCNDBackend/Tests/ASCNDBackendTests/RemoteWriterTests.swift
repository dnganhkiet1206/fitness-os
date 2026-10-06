@testable import ASCNDBackend
import ASCNDCore
import Foundation
import Supabase
import Testing

/// Bảng dịch lỗi → `WriteFailure`. Gửi lại hay thôi là việc của `RetryPolicy`;
/// ở đây chỉ kiểm lỗi được gọi ĐÚNG TÊN.
struct RemoteWriterClassifyTests {
  @Test(arguments: [URLError.Code.notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotFindHost, .cancelled])
  func unreachableIsOffline(code: URLError.Code) {
    #expect(SupabaseRemoteWriter.classify(URLError(code)) == .offline)
  }

  /// Tới được server nhưng phản hồi hỏng (vd. 5xx của gateway, URL sai) — lỗi
  /// tạm, KHÔNG phải offline: tính vào ngân sách.
  @Test func reachableButBrokenIsTransientServer() {
    #expect(SupabaseRemoteWriter.classify(URLError(.badServerResponse)) == .server(code: nil))
  }

  @Test func postgrestCodeIsCarried() {
    let e = PostgrestError(code: "23514", message: "violates check constraint")
    #expect(SupabaseRemoteWriter.classify(e) == .server(code: "23514"))
    #expect(RetryPolicy.isPermanent(SupabaseRemoteWriter.classify(e)))
  }

  /// Lệch baseline có chủ đích: JWT hết hạn là TẠM (token tự làm mới), không
  /// phải vĩnh viễn như mọi `PGRST…` khác — không thì buổi tập vào `dead`.
  @Test func expiredJwtIsTransient() {
    let e = PostgrestError(code: "PGRST301", message: "JWT expired")
    #expect(SupabaseRemoteWriter.classify(e) == .server(code: nil))
    #expect(!RetryPolicy.isPermanent(SupabaseRemoteWriter.classify(e)))
    // Các PGRST khác (lệch schema) vẫn vĩnh viễn như baseline.
    let drift = PostgrestError(code: "PGRST204", message: "column not found")
    #expect(RetryPolicy.isPermanent(SupabaseRemoteWriter.classify(drift)))
  }

  @Test func postgrestWithoutCodeIsTransient() {
    #expect(SupabaseRemoteWriter.classify(PostgrestError(message: "?")) == .server(code: nil))
  }

  @Test func cancellationIsOffline() {
    #expect(SupabaseRemoteWriter.classify(CancellationError()) == .offline)
  }

  @Test func nsURLErrorDomainIsUnderstood() {
    let e = NSError(domain: NSURLErrorDomain, code: URLError.Code.notConnectedToInternet.rawValue)
    #expect(SupabaseRemoteWriter.classify(e) == .offline)
  }

  @Test func unknownErrorIsTransient() {
    struct Weird: Error {}
    #expect(SupabaseRemoteWriter.classify(Weird()) == .server(code: nil))
  }

  /// Upsert theo `id` chỉ idempotent khi id hàng = id bản ghi.
  @Test func payloadMustBeTheRowWithTheSameId() {
    func e(_ payload: JSONValue) -> OutboxEntry {
      OutboxEntry(id: "s1", userId: "u", kind: "workout", payload: payload, createdAt: EpochMillis(0))
    }
    #expect(SupabaseRemoteWriter.isRow(e(.object(["id": .string("s1")]))))
    #expect(!SupabaseRemoteWriter.isRow(e(.object(["id": .string("other")]))))
    #expect(!SupabaseRemoteWriter.isRow(e(.object([:]))))
    #expect(!SupabaseRemoteWriter.isRow(e(.null)))
  }

  @Test func workoutGoesToWorkoutSessions() {
    #expect(SupabaseRemoteWriter.tables["workout"] == "workout_sessions")
    #expect(SupabaseRemoteWriter.tables["telepathy"] == nil)
  }
}
