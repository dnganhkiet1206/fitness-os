public import ASCNDCore

/// `WorkoutStore` trong bộ nhớ, giữ đúng hợp đồng của bản GRDB: mỗi hàm trả về
/// là đã "bền", `commitFinish` là một giao dịch và idempotent theo id.
///
/// Thêm hai cái núm cho test: làm hỏng N lần ghi kế tiếp (`failNext`), và giữ
/// các lần ghi lại giữa chừng (`hold` / `release`) để dựng đúng thứ tự xen kẽ
/// mà người dùng bấm nhanh tạo ra. "Kill app" = vứt controller, giữ store.
public actor InMemoryWorkoutStore: WorkoutStore {
  public struct Failure: Error, Sendable {}

  public private(set) var days: [String: DayState]
  public private(set) var outbox: [OutboxEntry] = []
  /// Hàng đã sang `dead` — khi store này đóng vai `OutboxPersistence`.
  public private(set) var deadEntries: [DeadEntry] = []
  public private(set) var writes = 0
  private var failures = 0
  private var loadFailures = 0
  private var heldKey: String?
  private var heldSkip = 0
  private var parkedLoads: [CheckedContinuation<Void, Never>] = []
  private var holding = false
  private var parkedWrites: [CheckedContinuation<Void, Never>] = []

  public init(days: [String: DayState] = [:]) {
    self.days = days
  }

  public func failNext(_ n: Int = 1) { failures = n }
  public func hold() { holding = true }
  public func release() {
    holding = false
    let parked = parkedWrites
    parkedWrites = []
    for c in parked { c.resume() }
  }
  /// Số lần ghi đang bị giữ ở cổng.
  public var parked: Int { parkedWrites.count }

  /// Làm hỏng N lần ĐỌC kế tiếp (SQLite bận, tệp đang khoá bảo vệ).
  public func failNextLoad(_ n: Int = 1) { loadFailures = n }

  /// Giữ lần đọc thứ `skip + 1` của `key` lại cho tới `releaseLoad()` — dựng
  /// đúng cảnh "buổi đang được đọc lên thì việc khác xảy ra".
  public func holdLoad(of key: String, after skip: Int = 0) {
    heldKey = key
    heldSkip = skip
  }
  public var heldLoads: Int { parkedLoads.count }
  public func releaseLoad() {
    heldKey = nil
    let parked = parkedLoads
    parkedLoads = []
    for c in parked { c.resume() }
  }

  public func loadDay(_ key: String) async throws -> DayState? {
    if key == heldKey {
      if heldSkip > 0 {
        heldSkip -= 1
      } else {
        await withCheckedContinuation { parkedLoads.append($0) }
      }
    }
    if loadFailures > 0 {
      loadFailures -= 1
      throw Failure()
    }
    return days[key]
  }

  public func saveDay(_ key: String, _ state: DayState) async throws {
    try await enter()
    try locked(key, against: state.loggedSessionId)
    days[key] = state
  }

  @discardableResult
  public func commitFinish(_ key: String, _ state: DayState, _ entry: OutboxEntry) async throws -> Bool {
    try await enter()
    try locked(key, against: state.loggedSessionId)
    days[key] = state
    guard !outbox.contains(where: { $0.id == entry.id }) else { return false }
    outbox.append(entry)
    return true
  }

  public func commitDelete(sessionId: String, _ entry: OutboxEntry) async throws {
    try await enter()
    guard !outbox.contains(where: { $0.id == entry.id }) else { return }
    for (k, s) in days where s.loggedSessionId == sessionId {
      var state = s
      state.loggedKeys = []
      days[k] = state
    }
    outbox.append(entry)
  }

  /// Ngày đã chốt bằng id khác → từ chối, không ghi gì (hợp đồng `WorkoutStore`).
  private func locked(_ key: String, against id: String?) throws {
    if let logged = days[key]?.loggedSessionId, logged != id {
      throw DayAlreadyLogged(sessionId: logged)
    }
  }

  private func enter() async throws {
    if holding { await withCheckedContinuation { parkedWrites.append($0) } }
    writes += 1
    if failures > 0 {
      failures -= 1
      throw Failure()
    }
  }
}

/// Cùng một store đóng vai nơi lưu của vòng sync — như bản GRDB, nơi ngày đã
/// chốt và hàng outbox nằm chung một tệp. Test đầu-cuối nhờ vậy dựng được
/// "chốt xong rồi app chết trước khi kịp gửi" mà không cần cầu nối giả.
/// Ngữ nghĩa `persist` y như `OutboxStore`: chỉ xoá hàng `settled` / `dead`.
extension InMemoryWorkoutStore: OutboxPersistence {
  public func load() async throws -> Outbox {
    Outbox(pending: outbox, dead: deadEntries)
  }

  public func persist(_ snapshot: Outbox, settled: Set<String>) async throws {
    let finished = settled.union(snapshot.dead.map(\.entry.id)).subtracting(snapshot.pending.map(\.id))
    outbox.removeAll { finished.contains($0.id) }
    for e in snapshot.pending {
      if let i = outbox.firstIndex(where: { $0.id == e.id }) { outbox[i] = e } else { outbox.append(e) }
    }
    if snapshot.dead.count > deadEntries.count { deadEntries += snapshot.dead.dropFirst(deadEntries.count) }
  }

  public func dropAllOnSignOut() async throws -> Int {
    defer {
      outbox = []
      deadEntries = []
    }
    return outbox.count
  }
}
