import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Test thuộc tính Outbox/SyncWorker (D-7, #282): chuỗi lỗi ngẫu nhiên với
/// seed cố định (`SplitMix64`) — tất định, không flaky. Bất biến sau khi
/// worker lắng:
///
/// 1. Không mất bản ghi: mỗi id đã enqueue nằm ở đúng một trong ba nơi —
///    đã tới server, còn pending, hoặc đã dead;
/// 2. Server không trùng id: mỗi id thành công đúng một hàng (gửi lại cùng
///    id là upsert, không thành hàng thứ hai);
/// 3. `dead` chỉ với lỗi vĩnh viễn (`refused`) hoặc hết ngân sách
///    (`exhausted`) — mất mạng không bao giờ vào dead.
///
/// Đảo ngược (chứng minh test bắt lỗi): đổi `RetryPolicy.isPermanent` coi
/// `.offline` là vĩnh viễn → bất biến 3 đỏ: dead chứa bản ghi lỗi offline.
private func fuzzEntry(_ id: String) -> OutboxEntry {
  OutboxEntry(id: id, userId: "u1", kind: "workout",
              payload: .object(["id": .string(id)]), createdAt: EpochMillis(0))
}

private enum FuzzScript: Sendable {
  case ok
  case transientThenOk
  case permanent
  case lostResponseThenOk
  case offlineThenOk
}

@MainActor
struct SyncWorkerFuzzTests {
  @Test func randomErrorSequencesKeepInvariants() async {
    var rng = SplitMix64(seed: 0x5000_02CE)
    for _ in 0..<40 {
      let n = 1 + Int(rng.next(below: 5))
      let ids = (0..<n).map { "w\($0)" }
      let store = InMemoryOutboxStore(ids.map(fuzzEntry))
      let server = FakeServer()
      var scripts: [String: FuzzScript] = [:]
      for id in ids {
        let script: FuzzScript
        switch rng.next(below: 5) {
        case 0: script = .ok
        case 1: script = .transientThenOk
        case 2: script = .permanent
        case 3: script = .lostResponseThenOk
        default: script = .offlineThenOk
        }
        scripts[id] = script
        switch script {
        case .ok:
          break
        case .transientThenOk:
          await server.script(id, .fail(.server(code: "500")), .fail(.server(code: "503")))
        case .permanent:
          await server.script(id, .fail(.server(code: "23514")))
        case .lostResponseThenOk:
          // Server ĐÃ ghi nhưng phản hồi mất: gửi lại không được thành hàng thứ hai.
          await server.script(id, .lostResponse)
        case .offlineThenOk:
          await server.script(id, .fail(.offline), .fail(.offline))
        }
      }

      let clock = ManualClock()
      let w = SyncWorker(store: store, remote: server, clock: clock,
                         online: true, signedInUser: "u1", sleep: clock.sleeper)
      w.kick()
      await w.settle()

      let rows = await server.rows
      let pending = await store.pending
      let dead = await store.dead
      let deadIds = Set(dead.map { $0.entry.id })

      for id in ids {
        let onServer = rows[id] != nil
        let isPending = pending.contains { $0.id == id }
        let isDead = deadIds.contains(id)
        // Bất biến 1: không mất bản ghi.
        #expect(onServer || isPending || isDead, "không mất bản ghi \(id)")
        #expect([onServer, isPending, isDead].filter { $0 }.count == 1,
                "\(id) ở đúng một nơi")

        switch scripts[id] {
        case .permanent:
          // Server từ chối: không có hàng, bản ghi dead vì refused.
          #expect(!onServer, "\(id): server từ chối thì không ghi")
          #expect(isDead, "\(id): lỗi vĩnh viễn → dead")
          #expect(dead.first { $0.entry.id == id }?.reason == .refused,
                  "\(id): reason refused")
        case .ok, .transientThenOk, .lostResponseThenOk, .offlineThenOk, nil:
          // Mọi lỗi tạm/mất mạng cuối cùng đều tới được server, đúng một hàng.
          #expect(onServer, "\(id): cuối cùng tới được server")
          #expect(!isDead, "\(id): không dead oan")
        }
      }

      // Bất biến 2: server không trùng id — kể cả ca lostResponse (server đã
      // ghi, phản hồi mất, worker gửi lại).
      #expect(rows.count == Set(rows.keys).count)
      for id in rows.keys {
        #expect(ids.contains(id), "không có hàng lạ trên server: \(id)")
      }

      // Bất biến 3: dead chỉ với lỗi vĩnh viễn hoặc hết ngân sách.
      for d in dead {
        let f = d.failure
        switch d.reason {
        case .refused:
          #expect(f.map(RetryPolicy.isPermanent) ?? false,
                  "\(d.entry.id): refused thì lỗi phải vĩnh viễn")
        case .exhausted:
          #expect(!(f.map(RetryPolicy.isPermanent) ?? true),
                  "\(d.entry.id): exhausted thì lỗi phải tạm thời")
          #expect(f != .offline, "\(d.entry.id): mất mạng không bao giờ exhausted")
        case .wrongAccount:
          #expect(f == .wrongAccount, "\(d.entry.id)")
        }
      }
    }
  }
}
