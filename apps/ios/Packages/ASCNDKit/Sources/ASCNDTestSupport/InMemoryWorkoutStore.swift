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
  public private(set) var writes = 0
  private var failures = 0
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

  public func loadDay(_ key: String) async throws -> DayState? { days[key] }

  public func saveDay(_ key: String, _ state: DayState) async throws {
    try await enter()
    try locked(key, against: state.loggedSessionId)
    days[key] = state
  }

  @discardableResult
  public func commitFinish(_ key: String, _ state: DayState, _ entry: OutboxEntry) async throws -> Bool {
    try await enter()
    try locked(key, against: entry.id)
    days[key] = state
    guard !outbox.contains(where: { $0.id == entry.id }) else { return false }
    outbox.append(entry)
    return true
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
