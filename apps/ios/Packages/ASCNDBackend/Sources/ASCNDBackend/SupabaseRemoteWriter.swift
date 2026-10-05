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
    WorkoutSessionRecord.revisionKind: "workout_sessions",
    WorkoutSessionRecord.deleteKind: "workout_sessions",
    PlanEdit.templateKind: "workout_templates",
    PlanEdit.templateDeleteKind: "workout_templates",
    PlanEdit.routineDayKind: "routine_days",
    ExerciseEdit.createKind: "exercises",
    ExerciseEdit.deleteKind: "exercises",
  ]

  /// Bản ghi lại (#296) GHI ĐÈ hàng có sẵn; bản ghi mới thì bỏ trùng
  /// (`IDEMPOTENT`). Cả hai đều idempotent: phát lại cùng nội dung ra cùng hàng.
  static func overwrites(_ kind: String) -> Bool { kind == WorkoutSessionRecord.revisionKind }

  /// Bản ghi nói về một hàng ĐÃ có (ghi lại / xoá): id hàng outbox là
  /// `"<buổi>@…"`, không phải chính id buổi.
  static func revises(_ kind: String) -> Bool {
    overwrites(kind) || deletes(kind)
  }

  /// Xoá theo `id` + `user_id` (`use-library.ts:335`, `use-fitness-data.ts:746`).
  static func deletes(_ kind: String) -> Bool {
    kind == WorkoutSessionRecord.deleteKind || kind == PlanEdit.templateDeleteKind || kind == ExerciseEdit.deleteKind
  }

  /// Hàng mang `user_id` phải là của chủ bản ghi — không thì một bản ghi hỏng
  /// chèn bài / template vào tài khoản khác (RLS cũng chặn, đây chặn sớm).
  static let ownedRows: Set<String> = [PlanEdit.templateKind, ExerciseEdit.createKind]

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
      if Self.deletes(entry.kind) {
        // Gỡ set cuối cùng (#398) / xoá buổi (#400) / xoá template (#401) /
        // xoá bài (#421): xoá
        // hàng — idempotent, xoá hàng đã mất không phải lỗi. Lọc cả `user_id`
        // như baseline, RLS cũng chặn.
        try await client.from(table)
          .delete()
          .eq("id", value: entry.payload["id"]?.stringValue ?? "")
          .eq("user_id", value: entry.userId)
          .execute()
      } else if entry.kind == PlanEdit.routineDayKind {
        // Gán ngày (#401): `upsert … onConflict: 'user_id,day_of_week'` như
        // baseline (`use-library.ts:461`) — một hàng mỗi ngày, gửi lại là ghi
        // đè cùng nội dung.
        try await client.from(table)
          .upsert(entry.payload, onConflict: "user_id,day_of_week")
          .execute()
      } else {
        try await client.from(table)
          .upsert(entry.payload, onConflict: "id", ignoreDuplicates: !Self.overwrites(entry.kind))
          .execute()
      }
    } catch {
      throw Self.classify(error)
    }
    await afterWrite(entry)
  }

  /// Payload phải là một hàng có `id` khớp bản ghi — không thì upsert theo
  /// `id` không còn idempotent, và phát lại thành hàng mới. Bản ghi lại mang
  /// id `"<buổi>@<số hàng>"`, hàng của nó là `<buổi>`.
  static func isRow(_ entry: OutboxEntry) -> Bool {
    if entry.kind == PlanEdit.routineDayKind {
      // Không có `id`: hàng xác định bởi (người, ngày). Người phải là chủ bản
      // ghi — không thì upsert ghi vào kế hoạch của ai khác (RLS cũng chặn).
      guard let day = entry.payload["day_of_week"]?.intValue, PlanEdit.days.contains(day),
        entry.payload["user_id"]?.stringValue?.lowercased() == entry.userId.lowercased()
      else { return false }
      return true
    }
    guard let rowId = entry.payload["id"]?.stringValue, !rowId.isEmpty else { return false }
    if ownedRows.contains(entry.kind),
      entry.payload["user_id"]?.stringValue?.lowercased() != entry.userId.lowercased()
    {
      return false
    }
    return revises(entry.kind) ? entry.id.hasPrefix(rowId + "@") : rowId == entry.id
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
    // Danh sách mã "không tới được server" dùng chung với các màn đọc (Core).
    if NetworkFailure.isOffline(error) { return .offline }
    if let e = error as? PostgrestError {
      guard let code = e.code else { return .server(code: nil) }
      return authCodes.contains(code) ? .server(code: nil) : .server(code: code)
    }
    return .server(code: nil)
  }

  static let authCodes: Set<String> = ["PGRST301", "PGRST302"]
}
