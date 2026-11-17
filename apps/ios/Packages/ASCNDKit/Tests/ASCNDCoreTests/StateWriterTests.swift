@testable import ASCNDCore
import Foundation
import Testing

/// Lớp Trạng thái #161 — đúng các ca vế 3 của `tools/offline-class.mjs` RN:
/// tick → bỏ → tick khi mất mạng rồi có mạng là MỘT lệnh ghi `true`; tick →
/// bỏ là không lệnh nào; ý mới lúc đang bay đợi rồi gửi ý mới nhất, không hai
/// lệnh song song; thực thể đã xoá thì bỏ ý và báo; mất mạng giữ ý, lỗi khác
/// bỏ ý và báo.

/// Một server giả: ghi lại từng lệnh, có thể giữ lệnh lại để kiểm "đang bay".
@MainActor
private final class FakeServer {
  var sent: [Bool] = []
  var inFlight = 0
  var maxInFlight = 0
  var result: StateWriter.SendResult = .ok
  var failure: (any Error)?
  var holding = false
  private var held: [CheckedContinuation<Void, Never>] = []

  func send(_ v: Bool) async throws -> StateWriter.SendResult {
    inFlight += 1
    maxInFlight = max(maxInFlight, inFlight)
    defer { inFlight -= 1 }
    if holding { await withCheckedContinuation { held.append($0) } }
    if let failure { throw failure }
    sent.append(v)
    return result
  }

  func release() {
    holding = false
    let h = held
    held = []
    for c in h { c.resume() }
  }
}

private struct Offline: Error {}
private struct Boom: Error {}

@MainActor
private final class Env {
  var online = true
  var settled: [String] = []
  var gone: [String] = []
  var errors: [String] = []
}

@MainActor
private func make(_ env: Env) -> StateWriter {
  StateWriter(environment: .init(
    online: { env.online },
    isOffline: { $0 is Offline },
    onSettled: { env.settled.append($0) },
    onGone: { env.gone.append($0) },
    onError: { k, _ in env.errors.append(k) }))
}

/// Cho các Task nội bộ chạy hết.
@MainActor
private func drain() async {
  for _ in 0..<20 { await Task.yield() }
}

/// Nơi lưu ý giả cho test của `StateWriter` và các sổ nhận lại
/// (`GroceryTests`…): giữ ảnh trong bộ nhớ, có thể cho hỏng để kiểm đường lỗi.
/// Không `private` để test khác trong cùng target dùng chung được.
final class FakeStateIntentPersistence: StateIntentPersistence, @unchecked Sendable {
  private let lock = NSLock()
  private var stored: [StateIntent] = []
  /// `true` thì `load` / `save` đều ném — đĩa hỏng.
  var fail = false

  var snapshot: [StateIntent] { lock.withLock { stored } }

  func load() throws -> [StateIntent] {
    if fail { throw Boom() }
    return lock.withLock { stored }
  }

  func save(_ intents: [StateIntent]) throws {
    if fail { throw Boom() }
    lock.withLock { stored = intents }
  }
}

@MainActor
struct StateWriterTests {
  @Test func tickUntickTickOfflineSendsOneTrue() async {
    let env = Env(), server = FakeServer(), w = make(env)
    env.online = false
    #expect(w.set(key: "s:1", value: true, server: false, send: server.send) == .queued)
    #expect(w.set(key: "s:1", value: false, server: false, send: server.send) == .unchanged)
    #expect(w.set(key: "s:1", value: true, server: false, send: server.send) == .queued)
    #expect(w.pending("s:1") == true)
    env.online = true
    w.flush()
    await drain()
    #expect(server.sent == [true])
    #expect(w.size == 0)
    #expect(env.settled == ["s:1"])
  }

  @Test func tickThenUntickSendsNothing() async {
    let env = Env(), server = FakeServer(), w = make(env)
    env.online = false
    w.set(key: "s:1", value: true, server: false, send: server.send)
    w.set(key: "s:1", value: false, server: false, send: server.send)
    env.online = true
    w.flush()
    await drain()
    #expect(server.sent.isEmpty)
    #expect(w.pending("s:1") == nil)
  }

  @Test func newIntentionWaitsForInFlightThenSendsNewest() async {
    let env = Env(), server = FakeServer(), w = make(env)
    server.holding = true
    #expect(w.set(key: "s:1", value: true, server: false, send: server.send) == .sending)
    await drain()
    #expect(w.set(key: "s:1", value: false, server: false, send: server.send) == .queued)
    #expect(w.set(key: "s:1", value: true, server: false, send: server.send) == .queued)
    #expect(w.set(key: "s:1", value: false, server: false, send: server.send) == .queued)
    server.release()
    await drain()
    // Lượt đầu gửi true; ý cuối là false ≠ server mới (true) → gửi false.
    #expect(server.sent == [true, false])
    #expect(server.maxInFlight == 1)
    #expect(w.size == 0)
  }

  @Test func goneDropsAndReports() async {
    let env = Env(), server = FakeServer(), w = make(env)
    server.result = .gone
    w.set(key: "s:1", value: true, server: false, send: server.send)
    await drain()
    #expect(env.gone == ["s:1"])
    #expect(w.size == 0)
  }

  @Test func offlineFailureKeepsOtherFailureDrops() async {
    let env = Env(), server = FakeServer(), w = make(env)
    server.failure = Offline()
    w.set(key: "s:1", value: true, server: false, send: server.send)
    await drain()
    #expect(w.pending("s:1") == true)
    #expect(env.errors.isEmpty)
    server.failure = nil
    w.flush()
    await drain()
    #expect(server.sent == [true])
    #expect(w.size == 0)

    server.failure = Boom()
    w.set(key: "s:2", value: true, server: false, send: server.send)
    await drain()
    #expect(w.pending("s:2") == nil)
    #expect(env.errors == ["s:2"])
  }

  @Test func clearDropsEverything() {
    let env = Env(), server = FakeServer(), w = make(env)
    env.online = false
    w.set(key: "a", value: true, server: false, send: server.send)
    w.set(key: "b", value: true, server: false, send: server.send)
    let v = w.version
    w.clear()
    #expect(w.size == 0)
    #expect(w.version != v)
  }

  // MARK: - Lưu bền (AUD-29)

  @Test func restoredIntentsFlushAfterAdopt() async {
    let env = Env(), server = FakeServer(), store = FakeStateIntentPersistence()
    let w1 = make(env)
    w1.attachPersistence(store)
    env.online = false
    w1.set(key: "s:1", value: true, server: false, send: server.send)
    #expect(store.snapshot == [StateIntent(key: "s:1", desired: true, server: false)])
    // Mở app lại: ý về từ đĩa, chưa có `send`, flush không gửi được.
    let w2 = make(env)
    w2.attachPersistence(store)
    #expect(w2.pending("s:1") == true)
    #expect(w2.size == 1)
    env.online = true
    w2.flush()
    await drain()
    #expect(server.sent.isEmpty)
    // Chủ nó nhận lại: gửi ngay vì đang có mạng; xong thì đĩa cũng sạch.
    #expect(w2.adopt(key: "s:1", server: false, send: server.send))
    await drain()
    #expect(server.sent == [true])
    #expect(w2.size == 0)
    #expect(store.snapshot.isEmpty)
  }

  @Test func clearDropsPersistedIntentsToo() {
    let env = Env(), server = FakeServer(), store = FakeStateIntentPersistence()
    let w = make(env)
    w.attachPersistence(store)
    env.online = false
    w.set(key: "a", value: true, server: false, send: server.send)
    w.set(key: "b", value: true, server: false, send: server.send)
    w.clear()
    #expect(store.snapshot.isEmpty)
    let w2 = make(env)
    w2.attachPersistence(store)
    #expect(w2.size == 0)
  }

  @Test func adoptDropsWhenServerAlreadyMatches() {
    let env = Env(), server = FakeServer(), store = FakeStateIntentPersistence()
    let w1 = make(env)
    w1.attachPersistence(store)
    env.online = false
    w1.set(key: "s:1", value: true, server: false, send: server.send)
    let w2 = make(env)
    w2.attachPersistence(store)
    #expect(w2.adopt(key: "s:1", server: true, send: server.send))
    #expect(w2.size == 0)
    #expect(store.snapshot.isEmpty)
    // Không có ý thì không nhận được gì, và không tạo ý mới.
    #expect(!w2.adopt(key: "nope", server: false, send: server.send))
    #expect(w2.size == 0)
  }

  @Test func adoptDoesNotStealLiveSenders() {
    let env = Env(), server = FakeServer(), store = FakeStateIntentPersistence()
    let w = make(env)
    w.attachPersistence(store)
    env.online = false
    w.set(key: "s:1", value: true, server: false, send: server.send)
    #expect(!w.adopt(key: "s:1", server: false, send: server.send))
    #expect(w.pending("s:1") == true)
  }

  @Test func restoreKeepsLiveEntries() async throws {
    let env = Env(), server = FakeServer(), store = FakeStateIntentPersistence()
    try store.save([StateIntent(key: "k", desired: false, server: false)])
    let w = make(env)
    env.online = false
    w.set(key: "k", value: true, server: false, send: server.send)
    w.attachPersistence(store)
    // Ý đang sống thắng ý trên đĩa; `send` vẫn còn nên flush gửi được.
    #expect(w.pending("k") == true)
    #expect(store.snapshot == [StateIntent(key: "k", desired: true, server: false)])
    env.online = true
    w.flush()
    await drain()
    #expect(server.sent == [true])
  }

  @Test func persistenceFailureKeepsInMemoryBehavior() async {
    let env = Env(), server = FakeServer(), store = FakeStateIntentPersistence()
    store.fail = true
    let w = make(env)
    w.attachPersistence(store)
    #expect(w.persistenceFailed)
    w.set(key: "s:1", value: true, server: false, send: server.send)
    await drain()
    #expect(server.sent == [true])
    #expect(w.persistenceFailed)
    store.fail = false
    env.online = false
    w.set(key: "s:2", value: true, server: false, send: server.send)
    #expect(!w.persistenceFailed)
    #expect(store.snapshot == [StateIntent(key: "s:2", desired: true, server: false)])
  }

  @Test func removeDropsOneKeyAndPersists() {
    let env = Env(), server = FakeServer(), store = FakeStateIntentPersistence()
    let w = make(env)
    w.attachPersistence(store)
    env.online = false
    w.set(key: "a", value: true, server: false, send: server.send)
    w.set(key: "b", value: true, server: false, send: server.send)
    #expect(w.remove(key: "a"))
    #expect(!w.remove(key: "a"))
    #expect(w.pendingKeys == ["b"])
    #expect(store.snapshot.map(\.key) == ["b"])
  }
}
