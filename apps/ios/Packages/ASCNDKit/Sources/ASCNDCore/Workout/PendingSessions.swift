public import Foundation

/// Đọc lại những hàng outbox chưa tới server (`ASCNDStore.OutboxStore`).
public protocol PendingWrites: Sendable {
  /// Các hàng còn chờ gửi của `userId`, theo thứ tự hàng đợi.
  func pending(userId: String) async throws -> [OutboxEntry]
}

/// Một thay đổi buổi tập mà server có thể chưa thấy: buổi vừa chốt / ghi lại
/// (cả hàng) hay vừa xoá (#400, #429).
public enum SessionChange: Sendable, Hashable {
  case upsert(JSONValue)
  case delete(id: String, at: EpochMillis?)

  /// Hàng outbox buổi tập của `userId` → thay đổi; kind khác → `nil`.
  public init?(_ entry: OutboxEntry, userId: String) {
    guard entry.userId == userId else { return nil }
    switch entry.kind {
    case WorkoutSessionRecord.outboxKind, WorkoutSessionRecord.revisionKind:
      guard entry.payload["id"]?.stringValue != nil else { return nil }
      self = .upsert(entry.payload)
    case WorkoutSessionRecord.deleteKind:
      guard let id = entry.payload["id"]?.stringValue else { return nil }
      self = .delete(id: id, at: entry.payload["date_time"]?.stringValue.flatMap { EpochMillis(iso8601: $0) })
    default:
      return nil
    }
  }

  var id: String {
    switch self {
    case .upsert(let row): (row["id"]?.stringValue ?? "").lowercased()
    case .delete(let id, _): id.lowercased()
    }
  }
}

/// Buổi tập = bản server ⊕ thay đổi chưa tới server, áp theo thứ tự hàng đợi
/// — đúng việc server sẽ làm khi nhận, nên áp lại một thay đổi server đã nhận
/// không đổi gì (tạo / ghi lại thay hàng cùng `id`; xoá hàng đã mất là không gì).
///
/// Không có lớp phủ này, lần làm mới đầu tiên sau khi mở lại app (trước khi
/// vòng sync kịp gửi) lấy bản server làm sự thật: buổi vừa XOÁ sống lại trong
/// lịch sử, "lần trước", phân tích, kỷ lục và ngày "đã tập"; buổi vừa CHỐT mà
/// chưa gửi thì biến khỏi lịch sử.
public enum PendingSessions {
  public static func changes(_ entries: [OutboxEntry], userId: String) -> [SessionChange] {
    entries.compactMap { SessionChange($0, userId: userId) }
  }

  /// Hàng server (`id`, `date_time`, `sets`…) sau khi áp `changes`.
  public static func apply(_ changes: [SessionChange], to rows: [JSONValue]) -> [JSONValue] {
    var out = rows
    for c in changes {
      out.removeAll { ($0["id"]?.stringValue ?? "").lowercased() == c.id }
      if case .upsert(let row) = c { out.append(row) }
    }
    return out
  }

  public static func apply(_ changes: [SessionChange], to rows: [SessionHistoryRow]) -> [SessionHistoryRow] {
    var out = rows
    for c in changes {
      out.removeAll { $0.id.lowercased() == c.id }
      if case .upsert(let row) = c, let id = row["id"]?.stringValue,
        let at = row["date_time"]?.stringValue.flatMap({ EpochMillis(iso8601: $0) })
      {
        out.append(SessionHistoryRow(id: id, at: at, sets: row["sets"]))
      }
    }
    return out
  }
}

/// Thay đổi đã áp tại chỗ (`absorb` / `forget`) kể từ một mốc — để lần làm
/// mới đang bay không xoá mất chúng: hàng chờ được đọc TRƯỚC truy vấn, thay
/// đổi tới SAU mốc ấy được áp lại lên bản server (cùng mẫu `mergeEdits` của
/// kế hoạch, #401).
struct SessionChangeLog {
  private(set) var mark = 0
  private var live: [(seq: Int, change: SessionChange)] = []

  mutating func record(_ change: SessionChange) {
    mark += 1
    live.append((mark, change))
  }

  /// Bản server vừa về: thay đổi trước `since` đã nằm trong hàng chờ hoặc
  /// trong bản server; chỉ giữ (và trả về) những thay đổi tới sau.
  mutating func settle(since: Int) -> [SessionChange] {
    live.removeAll { $0.seq <= since }
    return live.map(\.change)
  }
}

extension Optional where Wrapped == any PendingWrites {
  /// Thay đổi buổi tập còn trong outbox; `[]` khi không có outbox, `nil` khi
  /// đọc hỏng (đĩa) — người gọi giữ thứ đang có.
  func changes(userId: String) async -> [SessionChange]? {
    guard let store = self else { return [] }
    guard let all = try? await store.pending(userId: userId) else { return nil }
    return PendingSessions.changes(all, userId: userId)
  }
}
