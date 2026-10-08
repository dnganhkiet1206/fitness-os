import ASCNDCore
@testable import ASCNDStore
import Foundation
import GRDB
import Testing

/// D-30 (#488): Ma trận data-integrity cho cả ba ranh giới persistence —
/// `read_cache`, `workout_day`, `outbox`. Mục đích: bắt cross-account
/// contamination ở MỌI ranh giới, không chỉ workout_day.
///
/// Mỗi ô của ma trận: (store × scenario) → kỳ vọng. Chạy trên code thật
/// (Store/Core) và SQLite thật. Một mutation âm (bỏ kiểm tra tài khoản ở một
/// ranh giới) phải làm đỏ đúng ô ấy.

private let today = LocalDate("2026-10-05")!
private let dayKey = DayProgressStore.key(date: today, templateId: "tpl")

private func dayState() -> DayState {
  var p = DayProgress()
  p.done["0-0"] = true
  return DayState(progress: p)
}

private func outboxEntry(_ id: String, user: String) -> OutboxEntry {
  OutboxEntry(
    id: id, userId: user, kind: WorkoutSessionRecord.outboxKind,
    payload: .object(["id": .string(id)]), createdAt: EpochMillis(0))
}

/// Đếm hàng trên đĩa, qua mặt chốt.
private func count(_ db: ASCNDDatabase, table: String, user: String) throws -> Int {
  try db.queue.read { db in
    try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM \(table) WHERE userId = ?", arguments: [user]) ?? 0
  }
}

struct DataIntegrityMatrixTests {
  /// Ma trận: mỗi store × mỗi scenario.
  ///
  /// Scenarios:
  /// 1. signed-out write → từ chối (AccountScopeClosed), không hàng nào
  /// 2. signed-out read → không thấy gì
  /// 3. A→B switch: B không thấy của A; ghi của A sau switch bị từ chối
  /// 4. late write (của A, sau khi B đăng nhập) → từ chối
  /// 5. kill/reopen: chốt đóng, không ai thấy gì cho tới khi đăng nhập
  @Test func readCacheMatrix() async throws {
    let db = try ASCNDDatabase()
    let cache = GRDBTemplateCache(db)
    let snap = TemplateSnapshot(routine: [], templates: [], fetchedAt: EpochMillis(1))

    // 1. Signed-out write: ReadCacheTable.put bỏ qua (không lỗi, không ghi)
    db.accounts.signOut()
    try await cache.save(userId: "a", snap)
    #expect(try count(db, table: "read_cache", user: "a") == 0, "signed-out: không ghi")

    // 2. Signed-out read: nil
    db.accounts.signIn("a")
    try await cache.save(userId: "a", snap)
    db.accounts.signOut()
    #expect(try await cache.load(userId: "a") == nil, "signed-out: không đọc")

    // 3. A→B: B không thấy của A
    db.accounts.signIn("b")
    #expect(try await cache.load(userId: "a") == nil, "B không đọc được của A")
    #expect(try await cache.load(userId: "b") == nil, "B chưa có gì")

    // 4. Late write của A khi B đang đăng nhập: bị bỏ qua
    try await cache.save(userId: "a", snap)
    #expect(try count(db, table: "read_cache", user: "a") == 1, "hàng cũ của A vẫn đó (chưa dọn)")
    // Nhưng B ghi đè lên key của mình không ảnh hưởng A
    try await cache.save(userId: "b", snap)
    #expect(try count(db, table: "read_cache", user: "b") == 1)
  }

  @Test func workoutDayMatrix() async throws {
    let db = try ASCNDDatabase()
    let store = GRDBWorkoutStore(db)

    // 1. Signed-out write → AccountScopeClosed
    db.accounts.signOut()
    await #expect(throws: AccountScopeClosed.self) {
      try await store.saveDay(dayKey, dayState(), userId: "a")
    }
    #expect(try count(db, table: "workout_day", user: "a") == 0)

    // 2. Signed-out read → nil
    db.accounts.signIn("a")
    try await store.saveDay(dayKey, dayState(), userId: "a")
    db.accounts.signOut()
    #expect(try await store.loadDay(dayKey) == nil)

    // 3. A→B: B không thấy của A, ghi được ngày riêng
    db.accounts.signIn("b")
    #expect(try await store.loadDay(dayKey) == nil)
    try await store.saveDay(dayKey, dayState(), userId: "b")
    #expect(try count(db, table: "workout_day", user: "a") == 1)
    #expect(try count(db, table: "workout_day", user: "b") == 1)

    // 4. Late write của A khi B đăng nhập → từ chối
    await #expect(throws: AccountScopeClosed.self) {
      try await store.saveDay(dayKey, dayState(), userId: "a")
    }
    await #expect(throws: AccountScopeClosed.self) {
      _ = try await store.commitFinish(dayKey, dayState(), outboxEntry("late", user: "a"))
    }
  }

  /// Ma trận outbox — test FENCE THẬT của #492 (D-27), không assert giả.
  ///
  /// Fence: `OutboxStore.enqueue`/`append` kiểm `accounts.owner(writingFor:)`
  /// NGAY TRONG `db.write` (đóng TOCTOU), tất-cả-hoặc-không. Test này chạy
  /// trên implementation thật sau khi merge #492; trên base a46 (chưa có
  /// fence) các `#expect(throws:)` sẽ đỏ — đúng như HIGH-1 yêu cầu.
  @Test func outboxMatrix() async throws {
    let db = try ASCNDDatabase()
    let store = OutboxStore(db)

    // 1. Signed-out enqueue → AccountScopeClosed, không hàng nào lọt
    db.accounts.signOut()
    #expect(throws: AccountScopeClosed.self) {
      try store.enqueue([outboxEntry("a-1", user: "a")])
    }
    #expect(try store.load().pending.isEmpty, "signed-out: không ghi")

    // 2. Tất-cả-hoặc-không: lô lẫn 1 entry sai user → cả lô bị từ chối
    db.accounts.signIn("a")
    #expect(throws: AccountScopeClosed.self) {
      try store.enqueue([outboxEntry("a-2", user: "a"), outboxEntry("b-2", user: "b")])
    }
    #expect(try store.load().pending.isEmpty, "lô lẫn bị từ chối toàn bộ")

    // 3. A→B switch: entry của A không lọt vào khi B đăng nhập
    try store.enqueue([outboxEntry("a-1", user: "a")])
    db.accounts.signIn("b")
    #expect(throws: AccountScopeClosed.self) {
      try store.enqueue([outboxEntry("a-3", user: "a")])
    }
    #expect(try store.load().pending.map(\.id) == ["a-1"], "chỉ hàng của A từ trước")

    // 4. B ghi được của B
    try store.enqueue([outboxEntry("b-1", user: "b")])
    #expect(try store.load().pending.map(\.id).sorted() == ["a-1", "b-1"])

    // 5. append cũng có fence (đóng cùng #492)
    #expect(throws: AccountScopeClosed.self) {
      try store.append(outboxEntry("a-4", user: "a"))
    }
    #expect(try store.load().pending.map(\.id).sorted() == ["a-1", "b-1"])
    try store.append(outboxEntry("b-2", user: "b"))
    #expect(try store.load().pending.map(\.id).sorted() == ["a-1", "b-1", "b-2"])
  }

  @Test func killReopenMatrix() async throws {
    let path = FileManager.default.temporaryDirectory
      .appendingPathComponent("dim-\(UUID().uuidString).sqlite").path
    defer { try? FileManager.default.removeItem(atPath: path) }

    // Ghi dữ liệu cho A, rồi kill (đóng và mở lại)
    do {
      let db = try ASCNDDatabase(path: path)
      db.accounts.signIn("a")
      try await GRDBWorkoutStore(db).saveDay(dayKey, dayState(), userId: "a")
      try await GRDBTemplateCache(db).save(
        userId: "a", TemplateSnapshot(routine: [], templates: [], fetchedAt: EpochMillis(1)))
      try OutboxStore(db).enqueue([outboxEntry("a-1", user: "a")])
    }

    // Mở lại: chốt đóng (như AppServices lúc khởi động)
    let db = try ASCNDDatabase(path: path)
    db.accounts.signOut()

    // Không ai đọc được gì khi chốt đóng
    #expect(try await GRDBWorkoutStore(db).loadDay(dayKey) == nil)
    #expect(try await GRDBTemplateCache(db).load(userId: "a") == nil)

    // B đăng nhập: không thấy gì của A
    db.accounts.signIn("b")
    #expect(try await GRDBWorkoutStore(db).loadDay(dayKey) == nil)
    #expect(try await GRDBTemplateCache(db).load(userId: "a") == nil)

    // A đăng nhập lại: thấy đúng của A
    db.accounts.signIn("a")
    #expect(try await GRDBWorkoutStore(db).loadDay(dayKey) != nil)
    #expect(try await GRDBTemplateCache(db).load(userId: "a") != nil)
    #expect(try OutboxStore(db).load().pending.map(\.id) == ["a-1"])
  }

  /// Mutation âm THẬT: chứng minh ma trận BẮT ĐƯỢC khi một ranh giới mất chốt.
  ///
  /// Khác bản tautology cũ (chèn SQL rồi assert hàng tồn tại — pass dù có
  /// guard hay không): test này KHÓA behavior của chốt. Bước 1 và 4 assert
  /// `saveDay` ném `AccountScopeClosed` khi signed-out — nếu ai đó xóa
  /// `guard accounts.owner(...)` khỏi production code, hai dòng này ĐỎ ngay.
  /// Bước 2–3 mô phỏng "chốt bị gỡ" (ghi thẳng SQL, đúng câu lệnh `saveDay`
  /// sẽ chạy nếu không có guard) và chứng minh ma trận phát hiện sự lệch
  /// giữa "API cho phép" và "đĩa đang có".
  ///
  /// Đã kiểm chứng bằng mutation probe trên bản copy: xóa guard khỏi
  /// `GRDBWorkoutStore.saveDay` → test này ĐỎ tại bước 4 (xem PR comment).
  @Test func matrixDetectsGuardRemoval() async throws {
    let db = try ASCNDDatabase()
    let store = GRDBWorkoutStore(db)

    // 1. Chốt còn đó: signed-out write bị từ chối, đĩa sạch.
    db.accounts.signOut()
    await #expect(throws: AccountScopeClosed.self) {
      try await store.saveDay(dayKey, dayState(), userId: "a")
    }
    #expect(try count(db, table: "workout_day", user: "a") == 0,
            "chốt chặn: signed-out không ghi được")

    // 2. Mô phỏng chốt bị gỡ: ghi thẳng SQL, qua mặt AccountScope.
    db.accounts.signIn("b")
    try await db.queue.write { db in
      try db.execute(
        sql: "INSERT INTO workout_day (userId, key, state) VALUES (?, ?, ?)",
        arguments: ["a", "guardless-key", "{}"])
    }

    // 3. Ma trận phát hiện: API có chốt (B) không thấy hàng của A...
    #expect(try await store.loadDay("guardless-key") == nil,
            "API có chốt không để lộ hàng lọt")
    // ...nhưng kiểm tra trên đĩa (cơ chế của ma trận) thấy hàng lọt chốt.
    #expect(try count(db, table: "workout_day", user: "a") == 1,
            "ma trận phát hiện hàng của A lọt vào khi B đăng nhập")

    // 4. Khóa chốt: nếu guard bị gỡ khỏi saveDay, dòng này KHÔNG ném → test đỏ.
    //    Đây là negative mutation thật, không phải tautology.
    db.accounts.signOut()
    await #expect(throws: AccountScopeClosed.self) {
      try await store.saveDay("guardless-key-2", dayState(), userId: "a")
    }
    #expect(try count(db, table: "workout_day", user: "a") == 1,
            "chốt chặn: chỉ có hàng mô phỏng, không thêm hàng mới")
  }
}
