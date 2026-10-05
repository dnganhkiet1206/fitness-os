public import ASCNDCore
import Foundation
import Supabase

/// `RemoteWriter` thật: gửi MỘT bản ghi outbox lên Supabase.
///
/// Theo `applyOfflineWrite` của baseline (`offline-write.ts` @ fac9ac2):
/// - kiểm phiên TRƯỚC khi gửi: bản ghi của tài khoản khác không bao giờ đi
///   (`WrongAccountError`). RLS cũng sẽ chặn, nhưng ném sớm ở đây rõ hơn và
///   không tốn một chuyến mạng;
/// - upsert theo `id`, `ignoreDuplicates` (`IDEMPOTENT`): phát lại cùng bản ghi
///   — mất phản hồi, app chết giữa lượt — không thành hàng thứ hai. Đây là hợp
///   đồng mà `SyncWorker` dựa vào để giao "ít nhất một lần";
/// - lỗi được dịch về `WriteFailure` (`classify`) — MỘT hệ lỗi; quyết định gửi
///   lại hay thôi vẫn là của `RetryPolicy`, không phải của adapter.
public struct SupabaseRemoteWriter: RemoteWriter {
  /// `kind` của outbox → bảng. Chỉ những gì app native đã sinh ra; `kind` lạ
  /// là bản ghi bản build này không phát lại được (`UnusableWriteError`).
  static let tables: [String: String] = [
    WorkoutSessionRecord.outboxKind: "workout_sessions",
  ]

  private let client: SupabaseClient
  private let afterWrite: @Sendable (OutboxEntry) async -> Void

  /// - Parameter afterWrite: chạy sau khi server ĐÃ nhận — chỗ cho việc dựng
  ///   lại ngày (`rebuildAfterReplay`). Không ném: ghi đã thành rồi, để lỗi
  ///   dựng lại làm hỏng lượt gửi thì lượt sau phát lại và nhân đôi bản ghi —
  ///   tệ hơn một ngày tạm lệch (baseline giải thích ở `rebuildAfterReplay`).
  public init(backend: Backend, afterWrite: @escaping @Sendable (OutboxEntry) async -> Void = { _ in }) {
    self.client = backend.client
    self.afterWrite = afterWrite
  }

  public func send(_ entry: OutboxEntry) async throws(WriteFailure) {
    let signedIn = client.auth.currentSession?.user.id.uuidString.lowercased()
    guard signedIn == entry.userId.lowercased() else { throw .wrongAccount }
    guard let table = Self.tables[entry.kind], Self.isRow(entry) else { throw .unusable }
    do {
      try await client.from(table)
        .upsert(entry.payload, onConflict: "id", ignoreDuplicates: true)
        .execute()
    } catch {
      throw Self.classify(error)
    }
    await afterWrite(entry)
  }

  /// Payload phải là một hàng có `id` trùng id bản ghi — không thì upsert theo
  /// `id` không còn idempotent, và phát lại thành hàng mới.
  static func isRow(_ entry: OutboxEntry) -> Bool {
    entry.payload["id"]?.stringValue == entry.id
  }

  /// Dịch lỗi của supabase-swift / URLSession về `WriteFailure`.
  ///
  /// - Không tới được server (mất mạng, timeout, DNS, TLS, bị huỷ) → `offline`:
  ///   không tính vào ngân sách thử lại (ADR-0003).
  /// - PostgREST trả mã → `server(code:)`; `RetryPolicy` quyết mã nào vĩnh viễn.
  /// - JWT hết hạn / không hợp lệ (`PGRST301`, `PGRST302`) → `server(code: nil)`,
  ///   tức lỗi TẠM. Đây là chỗ native lệch baseline có chủ đích: baseline coi
  ///   mọi `PGRST…` là vĩnh viễn, nên một token hết hạn đúng lúc phát lại là
  ///   buổi tập vào thẳng `dead`. supabase-swift tự làm mới token; lần thử sau
  ///   có token mới. Token hỏng thật thì hết ngân sách → `exhausted`, vẫn có
  ///   điểm dừng.
  /// - Còn lại (5xx không có thân lỗi, lỗi lạ) → `server(code: nil)`: thời tiết.
  static func classify(_ error: any Error) -> WriteFailure {
    if let e = error as? WriteFailure { return e }
    if error is CancellationError { return .offline }
    if let e = error as? URLError { return offlineCodes.contains(e.code) ? .offline : .server(code: nil) }
    if let e = error as? PostgrestError {
      guard let code = e.code else { return .server(code: nil) }
      return authCodes.contains(code) ? .server(code: nil) : .server(code: code)
    }
    let ns = error as NSError
    if ns.domain == NSURLErrorDomain, offlineCodes.contains(where: { $0.rawValue == ns.code }) { return .offline }
    return .server(code: nil)
  }

  static let authCodes: Set<String> = ["PGRST301", "PGRST302"]

  static let offlineCodes: Set<URLError.Code> = [
    .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotFindHost, .cannotConnectToHost,
    .dnsLookupFailed, .internationalRoamingOff, .dataNotAllowed, .callIsActive, .cancelled,
    .secureConnectionFailed, .cannotLoadFromNetwork, .backgroundSessionWasDisconnected,
  ]
}
