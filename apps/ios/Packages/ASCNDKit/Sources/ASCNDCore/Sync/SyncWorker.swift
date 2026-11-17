public import Observation

/// `WriteFailure` là lỗi mà adapter ném ra — vẫn là MỘT hệ phân loại lỗi
/// (`RetryPolicy`), không có hệ thứ hai cho tầng mạng.
extension WriteFailure: Error {}

/// Gửi MỘT bản ghi lên server. `ASCNDBackend` hiện thực bằng Supabase (A4).
///
/// Hợp đồng: phát lại cùng `entry.id` là vô hại — server bỏ trùng (upsert
/// `onConflict: id, ignoreDuplicates`, như `IDEMPOTENT` của baseline). Worker
/// dựa vào điều này để giao "ít nhất một lần": mất phản hồi, app chết giữa
/// lượt gửi, hay ghi đĩa hỏng sau khi gửi xong đều chỉ dẫn tới GỬI LẠI, không
/// bao giờ tới mất bản ghi.
public protocol RemoteWriter: Sendable {
  func send(_ entry: OutboxEntry) async throws(WriteFailure)
}

/// Nơi lưu hàng đợi. `ASCNDStore.OutboxStore` hiện thực nó.
public protocol OutboxPersistence: Sendable {
  func load() async throws -> Outbox
  /// Ghi bước của worker; chỉ xoá hàng trong `settled` hoặc đã sang `dead` —
  /// hàng worker chưa nạp (màn tập vừa chốt) để nguyên.
  func persist(_ outbox: Outbox, settled: Set<String>) async throws
  /// Xoá hẳn mọi hàng (chờ gửi và `dead`) của một tài khoản đã bị xoá trên server.
  @discardableResult
  func purge(userId: String) async throws -> Int
  /// Số hàng trên đĩa mà bản app này không giải mã được — `load()` bỏ qua
  /// chúng (R2-SYNC-02). Mặc định 0: store trong bộ nhớ không có hàng lạ.
  func undecodableCount() async throws -> Int
  /// Cắt bảng `dead` về giới hạn (tuổi + số hàng, R2-SYNC-03). Trả về số hàng
  /// bỏ. Mặc định không làm gì: store trong bộ nhớ không phình.
  @discardableResult
  func pruneDead(now: EpochMillis) async throws -> Int
}

extension OutboxPersistence {
  public func undecodableCount() async throws -> Int { 0 }
  @discardableResult
  public func pruneDead(now: EpochMillis) async throws -> Int { 0 }
}

/// Vòng gửi của lớp Ghi nhận (ADR-0003): MỘT làn tuần tự, đọc `Outbox` (luật)
/// và đẩy từng bước xuống đĩa.
///
/// ── vòng ──
///
/// `kick()` khi có hàng mới (`WorkoutSessionController.onEnqueued`), khi có
/// mạng lại, khi app ra tiền cảnh, khi đăng nhập. Mỗi lượt: nạp hàng mới từ
/// đĩa → `next` → gửi → `succeeded` / `failed` → ghi đĩa → lặp, tới khi hàng
/// rỗng, chờ mạng, hay phải đợi lịch thử lại (thì ngủ đúng chừng ấy).
///
/// ── vì sao không bao giờ mất ──
///
/// Hàng chỉ rời đĩa khi server đã nhận (`settled`) hoặc khi nó bị từ chối
/// vĩnh viễn (`dead`, cũng nằm trên đĩa để còn báo). Ghi đĩa hỏng thì giá trị
/// trong bộ nhớ vẫn đúng và lần ghi sau thử lại; app chết trước khi ghi được
/// thì lần mở sau gửi lại — vô hại theo hợp đồng `RemoteWriter`.
@MainActor @Observable
public final class SyncWorker {
  public private(set) var outbox = Outbox()
  public private(set) var online: Bool
  public private(set) var signedInUser: String?
  /// Ghi đĩa gần nhất hỏng — hàng đợi trên đĩa đang đi sau bộ nhớ.
  public private(set) var unsaved: LocalWriteError?

  /// Hàng trên đĩa mà bản app này không giải mã được (R2-SYNC-02) — `load()`
  /// bỏ qua chúng, nên trước đây chúng vô hình: không đếm, không báo, bản ghi
  /// "đã lưu trên máy" đứng yên mãi mà không ai biết. Đếm ở đây để màn Lab
  /// thấy và `onIncident` báo lên Sentry.
  ///
  /// Đường hồi phục: hàng vẫn NẰM trên đĩa — `persist` không xoá thứ nó không
  /// đọc được. Thường là bản app mới hơn đã ghi rồi người dùng quay về bản cũ:
  /// cập nhật lên bản đọc được nó thì lần nạp sau nó gửi như thường. Hàng hỏng
  /// thật (không phải lược đồ mới hơn) thì nằm đó mãi — không tự xoá dữ liệu
  /// không đọc được; chỉ `purge` (xoá tài khoản) mới bỏ nó, theo `userId`.
  public private(set) var undecodableCount = 0

  /// Chỉ của người đang đăng nhập: bản ghi đỗ lại của tài khoản khác không
  /// hiện, không đếm (#335).
  public var pendingCount: Int { outbox.pending(for: signedInUser).count }

  /// Sự cố đáng báo (round 3, R2-OPS-03): trước đây bản ghi bị bỏ cuộc và ghi đĩa
  /// hỏng chỉ nằm trong bộ nhớ / màn hình của chính người dùng — đội không bao giờ
  /// biết. Chỉ mang loại bản ghi, lý do, mã lỗi: không payload, không id người dùng.
  public enum Incident: Sendable, Hashable {
    case dead(kind: String, reason: DeadEntry.Reason, code: String?)
    case localWrite(stage: String)
    /// Hàng trên đĩa bản app này không giải mã được (R2-SYNC-02): chỉ số
    /// lượng — không id hàng, không payload. Báo khi số lượng TĂNG, không báo
    /// lại cùng một số ở mỗi lần nạp.
    case undecodable(count: Int)
  }

  /// App nối vào Sentry. Gọi trên main actor, sau khi bước ấy đã xong.
  public var onIncident: (@MainActor (Incident) -> Void)?
  public var deadCount: Int { outbox.dead(for: signedInUser).count }
  public var isRunning: Bool { drain != nil }

  private let store: any OutboxPersistence
  private let remote: any RemoteWriter
  private let clock: any WallClock
  private let sleep: @Sendable (Int64) async -> Void
  private var loaded = false
  /// Đã gửi thành nhưng chưa ghi được xuống đĩa.
  private var settled: Set<String> = []
  private var drain: Task<Void, Never>?
  private var kicked = false
  /// Bộ nhớ đi trước đĩa (bước chưa ghi được, hay ghi hỏng).
  private var dirty = false
  /// Số hàng không giải mã được đã báo qua `onIncident` — chỉ báo khi tăng.
  private var reportedUndecodable = 0

  /// - Parameter sleep: ngủ chừng ấy mili giây (test thay bằng đồng hồ tay).
  public init(
    store: any OutboxPersistence, remote: any RemoteWriter, clock: any WallClock = SystemWallClock(),
    online: Bool = true, signedInUser: String? = nil,
    sleep: @escaping @Sendable (Int64) async -> Void = { ms in try? await Task.sleep(for: .milliseconds(ms)) }
  ) {
    self.store = store
    self.remote = remote
    self.clock = clock
    self.online = online
    self.signedInUser = signedInUser
    self.sleep = sleep
  }

  public func setOnline(_ value: Bool) {
    online = value
    if value { kick() }
  }

  public func setSignedInUser(_ id: String?) {
    signedInUser = id
    kick()
  }

  /// Có việc mới. Đang chạy thì lượt đang chạy nạp lại đĩa ở bước kế tiếp;
  /// không thì mở một lượt.
  public func kick() {
    kicked = true
    guard drain == nil else { return }
    drain = Task { [weak self] in
      await self?.run()
      self?.drain = nil
    }
  }

  /// Đợi lượt đang chạy (nếu có) xong.
  public func settle() async {
    while let d = drain { await d.value }
  }

  /// Phiên kết thúc: dừng vòng và ĐỖ hàng đợi (round 3, AUD-06; #241 (b)) —
  /// không xoá gì trên đĩa. Bản ghi được gửi khi chính chủ đăng nhập lại.
  /// Bước đã xong mà chưa kịp ghi xuống đĩa thì ghi nốt, để lần sau không gửi
  /// lại cái server đã nhận. Trả về số bản ghi đang đỗ.
  @discardableResult
  public func signOut() async -> Int {
    signedInUser = nil
    drain?.cancel()
    await settle()
    let parked = outbox.park()
    if dirty || !settled.isEmpty { await persist() }
    return parked
  }

  /// Gửi lại một bản ghi đã bỏ cuộc (AUD-62): về lại hàng chờ với ngân sách
  /// mới, cùng idempotency key (`Outbox.retryDead`), ghi đĩa rồi mở vòng gửi.
  /// Trả về `false` khi không có bản ghi `dead` nào mang `id` ấy.
  @discardableResult
  public func retryDead(id: String) async -> Bool {
    guard outbox.retryDead(id: id) else { return false }
    dirty = true
    await persist()
    kick()
    return true
  }

  /// Tài khoản đã bị xoá trên server: bỏ hẳn mọi bản ghi của nó trên máy (gửi
  /// tiếp chỉ còn bị từ chối, và dữ liệu không còn chủ). Trả về số bản ghi chờ
  /// gửi bị bỏ.
  @discardableResult
  public func purge(userId: String) async -> Int {
    drain?.cancel()
    await settle()
    let dropped = outbox.purge(userId: userId)
    do {
      try await store.purge(userId: userId)
    } catch {
      unsaved = LocalWriteError("purge: \(error)")
    }
    kick()
    return dropped
  }

  // MARK: - vòng

  private func run() async {
    while !Task.isCancelled {
      if kicked || !loaded {
        kicked = false
        await reload()
      }
      let deadBefore = outbox.dead.count
      let now = clock.nowMillis()
      let step = outbox.next(now: now, online: online, signedInUser: signedInUser)
      // `next` có thể đã chuyển bản ghi tài khoản khác sang `dead`.
      if outbox.dead.count != deadBefore { dirty = true }
      switch step {
      case .send(let entry):
        do throws(WriteFailure) {
          try await remote.send(entry)
          outbox.succeeded(id: entry.id)
          settled.insert(entry.id)
        } catch {
          if case .dead(let reason)? = outbox.failed(id: entry.id, error, now: clock.nowMillis()) {
            let code: String? = if case .server(let c) = error { c } else { nil }
            onIncident?(.dead(kind: entry.kind, reason: reason, code: code))
          }
        }
        dirty = true
        await persist()
      case .wait(let until):
        if dirty { await persist() }
        await sleep(max(0, until.millis - now.millis))
      case .waitForNetwork, .idle, .busy:
        // Lần ghi trước hỏng thì thử lại ở đây — không thì đĩa đi sau bộ nhớ
        // tới tận lần mở app sau.
        if dirty { await persist() }
        // Hàng mới tới trong lúc bước này chạy: nạp rồi xét lại, đừng ngủ quên.
        if kicked { continue }
        return
      }
    }
  }

  /// Nạp hàng mà worker chưa biết. Bản ghi đã gửi xong hay đã sang `dead`
  /// nhưng đĩa chưa kịp ghi thì KHÔNG nạp lại — không thì gửi hai lần cái
  /// đã thành, hay hồi sinh cái server đã từ chối.
  private func reload() async {
    do {
      // Lần nạp đầu: cắt bảng `dead` TRƯỚC khi nhận trạng thái đĩa
      // (R2-SYNC-03) — cắt sau thì bộ nhớ giữ bản ghi đĩa vừa bỏ, và lần ghi
      // sau hồi sinh chúng. Cắt hỏng thì báo rồi nạp tiếp: hàng đợi không
      // dừng vì một lượt dọn.
      if !loaded {
        do {
          _ = try await store.pruneDead(now: clock.nowMillis())
        } catch {
          onIncident?(.localWrite(stage: "prune"))
        }
      }
      let disk = try await store.load()
      await refreshUndecodable()
      if !loaded {
        outbox = disk
        loaded = true
        return
      }
      let dead = Set(outbox.dead.map(\.entry.id))
      for e in disk.pending where !settled.contains(e.id) && !dead.contains(e.id) {
        outbox.enqueue(e)
      }
    } catch {
      unsaved = LocalWriteError("load: \(error)")
      onIncident?(.localWrite(stage: "load"))
    }
  }

  /// Đếm lại hàng không giải mã được (R2-SYNC-02) và báo khi số lượng tăng.
  /// Đếm hỏng thì giữ số cũ — một con số chẩn đoán không được chặn vòng gửi.
  private func refreshUndecodable() async {
    do {
      let count = try await store.undecodableCount()
      undecodableCount = count
      if count > reportedUndecodable {
        reportedUndecodable = count
        onIncident?(.undecodable(count: count))
      } else if count < reportedUndecodable {
        // Hàng đã đọc được trở lại (lên bản mới): hạ mốc để lần tăng sau báo lại.
        reportedUndecodable = count
      }
    } catch {
      // Giữ số cũ.
    }
  }

  private func persist() async {
    let snapshot = outbox
    let done = settled
    do {
      try await store.persist(snapshot, settled: done)
      settled.subtract(done)
      dirty = false
      unsaved = nil
    } catch {
      unsaved = LocalWriteError("persist: \(error)")
      onIncident?(.localWrite(stage: "persist"))
    }
  }
}
