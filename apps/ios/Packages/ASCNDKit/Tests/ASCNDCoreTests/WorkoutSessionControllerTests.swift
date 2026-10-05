import ASCNDCore
import ASCNDTestSupport
import Foundation
import Synchronization
import Testing

private let bench1 = PlannedSet(key: "b1", exerciseId: "ex-bench", exerciseName: "Bench Press", ordinal: 1, of: 2, weightKg: 60, reps: 8, plannedRest: 90, plannedRpe: 7)
private let bench2 = PlannedSet(key: "b2", exerciseId: "ex-bench", exerciseName: "Bench Press", ordinal: 2, of: 2, weightKg: 60, reps: 8, plannedRest: 90, plannedRpe: 8)
private let plank = PlannedSet(key: "p1", exerciseName: "Plank", ordinal: 1, of: 1, weightKg: 0, reps: 0, plannedRest: 0, plannedRpe: 6)
private let blank = PlannedSet(key: "x1", exerciseName: "  ", ordinal: 1, of: 1, weightKg: 0, reps: 5, plannedRest: 0)

private let saigon = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
/// 14:00 giờ Sài Gòn ngày 05/10/2026.
private let clock = FixedWallClock(iso8601: "2026-10-05T14:00:00+07:00")
private let today = LocalDate("2026-10-05")!

/// Đếm số id đã sinh — id buổi chỉ được sinh MỘT lần dù chốt bao nhiêu lần.
private final class IdMint: Sendable {
  private let n = Mutex(0)
  private let prefix: String
  init(_ prefix: String = "sess") { self.prefix = prefix }
  var minted: Int { n.withLock { $0 } }
  func next() -> String { n.withLock { $0 += 1; return "\(prefix)-\($0)" } }
}

@MainActor
private func controller(
  _ store: InMemoryWorkoutStore, date: LocalDate = today, rows: [PlannedSet] = [bench1, bench2, plank],
  mint: IdMint = IdMint(), onRest: @escaping @MainActor (RestEvent, PlannedSet?) -> Void = { _, _ in },
  onEnqueued: @escaping @MainActor (OutboxEntry) -> Void = { _ in }
) async -> WorkoutSessionController {
  let c = WorkoutSessionController(
    plan: .init(date: date, templateId: "tpl-push", templateName: "Push A", rows: rows),
    userId: "u1", store: store, clock: clock, timeZone: saigon, makeId: { mint.next() },
    onRest: onRest, onEnqueued: onEnqueued)
  await c.load()
  return c
}

@MainActor
struct WorkoutSessionControllerTests {
  // MARK: đọc / khôi phục

  @Test func freshDayIsIdle() async {
    let c = await controller(InMemoryWorkoutStore())
    #expect(c.phase == .idle)
    #expect(!c.canFinish)
  }

  /// Kill app giữa buổi: controller mới trên cùng store mở lại đúng chỗ.
  @Test func restoresAfterKill() async {
    let store = InMemoryWorkoutStore()
    do {
      let c = await controller(store)
      await c.toggle("b1")
      await c.setWeightText("62.5", for: "b1")
      await c.setRepsText("45s", for: "p1")
      await c.setRpe(9, for: "b1")
    }
    let c = await controller(store)
    #expect(c.phase == .active)
    #expect(c.progress.done["b1"] == true)
    #expect(c.performed(bench1).weightKg == 62.5)
    #expect(c.performed(plank).durationSec == 45)
    #expect(c.progress.rpe["b1"] == 9)
    #expect(c.canFinish)
  }

  // MARK: ghi

  /// Hàm trả về thì thay đổi đã nằm trong store — không phải "sẽ ghi".
  @Test func editIsDurableWhenItReturns() async {
    let store = InMemoryWorkoutStore()
    let c = await controller(store)
    #expect(await c.toggle("b1"))
    let saved = await store.days[c.key]
    #expect(saved?.progress.done["b1"] == true)
    #expect(saved?.loggedSessionId == nil)
  }

  /// Hàng không tên không tick được (`rowReady`); bỏ tick thì luôn được.
  @Test func cannotTickARowThatIsNotReady() async {
    let store = InMemoryWorkoutStore()
    let c = await controller(store, rows: [blank, bench1])
    #expect(await c.toggle("x1") == false)
    #expect(c.progress.done["x1"] == nil)
    #expect(await store.writes == 0)
  }

  @Test func unknownRowIsRefused() async {
    let c = await controller(InMemoryWorkoutStore())
    #expect(await c.toggle("nope") == false)
    #expect(await c.setRpe(8, for: "nope") == false)
  }

  /// Tick có nghỉ → bắt đầu nghỉ, kèm set KẾ TIẾP (RT-12); bỏ tick → huỷ.
  @Test func tickDrivesRest() async {
    var events: [(RestEvent, String?)] = []
    let c = await controller(InMemoryWorkoutStore(), onRest: { events.append(($0, $1?.key)) })
    await c.toggle("b1")
    await c.toggle("b1")
    await c.setRepsText("45s", for: "p1")
    await c.toggle("p1")
    #expect(events.map(\.0) == [.start(seconds: 90), .cancel, .cancel])
    #expect(events.map(\.1) == ["b2", "b2", nil])
  }

  @Test func restIsClampedAndRpeValidated() async {
    let c = await controller(InMemoryWorkoutStore())
    await c.setRest(900, for: "b1")
    #expect(c.progress.rest["b1"] == 600)
    #expect(await c.setRpe(0, for: "b1") == false)
    #expect(await c.setRpe(11, for: "b1") == false)
    #expect(c.progress.rpe["b1"] == nil)
  }

  /// Ghi máy hỏng: màn nói thật (`unsaved`), lần ghi sau thành thì hết.
  @Test func failedLocalWriteIsReportedThenHealed() async {
    let store = InMemoryWorkoutStore()
    let c = await controller(store)
    await store.failNext()
    #expect(await c.toggle("b1") == false)
    #expect(c.unsaved != nil)
    #expect(await c.toggle("b2"))
    #expect(c.unsaved == nil)
    // Bản chụp sau chứa cả thay đổi mà lần hỏng đã không ghi được.
    #expect(await store.days[c.key]?.progress.done == ["b1": true, "b2": true])
  }

  /// Bấm nhanh hai lần trong khi lần ghi đầu còn treo: hai bản chụp hạ cánh
  /// đúng thứ tự, bản sau không bị bản trước đè.
  @Test func writesLandInOrder() async {
    let store = InMemoryWorkoutStore()
    let c = await controller(store)
    await store.hold()
    let first = Task { await c.toggle("b1") }
    while await store.parked < 1 { await Task.yield() }
    let second = Task { await c.toggle("b2") }
    for _ in 0..<50 { await Task.yield() }
    #expect(await store.parked == 1, "lần ghi thứ hai phải đợi lần đầu, không chen vào store")
    await store.release()
    #expect(await first.value)
    #expect(await second.value)
    #expect(await store.days[c.key]?.progress.done == ["b1": true, "b2": true])
  }

  // MARK: chốt buổi

  @Test func finishWritesOneOutboxEntryAndLocksTheDay() async throws {
    let store = InMemoryWorkoutStore()
    var enqueued: [String] = []
    let c = await controller(store, onEnqueued: { enqueued.append($0.id) })
    await c.toggle("b1")
    await c.toggle("b2")
    await c.setRepsText("45s", for: "p1")
    await c.toggle("p1")
    let s = try await c.finish()

    let outbox = await store.outbox
    #expect(outbox.count == 1)
    let e = try #require(outbox.first)
    #expect(e.id == s.sessionId)
    #expect(e.kind == "workout")
    #expect(e.userId == "u1")
    #expect(e.payload["id"] == .string(s.sessionId), "id hàng outbox = id hàng server: upsert ignoreDuplicates")
    #expect(e.payload["template_id"] == .string("tpl-push"))
    #expect(e.payload["volume_load"] == .number(960))
    #expect(e.payload["date_time"] == .string("2026-10-05T07:00:00.000Z"), "hôm nay → đúng lúc này")
    #expect(enqueued == [s.sessionId])

    #expect(c.phase == .finished(sessionId: s.sessionId))
    #expect(!c.canFinish)
    let day = await store.days[c.key]
    #expect(day?.loggedSessionId == s.sessionId)
    #expect(day?.progress.done["b1"] == true, "điểm quay lại giữ lại làm read model của ngày")
  }

  /// Số liệu cho màn Tổng kết (C): khớp với hàng đã gửi.
  @Test func summaryCountsWhatWasDone() async throws {
    let c = await controller(InMemoryWorkoutStore())
    await c.toggle("b1")
    await c.toggle("b2")
    await c.setRepsText("45s", for: "p1")
    await c.toggle("p1")
    await c.setRpe(9, for: "b2")
    let s = try await c.finish()
    #expect(s.completedSets == 3)
    #expect(s.holdSets == 1)
    #expect(s.warmupSets == 0)
    #expect(s.exerciseCount == 2)
    #expect(s.volumeKg == 960)
    #expect(s.sessionRpe == 9)
    #expect(s.templateName == "Push A")
    #expect(!s.prDetected)
  }

  @Test func nothingDoneCannotFinish() async {
    let store = InMemoryWorkoutStore()
    let c = await controller(store)
    await #expect(throws: WorkoutSessionController.FinishRefusal.nothingDone) { try await c.finish() }
    #expect(await store.outbox.isEmpty)
  }

  /// Ngày mai: tick được, chốt thì không (baseline `future`).
  @Test func futureDayTicksButDoesNotFinish() async {
    let store = InMemoryWorkoutStore()
    let c = await controller(store, date: today.adding(days: 1))
    #expect(await c.toggle("b1"))
    #expect(!c.canFinish)
    await #expect(throws: WorkoutSessionController.FinishRefusal.futureDay) { try await c.finish() }
    #expect(await store.outbox.isEmpty)
  }

  /// Chốt bù hôm qua: đóng dấu 12:00 trưa giờ địa phương của hôm qua.
  @Test func pastDayIsStampedAtLocalNoon() async throws {
    let store = InMemoryWorkoutStore()
    let c = await controller(store, date: today.adding(days: -1))
    await c.toggle("b1")
    _ = try await c.finish()
    #expect(await store.outbox.first?.payload["date_time"] == .string("2026-10-04T05:00:00.000Z"))
  }

  /// Bấm Chốt hai lần thật nhanh: một buổi, lần thứ hai bị từ chối.
  @Test func doubleTapFinishesOnce() async throws {
    let store = InMemoryWorkoutStore()
    let mint = IdMint()
    let c = await controller(store, mint: mint)
    await c.toggle("b1")
    await store.hold()
    let first = Task { try await c.finish() }
    while await store.parked < 1 { await Task.yield() }
    // Lần thứ hai chạy ở task riêng: nếu luật chặn hỏng, nó kẹt ở cổng cùng
    // lần đầu — test phải ĐỎ, không được treo.
    let second = Task { () -> WorkoutSessionController.FinishRefusal? in
      do throws(WorkoutSessionController.FinishRefusal) { _ = try await c.finish(); return nil } catch { return error }
    }
    for _ in 0..<50 { await Task.yield() }
    #expect(await c.toggle("b2") == false, "đang chốt thì không sửa — bản ghi đã chụp")
    await store.release()
    _ = try await first.value
    #expect(await second.value == .inProgress)
    #expect(await store.outbox.count == 1)
    #expect(mint.minted == 1)
  }

  /// Chốt xong rồi gọi lại: trả lại đúng tổng kết, không ghi gì thêm.
  @Test func repeatedFinishReturnsTheSameSummary() async throws {
    let store = InMemoryWorkoutStore()
    let c = await controller(store)
    await c.toggle("b1")
    let a = try await c.finish()
    let writes = await store.writes
    let b = try await c.finish()
    #expect(a == b)
    #expect(await store.writes == writes)
    #expect(await store.outbox.count == 1)
  }

  /// Giao dịch hỏng: không có gì được ghi, ngày chưa chốt, bấm lại dùng
  /// ĐÚNG id cũ — nên dù lần hỏng thật ra đã chèn, lần sau cũng không thành hai.
  @Test func failedFinishRetriesWithTheSameId() async throws {
    let store = InMemoryWorkoutStore()
    let mint = IdMint()
    let c = await controller(store, mint: mint)
    await c.toggle("b1")
    await store.failNext()
    await #expect(throws: WorkoutSessionController.FinishRefusal.self) { try await c.finish() }
    #expect(await store.outbox.isEmpty)
    #expect(await store.days[c.key]?.loggedSessionId == nil)
    #expect(c.phase == .active)
    #expect(c.canFinish)
    let s = try await c.finish()
    #expect(s.sessionId == "sess-1")
    #expect(mint.minted == 1)
    #expect(await store.outbox.map(\.id) == ["sess-1"])
  }

  /// Store đã có hàng với id ấy (lần trước chèn rồi mới báo lỗi): INSERT OR
  /// IGNORE — vẫn một hàng.
  @Test func commitIsIdempotentById() async throws {
    let store = InMemoryWorkoutStore()
    let e = OutboxEntry(id: "s", userId: "u1", kind: "workout", payload: .null, createdAt: EpochMillis(0))
    #expect(try await store.commitFinish("k", DayState(loggedSessionId: "s"), e))
    #expect(try await store.commitFinish("k", DayState(loggedSessionId: "s"), e) == false)
    #expect(await store.outbox.count == 1)
  }

  /// Kill app sau khi chốt, mở lại OFFLINE: ngày vẫn đã chốt, không chốt lại
  /// được, không sửa được — luật chặn ghi trùng không cần server.
  @Test func finishedDaySurvivesKill() async throws {
    let store = InMemoryWorkoutStore()
    let id: String
    do {
      let c = await controller(store)
      await c.toggle("b1")
      id = try await c.finish().sessionId
    }
    let c = await controller(store)
    #expect(c.phase == .finished(sessionId: id))
    #expect(!c.canFinish)
    #expect(await c.toggle("b2") == false)
    await #expect(throws: WorkoutSessionController.FinishRefusal.alreadyLogged(sessionId: id)) { try await c.finish() }
    #expect(await store.outbox.count == 1)
  }

  /// Kill app NGAY sau giao dịch chốt (trước khi controller kịp cập nhật gì):
  /// giao dịch là một khối, nên mở lại thấy đủ cả hai — có buổi trong outbox
  /// VÀ ngày đã chốt — không bao giờ một mà thiếu hai.
  @Test func killRightAfterCommitIsConsistent() async throws {
    let store = InMemoryWorkoutStore()
    let c1 = await controller(store)
    await c1.toggle("b1")
    _ = try await c1.finish()
    let c2 = await controller(store)
    let ids = await store.outbox.map(\.id)
    #expect(ids.count == 1)
    #expect(c2.loggedSessionId == ids.first)
  }

  /// Hai controller cùng mở một ngày (hai màn / khôi phục chồng): mỗi cái
  /// sinh một id, nên idempotent theo id không cứu được. Khoá ở tầng lưu thì
  /// cứu: một buổi, cái thứ hai chuyển sang "đã chốt" chứ không báo lỗi đĩa.
  @Test func twoControllersOnOneDayFinishOnce() async throws {
    let store = InMemoryWorkoutStore()
    let a = await controller(store, mint: IdMint("a"))
    let b = await controller(store, mint: IdMint("b"))
    await a.toggle("b1")
    await b.toggle("b2")
    let s = try await a.finish()
    await #expect(throws: WorkoutSessionController.FinishRefusal.alreadyLogged(sessionId: s.sessionId)) {
      try await b.finish()
    }
    #expect(await store.outbox.count == 1)
    #expect(b.phase == .finished(sessionId: s.sessionId))
    #expect(b.unsaved == nil)
  }

  /// Bản chụp của controller cũ không được "mở khoá" ngày đã chốt — không thì
  /// nút Chốt sáng lại và lần bấm sau là buổi thứ hai.
  @Test func staleControllerCannotUnlockALoggedDay() async throws {
    let store = InMemoryWorkoutStore()
    let stale = await controller(store, mint: IdMint("stale"))
    let a = await controller(store, mint: IdMint("a"))
    await a.toggle("b1")
    let s = try await a.finish()
    #expect(await stale.toggle("b2") == false)
    #expect(await store.days[a.key]?.loggedSessionId == s.sessionId)
    #expect(stale.phase == .finished(sessionId: s.sessionId))
    #expect(stale.unsaved == nil)
  }
}

struct WorkoutSummaryTests {
  /// Khởi động không vào volume, không vào số set; set giữ có tính.
  @Test func warmupsAreExcluded() throws {
    let r = try #require(WorkoutSessionRecord(
      id: "s", userId: "u", dateTime: EpochMillis(0), templateId: nil, templateName: "W",
      sets: [
        SessionSet(exerciseId: "sq", exerciseName: "Squat", weightKg: 60, reps: 5, rpe: 5, warmup: true),
        SessionSet(exerciseId: "sq", exerciseName: "Squat", weightKg: 100, reps: 5, rpe: 8),
        SessionSet(exerciseId: "", exerciseName: "Plank", weightKg: 0, reps: 0, rpe: 6, durationSec: 60),
        SessionSet(exerciseId: "", exerciseName: "Dips", weightKg: 0, reps: 10, rpe: 7),
      ]))
    let s = WorkoutSummary(r)
    #expect(s.completedSets == 3)
    #expect(s.warmupSets == 1)
    #expect(s.holdSets == 1)
    #expect(s.exerciseCount == 3, "bài không id phân biệt theo tên")
    #expect(s.volumeKg == 500)
  }
}

struct LocalDateInstantTests {
  /// 23:30 UTC ngày 4 là 06:30 ngày 5 ở Sài Gòn, vẫn ngày 4 ở New York.
  @Test func calendarDayDependsOnZone() {
    let t = EpochMillis(Date(timeIntervalSince1970: 1_791_156_600)) // 2026-10-04T23:30:00Z
    #expect(LocalDate(t, in: saigon).description == "2026-10-05")
    #expect(LocalDate(t, in: TimeZone(identifier: "America/New_York")!).description == "2026-10-04")
    #expect(LocalDate(t, in: TimeZone(identifier: "UTC")!).description == "2026-10-04")
  }

  @Test func beforeEpoch() {
    #expect(LocalDate(EpochMillis(-1), in: TimeZone(identifier: "UTC")!).description == "1969-12-31")
  }
}
