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
  @discardableResult
  func dropAllOnSignOut() async throws -> Int
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

  public var pendingCount: Int { outbox.pending.count }
  public var deadCount: Int { outbox.dead.count }
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

  /// Đăng xuất: dừng vòng, bỏ hàng đợi như baseline (`clearPersistedCache`;
  /// #241 chờ Kiệt). Trả về số bản ghi bị bỏ.
  @discardableResult
  public func signOut() async -> Int {
    signedInUser = nil
    drain?.cancel()
    await settle()
    let dropped = outbox.dropAllOnSignOut()
    settled = []
    do {
      try await store.dropAllOnSignOut()
    } catch {
      unsaved = LocalWriteError("signOut: \(error)")
    }
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
          outbox.failed(id: entry.id, error, now: clock.nowMillis())
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
      let disk = try await store.load()
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
    }
  }
}
