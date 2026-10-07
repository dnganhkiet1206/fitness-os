public import ASCNDCore
public import Foundation
import Synchronization

/// Đồng hồ chạy bằng tay: `advance` là cách duy nhất thời gian trôi. Dùng làm
/// `sleep` của `SyncWorker` — ngủ 4 giây là đồng hồ nhảy 4 giây, ngay lập tức.
public final class ManualClock: WallClock {
  private let millis: Mutex<Int64>
  public init(_ start: EpochMillis = EpochMillis(0)) { millis = Mutex(start.millis) }
  public func now() -> Date { EpochMillis(millis.withLock { $0 }).date }
  public func advance(_ ms: Int64) { millis.withLock { $0 += ms } }
  /// Tổng thời gian đã ngủ qua `sleeper`.
  public var slept: [Int64] { sleeps.withLock { $0 } }
  private let sleeps = Mutex<[Int64]>([])
  public var sleeper: @Sendable (Int64) async -> Void {
    { [self] ms in
      sleeps.withLock { $0.append(ms) }
      advance(ms)
    }
  }
}

/// Server giả: nhận theo id như upsert `ignoreDuplicates` của baseline — gửi
/// lại cùng id không thành hàng thứ hai. Mỗi lần gửi lấy một kết quả từ kịch
/// bản; hết kịch bản thì thành công.
public actor FakeServer: RemoteWriter {
  public enum Reply: Sendable {
    case ok
    case fail(WriteFailure)
    /// Server ĐÃ ghi, nhưng phản hồi mất trên đường về (timeout).
    case lostResponse
  }

  public private(set) var rows: [String: OutboxEntry] = [:]
  /// Bảng `workout_sessions` như server thấy, theo `payload.id`: bản ghi mới
  /// là upsert bỏ trùng (`ignoreDuplicates`), bản ghi lại (#296) có `base` thì
  /// gộp lên hàng hiện có, không có (bản cũ) thì ghi đè cả hàng — đúng như
  /// `SupabaseRemoteWriter`.
  public private(set) var table: [String: JSONValue] = [:]
  /// Mọi lần gửi, theo thứ tự — kể cả gửi lại.
  public private(set) var attempts: [String] = []
  private var script: [String: [Reply]] = [:]

  public init() {}

  public func script(_ id: String, _ replies: Reply...) { script[id, default: []] += replies }

  public func send(_ entry: OutboxEntry) async throws(WriteFailure) {
    attempts.append(entry.id)
    let reply = script[entry.id]?.isEmpty == false ? script[entry.id]!.removeFirst() : .ok
    switch reply {
    case .ok:
      apply(entry)
    case .fail(let f):
      throw f
    case .lostResponse:
      apply(entry)
      throw .offline
    }
  }

  /// Một máy KHÁC ghi thẳng vào bảng (`nil` = xoá hàng) — dựng cảnh nhiều máy.
  public func externalWrite(_ rowId: String, _ row: JSONValue?) { table[rowId] = row }

  private func apply(_ entry: OutboxEntry) {
    if rows[entry.id] == nil { rows[entry.id] = entry }
    guard let rowId = entry.payload["id"]?.stringValue else { return }
    let revises = entry.kind == WorkoutSessionRecord.revisionKind || entry.kind == WorkoutSessionRecord.deleteKind
    if revises, let base = entry.base {
      // Như `SupabaseRemoteWriter.sendMerged`: đọc hàng lúc gửi rồi gộp.
      let local = entry.kind == WorkoutSessionRecord.revisionKind ? entry.payload : nil
      switch SessionRevisionMerge.merge(server: table[rowId], base: base, local: local) {
      case .skip: break
      case .delete: table[rowId] = nil
      case .update(let fields):
        if case .object(var row)? = table[rowId], case .object(let f) = fields {
          for (k, v) in f { row[k] = v }
          table[rowId] = .object(row)
        }
      case .upsert(let row): table[rowId] = row
      }
    } else if entry.kind == WorkoutSessionRecord.deleteKind {
      table[rowId] = nil
    } else if entry.kind == WorkoutSessionRecord.revisionKind || table[rowId] == nil {
      table[rowId] = entry.payload
    }
  }
}

/// `OutboxPersistence` trong bộ nhớ với đúng ngữ nghĩa của `OutboxStore`:
/// `append` song song với worker, `persist` chỉ xoá hàng `settled` / `dead`.
public actor InMemoryOutboxStore: OutboxPersistence {
  public private(set) var pending: [OutboxEntry] = []
  public private(set) var dead: [DeadEntry] = []
  private var failures = 0
  private var holding = false
  private var parkedLoads: [CheckedContinuation<Void, Never>] = []

  public init(_ entries: [OutboxEntry] = []) { pending = entries }

  public func failNext(_ n: Int = 1) { failures = n }
  /// Giữ `load` lại SAU khi đã chụp đĩa — dựng đúng cảnh worker đọc xong rồi
  /// mới có hàng mới.
  public func holdLoads() { holding = true }
  public func release() {
    holding = false
    let parked = parkedLoads
    parkedLoads = []
    for c in parked { c.resume() }
  }
  public var parked: Int { parkedLoads.count }

  /// Màn tập chốt buổi: chèn, bỏ trùng theo id.
  public func append(_ e: OutboxEntry) {
    guard !pending.contains(where: { $0.id == e.id }) else { return }
    pending.append(e)
  }

  public func load() async throws -> Outbox {
    let snapshot = Outbox(pending: pending, dead: dead)
    if holding { await withCheckedContinuation { parkedLoads.append($0) } }
    return snapshot
  }

  public func persist(_ outbox: Outbox, settled: Set<String>) async throws {
    if failures > 0 {
      failures -= 1
      throw InMemoryWorkoutStore.Failure()
    }
    let finished = settled.union(outbox.dead.map(\.entry.id)).subtracting(outbox.pending.map(\.id))
    pending.removeAll { finished.contains($0.id) }
    for e in outbox.pending {
      if let i = pending.firstIndex(where: { $0.id == e.id }) { pending[i] = e } else { pending.append(e) }
    }
    if outbox.dead.count > dead.count { dead += outbox.dead.dropFirst(dead.count) }
  }

  public func dropAllOnSignOut() async throws -> Int {
    defer {
      pending = []
      dead = []
    }
    return pending.count
  }
}
