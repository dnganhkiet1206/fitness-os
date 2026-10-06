import ASCNDCore
import ASCNDTestSupport
import Foundation
import Synchronization
import Testing

/// Test thuộc tính WorkoutSession (D-7, #282): chuỗi thao tác ngẫu nhiên +
/// kill ngẫu nhiên (vứt controller, giữ store) với seed cố định
/// (`SplitMix64`) — tất định, không flaky. Bất biến sau mỗi lượt:
///
/// 1. Mỗi ngày tối đa MỘT hàng outbox (chốt là idempotent theo id buổi);
/// 2. `summary.volumeKg == Σ kg×reps` của đúng các hàng đã chốt (bỏ warmup),
///    tính từ `performed` — con số người dùng thấy và con số lên server là một.
///
/// Đảo ngược (chứng minh test bắt lỗi): cho `makeId` sinh id mới mỗi lần
/// `finish()` (thay vì một id cho cả buổi) → bất biến 1 đỏ: outbox có hai
/// hàng cho cùng một ngày.
private let fuzzClock = FixedWallClock(iso8601: "2026-10-05T14:00:00+07:00")
private let fuzzZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
private let fuzzToday = LocalDate("2026-10-05")!

private func fuzzRows() -> [PlannedSet] {
  [
    PlannedSet(key: "b1", exerciseId: "ex-bench", exerciseName: "Bench Press",
               ordinal: 1, of: 3, weightKg: 60, reps: 8, plannedRest: 90, plannedRpe: 7),
    PlannedSet(key: "b2", exerciseId: "ex-bench", exerciseName: "Bench Press",
               ordinal: 2, of: 3, weightKg: 60, reps: 8, plannedRest: 90, plannedRpe: 8),
    PlannedSet(key: "b3", exerciseId: "ex-bench", exerciseName: "Bench Press",
               ordinal: 3, of: 3, weightKg: 60, reps: 8, plannedRest: 90, plannedRpe: 9),
    PlannedSet(key: "p1", exerciseName: "Plank", ordinal: 1, of: 1,
               weightKg: 0, reps: 0, plannedRest: 0, plannedRpe: 6),
  ]
}

@MainActor
struct WorkoutSessionFuzzTests {
  private func controller(_ store: InMemoryWorkoutStore, mint: @escaping @Sendable () -> String) async
    -> WorkoutSessionController
  {
    let c = WorkoutSessionController(
      plan: .init(date: fuzzToday, templateId: "tpl-fuzz", templateName: "Fuzz",
                  rows: fuzzRows()),
      userId: "u1", store: store, clock: fuzzClock, timeZone: fuzzZone,
      makeId: mint, onRest: { _, _ in }, onEnqueued: { _ in })
    await c.load()
    return c
  }

  @Test func randomOpsAndKillsKeepInvariants() async throws {
    var rng = SplitMix64(seed: 0xF025_5700)
    let keys = ["b1", "b2", "b3", "p1"]
    let weights = ["", "60", "62.5", "0", "abc"]
    let reps = ["", "8", "10", "45s", "0", "xyz"]

    for _ in 0..<60 {
      let store = InMemoryWorkoutStore()
      // Một id cho cả buổi — chốt bao nhiêu lần cũng cùng id (idempotent).
      let minted = Mutex(0)
      let mint: @Sendable () -> String = {
        minted.withLock { $0 += 1; return "fuzz-\($0)" }
      }
      var c = await controller(store, mint: mint)

      for _ in 0..<(10 + Int(rng.next(below: 25))) {
        switch rng.next(below: 7) {
        case 0:
          _ = await c.toggle(keys[Int(rng.next(below: UInt64(keys.count)))])
        case 1:
          _ = await c.setWeightText(weights[Int(rng.next(below: UInt64(weights.count)))],
                                    for: keys[Int(rng.next(below: UInt64(keys.count)))])
        case 2:
          _ = await c.setRepsText(reps[Int(rng.next(below: UInt64(reps.count)))],
                                  for: keys[Int(rng.next(below: UInt64(keys.count)))])
        case 3:
          _ = await c.setRpe(1 + Int(rng.next(below: 10)),
                             for: keys[Int(rng.next(below: UInt64(keys.count)))])
        case 4:
          c = await controller(store, mint: mint) // kill app: vứt controller, giữ store
        case 5:
          _ = try? await c.finish()
        default:
          _ = await c.toggle(keys[Int(rng.next(below: UInt64(keys.count)))])
        }

        // Bất biến 1: mỗi ngày tối đa một hàng outbox (idempotent theo id).
        let ids = await store.outbox.map(\.id)
        #expect(Set(ids).count == ids.count, "không trùng id outbox")
        #expect(ids.count <= 1, "một ngày một hàng outbox")
      }

      // Bất biến 2: volume chốt == Σ kg×reps của các hàng ĐÃ CHỐT (bỏ warmup),
      // tính từ performed. Hàng tick SAU khi chốt là `pendingRows` — chưa nằm
      // trong buổi đã lưu cho tới khi nối thêm (#296) — nên không thuộc
      // `summary`; tính cả chúng là so số đã lưu với số chưa lưu.
      if let summary = c.summary {
        var expected = 0.0
        for row in fuzzRows() where c.loggedKeys.contains(row.key) && c.progress.done[row.key] == true {
          let p = c.performed(row)
          expected += p.weightKg * Double(p.reps)
        }
        #expect(summary.volumeKg == Int((expected + 0.5).rounded(.down)),
                "volumeKg == Σ ticked kg×reps")
      }
    }
  }
}
