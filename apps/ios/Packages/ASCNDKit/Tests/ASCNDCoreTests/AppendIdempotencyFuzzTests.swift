import ASCNDCore
import ASCNDTestSupport
import Foundation
import Synchronization
import Testing

/// Property tests cho tính idempotent của append (D-13, #325) — bổ sung cho
/// `AppendToSessionTests` của A: chuỗi append / retry / kill / reopen ngẫu nhiên
/// với seed cố định (`SplitMix64`) — tất định, không flaky. Bất biến sau mọi
/// thao tác:
///
/// 1. Không bao giờ trùng set: mỗi hàng outbox mang id `"<buổi>@r<n>"` (#415) —
///    phát lại / bấm lại cùng id không nhân đôi set.
/// 2. Session id được giữ: mọi bản ghi lại mang đúng id buổi gốc.
/// 3. Dấu thời gian được giữ: bản ghi lại cùng `date_time` với buổi gốc.
/// 4. Kill/reopen giữa chừng: không mất dữ liệu đã commit, không sinh buổi mới.
///
/// Đảo ngược (chứng minh test bắt lỗi): cho `append()` sinh id outbox mới mỗi
/// lần gọi thay vì `"<buổi>@r<n>"` → bất biến 1 đỏ ngay (hai hàng cùng
/// tập set).
@MainActor
struct AppendIdempotencyFuzzTests {
  private let saigon = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
  private let clock = FixedWallClock(iso8601: "2026-10-05T14:00:00+07:00")
  private let today = LocalDate("2026-10-05")!

  private func makeRows(_ rng: inout SplitMix64) -> [PlannedSet] {
    let n = 2 + Int(rng.next(below: 3))
    return (1...n).map { i in
      PlannedSet(
        key: "r\(i)", exerciseId: "ex-\(i)", exerciseName: "Lift \(i)",
        ordinal: i, of: n, weightKg: 40 + Double(i) * 10, reps: 8,
        plannedRest: 90, plannedRpe: 7)
    }
  }

  private func controller(
    _ store: InMemoryWorkoutStore, rows: [PlannedSet], mint: IdMint
  ) async -> WorkoutSessionController {
    let c = WorkoutSessionController(
      plan: .init(date: today, templateId: "tpl-1", templateName: "Plan", rows: rows),
      userId: "u1", store: store, clock: clock, timeZone: saigon,
      makeId: { mint.next() })
    await c.load()
    return c
  }

  @Test func randomAppendRetryKillKeepsInvariants() async throws {
    var rng = SplitMix64(seed: 0xA99E_0D13)
    for _ in 0..<60 {
      let store = InMemoryWorkoutStore()
      let mint = IdMint()
      let rows = makeRows(&rng)
      var c = await controller(store, rows: rows, mint: mint)

      // Chốt một tập con ngẫu nhiên.
      var ticked: [String] = []
      for r in rows where rng.next(below: 2) == 0 {
        if await c.toggle(r.key) { ticked.append(r.key) }
      }
      if ticked.isEmpty { _ = await c.toggle(rows[0].key); ticked = [rows[0].key] }
      let first = try await c.finish()
      let sessionId = first.sessionId
      let stamp = (await store.outbox.first?.payload["date_time"])?.stringValue

      // Xen kẽ: tick hàng mới, append, append hỏng rồi thử lại, kill.
      for _ in 0..<(2 + Int(rng.next(below: 5))) {
        switch rng.next(below: 4) {
        case 0: // tick một hàng chưa có trong buổi
          let candidates = rows.filter { !c.loggedKeys.contains($0.key) }
          if let r = candidates.randomElement(using: &rng) { _ = await c.toggle(r.key) }
        case 1: // append (có thể đã hết hàng để nối → ném, vẫn hợp lệ)
          _ = try? await c.append()
        case 2: // append hỏng ghi đĩa rồi bấm lại — phải idempotent
          await store.failNext()
          _ = try? await c.append()
          _ = try? await c.append()
        default: // kill: mở lại controller mới trên cùng store
          c = await controller(store, rows: rows, mint: mint)
        }

        // ── bất biến sau mỗi bước ──
        let outbox = await store.outbox
        let ids = outbox.map(\.id)
        #expect(Set(ids).count == ids.count, "id hàng outbox không trùng")
        for e in outbox {
          #expect(e.payload["id"]?.stringValue == sessionId, "giữ id buổi gốc")
        }
        if let stamp {
          for e in outbox where e.id != sessionId {
            #expect(e.payload["date_time"]?.stringValue == stamp, "giữ dấu thời gian buổi gốc")
          }
        }
        // Không có hai bản ghi lại cho cùng số hàng
        let revisions = ids.filter { $0 != sessionId }
        #expect(Set(revisions).count == revisions.count, "mỗi số hàng một bản ghi lại")
      }

      // Sau kill cuối: không mất, không buổi mới.
      c = await controller(store, rows: rows, mint: mint)
      #expect(c.loggedSessionId == sessionId, "không sinh buổi mới sau kill")
      #expect(mint.minted == 1, "id buổi chỉ sinh một lần")
      let finalIds = await store.outbox.map(\.id)
      #expect(Set(finalIds).count == finalIds.count)
    }
  }

  @Test func doubleAppendOfSamePendingIsOneRevision() async throws {
    // Hai lần append liên tiếp (lần hai không còn gì để nối) → một bản ghi lại.
    var rng = SplitMix64(seed: 0xD131_0D13)
    for _ in 0..<20 {
      let store = InMemoryWorkoutStore()
      let mint = IdMint()
      let rows = makeRows(&rng)
      let c = await controller(store, rows: rows, mint: mint)
      _ = await c.toggle(rows[0].key)
      let first = try await c.finish()
      _ = await c.toggle(rows[1].key)
      _ = try await c.append()
      let afterFirst = await store.outbox.map(\.id)
      // Bấm lại khi không còn hàng mới → từ chối, không ghi thêm
      await #expect(throws: WorkoutSessionController.FinishRefusal.self) {
        try await c.append()
      }
      #expect(await store.outbox.map(\.id) == afterFirst, "không thêm hàng khi hết pending")
      // Id bản ghi lại là "<buổi>@r<n>", n đếm bền trong `DayState.loggedRevision`
      // (#415). Dạng cũ "<buổi>@<số set>" trùng khi gỡ set rồi nối lại cùng số
      // set. Bất biến giữ nguyên: đúng MỘT bản ghi lại sau bản chốt.
      #expect(afterFirst == [first.sessionId, "\(first.sessionId)@r1"])
    }
  }
}

// MARK: - helpers (bản sao gọn của WorkoutSessionControllerTests)

private final class IdMint: Sendable {
  private let n = Mutex(0)
  var minted: Int { n.withLock { $0 } }
  func next() -> String { n.withLock { $0 += 1; return "sess-\($0)" } }
}

extension Array {
  fileprivate func randomElement(using rng: inout SplitMix64) -> Element? {
    guard !isEmpty else { return nil }
    return self[Int(rng.next(below: UInt64(count)))]
  }
}
