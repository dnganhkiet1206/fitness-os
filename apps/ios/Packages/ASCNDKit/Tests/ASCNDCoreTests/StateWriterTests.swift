@testable import ASCNDCore
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
}
